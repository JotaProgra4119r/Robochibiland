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
  }

  init(user) {
    this.currentUser = user;
    this.connect();
  }

  updateUser(newUser) {
    this.currentUser = { ...this.currentUser, ...newUser };
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'JOIN',
        username: this.currentUser.username,
        avatar: this.currentUser.avatar || '🐾'
      }));
    }
  }

  connect() {
    if (this.socket) {
      try { this.socket.close(); } catch (e) {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // e.g. localhost:3000, 192.168.1.224:3000, or robochibi-1321.loca.lt
    const wsUrl = `${protocol}//${host}`;

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.connected = true;
        console.log("🟢 [Multiplayer] Conectado exitosamente al WebSocket del servidor.");
        if (this.onStatusChange) this.onStatusChange(true);

        // Enviar identificación del usuario registrado
        if (this.currentUser) {
          this.socket.send(JSON.stringify({
            type: 'JOIN',
            username: this.currentUser.username,
            avatar: this.currentUser.avatar || '🐾'
          }));
        }

        // Heartbeat periódico (evita caídas en móviles y túneles)
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
        console.log("🔴 [Multiplayer] Desconectado. Reintentando en 3s...");
        setTimeout(() => this.connect(), 3000);
      };

      this.socket.onerror = (err) => {
        console.warn("⚠️ [Multiplayer] WebSocket error:", err);
      };
    } catch (e) {
      console.error("Error iniciando WebSocket:", e);
    }
  }

  handleMessage(msg) {
    if (msg.type === 'JOIN_ACK') {
      this.currentUser = { ...this.currentUser, id: msg.user.id };
      this.onlineUsers = msg.onlineUsers || [];
      if (this.onUsersListUpdated) this.onUsersListUpdated(this.onlineUsers, this.currentUser);
    } else if (msg.type === 'USER_JOINED') {
      this.onlineUsers = msg.onlineUsers || [];
      if (this.onUserJoined) this.onUserJoined(msg.user);
      if (this.onUsersListUpdated) this.onUsersListUpdated(this.onlineUsers, this.currentUser);
    } else if (msg.type === 'USER_LEFT') {
      this.onlineUsers = msg.onlineUsers || [];
      if (this.onUserLeft) this.onUserLeft(msg.user);
      if (this.onUsersListUpdated) this.onUsersListUpdated(this.onlineUsers, this.currentUser);
    } else if (msg.type === 'CHAT_COMMAND') {
      if (this.onCommandReceived) {
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
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({
      type: 'CHAT_COMMAND',
      text,
      targetRobot,
      username: this.currentUser ? this.currentUser.username : 'Humano',
      avatar: this.currentUser ? this.currentUser.avatar : '🐾'
    }));
    return true;
  }

  sendRobotAction(robotName, action, emotion, thought) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      type: 'ROBOT_ACTION',
      robotName,
      action,
      emotion,
      thought
    }));
  }
}
