/**
 * Voxelcraft Online Multiplayer Engine for Trac Studios
 * PeerJS (WebRTC) P2P Room System - Zero Server, Vercel Ready
 */
(function() {
  'use strict';

  const PEER_PREFIX = 'trac_voxel_v2_';

  const COLOR_PALETTE = [
    0x00f5d4, // Mint Cyan
    0x7928ca, // Electric Violet
    0xf72585, // Neon Pink
    0x4361ee, // Royal Blue
    0x4cc9f0, // Sky Blue
    0xfb5607, // Neon Orange
    0xffbe0b, // Amber Gold
    0x2ec4b6  // Teal
  ];

  function getRandomColor() {
    return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
  }

  // Create high-res name tag sprite
  function createNameTagSprite(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Rounded background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.7)';
    ctx.lineWidth = 3;
    const r = 16, x = 10, y = 10, w = 236, h = 44;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Online indicator dot
    ctx.fillStyle = '#00f5d4';
    ctx.beginPath();
    ctx.arc(32, 32, 6, 0, Math.PI * 2);
    ctx.fill();

    // Text
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 15), 48, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 0.4, 1.0);
    sprite.renderOrder = 999;
    return sprite;
  }

  // Build 3D Voxel humanoid player model
  function buildAvatarMesh(name, colorHex) {
    const group = new THREE.Group();

    // Material with shading
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffd1a4 });
    const shirtMat = new THREE.MeshLambertMaterial({ color: colorHex });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

    // Head
    const headGeo = new THREE.BoxGeometry(0.46, 0.46, 0.46);
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 1.38;
    group.add(headMesh);

    // Face eyes (simple pixel eyes on face)
    const eyeCanvas = document.createElement('canvas');
    eyeCanvas.width = 32; eyeCanvas.height = 32;
    const ectx = eyeCanvas.getContext('2d');
    ectx.fillStyle = '#ffffff'; ectx.fillRect(6, 12, 6, 6); ectx.fillRect(20, 12, 6, 6);
    ectx.fillStyle = '#1e293b'; ectx.fillRect(8, 14, 4, 4); ectx.fillRect(22, 14, 4, 4);
    ectx.fillStyle = '#b45309'; ectx.fillRect(10, 24, 12, 3); // mouth
    const eyeTex = new THREE.CanvasTexture(eyeCanvas);
    eyeTex.magFilter = THREE.NearestFilter;
    const eyeMat = new THREE.MeshBasicMaterial({ map: eyeTex, transparent: true });
    const facePlate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), eyeMat);
    facePlate.position.set(0, 1.38, -0.232);
    facePlate.rotation.y = Math.PI;
    group.add(facePlate);

    // Torso
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.65, 0.28);
    const bodyMesh = new THREE.Mesh(bodyGeo, shirtMat);
    bodyMesh.position.y = 0.85;
    group.add(bodyMesh);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
    const leftArm = new THREE.Mesh(armGeo, shirtMat);
    leftArm.position.set(-0.36, 0.85, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, shirtMat);
    rightArm.position.set(0.36, 0.85, 0);
    group.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.24);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.14, 0.32, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.14, 0.32, 0);
    group.add(rightLeg);

    // Name tag
    const tag = createNameTagSprite(name);
    tag.position.y = 1.95;
    group.add(tag);

    group.userData = {
      head: headMesh,
      face: facePlate,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      tag,
      walkCycle: 0
    };

    return group;
  }

  window.Multiplayer = {
    peer: null,
    isHost: false,
    roomCode: '',
    myName: localStorage.getItem('trac_voxel_name') || 'Bilişimci_' + Math.floor(Math.random() * 900 + 100),
    myColor: getRandomColor(),
    connections: new Map(), // peerId -> DataConnection
    remotePlayers: new Map(), // peerId -> { name, mesh, x, y, z, yaw, pitch, targetX, targetY, targetZ, lastSeen }
    modifiedBlocks: [], // Host keeps list of block modifications
    isReceivingRemoteBlock: false,
    active: false,
    lastBroadcast: 0,

    init() {
      this.injectMultiplayerUI();
      this.injectChatUI();
      this.checkUrlParams();
      this.setupBlockListener();

      // Hook into game render loop
      const origLoop = Game.loop.bind(Game);
      Game.loop = (now) => {
        origLoop(now);
        this.update(now);
      };
    },

    checkUrlParams() {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const roleParam = params.get('role');
      const nameParam = params.get('name');
      if (nameParam) {
        this.myName = nameParam;
        localStorage.setItem('trac_voxel_name', nameParam);
      }
      if (roomParam) {
        setTimeout(() => {
          if (roleParam === 'host') {
            this.hostRoom(roomParam.toUpperCase());
          } else {
            this.joinRoom(roomParam.toUpperCase());
          }
        }, 600);
      } else {
        // Automatically open multiplayer room modal on startup!
        setTimeout(() => {
          this.openMultiplayerModal();
        }, 500);
      }
    },

    setupBlockListener() {
      Events.on('blockChanged', (x, y, z, oldId, id, oldMeta, meta) => {
        if (!this.active || this.isReceivingRemoteBlock) return;
        const blockMsg = { type: 'block', x, y, z, id, meta };
        this.broadcast(blockMsg);
        if (this.isHost) {
          this.modifiedBlocks.push(blockMsg);
          if (this.modifiedBlocks.length > 5000) this.modifiedBlocks.shift();
        }
      });
    },

    hostRoom(customCode) {
      const code = (customCode || 'TRAC' + Math.floor(1000 + Math.random() * 9000)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.roomCode = code;
      this.isHost = true;
      this.initPeer(PEER_PREFIX + code);
    },

    joinRoom(code) {
      if (!code) return;
      const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.roomCode = cleanCode;
      this.isHost = false;
      this.initPeer(null, PEER_PREFIX + cleanCode);
    },

    initPeer(myCustomId, targetHostId) {
      if (typeof Peer === 'undefined') {
        alert('PeerJS kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.');
        return;
      }

      this.updateStatusModal('Bağlanıyor...', 'Lütfen bekleyin, WebRTC eşleşme başlatılıyor.');
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
      }

      const peerConfig = {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
          ]
        }
      };

      try {
        this.peer = myCustomId ? new Peer(myCustomId, peerConfig) : new Peer(peerConfig);
      } catch (err) {
        console.error('Peer init error:', err);
        alert('Bağlantı hatası: ' + err.message);
        return;
      }

      this.peer.on('open', (id) => {
        console.log('Peer connected with ID:', id);
        this.active = true;

        if (this.isHost) {
          this.updateStatusModal('Oda Kuruldu!', `Oda Kodu: <b>${this.roomCode}</b><br>Arkadaşlarınıza bu kodu veya bağlantıyı verin.`);
          this.showRoomPill();
          this.addChatMessage('SİSTEM', `🟢 Oda açıldı! Kod: ${this.roomCode}`, '#00f5d4');
          // If game not running, start game
          if (!Game.running) {
            const seedInput = document.getElementById('seed-input');
            const seed = (seedInput ? seedInput.value.trim() : '') || String(Math.floor(Math.random() * 9999999));
            Game.start(seed);
          }
        } else if (targetHostId) {
          this.updateStatusModal('Odaya Bağlanılıyor...', `Oda aranıyor: ${this.roomCode}`);
          const conn = this.peer.connect(targetHostId, { reliable: true });
          this.setupConnection(conn, true);
        }
      });

      this.peer.on('connection', (conn) => {
        this.setupConnection(conn, false);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'unavailable-id') {
          if (this.isHost) {
            alert(`"${this.roomCode}" oda kodu şu an zaten kullanımda! Farklı bir kod deneyin veya odaya katılın.`);
          }
        } else if (err.type === 'peer-unavailable') {
          alert(`"${this.roomCode}" kodlu oda bulunamadı veya ev sahibi henüz oyunda değil.`);
        } else {
          this.addChatMessage('HATA', err.message, '#ff4757');
        }
        this.closeMultiplayerModal();
      });
    },

    setupConnection(conn, isOutgoing) {
      conn.on('open', () => {
        console.log('Data connection opened with:', conn.peer);
        this.connections.set(conn.peer, conn);
        this.showRoomPill();

        if (isOutgoing) {
          // Joined host, send greeting
          conn.send({
            type: 'join',
            name: this.myName,
            color: this.myColor
          });
          this.updateStatusModal('Bağlandı!', 'Dünya verileri alınıyor...');
        } else {
          // Host sends handshake to new client
          conn.send({
            type: 'handshake',
            seed: Game.seed,
            mode: Game.mode,
            time: typeof Sky !== 'undefined' ? Sky.time : 1000,
            blocks: this.modifiedBlocks,
            hostName: this.myName,
            hostColor: this.myColor,
            hostPos: typeof player !== 'undefined' ? [player.x, player.y, player.z] : null
          });
        }
      });

      conn.on('data', (data) => {
        this.handleMessage(conn.peer, data);
      });

      conn.on('close', () => {
        console.log('Connection closed:', conn.peer);
        this.connections.delete(conn.peer);
        this.removeRemotePlayer(conn.peer);
        this.showRoomPill();
      });

      conn.on('error', (err) => {
        console.error('Connection error:', err);
      });
    },

    handleMessage(senderId, msg) {
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'handshake':
          console.log('Received handshake with seed:', msg.seed);
          if (!Game.running || Game.seed !== String(msg.seed)) {
            Game.mode = msg.mode || 'survival';
            Game.start(msg.seed);
          }
          if (msg.hostPos && Array.isArray(msg.hostPos) && typeof player !== 'undefined') {
            player.x = msg.hostPos[0] + 1;
            player.y = msg.hostPos[1];
            player.z = msg.hostPos[2];
          }
          if (msg.blocks && Array.isArray(msg.blocks)) {
            this.pendingBlocks = msg.blocks.slice();
          }
          this.closeMultiplayerModal();
          this.addChatMessage('SİSTEM', `🌐 ${msg.hostName || 'Kurucu'} odasına başarıyla katıldın!`, '#00f5d4');
          if (msg.hostName) {
            this.upsertRemotePlayer(senderId, msg.hostName, msg.hostColor);
          }
          break;

        case 'join':
          this.upsertRemotePlayer(senderId, msg.name, msg.color);
          this.addChatMessage('SİSTEM', `👋 ${msg.name} odaya katıldı!`, '#4cc9f0');
          // If host, announce to other peers
          if (this.isHost) {
            this.broadcast({
              type: 'peer_joined',
              peerId: senderId,
              name: msg.name,
              color: msg.color
            }, senderId);
          }
          break;

        case 'peer_joined':
          this.upsertRemotePlayer(msg.peerId, msg.name, msg.color);
          this.addChatMessage('SİSTEM', `👋 ${msg.name} odaya katıldı!`, '#4cc9f0');
          break;

        case 'pos':
          this.updateRemotePlayerTransform(senderId, msg);
          // If host, relay to other peers
          if (this.isHost) {
            this.broadcast(msg, senderId);
          }
          break;

        case 'block':
          this.isReceivingRemoteBlock = true;
          world.setBlock(msg.x, msg.y, msg.z, msg.id, msg.meta || 0, SET_SILENT);
          this.isReceivingRemoteBlock = false;
          if (this.isHost) {
            this.modifiedBlocks.push(msg);
            this.broadcast(msg, senderId);
          }
          break;

        case 'chat':
          this.addChatMessage(msg.name, msg.text, msg.color || '#ffffff');
          if (this.isHost) {
            this.broadcast(msg, senderId);
          }
          break;
      }
    },

    broadcast(msg, excludePeerId) {
      for (const [peerId, conn] of this.connections.entries()) {
        if (peerId !== excludePeerId && conn.open) {
          try { conn.send(msg); } catch (e) { console.warn('Send error:', e); }
        }
      }
    },

    upsertRemotePlayer(peerId, name, colorHex) {
      if (this.remotePlayers.has(peerId)) {
        const p = this.remotePlayers.get(peerId);
        p.name = name;
        return;
      }
      const mesh = buildAvatarMesh(name, colorHex || getRandomColor());
      Game.scene.add(mesh);
      this.remotePlayers.set(peerId, {
        name,
        mesh,
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: 0,
        pitch: 0,
        targetX: player.x,
        targetY: player.y,
        targetZ: player.z,
        targetYaw: 0,
        targetPitch: 0,
        isMoving: false,
        lastSeen: performance.now()
      });
      this.showRoomPill();
    },

    updateRemotePlayerTransform(peerId, msg) {
      if (!this.remotePlayers.has(peerId)) {
        this.upsertRemotePlayer(peerId, msg.name || 'Oyuncu', msg.color);
      }
      const p = this.remotePlayers.get(peerId);
      p.targetX = msg.x;
      p.targetY = msg.y;
      p.targetZ = msg.z;
      p.targetYaw = msg.yaw;
      p.targetPitch = msg.pitch;
      p.isMoving = !!msg.moving;
      p.lastSeen = performance.now();
    },

    removeRemotePlayer(peerId) {
      if (!this.remotePlayers.has(peerId)) return;
      const p = this.remotePlayers.get(peerId);
      if (p.mesh && Game.scene) {
        Game.scene.remove(p.mesh);
      }
      this.remotePlayers.delete(peerId);
      this.addChatMessage('SİSTEM', `🔴 ${p.name} oyundan ayrıldı.`, '#ff4757');
      this.showRoomPill();
    },

    applyPendingBlocks() {
      if (!this.pendingBlocks || this.pendingBlocks.length === 0) return;
      this.isReceivingRemoteBlock = true;
      const remaining = [];
      for (const b of this.pendingBlocks) {
        const ok = world.setBlock(b.x, b.y, b.z, b.id, b.meta || 0, SET_SILENT);
        if (!ok) remaining.push(b);
      }
      this.pendingBlocks = remaining;
      this.isReceivingRemoteBlock = false;
    },

    update(now) {
      if (!this.active || !Game.running) return;

      if (this.pendingBlocks && this.pendingBlocks.length > 0) {
        this.applyPendingBlocks();
      }

      // Broadcast local player pos at 20Hz (every 50ms)
      if (now - this.lastBroadcast > 50) {
        this.lastBroadcast = now;
        const moving = Math.abs(player.vx) > 0.01 || Math.abs(player.vz) > 0.01;
        this.broadcast({
          type: 'pos',
          peerId: this.peer ? this.peer.id : '',
          name: this.myName,
          color: this.myColor,
          x: player.x,
          y: player.y,
          z: player.z,
          yaw: player.yaw,
          pitch: player.pitch,
          moving
        });
      }

      // Interpolate and animate remote players
      const dt = 0.05;
      for (const [peerId, p] of this.remotePlayers.entries()) {
        const mesh = p.mesh;
        if (!mesh) continue;

        // Smooth position lerp
        p.x += (p.targetX - p.x) * 0.3;
        p.y += (p.targetY - p.y) * 0.3;
        p.z += (p.targetZ - p.z) * 0.3;
        p.yaw += (p.targetYaw - p.yaw) * 0.3;
        p.pitch += (p.targetPitch - p.pitch) * 0.3;

        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.yaw;

        const u = mesh.userData;
        if (u.head) u.head.rotation.x = p.pitch;

        // Walk swing animation
        if (p.isMoving) {
          u.walkCycle = (u.walkCycle || 0) + 0.3;
          const swing = Math.sin(u.walkCycle) * 0.6;
          if (u.leftLeg) u.leftLeg.rotation.x = swing;
          if (u.rightLeg) u.rightLeg.rotation.x = -swing;
          if (u.leftArm) u.leftArm.rotation.x = -swing;
          if (u.rightArm) u.rightArm.rotation.x = swing;
        } else {
          if (u.leftLeg) u.leftLeg.rotation.x = 0;
          if (u.rightLeg) u.rightLeg.rotation.x = 0;
          if (u.leftArm) u.leftArm.rotation.x = 0;
          if (u.rightArm) u.rightArm.rotation.x = 0;
        }
      }
    },

    // UI & In-game Chat Helpers
    injectChatUI() {
      const chatHtml = `
        <div id="trac-chat-container" style="position:fixed;bottom:20px;left:20px;z-index:9000;pointer-events:none;font-family:Segoe UI, sans-serif;">
          <div id="trac-chat-messages" style="max-height:220px;overflow-y:auto;width:340px;display:flex;flex-direction:column;gap:5px;margin-bottom:8px;"></div>
          <div id="trac-chat-bar" style="display:none;pointer-events:auto;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);border:1px solid rgba(0,245,212,0.6);border-radius:8px;padding:6px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
            <input type="text" id="trac-chat-input" placeholder="Mesaj yazın (Enter ile gönder)..." style="width:100%;box-sizing:border-box;background:transparent;border:none;outline:none;color:#fff;font-size:14px;padding:4px 8px;">
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', chatHtml);

      const input = document.getElementById('trac-chat-input');
      const bar = document.getElementById('trac-chat-bar');

      window.addEventListener('keydown', (e) => {
        if (!Game.running || Game.paused) return;

        // Open chat with T or Enter
        if ((e.code === 'KeyT' || e.code === 'Enter') && bar.style.display !== 'block') {
          if (document.pointerLockElement) document.exitPointerLock();
          bar.style.display = 'block';
          input.focus();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Inside chat
        if (bar.style.display === 'block') {
          if (e.code === 'Enter') {
            const val = input.value.trim();
            if (val) {
              this.sendChatMessage(val);
              input.value = '';
            }
            bar.style.display = 'none';
            input.blur();
            if (Game.canvas) Input.lock();
            e.preventDefault();
          } else if (e.code === 'Escape') {
            bar.style.display = 'none';
            input.blur();
            if (Game.canvas) Input.lock();
            e.preventDefault();
          }
        }
      });
    },

    sendChatMessage(text) {
      this.addChatMessage(this.myName, text, '#ffffff');
      this.broadcast({
        type: 'chat',
        name: this.myName,
        text: text,
        color: '#ffffff'
      });
    },

    addChatMessage(name, text, color) {
      const box = document.getElementById('trac-chat-messages');
      if (!box) return;
      const msgEl = document.createElement('div');
      msgEl.style.cssText = 'background:rgba(10,15,30,0.7);backdrop-filter:blur(4px);padding:5px 10px;border-radius:6px;font-size:13px;color:#f1f5f9;border-left:3px solid #00f5d4;box-shadow:0 2px 8px rgba(0,0,0,0.4);animation:fadeIn 0.2s ease;';
      msgEl.innerHTML = `<b style="color:${color || '#00f5d4'};">${name}:</b> <span>${this.escapeHtml(text)}</span>`;
      box.appendChild(msgEl);
      box.scrollTop = box.scrollHeight;

      // Auto fade after 9s
      setTimeout(() => {
        msgEl.style.transition = 'opacity 1s ease';
        msgEl.style.opacity = '0';
        setTimeout(() => msgEl.remove(), 1000);
      }, 9000);
    },

    escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    injectMultiplayerUI() {
      // 1. Top Bar Pill
      const pillHtml = `
        <div id="trac-mp-pill" style="position:fixed;top:14px;right:20px;z-index:9000;display:none;background:rgba(15,23,42,0.85);backdrop-filter:blur(10px);border:1px solid #00f5d4;border-radius:24px;padding:6px 14px;color:#fff;font-family:Segoe UI, sans-serif;font-size:13px;box-shadow:0 4px 20px rgba(0,245,212,0.25);cursor:pointer;">
          <span style="display:inline-block;width:8px;height:8px;background:#00f5d4;border-radius:50%;margin-right:6px;box-shadow:0 0 8px #00f5d4;"></span>
          <span id="trac-mp-pill-text">Oda: TRAC-1 · 1 Oyuncu</span>
        </div>
        <div id="trac-home-btn" style="position:fixed;top:14px;left:20px;z-index:9000;background:rgba(15,23,42,0.85);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.2);border-radius:24px;padding:6px 14px;color:#fff;font-family:Segoe UI, sans-serif;font-size:13px;cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:6px;" onclick="window.location.href='../index.html'">
          <span>🏠</span> <b>Trac Studios Portal</b>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', pillHtml);

      // 2. Multiplayer Modal
      const modalHtml = `
        <div id="trac-mp-modal" class="overlay hidden" style="position:fixed;inset:0;background:rgba(7,10,20,0.85);backdrop-filter:blur(8px);z-index:9999;display:none;align-items:center;justify-content:center;font-family:Segoe UI, sans-serif;">
          <div style="background:#111827;border:2px solid #00f5d4;border-radius:16px;padding:28px;width:460px;max-width:92vw;color:#fff;box-shadow:0 0 40px rgba(0,245,212,0.3);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
              <h2 style="margin:0;font-size:22px;display:flex;align-items:center;gap:10px;color:#00f5d4;">
                <span>🌐</span> Çok Oyunculu (Online P2P)
              </h2>
              <button onclick="Multiplayer.closeMultiplayerModal()" style="background:none;border:none;color:#94a3b8;font-size:24px;cursor:pointer;">✕</button>
            </div>
            <p style="font-size:13px;color:#94a3b8;margin-top:0;margin-bottom:18px;line-height:1.5;">
              Bilişim sınıfında veya okulda arkadaşlarınızla aynı haritaya bağlanın! WebRTC üzerinden doğrudan eşleşir, sunucu gerektirmez.
            </p>

            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:12px;font-weight:600;color:#cbd5e1;margin-bottom:6px;">Oyuncu Adınız</label>
              <input type="text" id="trac-mp-name-input" value="${this.myName}" placeholder="Adınızı girin" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;">
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
              <button id="trac-tab-host" onclick="Multiplayer.setTab('host')" style="background:#00f5d4;color:#0f172a;border:none;border-radius:8px;padding:10px;font-weight:bold;cursor:pointer;">👑 Oda Kur (Host)</button>
              <button id="trac-tab-join" onclick="Multiplayer.setTab('join')" style="background:#1e293b;color:#cbd5e1;border:none;border-radius:8px;padding:10px;font-weight:bold;cursor:pointer;">🚀 Odaya Katıl</button>
            </div>

            <!-- Host Content -->
            <div id="trac-content-host">
              <label style="display:block;font-size:12px;font-weight:600;color:#cbd5e1;margin-bottom:6px;">Oda Kodu (İsteğe Bağlı)</label>
              <div style="display:flex;gap:8px;margin-bottom:16px;">
                <input type="text" id="trac-host-code" placeholder="Örn: BILISIM1" style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;text-transform:uppercase;">
                <button onclick="Multiplayer.generateRandomHostCode()" style="background:#334155;border:none;border-radius:8px;padding:0 12px;color:#fff;cursor:pointer;" title="Rastgele Kod">🎲</button>
              </div>
              <button onclick="Multiplayer.onHostSubmit()" style="width:100%;background:linear-gradient(135deg, #00f5d4, #00b4d8);border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:bold;color:#0f172a;cursor:pointer;box-shadow:0 4px 15px rgba(0,245,212,0.4);">
                Odayı Başlat & Dünyayı Aç
              </button>
            </div>

            <!-- Join Content -->
            <div id="trac-content-join" style="display:none;">
              <label style="display:block;font-size:12px;font-weight:600;color:#cbd5e1;margin-bottom:6px;">Ev Sahibinin Oda Kodu</label>
              <input type="text" id="trac-join-code" placeholder="Örn: TRAC-842" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;text-transform:uppercase;margin-bottom:16px;">
              <button onclick="Multiplayer.onJoinSubmit()" style="width:100%;background:linear-gradient(135deg, #7928ca, #4361ee);border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:bold;color:#fff;cursor:pointer;box-shadow:0 4px 15px rgba(121,40,202,0.4);">
                Odaya Bağlan
              </button>
            </div>

            <div style="margin-top:14px;padding-top:12px;border-top:1px solid #1f293d;text-align:center;">
              <button onclick="Multiplayer.closeMultiplayerModal()" style="background:none;border:none;color:#94a3b8;font-size:13px;cursor:pointer;text-decoration:underline;">
                ⛏️ Çok Oyunculu İstemiyorum, Tek Başıma Oyna
              </button>
            </div>

            <!-- Status Box -->
            <div id="trac-status-box" style="display:none;margin-top:16px;background:#1e293b;border-radius:8px;padding:12px;font-size:13px;border-left:4px solid #00f5d4;">
              <div id="trac-status-title" style="font-weight:bold;color:#00f5d4;margin-bottom:4px;">Durum</div>
              <div id="trac-status-desc" style="color:#cbd5e1;"></div>
              <button id="trac-copy-link-btn" onclick="Multiplayer.copyInviteLink()" style="display:none;margin-top:10px;background:#334155;color:#00f5d4;border:1px solid #00f5d4;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600;">
                🔗 Davet Bağlantısını Kopyala
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      // 3. Inject Button into Title Screen
      const titleRow = document.querySelector('#start .row:last-of-type') || document.querySelector('#start .panel');
      if (titleRow) {
        const mpBtn = document.createElement('button');
        mpBtn.className = 'btn';
        mpBtn.style.cssText = 'background:linear-gradient(135deg, #00f5d4, #00b4d8);color:#0f172a;font-weight:bold;margin-top:10px;box-shadow:0 0 15px rgba(0,245,212,0.4);border:none;padding:10px 18px;border-radius:6px;cursor:pointer;';
        mpBtn.innerHTML = '🌐 Çok Oyunculu (Online P2P)';
        mpBtn.onclick = (e) => {
          e.preventDefault();
          this.openMultiplayerModal();
        };
        titleRow.appendChild(mpBtn);
      }

      // 4. Inject Button into Pause Screen
      const pausePanel = document.querySelector('#pause .panel');
      if (pausePanel) {
        const pauseMpBtn = document.createElement('button');
        pauseMpBtn.className = 'btn';
        pauseMpBtn.style.cssText = 'background:#1e293b;border:1px solid #00f5d4;color:#00f5d4;margin-top:6px;padding:8px 14px;border-radius:4px;cursor:pointer;';
        pauseMpBtn.innerHTML = '🌐 Çok Oyunculu Ayarları';
        pauseMpBtn.onclick = (e) => {
          e.preventDefault();
          this.openMultiplayerModal();
        };
        pausePanel.appendChild(pauseMpBtn);
      }
    },

    openMultiplayerModal() {
      const modal = document.getElementById('trac-mp-modal');
      if (modal) modal.style.display = 'flex';
      const nameInput = document.getElementById('trac-mp-name-input');
      if (nameInput) nameInput.value = this.myName;
    },

    closeMultiplayerModal() {
      const modal = document.getElementById('trac-mp-modal');
      if (modal) modal.style.display = 'none';
    },

    setTab(tab) {
      const hostTab = document.getElementById('trac-tab-host');
      const joinTab = document.getElementById('trac-tab-join');
      const hostContent = document.getElementById('trac-content-host');
      const joinContent = document.getElementById('trac-content-join');

      if (tab === 'host') {
        hostTab.style.background = '#00f5d4';
        hostTab.style.color = '#0f172a';
        joinTab.style.background = '#1e293b';
        joinTab.style.color = '#cbd5e1';
        hostContent.style.display = 'block';
        joinContent.style.display = 'none';
      } else {
        joinTab.style.background = '#7928ca';
        joinTab.style.color = '#ffffff';
        hostTab.style.background = '#1e293b';
        hostTab.style.color = '#cbd5e1';
        hostContent.style.display = 'none';
        joinContent.style.display = 'block';
      }
    },

    generateRandomHostCode() {
      const codeInput = document.getElementById('trac-host-code');
      if (codeInput) {
        codeInput.value = 'TRAC' + Math.floor(100 + Math.random() * 900);
      }
    },

    onHostSubmit() {
      const nameVal = document.getElementById('trac-mp-name-input').value.trim();
      if (nameVal) {
        this.myName = nameVal;
        localStorage.setItem('trac_voxel_name', nameVal);
      }
      const codeVal = document.getElementById('trac-host-code').value.trim();
      this.hostRoom(codeVal);
    },

    onJoinSubmit() {
      const nameVal = document.getElementById('trac-mp-name-input').value.trim();
      if (nameVal) {
        this.myName = nameVal;
        localStorage.setItem('trac_voxel_name', nameVal);
      }
      const codeVal = document.getElementById('trac-join-code').value.trim();
      if (!codeVal) {
        alert('Lütfen bir oda kodu girin!');
        return;
      }
      this.joinRoom(codeVal);
    },

    updateStatusModal(title, desc) {
      const box = document.getElementById('trac-status-box');
      const t = document.getElementById('trac-status-title');
      const d = document.getElementById('trac-status-desc');
      const copyBtn = document.getElementById('trac-copy-link-btn');
      if (!box) return;
      box.style.display = 'block';
      t.innerHTML = title;
      d.innerHTML = desc;

      if (this.isHost && this.roomCode) {
        copyBtn.style.display = 'inline-block';
      } else {
        copyBtn.style.display = 'none';
      }
    },

    copyInviteLink() {
      const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Davet bağlantısı kopyalandı! Arkadaşınıza gönderin:\n' + url);
      }).catch(() => {
        prompt('Bağlantıyı kopyalayın:', url);
      });
    },

    showRoomPill() {
      const pill = document.getElementById('trac-mp-pill');
      const txt = document.getElementById('trac-mp-pill-text');
      if (!pill || !txt) return;
      if (this.active && this.roomCode) {
        pill.style.display = 'block';
        const total = 1 + this.connections.size;
        txt.innerHTML = `Oda: <b>${this.roomCode}</b> · 👥 ${total} Oyuncu`;
        pill.onclick = () => this.openMultiplayerModal();
      } else {
        pill.style.display = 'none';
      }
    }
  };

  // Auto-initialize when window loads
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (window.Multiplayer && typeof Game !== 'undefined') {
        window.Multiplayer.init();
      }
    }, 500);
  });
})();
