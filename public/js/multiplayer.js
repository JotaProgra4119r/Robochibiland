// Real-Time WebSocket Multiplayer & Multi-User Collaboration Client for RoboChibiLand
export class MultiplayerClient {
  constructor(options = {}) {
    this.onCommandReceived = options.onCommandReceived || null;
    this.onUserJoined = options.onUserJoined || null;
    this.onUserLeft = options.onUserLeft || null;
    this.onUsersListUpdated = options.onUsersListUpdated || null;
    this.onRobotActionReceived = options.onRobotActionReceived || null;
    this.onStatusChange = options.onStatusChange || null;

    this.socket = null;
    this.connected = false;
    this.currentUser = null;
    this.onlineUsers = [];
    this.pingInterval = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.pendingQueue = [];

    // Reconnect immediately when network recovers
    window.addEventListener('online', () => {
      if (!this.connected && this.currentUser) {
        this.reconnectAttempts = 0;
        this.connect();
      }
    });
  }

  init(user) {
    this.currentUser = user;
    this.connect();
  }

  updateUser(newUser) {
    this.currentUser = { ...this.currentUser, ...newUser };
    this.sendRaw({
      type: 'JOIN',
      username: this.currentUser.username,
      avatar: this.currentUser.avatar || '🐾'
    });
  }

  cleanupSocket() {
    clearInterval(this.pingInterval);
    this.pingInterval = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      // Detach handlers first so closing old socket doesn't trigger a duplicate reconnect loop
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      try {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
        }
      } catch (e) { }
      this.socket = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 8);
    const delay = Math.min(12000, 2500 * Math.pow(1.3, this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  connect() {
    this.cleanupSocket();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:3000';
    const wsUrl = `${protocol}//${host}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log("🟢 [Multiplayer] Conectado exitosamente al WebSocket del servidor.");
        if (this.onStatusChange) this.onStatusChange(true);

        if (this.currentUser) {
          this.socket.send(JSON.stringify({
            type: 'JOIN',
            username: this.currentUser.username,
            avatar: this.currentUser.avatar || '🐾'
          }));
        }

        // Flush any queued messages sent while connecting
        while (this.pendingQueue.length > 0 && this.socket && this.socket.readyState === WebSocket.OPEN) {
          const payload = this.pendingQueue.shift();
          this.socket.send(JSON.stringify(payload));
        }

        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'PING' }));
          }
        }, 15000);
      };

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.warn("Error leyendo mensaje de servidor:", e);
        }
      };

      this.socket.onclose = () => {
        this.connected = false;
        clearInterval(this.pingInterval);
        if (this.onStatusChange) this.onStatusChange(false);
        console.log("🔴 [Multiplayer] Desconectado. Reintentando conexión...");
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn("⚠️ [Multiplayer] WebSocket aviso:", err);
      };
    } catch (e) {
      console.error("Error iniciando WebSocket:", e);
      this.scheduleReconnect();
    }
  }

  sendRaw(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return true;
    }
    if (this.pendingQueue.length < 25) {
      this.pendingQueue.push(payload);
    }
    return false;
  }

  handleMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'JOIN_ACK') {
      if (msg.user && msg.user.id) {
        this.currentUser = { ...this.currentUser, id: msg.user.id };
      }
      this.onlineUsers = Array.isArray(msg.onlineUsers) ? msg.onlineUsers : [];
      if (this.onUsersListUpdated) this.onUsersListUpdated(this.onlineUsers, this.currentUser);
    } else if (msg.type === 'USER_JOINED') {
      this.onlineUsers = Array.isArray(msg.onlineUsers) ? msg.onlineUsers : [];
      if (msg.user && this.onUserJoined) this.onUserJoined(msg.user);
      if (this.onUsersListUpdated) this.onUsersListUpdated(this.onlineUsers, this.currentUser);
    } else if (msg.type === 'USER_LEFT') {
      this.onlineUsers = Array.isArray(msg.onlineUsers) ? msg.onlineUsers : [];
      if (msg.user && this.onUserLeft) this.onUserLeft(msg.user);
      if (this.onUsersListUpdated) this.onUsersListUpdated(this.onlineUsers, this.currentUser);
    } else if (msg.type === 'CHAT_COMMAND') {
      if (this.onCommandReceived && msg.sender && msg.text) {
        this.onCommandReceived(msg.sender, msg.text, msg.targetRobot);
      }
    } else if (msg.type === 'ROBOT_ACTION') {
      if (this.onRobotActionReceived) {
        this.onRobotActionReceived(msg.robotName, msg.action, msg.emotion, msg.thought, msg.sender);
      }
    } else if (msg.type === 'TUNNEL_URL') {
      const tunInput = document.getElementById('share-tunnel-url');
      if (tunInput && msg.tunnelUrl) {
        tunInput.value = msg.tunnelUrl;
      }
    }
  }

  sendChatCommand(text, targetRobot = null) {
    if (!text) return false;
    return this.sendRaw({
      type: 'CHAT_COMMAND',
      text,
      targetRobot,
      username: this.currentUser ? this.currentUser.username : 'Humano',
      avatar: this.currentUser ? this.currentUser.avatar : '🐾'
    });
  }

  sendRobotAction(robotName, action, emotion, thought) {
    this.sendRaw({
      type: 'ROBOT_ACTION',
      robotName,
      action,
      emotion,
      thought
    });
  }
}