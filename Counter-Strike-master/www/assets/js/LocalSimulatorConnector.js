import {
    Action,
    ArmorType,
    Color,
    EventList,
    GameOverReason,
    InventorySlot,
    ItemId,
    PauseReason,
    SoundType
} from "./Enums.js";
import {Utils} from "./Utils.js";

/**
 * Trac Studios - Local & P2P WebRTC Simulator Connector
 * Allows playing Counter-Strike: Football in browser without needing an external PHP server:
 * 1. Solo Practice / Target Range Mode (with Bots)
 * 2. WebRTC P2P Multiplayer Mode (via PeerJS)
 */
export class LocalSimulatorConnector {
    #game;
    #control;
    #loopIntervalId = null;
    #mode = 'practice'; // 'practice' or 'p2p'
    #peer = null;
    #conn = null;
    #isHost = false;
    #joinUrl = '';

    // Local Player State
    #playerMe = null;
    #playerId = 1;
    #playerPos = { x: 4498, y: 1198, z: 1775 };
    #playerLook = { horizontal: 0, vertical: 0 };
    #playerVelY = 0;
    #isGrounded = true;
    #baseFloorY = 1198;
    #isCrouching = false;
    #isWalking = false;
    #currentSlot = InventorySlot.SLOT_PRIMARY;
    #reloadEndTime = 0;
    #attackCooldown = 0;

    // Target Bots / Peer Player
    #bots = [];
    #peerPlayer = null;
    #tick = 0;

    constructor(game, joinUrl = '') {
        this.#game = game;
        this.#joinUrl = joinUrl;
    }

    close() {
        if (this.#loopIntervalId) {
            clearInterval(this.#loopIntervalId);
            this.#loopIntervalId = null;
        }
        if (this.#conn) {
            try { this.#conn.close(); } catch (e) {}
            this.#conn = null;
        }
        if (this.#peer) {
            try { this.#peer.destroy(); } catch (e) {}
            this.#peer = null;
        }
        console.log("[CS-Simulator] Closed.");
    }

    async connect(host, port, loginCode, control) {
        this.#control = control;
        console.log(`[CS-Simulator] Connecting with host=${host}, code=${loginCode}, url=${this.#joinUrl}`);

        const urlParams = new URLSearchParams(this.#joinUrl.split('?')[1] || '');
        const modeParam = urlParams.get('mode') || (loginCode && loginCode.startsWith('room-') ? 'p2p' : 'practice');
        this.#mode = modeParam;

        const role = urlParams.get('role') || 'host';
        this.#isHost = (role === 'host');
        const roomCode = urlParams.get('room') || loginCode || 'TRAC-CS';

        if (this.#mode === 'p2p') {
            this.#initP2P(roomCode);
        } else {
            this.#initPractice();
        }
    }

    #initPractice() {
        console.log("[CS-Simulator] Initializing Solo Practice / Target Range Mode...");
        this.#playerId = 1;
        this.#playerPos = { x: 4498, y: 1198, z: 1775 };
        this.#playerLook = { horizontal: 0, vertical: 0 };

        // Create initial local player data
        this.#playerMe = this.#createDefaultPlayerData(this.#playerId, 1, true, this.#playerPos);

        // Spawn 2 target practice bots (Opponents)
        this.#bots = [
            this.#createBot(2, 2, false, { x: 4520, y: 1198, z: 2350 }, 180, ItemId.RifleM4A4, InventorySlot.SLOT_PRIMARY),
            this.#createBot(3, 3, false, { x: 4180, y: 1198, z: 2000 }, 90, ItemId.RifleAWP, InventorySlot.SLOT_PRIMARY)
        ];

        this.#startSimulation();
    }

    #initP2P(roomCode) {
        console.log(`[CS-Simulator] Initializing WebRTC P2P Mode (room: ${roomCode}, isHost: ${this.#isHost})...`);
        this.#playerId = this.#isHost ? 1 : 2;

        if (this.#isHost) {
            this.#playerPos = { x: 4498, y: 1198, z: 1775 }; // Attackers spawn
            this.#playerMe = this.#createDefaultPlayerData(1, 1, true, this.#playerPos);
        } else {
            this.#playerPos = { x: 4520, y: 1198, z: 2350 }; // Close spawn for 1v1 action
            this.#playerMe = this.#createDefaultPlayerData(2, 2, false, this.#playerPos);
        }

        // Setup PeerJS if available
        if (typeof window.Peer !== 'undefined') {
            const peerIdPrefix = "traccs-p2p-";
            const myPeerId = this.#isHost ? `${peerIdPrefix}${roomCode}` : undefined;

            try {
                this.#peer = new window.Peer(myPeerId, {
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
                });

                if (this.#isHost) {
                    this.#peer.on('connection', (conn) => {
                        console.log("[CS-P2P] Guest connected!");
                        this.#conn = conn;
                        this.#setupDataConnection();
                    });
                } else {
                    this.#peer.on('open', () => {
                        const targetId = `${peerIdPrefix}${roomCode}`;
                        console.log(`[CS-P2P] Connecting to host: ${targetId}`);
                        this.#conn = this.#peer.connect(targetId, { reliable: true });
                        this.#setupDataConnection();
                    });
                }

                this.#peer.on('error', (err) => {
                    console.warn("[CS-P2P] PeerJS error:", err);
                });
            } catch (e) {
                console.warn("[CS-P2P] Failed to initialize PeerJS, continuing local:", e);
            }
        }

        this.#startSimulation();
    }

    #setupDataConnection() {
        if (!this.#conn) return;

        this.#conn.on('open', () => {
            console.log("[CS-P2P] Data connection ready!");
        });

        this.#conn.on('data', (data) => {
            if (data.type === 'tick') {
                this.#peerPlayer = data.player;
            } else if (data.type === 'hit') {
                this.#takeDamage(data.damage, data.attackerId, data.headshot, data.itemId);
            }
        });
    }

    #startSimulation() {
        // Send GameStartEvent to game
        const gameStartOptions = {
            playerId: this.#playerId,
            tickMs: 20,
            warmupSec: 1,
            setting: {
                round_time_ms: 180000,
                max_rounds: 30
            },
            player: this.#playerMe
        };

        this.#game.gameStart(gameStartOptions);

        // Start 50 Hz tick loop (20ms)
        this.#loopIntervalId = setInterval(() => {
            this.#tickLoop();
        }, 20);
    }

    #createDefaultPlayerData(id, color, isAttacker, pos) {
        return {
            id: id,
            color: color,
            money: 16000,
            item: { id: ItemId.RifleAk, slot: InventorySlot.SLOT_PRIMARY },
            canAttack: true,
            canBuy: true,
            canPlant: true,
            slots: {
                [InventorySlot.SLOT_KNIFE]: { id: ItemId.Knife, slot: InventorySlot.SLOT_KNIFE },
                [InventorySlot.SLOT_PRIMARY]: { id: ItemId.RifleAk, slot: InventorySlot.SLOT_PRIMARY, ammo: 30, ammoReserve: 90 },
                [InventorySlot.SLOT_SECONDARY]: { id: ItemId.PistolUsp, slot: InventorySlot.SLOT_SECONDARY, ammo: 12, ammoReserve: 36 },
                [InventorySlot.SLOT_BOMB]: { id: ItemId.Bomb, slot: InventorySlot.SLOT_BOMB }
            },
            health: 100,
            position: { x: pos.x, y: pos.y, z: pos.z },
            look: { horizontal: 0, vertical: 0 },
            isAttacker: isAttacker,
            sight: 1.5,
            armor: 100,
            armorType: ArmorType.BODY_AND_HEAD,
            ammo: 30,
            ammoReserve: 90,
            isReloading: false,
            scopeLevel: 0
        };
    }

    #createBot(id, color, isAttacker, pos, horizLook, weaponId, slot) {
        return {
            id: id,
            color: color,
            money: 10000,
            item: { id: weaponId, slot: slot },
            canAttack: true,
            canBuy: false,
            canPlant: false,
            slots: {
                [InventorySlot.SLOT_KNIFE]: { id: ItemId.Knife, slot: InventorySlot.SLOT_KNIFE },
                [slot]: { id: weaponId, slot: slot, ammo: 30, ammoReserve: 90 }
            },
            health: 100,
            maxHealth: 100,
            position: { x: pos.x, y: pos.y, z: pos.z },
            spawnPosition: { x: pos.x, y: pos.y, z: pos.z },
            look: { horizontal: horizLook, vertical: 0 },
            isAttacker: isAttacker,
            sight: 1.5,
            armor: 100,
            armorType: ArmorType.BODY_AND_HEAD,
            ammo: 30,
            ammoReserve: 90,
            isReloading: false,
            scopeLevel: 0,
            isAlive: true,
            respawnAt: 0
        };
    }

    #tickLoop() {
        this.#tick++;
        const tickEvents = [];

        // 1. Read input actions from Control.js
        const actionString = this.#control ? this.#control.getTickAction() : '';
        const actions = actionString ? actionString.split('|') : [];

        // 2. Parse Actions
        let moveFwd = false;
        let moveBwd = false;
        let moveLeft = false;
        let moveRight = false;
        let jump = false;
        let attack = false;
        let attack2 = false;
        let reload = false;

        for (const act of actions) {
            if (act === 'forward') moveFwd = true;
            else if (act === 'backward') moveBwd = true;
            else if (act === 'left') moveLeft = true;
            else if (act === 'right') moveRight = true;
            else if (act === 'jump') jump = true;
            else if (act === 'crouch') this.#isCrouching = true;
            else if (act === 'stand') this.#isCrouching = false;
            else if (act === 'walk') this.#isWalking = true;
            else if (act === 'run') this.#isWalking = false;
            else if (act === 'attack') attack = true;
            else if (act === 'attack2') attack2 = true;
            else if (act === 'reload') reload = true;
            else if (act.startsWith('equip ')) {
                const slot = parseInt(act.split(' ')[1]);
                if (this.#playerMe.slots[slot]) {
                    this.#currentSlot = slot;
                    this.#playerMe.item = this.#playerMe.slots[slot];
                }
            } else if (act.startsWith('look ')) {
                const parts = act.split(' ');
                this.#playerLook.horizontal = parseFloat(parts[1]) || 0;
                this.#playerLook.vertical = parseFloat(parts[2]) || 0;
            } else if (act.startsWith('buy ')) {
                this.#handleBuy(parseInt(act.split(' ')[1]));
            }
        }

        // 3. Movement Physics
        const speed = this.#isCrouching ? 5 : (this.#isWalking ? 7 : 13);
        const radH = (this.#playerLook.horizontal * Math.PI) / 180;
        const sinH = Math.sin(radH);
        const cosH = Math.cos(radH);

        let dx = 0;
        let dz = 0;

        if (moveFwd) {
            dx += sinH * speed;
            dz += cosH * speed;
        }
        if (moveBwd) {
            dx -= sinH * speed;
            dz -= cosH * speed;
        }
        if (moveRight) {
            dx += cosH * speed;
            dz -= sinH * speed;
        }
        if (moveLeft) {
            dx -= cosH * speed;
            dz += sinH * speed;
        }

        this.#playerPos.x += dx;
        this.#playerPos.z += dz;

        // Jump & Gravity
        if (jump && this.#isGrounded) {
            this.#playerVelY = 16;
            this.#isGrounded = false;
        }

        if (!this.#isGrounded) {
            this.#playerPos.y += this.#playerVelY;
            this.#playerVelY -= 1.0; // gravity
            if (this.#playerPos.y <= this.#baseFloorY) {
                this.#playerPos.y = this.#baseFloorY;
                this.#playerVelY = 0;
                this.#isGrounded = true;
                tickEvents.push({
                    code: EventList.SoundEvent,
                    data: {
                        type: SoundType.PLAYER_GROUND_TOUCH,
                        player: this.#playerId,
                        position: { ...this.#playerPos }
                    }
                });
            }
        }

        // Footstep sound
        if ((moveFwd || moveBwd || moveLeft || moveRight) && this.#isGrounded && this.#tick % 18 === 0) {
            tickEvents.push({
                code: EventList.SoundEvent,
                data: {
                    type: SoundType.PLAYER_STEP,
                    player: this.#playerId,
                    position: { ...this.#playerPos }
                }
            });
        }

        // Reload Handling
        if (reload && Date.now() > this.#reloadEndTime) {
            const currentItem = this.#playerMe.slots[this.#currentSlot];
            if (currentItem && currentItem.ammo !== undefined && currentItem.ammoReserve > 0) {
                this.#reloadEndTime = Date.now() + 1800;
                this.#playerMe.isReloading = true;
                tickEvents.push({
                    code: EventList.SoundEvent,
                    data: {
                        type: SoundType.ITEM_RELOAD,
                        item: currentItem,
                        player: this.#playerId,
                        position: { ...this.#playerPos }
                    }
                });
            }
        }

        if (this.#playerMe.isReloading && Date.now() > this.#reloadEndTime) {
            const currentItem = this.#playerMe.slots[this.#currentSlot];
            if (currentItem && currentItem.ammo !== undefined) {
                const needed = 30 - currentItem.ammo;
                const toAdd = Math.min(needed, currentItem.ammoReserve);
                currentItem.ammo += toAdd;
                currentItem.ammoReserve -= toAdd;
                this.#playerMe.ammo = currentItem.ammo;
                this.#playerMe.ammoReserve = currentItem.ammoReserve;
            }
            this.#playerMe.isReloading = false;
        }

        // 4. Attack / Shooting Handling
        if (attack && Date.now() > this.#attackCooldown && !this.#playerMe.isReloading) {
            const currentItem = this.#playerMe.slots[this.#currentSlot];
            if (currentItem) {
                if (currentItem.ammo === undefined || currentItem.ammo > 0) {
                    if (currentItem.ammo !== undefined) {
                        currentItem.ammo--;
                        this.#playerMe.ammo = currentItem.ammo;
                    }
                    this.#attackCooldown = Date.now() + (currentItem.id === ItemId.RifleAWP ? 1100 : (currentItem.id === ItemId.Knife ? 400 : 120));

                    // Weapon attack sound
                    tickEvents.push({
                        code: EventList.SoundEvent,
                        data: {
                            type: SoundType.ITEM_ATTACK,
                            item: currentItem,
                            player: this.#playerId,
                            position: { ...this.#playerPos }
                        }
                    });

                    // Perform Raycast Hit Check against Bots or Peer
                    this.#performHitScan(currentItem, tickEvents);
                } else {
                    // Attack with no ammo sound
                    tickEvents.push({
                        code: EventList.SoundEvent,
                        data: {
                            type: SoundType.ATTACK_NO_AMMO,
                            item: currentItem,
                            player: this.#playerId,
                            position: { ...this.#playerPos }
                        }
                    });
                }
            }
        }

        // Secondary attack (AWP zoom / Knife stab)
        if (attack2) {
            const currentItem = this.#playerMe.slots[this.#currentSlot];
            if (currentItem && currentItem.id === ItemId.RifleAWP) {
                this.#playerMe.scopeLevel = this.#playerMe.scopeLevel === 2 ? 0 : this.#playerMe.scopeLevel + 1;
            }
        }

        // 5. Update local player object
        const activeItem = this.#playerMe.slots[this.#currentSlot] || this.#playerMe.item;
        this.#playerMe.item = activeItem;
        this.#playerMe.ammo = activeItem.ammo;
        this.#playerMe.ammoReserve = activeItem.ammoReserve;
        this.#playerMe.sight = this.#isCrouching ? 0.9 : 1.5;
        this.#playerMe.position = { ...this.#playerPos };
        this.#playerMe.look = { ...this.#playerLook };

        // 6. Update Bots (respawn logic & simple head tracking)
        const activePlayers = [this.#playerMe];
        const now = Date.now();

        for (const bot of this.#bots) {
            if (!bot.isAlive) {
                if (now > bot.respawnAt) {
                    bot.isAlive = true;
                    bot.health = bot.maxHealth;
                    bot.position = { ...bot.spawnPosition };
                } else {
                    continue; // Skip dead bot
                }
            }

            // Bot faces player
            const dxB = this.#playerPos.x - bot.position.x;
            const dzB = this.#playerPos.z - bot.position.z;
            bot.look.horizontal = (Math.atan2(dxB, dzB) * 180) / Math.PI;

            activePlayers.push(bot);
        }

        // Peer player in P2P mode
        if (this.#peerPlayer) {
            activePlayers.push(this.#peerPlayer);

            // Send local player to peer
            if (this.#conn && this.#conn.open && this.#tick % 2 === 0) {
                this.#conn.send({
                    type: 'tick',
                    player: this.#playerMe
                });
            }
        }

        // 7. Dispatch state tick to Game.js
        this.#game.tick({
            players: activePlayers,
            events: tickEvents
        });
    }

    #performHitScan(weapon, tickEvents) {
        const radH = (this.#playerLook.horizontal * Math.PI) / 180;
        const radV = (this.#playerLook.vertical * Math.PI) / 180;
        const dirX = Math.sin(radH) * Math.cos(radV);
        const dirY = Math.sin(radV);
        const dirZ = Math.cos(radH) * Math.cos(radV);

        const damage = weapon.id === ItemId.RifleAWP ? 115 : (weapon.id === ItemId.RifleAk ? 36 : (weapon.id === ItemId.Knife ? 45 : 22));

        // Check Bots
        for (const bot of this.#bots) {
            if (!bot.isAlive) continue;

            const toBotX = bot.position.x - this.#playerPos.x;
            const toBotY = (bot.position.y + bot.sight) - (this.#playerPos.y + this.#playerMe.sight);
            const toBotZ = bot.position.z - this.#playerPos.z;

            const dist = Math.sqrt(toBotX * toBotX + toBotY * toBotY + toBotZ * toBotZ);
            if (dist < 4000) {
                // Dot product / alignment check
                const dot = (dirX * toBotX + dirY * toBotY + dirZ * toBotZ) / dist;
                if (dot > 0.985) {
                    const isHeadshot = (toBotY > 10 && dot > 0.995);
                    const finalDamage = isHeadshot ? damage * 3 : damage;

                    bot.health -= finalDamage;

                    tickEvents.push({
                        code: EventList.SoundEvent,
                        data: {
                            type: isHeadshot ? SoundType.BULLET_HIT_HEADSHOT : SoundType.BULLET_HIT,
                            player: bot.id,
                            position: { ...bot.position },
                            extra: { origin: { ...this.#playerPos } }
                        }
                    });

                    if (bot.health <= 0) {
                        bot.isAlive = false;
                        bot.respawnAt = Date.now() + 2500;

                        tickEvents.push({
                            code: EventList.KillEvent,
                            data: {
                                playerDead: bot.id,
                                playerCulprit: this.#playerId,
                                headshot: isHeadshot,
                                itemId: weapon.id
                            }
                        });

                        tickEvents.push({
                            code: EventList.SoundEvent,
                            data: {
                                type: SoundType.PLAYER_DEAD,
                                player: bot.id,
                                position: { ...bot.position }
                            }
                        });
                    }
                    return;
                }
            }
        }

        // Check Peer in P2P mode
        if (this.#peerPlayer && this.#conn && this.#conn.open) {
            const toPeerX = this.#peerPlayer.position.x - this.#playerPos.x;
            const toPeerY = (this.#peerPlayer.position.y + this.#peerPlayer.sight) - (this.#playerPos.y + this.#playerMe.sight);
            const toPeerZ = this.#peerPlayer.position.z - this.#playerPos.z;

            const dist = Math.sqrt(toPeerX * toPeerX + toPeerY * toPeerY + toPeerZ * toPeerZ);
            if (dist < 4000) {
                const dot = (dirX * toPeerX + dirY * toPeerY + dirZ * toPeerZ) / dist;
                if (dot > 0.985) {
                    const isHeadshot = (toPeerY > 10 && dot > 0.995);
                    const finalDamage = isHeadshot ? damage * 3 : damage;

                    this.#conn.send({
                        type: 'hit',
                        damage: finalDamage,
                        attackerId: this.#playerId,
                        headshot: isHeadshot,
                        itemId: weapon.id
                    });
                }
            }
        }
    }

    #takeDamage(damage, attackerId, headshot, itemId) {
        this.#playerMe.health -= damage;
        if (this.#playerMe.health <= 0) {
            this.#playerMe.health = 0;
            // Respawn in 3 seconds
            setTimeout(() => {
                this.#playerMe.health = 100;
                this.#playerPos = this.#isHost ? { x: 4498, y: 1198, z: 1775 } : { x: 4520, y: 1198, z: 2350 };
            }, 3000);
        }
    }

    #handleBuy(buyId) {
        if (!this.#playerMe.canBuy) return;

        let newItem = null;
        let slot = InventorySlot.SLOT_PRIMARY;

        if (buyId === 1) { // AK
            newItem = { id: ItemId.RifleAk, slot: InventorySlot.SLOT_PRIMARY, ammo: 30, ammoReserve: 90 };
        } else if (buyId === 7) { // M4A4
            newItem = { id: ItemId.RifleM4A4, slot: InventorySlot.SLOT_PRIMARY, ammo: 30, ammoReserve: 90 };
        } else if (buyId === 15) { // AWP
            newItem = { id: ItemId.RifleAWP, slot: InventorySlot.SLOT_PRIMARY, ammo: 10, ammoReserve: 30 };
        } else if (buyId === 8) { // USP
            newItem = { id: ItemId.PistolUsp, slot: InventorySlot.SLOT_SECONDARY, ammo: 12, ammoReserve: 36 };
            slot = InventorySlot.SLOT_SECONDARY;
        }

        if (newItem) {
            this.#playerMe.slots[slot] = newItem;
            this.#currentSlot = slot;
            this.#playerMe.item = newItem;
        }
    }
}
