// Real-Time WebSocket Multiplayer Client wired to EventBus, AppState & Managed Timers
import { eventBus as defaultEventBus } from './core/EventBus.js';
import { appState as defaultAppState } from './core/AppState.js';
import { TimerRegistry } from './core/Scratch.js';

export class MultiplayerClient {
  constructor(eventBus = defaultEventBus, appState = defaultAppState) {
    this.eventBus = eventBus;
    this.appState = appState;
    this.socket = null;
    this.connected = false;
    this.currentUser = null;
    this.onlineUsers = [];
    this.reconnectAttempts = 0;
    this.pendingQueue = [];
    this._timers = new TimerRegistry();
    this._pingTimer = null;
    this._reconnectTimer = null;
    this._lastPosSentMs = 0;
    this._disposed = false;
    this._abortController = new AbortController();

    window.addEventListener(
      'online',
      () => {
        if (!this._disposed && !this.connected && this.currentUser) {
          this.reconnectAttempts = 0;
          this._openSocket();
        }
      },
      { signal: this._abortController.signal }
    );
  }

  connect(user) {
    if (this._disposed) return;
    if (user) {
      this.currentUser = { ...this.currentUser, ...user };
      this.appState.net.user = this.currentUser;
    }
    this._openSocket();
  }

  init(user) {
    this.connect(user);
  }

  updateUser(newUser) {
    this.currentUser = { ...this.currentUser, ...newUser };
    this.appState.net.user = this.currentUser;
    this._sendRaw({
      type: 'JOIN',
      username: this.currentUser.username,
      avatar: this.currentUser.avatar || '🐾'
    });
  }

  _cleanupSocket() {
    if (this._pingTimer !== null) {
      this._timers.clear(this._pingTimer);
      this._pingTimer = null;
    }
    if (this._reconnectTimer !== null) {
      this._timers.clear(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
        }
      } catch (e) {}
      this.socket = null;
    }
  }

  _scheduleReconnect() {
    if (this._disposed) return;
    if (this._reconnectTimer !== null) {
      this._timers.clear(this._reconnectTimer);
    }
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 8);
    const delay = Math.min(12000, 2500 * Math.pow(1.3, this.reconnectAttempts - 1));
    this._reconnectTimer = this._timers.setTimeout(() => {
      this._reconnectTimer = null;
      this._openSocket();
    }, delay);
  }

  _openSocket() {
    if (this._disposed) return;
    this._cleanupSocket();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3000';
    const wsUrl = `${protocol}//${host}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        if (this._disposed) return;
        this.connected = true;
        this.reconnectAttempts = 0;
        this.appState.net.connected = true;
        this.eventBus.emit('net:status', { connected: true, users: this.onlineUsers });

        if (this.currentUser) {
          this.socket.send(
            JSON.stringify({
              type: 'JOIN',
              username: this.currentUser.username,
              avatar: this.currentUser.avatar || '🐾'
            })
          );
        }

        while (this.pendingQueue.length > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
          const payload = this.pendingQueue.shift();
          this.socket.send(JSON.stringify(payload));
        }

        this._pingTimer = this._timers.setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'PING' }));
          }
        }, 15000);
      };

      this.socket.onmessage = (event) => {
        if (this._disposed) return;
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.warn('[Multiplayer] Error leyendo mensaje:', e);
        }
      };

      this.socket.onclose = () => {
        this.connected = false;
        if (this._pingTimer !== null) {
          this._timers.clear(this._pingTimer);
          this._pingTimer = null;
        }
        this.appState.net.connected = false;
        this.eventBus.emit('net:status', { connected: false, users: this.onlineUsers });
        if (!this._disposed) {
          this._scheduleReconnect();
        }
      };

      this.socket.onerror = () => {};
    } catch (e) {
      console.error('[Multiplayer] Error iniciando WebSocket:', e);
      this._scheduleReconnect();
    }
  }

  _sendRaw(payload, queueIfOffline = true) {
    if (this._disposed) return false;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return true;
    }
    if (queueIfOffline && this.pendingQueue.length < 25) {
      this.pendingQueue.push(payload);
    }
    return false;
  }

  _handleMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'JOIN_ACK') {
      if (msg.user && msg.user.id) {
        this.currentUser = { ...this.currentUser, id: msg.user.id };
        this.appState.net.user = this.currentUser;
      }
      this.onlineUsers = Array.isArray(msg.onlineUsers) ? msg.onlineUsers : [];
      this.appState.net.onlineUsers = this.onlineUsers;
      this.eventBus.emit('net:status', { connected: this.connected, users: this.onlineUsers });
    } else if (msg.type === 'USER_JOINED') {
      this.onlineUsers = Array.isArray(msg.onlineUsers) ? msg.onlineUsers : [];
      this.appState.net.onlineUsers = this.onlineUsers;
      this.eventBus.emit('net:status', { connected: this.connected, users: this.onlineUsers });
      if (msg.user) {
        this.eventBus.emit('chat:message', {
          author: 'Sistema',
          message: `👋 ${msg.user.avatar || '🐾'} <strong>${msg.user.username}</strong> se ha unido al mundo virtual.`,
          role: 'system',
          targetDog: 'ALL',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        this.eventBus.emit('world:activity', { text: `👋 ${msg.user.username} se unió a la sesión.`, level: 'info' });
      }
    } else if (msg.type === 'USER_LEFT') {
      this.onlineUsers = Array.isArray(msg.onlineUsers) ? msg.onlineUsers : [];
      this.appState.net.onlineUsers = this.onlineUsers;
      this.eventBus.emit('net:status', { connected: this.connected, users: this.onlineUsers });
      if (msg.user) {
        this.eventBus.emit('chat:message', {
          author: 'Sistema',
          message: `🚪 ${msg.user.avatar || '🐾'} <strong>${msg.user.username}</strong> salió de la sesión.`,
          role: 'system',
          targetDog: 'ALL',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        this.eventBus.emit('world:activity', { text: `🚪 ${msg.user.username} salió del mundo.`, level: 'info' });
      }
    } else if (msg.type === 'CHAT_COMMAND') {
      if (msg.sender && msg.text) {
        const isSelf = this.currentUser && msg.sender.username === this.currentUser.username;
        if (!isSelf) {
          this.eventBus.emit('chat:message', {
            author: `${msg.sender.avatar || '👤'} ${msg.sender.username}`,
            message: msg.text,
            role: 'user',
            targetDog: msg.targetRobot || this.appState.activeRobotName,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          this.eventBus.emit('world:activity', { text: `💬 ${msg.sender.username} ordenó: "${msg.text}"`, level: 'info' });
          this.eventBus.emit('input:action', {
            action: 'remote_chat_command',
            payload: { text: msg.text, targetRobot: msg.targetRobot || null, sender: msg.sender }
          });
        }
      }
    } else if (msg.type === 'ROBOT_ACTION') {
      this.eventBus.emit('net:robotAction', msg);
    } else if (msg.type === 'BALL_THROW') {
      this.eventBus.emit('net:ballThrow', msg);
    } else if (msg.type === 'TUNNEL_URL' && msg.tunnelUrl) {
      this.eventBus.emit('net:tunnelUrl', { tunnelUrl: msg.tunnelUrl });
    }
  }

  sendPosition(dog) {
    if (!dog || !dog.group || !this.connected) return false;
    const now = performance.now();
    if (now - this._lastPosSentMs < 120) return false;
    this._lastPosSentMs = now;
    const p = dog.group.position;
    return this._sendRaw(
      {
        type: 'ROBOT_ACTION',
        robotName: dog.name || this.appState.activeRobotName,
        action: 'sync_pose',
        emotion: dog.currentEmotion ? dog.currentEmotion.id : null,
        thought: `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${dog.group.rotation.y.toFixed(2)}`
      },
      false
    );
  }

  sendChat(msg, targetDog = null) {
    if (!msg) return false;
    return this._sendRaw({
      type: 'CHAT_COMMAND',
      text: msg,
      targetRobot: targetDog,
      username: this.currentUser ? this.currentUser.username : 'Humano',
      avatar: this.currentUser ? this.currentUser.avatar : '🐾'
    });
  }

  sendAction(action, data = {}) {
    if (!action) return false;
    return this._sendRaw({
      type: 'ROBOT_ACTION',
      robotName: data.robotName || this.appState.activeRobotName,
      action,
      emotion: data.emotion || null,
      thought: data.thought || null
    });
  }

  sendBallState(ball) {
    if (!ball || !ball.mesh) return false;
    const p = ball.mesh.position;
    const v = ball.velocity;
    return this._sendRaw(
      {
        type: 'BALL_THROW',
        origin: { x: p.x, y: p.y, z: p.z },
        direction: v ? { x: v.x, y: v.y, z: v.z } : { x: 0, y: 0, z: 0 },
        force: 1
      },
      false
    );
  }

  dispose() {
    this._disposed = true;
    this._abortController.abort();
    this._timers.clearAll();
    this._cleanupSocket();
    this.pendingQueue.length = 0;
    this.onlineUsers = [];
    this.connected = false;
    this.appState.net.connected = false;
    this.appState.net.onlineUsers = [];
  }
}
