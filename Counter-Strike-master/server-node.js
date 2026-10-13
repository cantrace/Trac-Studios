const http = require('http');
const crypto = require('crypto');

/**
 * Trac Studios - Lightweight Node.js WebSocket Server for Counter-Strike: Football
 * Requires zero external npm packages! Uses native Node.js http and crypto modules.
 * Port: 8081
 */
const PORT = process.env.PORT || 8081;

// Server state
const clients = new Map();
let nextClientId = 1;
let tickCount = 0;

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <html>
        <body style="font-family:sans-serif;background:#0d1322;color:#fff;padding:40px;text-align:center;">
            <h1 style="color:#00f5d4;">Trac Studios CS Server</h1>
            <p>Sunucu AKTİF! Port: <strong>${PORT}</strong></p>
            <p>Bağlı Oyuncular: <strong>${clients.size}</strong></p>
            <p style="color:#aaa;">Bu sunucu adresini oyun istemcisine yazın: <code>ws://${req.headers.host}</code></p>
        </body>
        </html>
    `);
});

// Upgrade to WebSocket (RFC 6455)
server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.destroy();
        return;
    }

    const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`
    ];

    socket.write(headers.join('\r\n') + '\r\n\r\n');

    const clientId = nextClientId++;
    const client = {
        id: clientId,
        socket: socket,
        address: req.socket.remoteAddress,
        logged: false,
        playerData: {
            id: clientId,
            color: clientId % 5 + 1,
            isAttacker: (clientId % 2 === 1),
            health: 100,
            armor: 100,
            armorType: 2,
            sight: 1.5,
            position: clientId % 2 === 1 ? { x: 4498, y: 1198, z: 1775 } : { x: 8705, y: 440, z: 11029 },
            look: { horizontal: 0, vertical: 0 },
            money: 16000,
            item: { id: 5, slot: 1 },
            slots: {
                0: { id: 1, slot: 0 },
                1: { id: 5, slot: 1, ammo: 30, ammoReserve: 90 },
                2: { id: 4, slot: 2, ammo: 12, ammoReserve: 36 },
                3: { id: 50, slot: 3 }
            },
            ammo: 30,
            ammoReserve: 90,
            isReloading: false,
            scopeLevel: 0
        }
    };

    clients.set(socket, client);
    console.log(`[CS-Server] Yeni oyuncu baglandi: Oyuncu #${clientId} (${client.address}) | Toplam: ${clients.size}`);

    socket.on('data', (buffer) => {
        handleWsFrame(client, buffer);
    });

    socket.on('close', () => {
        clients.delete(socket);
        console.log(`[CS-Server] Oyuncu #${clientId} ayrildi | Kalan: ${clients.size}`);
    });

    socket.on('error', (err) => {
        console.warn(`[CS-Server] Socket hatasi (${clientId}):`, err.message);
    });
});

function handleWsFrame(client, buffer) {
    if (buffer.length < 2) return;

    const isFinal = (buffer[0] & 0x80) !== 0;
    const opcode = buffer[0] & 0x0f;
    const isMasked = (buffer[1] & 0x80) !== 0;
    let payloadLen = buffer[1] & 0x7f;

    let offset = 2;
    if (payloadLen === 126) {
        payloadLen = buffer.readUInt16BE(offset);
        offset += 2;
    } else if (payloadLen === 127) {
        payloadLen = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
    }

    if (opcode === 0x8) { // Close frame
        client.socket.end();
        return;
    }

    let mask = null;
    if (isMasked) {
        mask = buffer.slice(offset, offset + 4);
        offset += 4;
    }

    const payload = buffer.slice(offset, offset + payloadLen);
    if (isMasked && mask) {
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4];
        }
    }

    const msg = payload.toString('utf8');

    if (!client.logged && msg.startsWith('login')) {
        client.logged = true;
        console.log(`[CS-Server] Oyuncu #${client.id} giris yapti (${msg})`);

        // Send GameStartEvent
        const startMessage = JSON.stringify({
            players: [],
            events: [
                {
                    code: 6, // GameStartEvent
                    data: {
                        playerId: client.id,
                        tickMs: 20,
                        warmupSec: 2,
                        setting: {
                            round_time_ms: 180000,
                            max_rounds: 30
                        },
                        player: client.playerData
                    }
                }
            ]
        });

        sendWsText(client.socket, startMessage);
        return;
    }

    // Process tick action from player
    if (msg) {
        parsePlayerAction(client, msg);
    }
}

function parsePlayerAction(client, msg) {
    const parts = msg.split('|');
    const p = client.playerData;
    const speed = 12;

    const radH = (p.look.horizontal * Math.PI) / 180;
    const sinH = Math.sin(radH);
    const cosH = Math.cos(radH);

    for (const act of parts) {
        if (act === 'forward') {
            p.position.x += sinH * speed;
            p.position.z += cosH * speed;
        } else if (act === 'backward') {
            p.position.x -= sinH * speed;
            p.position.z -= cosH * speed;
        } else if (act === 'right') {
            p.position.x += cosH * speed;
            p.position.z -= sinH * speed;
        } else if (act === 'left') {
            p.position.x -= cosH * speed;
            p.position.z += sinH * speed;
        } else if (act.startsWith('look ')) {
            const lParts = act.split(' ');
            p.look.horizontal = parseFloat(lParts[1]) || 0;
            p.look.vertical = parseFloat(lParts[2]) || 0;
        } else if (act.startsWith('equip ')) {
            const slot = parseInt(act.split(' ')[1]);
            if (p.slots[slot]) {
                p.item = p.slots[slot];
            }
        }
    }
}

function sendWsText(socket, text) {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header;

    if (len <= 125) {
        header = Buffer.from([0x81, len]);
    } else if (len <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }

    try {
        socket.write(Buffer.concat([header, payload]));
    } catch (e) {}
}

// 50Hz Global Server Tick (every 20ms)
setInterval(() => {
    tickCount++;
    if (clients.size === 0) return;

    const allPlayers = [];
    for (const c of clients.values()) {
        if (c.logged) {
            allPlayers.push(c.playerData);
        }
    }

    const state = JSON.stringify({
        players: allPlayers,
        events: []
    });

    for (const c of clients.values()) {
        if (c.logged) {
            sendWsText(c.socket, state);
        }
    }
}, 20);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`  TRAC STUDIOS - COUNTER-STRIKE DEDICATED LAN SERVER`);
    console.log(`  Sunucu Baslatildi: ws://localhost:${PORT}`);
    console.log(`  Yerel Agdaki arkadaslariniz baglanabilir!`);
    console.log(`=======================================================`);
});
