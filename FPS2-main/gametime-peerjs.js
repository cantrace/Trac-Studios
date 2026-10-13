/**
 * Gametime-PeerJS: WebRTC P2P Multiplayer Engine for FPS2
 * Trac Studios Custom Adapter - Zero PubNub, 100% Free & Vercel Ready
 */
(function() {
  'use strict';

  // Safe offline fallbacks for utilities
  if (typeof window.generateName !== 'function') {
    window.generateName = function() {
      const names = ['Kabus', 'Sniper', 'Komando', 'Kurt', 'Atmaca', 'Kaplan', 'Bordo', 'Golge', 'Firtina', 'Sahin'];
      return names[Math.floor(Math.random() * names.length)] + '_' + Math.floor(Math.random() * 900 + 100);
    };
  }

  if (typeof window.swal !== 'function') {
    window.swal = function(opt) {
      if (typeof opt === 'string') {
        console.log('[SWAL]', opt);
      } else if (opt && opt.title) {
        console.log('[SWAL]', opt.title, opt.text || '');
      }
      return Promise.resolve(true);
    };
    window.swal.close = function() {};
  }

  const PEER_PREFIX = 'trac_fps2_v1_';

  // Global gametime object expected by FPS2
  window.gametime = {
    events: [],
    channel: new URLSearchParams(window.location.search).get('lobby') || 'TRAC1',
    connected: false,
    connectedPlayers: 1,
    idList: [],
    onconnect: null,
    ondisconnect: null,
    didConnect: null,
    user: {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      position: 1, // 1 = Host, 2 = Guest
      username: localStorage.getItem('trac_fps2_name') || 'Asker_' + Math.floor(Math.random() * 900 + 100)
    },
    join: { maxLength: 2, minLength: 2 },

    set: function(key, val) {
      if (key === 'channel' && val) {
        this.channel = val.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
      }
    },

    make: function(eventName) {
      if (!this.events.includes(eventName)) {
        this.events.push(eventName);
      }
    },

    on: function(eventName, fn) {
      this.make(eventName);
      this.events.functions[eventName] = fn;
    },

    run: function(eventName, args) {
      const argArray = Array.isArray(args) ? args : (args !== undefined ? [args] : []);

      // 1. Run locally
      if (typeof this.events.functions[eventName] === 'function') {
        try {
          this.events.functions[eventName].apply(null, argArray);
        } catch (e) {
          console.warn('Local event error [' + eventName + ']:', e);
        }
      }

      // 2. Broadcast to peer
      if (FPSMultiplayer.conn && FPSMultiplayer.conn.open) {
        try {
          FPSMultiplayer.conn.send({
            type: 'gt_event',
            event: eventName,
            args: argArray
          });
        } catch (e) {
          console.warn('Network send error:', e);
        }
      }
    },

    disconnect: function() {
      this.connected = false;
      if (FPSMultiplayer.conn) {
        try { FPSMultiplayer.conn.close(); } catch (e) {}
      }
      if (FPSMultiplayer.peer) {
        try { FPSMultiplayer.peer.destroy(); } catch (e) {}
      }
    }
  };

  window.gametime.events.functions = {};

  // Global variables that FPS2 relies upon
  window.isHost = true;
  window.isGuest = false;
  window.Guest = false;
  window.willBeAutoHost = false;

  // FPS2 Multiplayer Manager
  window.FPSMultiplayer = {
    peer: null,
    conn: null,
    isHost: true,
    roomCode: '',
    myName: window.gametime.user.username,

    init: function() {
      this.injectUI();
      this.checkUrlParams();
    },

    checkUrlParams: function() {
      const params = new URLSearchParams(window.location.search);
      const lobby = params.get('lobby');
      const role = params.get('role'); // 'host' or 'guest'
      const name = params.get('name');

      if (name) {
        this.myName = name;
        window.gametime.user.username = name;
        localStorage.setItem('trac_fps2_name', name);
      }

      if (lobby) {
        const cleanLobby = lobby.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (role === 'guest') {
          setTimeout(() => this.joinRoom(cleanLobby), 500);
        } else {
          setTimeout(() => this.hostRoom(cleanLobby), 500);
        }
      } else {
        // Show room selection modal
        setTimeout(() => this.openModal(), 300);
      }
    },

    hostRoom: function(code) {
      this.roomCode = (code || 'TRAC' + Math.floor(100 + Math.random() * 900)).toUpperCase().replace(/[^A-Z0-9]/g, '');
      window.gametime.channel = this.roomCode;
      this.isHost = true;
      window.isHost = true;
      window.isGuest = false;
      window.Guest = false;
      window.gametime.user.position = 1;

      this.connectPeer(PEER_PREFIX + this.roomCode, null);
    },

    joinRoom: function(code) {
      if (!code) return;
      this.roomCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      window.gametime.channel = this.roomCode;
      this.isHost = false;
      window.isHost = false;
      window.isGuest = true;
      window.Guest = true;
      window.gametime.user.position = 2;

      this.connectPeer(null, PEER_PREFIX + this.roomCode);
    },

    connectPeer: function(myPeerId, targetHostId) {
      if (typeof Peer === 'undefined') {
        alert('PeerJS kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.');
        return;
      }

      this.updateStatus('Bağlanıyor...', 'WebRTC sunucusuna bağlanılıyor...');

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
        this.peer = myPeerId ? new Peer(myPeerId, peerConfig) : new Peer(peerConfig);
      } catch (e) {
        alert('Peer başlatma hatası: ' + e.message);
        return;
      }

      this.peer.on('open', (id) => {
        console.log('FPS2 Peer ID:', id);

        if (this.isHost) {
          this.updateStatus('Oda Hazır!', `Oda Kodu: <b>${this.roomCode}</b><br>Arkadaşınızın bağlanması bekleniyor...`);
          this.showRoomPill();
          this.addChatMessage('SİSTEM', `🟢 Oda kuruldu: ${this.roomCode} (1. Oyuncusun - Host)`, '#00f5d4');
        } else if (targetHostId) {
          this.updateStatus('Odaya Bağlanılıyor...', `Oda aranıyor: ${this.roomCode}`);
          const c = this.peer.connect(targetHostId, { reliable: true });
          this.setupDataConnection(c);
        }
      });

      this.peer.on('connection', (c) => {
        this.setupDataConnection(c);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'unavailable-id') {
          alert(`"${this.roomCode}" oda kodu kullanımda! Farklı bir kod deneyin veya odaya katılın.`);
        } else if (err.type === 'peer-unavailable') {
          alert(`"${this.roomCode}" kodlu oda bulunamadı veya 1. oyuncu henüz oyunda değil.`);
        }
      });
    },

    setupDataConnection: function(conn) {
      this.conn = conn;

      conn.on('open', () => {
        console.log('FPS2 P2P Data Connection OPEN!');
        window.gametime.connected = true;
        window.gametime.connectedPlayers = 2;
        window.players = 2;

        this.closeModal();
        this.showRoomPill();

        this.addChatMessage('SİSTEM', '🎮 2. Oyuncu bağlandı! Maç başlatılıyor...', '#00f5d4');

        // Trigger connection handlers
        if (typeof window.gametime.onconnect === 'function') {
          window.gametime.onconnect();
        }
        if (typeof window.gametime.didConnect === 'function') {
          window.gametime.didConnect();
        }
      });

      conn.on('data', (data) => {
        if (!data) return;

        if (data.type === 'gt_event') {
          if (typeof window.gametime.events.functions[data.event] === 'function') {
            try {
              window.gametime.events.functions[data.event].apply(null, data.args || []);
            } catch (err) {
              console.warn('Error handling remote event [' + data.event + ']:', err);
            }
          }
        } else if (data.type === 'chat') {
          this.addChatMessage(data.name || 'Rakip', data.text, '#ff7675');
        }
      });

      conn.on('close', () => {
        console.log('Peer connection closed');
        window.gametime.connected = false;
        window.gametime.connectedPlayers = 1;
        this.addChatMessage('SİSTEM', '🔴 Rakip oyundan ayrıldı.', '#ff4757');
        this.showRoomPill();
      });
    },

    playSoloBot: function() {
      this.closeModal();
      if (typeof window.startBot === 'function') {
        window.startBot();
        this.addChatMessage('SİSTEM', '🤖 Solo Bot Maçı Başlatıldı! İyi şanslar!', '#00f5d4');
      } else {
        alert('Bot modu başlatılamadı.');
      }
    },

    // UI Helpers
    injectUI: function() {
      // 1. Top Navbar / Controls
      const topBarHtml = `
        <div id="trac-fps-nav" style="position:fixed;top:12px;left:16px;right:16px;z-index:999999;display:flex;justify-content:space-between;align-items:center;pointer-events:none;font-family:'Plus Jakarta Sans',Segoe UI,sans-serif;">
          <a href="../index.html" style="pointer-events:auto;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);border:1px solid rgba(0,245,212,0.4);border-radius:20px;padding:6px 14px;color:#fff;font-size:13px;font-weight:bold;text-decoration:none;display:flex;align-items:center;gap:6px;box-shadow:0 4px 15px rgba(0,0,0,0.5);">
            <span>🏠</span> Trac Studios Portala Dön
          </a>

          <div id="trac-fps-pill" style="pointer-events:auto;background:rgba(15,23,42,0.85);backdrop-filter:blur(8px);border:1px solid #00f5d4;border-radius:20px;padding:6px 16px;color:#fff;font-size:13px;display:none;cursor:pointer;" onclick="FPSMultiplayer.openModal()">
            <span style="display:inline-block;width:8px;height:8px;background:#00f5d4;border-radius:50%;margin-right:6px;box-shadow:0 0 8px #00f5d4;"></span>
            <span id="trac-fps-pill-text">Oda: TRAC1 · 👥 2 Oyuncu</span>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', topBarHtml);

      // 2. Chat UI
      const chatHtml = `
        <div id="trac-fps-chat-wrap" style="position:fixed;bottom:20px;left:20px;z-index:999999;pointer-events:none;font-family:Segoe UI, sans-serif;width:320px;">
          <div id="trac-fps-chat-msgs" style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:hidden;margin-bottom:8px;"></div>
          <div id="trac-fps-chat-box" style="display:none;pointer-events:auto;background:rgba(15,23,42,0.9);border:1px solid #00f5d4;border-radius:8px;padding:6px;backdrop-filter:blur(6px);">
            <input type="text" id="trac-fps-chat-input" placeholder="Mesaj yaz (Enter ile gönder)..." style="width:100%;box-sizing:border-box;background:transparent;border:none;outline:none;color:#fff;font-size:13px;padding:4px 8px;">
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', chatHtml);

      // Chat key listener
      const chatBox = document.getElementById('trac-fps-chat-box');
      const chatInput = document.getElementById('trac-fps-chat-input');

      window.addEventListener('keydown', (e) => {
        if ((e.code === 'KeyT' || e.code === 'Enter') && chatBox.style.display !== 'block') {
          if (document.pointerLockElement) document.exitPointerLock();
          chatBox.style.display = 'block';
          chatInput.focus();
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (chatBox.style.display === 'block') {
          if (e.code === 'Enter') {
            const val = chatInput.value.trim();
            if (val) {
              this.sendChat(val);
              chatInput.value = '';
            }
            chatBox.style.display = 'none';
            chatInput.blur();
            e.preventDefault();
          } else if (e.code === 'Escape') {
            chatBox.style.display = 'none';
            chatInput.blur();
            e.preventDefault();
          }
        }
      });

      // 3. Lobby Modal
      const modalHtml = `
        <div id="trac-fps-modal" style="position:fixed;inset:0;background:rgba(7,10,20,0.88);backdrop-filter:blur(10px);z-index:9999999;display:none;align-items:center;justify-content:center;font-family:'Plus Jakarta Sans',Segoe UI,sans-serif;">
          <div style="background:#0f172a;border:2px solid #00f5d4;border-radius:20px;padding:28px;width:480px;max-width:92vw;color:#fff;box-shadow:0 0 50px rgba(0,245,212,0.35);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
              <h2 style="margin:0;font-size:22px;color:#00f5d4;display:flex;align-items:center;gap:10px;">
                <span>🎯</span> FPS2 3D Online Çok Oyunculu
              </h2>
              <button onclick="FPSMultiplayer.closeModal()" style="background:none;border:none;color:#94a3b8;font-size:24px;cursor:pointer;">✕</button>
            </div>
            <p style="font-size:13px;color:#94a3b8;margin-top:0;margin-bottom:18px;line-height:1.5;">
              Bilişim sınıfında veya okulda arkadaşınla 1v1 kapış! WebRTC üzerinden doğrudan bağlanır, sunucu gerektirmez.
            </p>

            <div style="margin-bottom:16px;">
              <label style="display:block;font-size:12px;font-weight:700;color:#cbd5e1;margin-bottom:6px;">Oyuncu Adınız</label>
              <input type="text" id="trac-fps-name" value="${this.myName}" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;outline:none;">
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
              <button id="trac-fps-tab-host" onclick="FPSMultiplayer.setTab('host')" style="background:#00f5d4;color:#0f172a;border:none;border-radius:8px;padding:10px;font-weight:bold;cursor:pointer;">👑 Oda Kur (1. Oyuncu)</button>
              <button id="trac-fps-tab-join" onclick="FPSMultiplayer.setTab('join')" style="background:#1e293b;color:#cbd5e1;border:none;border-radius:8px;padding:10px;font-weight:bold;cursor:pointer;">🚀 Odaya Katıl (2. Oyuncu)</button>
            </div>

            <!-- Host Content -->
            <div id="trac-fps-content-host">
              <label style="display:block;font-size:12px;font-weight:700;color:#cbd5e1;margin-bottom:6px;">Oda Kodu (İsteğe Bağlı)</label>
              <div style="display:flex;gap:8px;margin-bottom:16px;">
                <input type="text" id="trac-fps-host-code" placeholder="Örn: FPS101" style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;text-transform:uppercase;">
                <button onclick="FPSMultiplayer.randomHostCode()" style="background:#334155;border:none;border-radius:8px;padding:0 14px;color:#fff;cursor:pointer;" title="Rastgele Kod">🎲</button>
              </div>
              <button onclick="FPSMultiplayer.submitHost()" style="width:100%;background:linear-gradient(135deg, #00f5d4, #00b4d8);border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:bold;color:#0f172a;cursor:pointer;box-shadow:0 4px 15px rgba(0,245,212,0.4);">
                Odayı Aç & Rakip Bekle
              </button>
            </div>

            <!-- Join Content -->
            <div id="trac-fps-content-join" style="display:none;">
              <label style="display:block;font-size:12px;font-weight:700;color:#cbd5e1;margin-bottom:6px;">Kurucunun Oda Kodu</label>
              <input type="text" id="trac-fps-join-code" placeholder="Örn: FPS101" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 14px;color:#fff;font-size:14px;text-transform:uppercase;margin-bottom:16px;">
              <button onclick="FPSMultiplayer.submitJoin()" style="width:100%;background:linear-gradient(135deg, #7928ca, #4361ee);border:none;border-radius:10px;padding:12px;font-size:15px;font-weight:bold;color:#fff;cursor:pointer;box-shadow:0 4px 15px rgba(121,40,202,0.4);">
                Odaya Bağlan & Oyuna Gir
              </button>
            </div>

            <!-- Solo Bot Button -->
            <div style="margin-top:16px;text-align:center;">
              <button onclick="FPSMultiplayer.playSoloBot()" style="background:transparent;border:1px dashed #64748b;color:#94a3b8;border-radius:8px;padding:8px 16px;font-size:12px;cursor:pointer;width:100%;transition:all 0.2s;" onmouseover="this.style.color='#fff';this.style.borderColor='#00f5d4';" onmouseout="this.style.color='#94a3b8';this.style.borderColor='#64748b';">
                🤖 Kimse Yok mu? Bot ile Tek Başına Oyna (Solo vs AI)
              </button>
            </div>

            <!-- Status Box -->
            <div id="trac-fps-status" style="display:none;margin-top:16px;background:#1e293b;border-radius:10px;padding:12px;font-size:13px;border-left:4px solid #00f5d4;">
              <div id="trac-fps-status-title" style="font-weight:bold;color:#00f5d4;margin-bottom:4px;">Durum</div>
              <div id="trac-fps-status-desc" style="color:#cbd5e1;"></div>
              <button id="trac-fps-copy-btn" onclick="FPSMultiplayer.copyLink()" style="display:none;margin-top:10px;background:#334155;color:#00f5d4;border:1px solid #00f5d4;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600;">
                🔗 Davet Bağlantısını Kopyala
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    openModal: function() {
      const modal = document.getElementById('trac-fps-modal');
      if (modal) modal.style.display = 'flex';
    },

    closeModal: function() {
      const modal = document.getElementById('trac-fps-modal');
      if (modal) modal.style.display = 'none';
    },

    setTab: function(tab) {
      const hTab = document.getElementById('trac-fps-tab-host');
      const jTab = document.getElementById('trac-fps-tab-join');
      const hContent = document.getElementById('trac-fps-content-host');
      const jContent = document.getElementById('trac-fps-content-join');

      if (tab === 'host') {
        hTab.style.background = '#00f5d4';
        hTab.style.color = '#0f172a';
        jTab.style.background = '#1e293b';
        jTab.style.color = '#cbd5e1';
        hContent.style.display = 'block';
        jContent.style.display = 'none';
      } else {
        jTab.style.background = '#7928ca';
        jTab.style.color = '#fff';
        hTab.style.background = '#1e293b';
        hTab.style.color = '#cbd5e1';
        hContent.style.display = 'none';
        jContent.style.display = 'block';
      }
    },

    randomHostCode: function() {
      const el = document.getElementById('trac-fps-host-code');
      if (el) el.value = 'FPS' + Math.floor(100 + Math.random() * 900);
    },

    submitHost: function() {
      const nameVal = document.getElementById('trac-fps-name').value.trim();
      if (nameVal) {
        this.myName = nameVal;
        window.gametime.user.username = nameVal;
        localStorage.setItem('trac_fps2_name', nameVal);
      }
      const codeVal = document.getElementById('trac-fps-host-code').value.trim();
      this.hostRoom(codeVal);
    },

    submitJoin: function() {
      const nameVal = document.getElementById('trac-fps-name').value.trim();
      if (nameVal) {
        this.myName = nameVal;
        window.gametime.user.username = nameVal;
        localStorage.setItem('trac_fps2_name', nameVal);
      }
      const codeVal = document.getElementById('trac-fps-join-code').value.trim();
      if (!codeVal) {
        alert('Lütfen bir oda kodu girin!');
        return;
      }
      this.joinRoom(codeVal);
    },

    updateStatus: function(title, desc) {
      const s = document.getElementById('trac-fps-status');
      const t = document.getElementById('trac-fps-status-title');
      const d = document.getElementById('trac-fps-status-desc');
      const btn = document.getElementById('trac-fps-copy-btn');
      if (!s) return;
      s.style.display = 'block';
      t.innerHTML = title;
      d.innerHTML = desc;
      if (this.isHost && this.roomCode) {
        btn.style.display = 'inline-block';
      } else {
        btn.style.display = 'none';
      }
    },

    copyLink: function() {
      const url = `${window.location.origin}${window.location.pathname}?lobby=${this.roomCode}&role=guest`;
      navigator.clipboard.writeText(url).then(() => {
        alert('Bağlantı kopyalandı! Arkadaşına gönder:\n' + url);
      }).catch(() => {
        prompt('Davet linki:', url);
      });
    },

    showRoomPill: function() {
      const pill = document.getElementById('trac-fps-pill');
      const txt = document.getElementById('trac-fps-pill-text');
      if (!pill || !txt) return;
      if (this.roomCode) {
        pill.style.display = 'block';
        const count = window.gametime.connected ? 2 : 1;
        txt.innerHTML = `Oda: <b>${this.roomCode}</b> · 👥 ${count} Oyuncu`;
      }
    },

    sendChat: function(text) {
      this.addChatMessage(this.myName, text, '#00f5d4');
      if (this.conn && this.conn.open) {
        try {
          this.conn.send({
            type: 'chat',
            name: this.myName,
            text: text
          });
        } catch (e) {}
      }
    },

    addChatMessage: function(name, text, color) {
      const box = document.getElementById('trac-fps-chat-msgs');
      if (!box) return;
      const el = document.createElement('div');
      el.style.cssText = 'background:rgba(10,15,30,0.8);backdrop-filter:blur(4px);padding:4px 10px;border-radius:6px;font-size:12px;color:#f1f5f9;border-left:3px solid ' + (color || '#00f5d4') + ';';
      el.innerHTML = `<b style="color:${color || '#00f5d4'};">${name}:</b> <span>${this.escape(text)}</span>`;
      box.appendChild(el);
      box.scrollTop = box.scrollHeight;
      setTimeout(() => {
        el.style.transition = 'opacity 1s ease';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 1000);
      }, 8000);
    },

    escape: function(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  };

  // Auto-init when DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    FPSMultiplayer.init();
  });
})();
