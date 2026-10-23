const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { WebSocketServer } = require('ws');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// Ruta principal explícita
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Crear servidor HTTP integrado con WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('error', (err) => {
  console.warn('WSS aviso:', err.message);
});

// Registro de clientes multi-usuario conectados
const connectedClients = new Map(); // ws -> { id, username, avatar, joinTime }
let nextClientId = 100;

function broadcast(payload, exceptWs = null) {
  const jsonStr = JSON.stringify(payload);
  for (const [clientWs] of connectedClients.entries()) {
    if (clientWs !== exceptWs && clientWs.readyState === 1) { // 1 = OPEN
      try {
        clientWs.send(jsonStr);
      } catch (e) {
        console.warn("Error enviando broadcast:", e.message);
      }
    }
  }
}

function getOnlineUsersList() {
  return Array.from(connectedClients.values()).map(c => ({
    id: c.id,
    username: c.username,
    avatar: c.avatar,
    joinTime: c.joinTime
  }));
}

wss.on('connection', (ws, req) => {
  const clientId = `usr_${++nextClientId}`;

  ws.on('message', (messageRaw) => {
    try {
      const msg = JSON.parse(messageRaw);

      if (msg.type === 'JOIN') {
        const username = (msg.username || `Humano_${clientId.slice(-3)}`).trim().slice(0, 24);
        const avatar = msg.avatar || '🐾';
        const userData = {
          id: clientId,
          username,
          avatar,
          joinTime: new Date().toISOString()
        };
        connectedClients.set(ws, userData);

        console.log(`👤 [Multiplayer] Usuario conectado: ${username} (${clientId}) | Total: ${connectedClients.size}`);

        // Enviar confirmación al usuario que acaba de entrar
        ws.send(JSON.stringify({
          type: 'JOIN_ACK',
          user: userData,
          onlineUsers: getOnlineUsersList()
        }));

        // Notificar a todos los demás usuarios conectados
        broadcast({
          type: 'USER_JOINED',
          user: userData,
          onlineUsers: getOnlineUsersList()
        }, ws);
      }

      else if (msg.type === 'CHAT_COMMAND') {
        const user = connectedClients.get(ws) || { username: msg.username || 'Visitante', avatar: msg.avatar || '🐾' };
        const text = (msg.text || '').trim();
        if (!text) return;

        console.log(`💬 [Multiplayer] Instrucción de ${user.username}: "${text}"`);

        // Reenviar a TODOS los usuarios conectados para sincronización total
        broadcast({
          type: 'CHAT_COMMAND',
          sender: user,
          text,
          targetRobot: msg.targetRobot || null,
          timestamp: new Date().toISOString()
        });
      }

      else if (msg.type === 'ROBOT_ACTION') {
        const user = connectedClients.get(ws) || { username: 'Robot' };
        broadcast({
          type: 'ROBOT_ACTION',
          sender: user,
          robotName: msg.robotName,
          action: msg.action,
          emotion: msg.emotion,
          thought: msg.thought,
          timestamp: new Date().toISOString()
        }, ws);
      }

      else if (msg.type === 'BALL_THROW') {
        const user = connectedClients.get(ws) || { username: 'Humano' };
        broadcast({
          type: 'BALL_THROW',
          sender: user,
          origin: msg.origin,
          direction: msg.direction,
          force: msg.force
        }, ws);
      }

      else if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {
      console.error('Error procesando mensaje WebSocket:', e);
    }
  });

  ws.on('close', () => {
    const user = connectedClients.get(ws);
    if (user) {
      console.log(`👋 [Multiplayer] Usuario desconectado: ${user.username} (${user.id}) | Restantes: ${connectedClients.size - 1}`);
      connectedClients.delete(ws);
      broadcast({
        type: 'USER_LEFT',
        user,
        onlineUsers: getOnlineUsersList()
      });
    }
  });

  ws.on('error', (err) => {
    console.warn(`WebSocket error (${clientId}):`, err.message);
  });
});

// API: Usuarios en línea
app.get('/api/users', (req, res) => {
  res.json({
    count: connectedClients.size,
    users: getOnlineUsersList()
  });
});

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

let currentTunnelUrl = null;
let cloudflareProcess = null;

function getTunnelUrl() {
  if (currentTunnelUrl) return currentTunnelUrl;
  const tunnelFile = path.join(__dirname, 'data', 'tunnel.txt');
  if (fs.existsSync(tunnelFile)) {
    const content = fs.readFileSync(tunnelFile, 'utf8').trim();
    if (content && content.startsWith('https://') && content.includes('.trycloudflare.com') && !content.includes('iron-accomplished')) {
      return content;
    }
  }
  return null;
}

function startCloudflareTunnel() {
  const cfExe = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(cfExe)) {
    console.log('ℹ️ cloudflared.exe no encontrado en el directorio raíz. Modo local activo.');
    return;
  }

  if (cloudflareProcess) {
    try { cloudflareProcess.kill(); } catch (e) {}
    cloudflareProcess = null;
  }

  try {
    const { execSync } = require('child_process');
    execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore' });
  } catch (e) {}

  console.log('🌐 Conectando túnel seguro Cloudflare para acceso externo...');
  try {
    const { spawn } = require('child_process');
    cloudflareProcess = spawn(cfExe, ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const handleOutput = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
      if (match) {
        const foundUrl = match[0];
        if (foundUrl !== currentTunnelUrl) {
          currentTunnelUrl = foundUrl;
          try {
            const tunnelDir = path.join(__dirname, 'data');
            if (!fs.existsSync(tunnelDir)) fs.mkdirSync(tunnelDir, { recursive: true });
            fs.writeFileSync(path.join(tunnelDir, 'tunnel.txt'), foundUrl, 'utf8');
          } catch (e) {
            console.warn('No se pudo guardar data/tunnel.txt:', e.message);
          }

          console.log('\n=======================================================');
          console.log('🚀 ¡TÚNEL CLOUDFLARE LISTO Y CONECTADO!');
          console.log(`📱 Enlace público para Celular / Internet:`);
          console.log(`   👉 ${foundUrl}`);
          console.log('=======================================================\n');

          broadcast({
            type: 'TUNNEL_URL',
            tunnelUrl: foundUrl
          });
        }
      }
    };

    cloudflareProcess.stdout.on('data', handleOutput);
    cloudflareProcess.stderr.on('data', handleOutput);

    cloudflareProcess.on('error', (err) => {
      console.warn('⚠️ Error en túnel Cloudflare:', err.message);
      cloudflareProcess = null;
    });

    cloudflareProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.log(`ℹ️ Proceso Cloudflare finalizado (código ${code})`);
      }
      cloudflareProcess = null;
    });
  } catch (err) {
    console.warn('⚠️ No se pudo iniciar el túnel Cloudflare:', err.message);
  }
}

function cleanupProcesses() {
  if (cloudflareProcess) {
    try {
      cloudflareProcess.kill();
    } catch (e) {}
    cloudflareProcess = null;
  }
}
process.on('exit', cleanupProcesses);
process.on('SIGINT', () => { cleanupProcesses(); process.exit(); });
process.on('SIGTERM', () => { cleanupProcesses(); process.exit(); });

// API: Información de red para compartir enlaces
app.get('/api/network-info', (req, res) => {
  const lanIp = getLocalIp();
  const tunnelUrl = getTunnelUrl();
  res.json({
    port: PORT,
    localUrl: `http://localhost:${PORT}`,
    lanUrl: `http://${lanIp}:${PORT}`,
    tunnelUrl: tunnelUrl || 'Generando túnel Cloudflare...'
  });
});

// API: Obtener memoria actual del robot
app.get('/api/memory', (req, res) => {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return res.status(404).json({ error: 'Archivo de memoria no encontrado' });
    }
    const data = fs.readFileSync(MEMORY_FILE, 'utf8');
    const json = JSON.parse(data);
    res.json(json);
  } catch (err) {
    console.error('Error al leer memoria:', err);
    res.status(500).json({ error: 'Error al leer memoria', details: err.message });
  }
});

// API: Guardar / Actualizar memoria completa
app.post('/api/memory', (req, res) => {
  try {
    const memoryData = req.body;
    memoryData.last_updated = new Date().toISOString();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryData, null, 2), 'utf8');
    res.json({ success: true, message: 'Memoria actualizada en disco', last_updated: memoryData.last_updated });
  } catch (err) {
    console.error('Error al guardar memoria:', err);
    res.status(500).json({ error: 'Error al guardar memoria', details: err.message });
  }
});

// API: Agregar entrada rápida al diario de vivencias
app.post('/api/memory/journal', (req, res) => {
  try {
    const { emotion, thought } = req.body;
    if (!thought) return res.status(400).json({ error: 'thought es requerido' });

    let memory = {};
    if (fs.existsSync(MEMORY_FILE)) {
      memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
    if (!Array.isArray(memory.journal)) memory.journal = [];

    const newEntry = {
      time: new Date().toISOString(),
      emotion: emotion || 'Curioso',
      thought: thought
    };

    memory.journal.push(newEntry);
    if (memory.journal.length > 80) {
      memory.journal = memory.journal.slice(-80);
    }
    memory.last_updated = new Date().toISOString();

    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf8');
    res.json({ success: true, entry: newEntry, total_entries: memory.journal.length });
  } catch (err) {
    console.error('Error al agregar journal:', err);
    res.status(500).json({ error: 'Error al agregar journal', details: err.message });
  }
});

// API: Agregar nuevo truco o movimiento aprendido
app.post('/api/memory/trick', (req, res) => {
  try {
    const { name, description, sequence, created_by } = req.body;
    if (!name || !sequence) return res.status(400).json({ error: 'name y sequence son requeridos' });

    let memory = {};
    if (fs.existsSync(MEMORY_FILE)) {
      memory = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
    }
    if (!Array.isArray(memory.learned_movements)) memory.learned_movements = [];

    const newTrick = {
      name,
      description: description || 'Movimiento ideado por la IA',
      sequence: Array.isArray(sequence) ? sequence : [sequence],
      created_by: created_by || 'Sparky-AI',
      timestamp: new Date().toISOString()
    };

    memory.learned_movements.push(newTrick);
    if (!memory.stats) memory.stats = {};
    memory.stats.tricks_invented = (memory.stats.tricks_invented || 0) + 1;
    memory.last_updated = new Date().toISOString();

    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf8');
    res.json({ success: true, trick: newTrick });
  } catch (err) {
    console.error('Error al registrar truco:', err);
    res.status(500).json({ error: 'Error al registrar truco', details: err.message });
  }
});

function cleanEndpointUrl(rawUrl) {
  if (!rawUrl) return 'http://127.0.0.1:31415/v1/chat/completions';
  let url = rawUrl.trim();
  const match = url.match(/https?:\/\/[^\s"']+/i);
  if (match) {
    url = match[0];
  }
  url = url.replace(/\/+$/, '');
  if (!url.endsWith('/chat/completions')) {
    if (url.endsWith('/v1')) {
      url += '/chat/completions';
    } else {
      url += '/v1/chat/completions';
    }
  }
  return url;
}

// API: Proxy para FreeLLMsAPI / OpenAI-compatible endpoint para eludir problemas de CORS
app.post('/api/llm/proxy', async (req, res) => {
  const { endpoint, apiKey, model, messages, max_tokens, temperature } = req.body;

  try {
    const targetUrl = cleanEndpointUrl(endpoint);
    console.log(`📡 Llamando a FreeLLMAPI en: ${targetUrl} [Modelo: ${model || 'auto'}]`);

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }

    const payload = {
      messages: messages || [],
      max_tokens: max_tokens || 140,
      temperature: temperature !== undefined ? temperature : 0.7
    };

    if (model && model.trim()) {
      payload.model = model.trim();
    } else {
      payload.model = 'auto';
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const data = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      parsed = { raw: data };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: `LLM API Error (${response.status})`,
        data: parsed
      });
    }

    res.json(parsed);
  } catch (err) {
    console.error('Error en proxy LLM:', err);
    res.status(500).json({ error: 'Fallo de conexión con FreeLLMsAPI', details: err.message });
  }
});

server.listen(PORT, HOST, () => {
  const lanIp = getLocalIp();
  console.log(`=======================================================`);
  console.log(`🐾 ROBO CHIBI 3D MULTI-USUARIO SERVIDOR ACTIVO 🐾`);
  console.log(`💻 En tu PC:          http://localhost:${PORT}`);
  console.log(`📶 En tu Celular WiFi: http://${lanIp}:${PORT}`);
  console.log(`🌍 Túnel público:      Conectando Cloudflare...`);
  console.log(`📁 Memoria robot:     ${MEMORY_FILE}`);
  console.log(`=======================================================`);

  startCloudflareTunnel();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && os.platform() === 'win32') {
    console.log(`⚠️ El puerto ${PORT} está ocupado por una instancia previa. Liberando puerto...`);
    try {
      const { execSync } = require('child_process');
      const out = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`).toString();
      const lines = out.trim().split('\n');
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== process.pid.toString()) {
          console.log(`Cerrando proceso previo PID: ${pid}`);
          try { execSync(`taskkill /F /PID ${pid}`); } catch (e) {}
        }
      });
      setTimeout(() => {
        server.listen(PORT, HOST, () => {
          console.log(`Servidor reanudado en http://localhost:${PORT}`);
        });
      }, 700);
    } catch (e) {
      console.warn('No se pudo liberar puerto 3000 automáticamente:', e.message);
    }
  } else {
    console.error('Error en servidor HTTP:', err);
  }
});
