// Cognitive Engine & FreeLLMAPI Router with Zero-Alloc Navigation, Managed Timers & EventBus Dispatch
import * as THREE from 'three';
import { EMOTIONS } from './emotions.js';
import { roboAudio } from './audio.js';
import { eventBus as defaultEventBus } from './core/EventBus.js';
import { appState } from './core/AppState.js';
import { TMP, dampAngle, TimerRegistry } from './core/Scratch.js';

const TRICK_TITLES = [
  'Tornado Cibernético',
  'Súper Combo Lunar',
  'Acrobacia Rayo',
  'Baile Sónico'
];
const TRICK_MOVES = ['jump', 'spin', 'backflip', 'wave', 'dance', 'roll', 'howl'];
const DIRECT_ANIMS = new Set([
  'walk', 'run', 'sit', 'lieDown', 'jump', 'wagTail', 'bark', 'sniff', 'scratch',
  'backflip', 'spin', 'roll', 'wave', 'recharge', 'dig', 'howl', 'dance', 'sneak',
  'playBow', 'headTilt', 'bellyRub', 'beg', 'shakeOff', 'nuzzle', 'dizzy',
  'swimming', 'patrolLook', 'scentTrack'
]);
const INTERACTION_TO_ACTION = {
  bounce_trampoline: 'go_trampoline',
  kick_ball: 'go_ball',
  eat_snack: 'go_snack',
  drink_water: 'go_fountain',
  ride_carousel: 'go_carousel',
  dance_disco: 'go_disco',
  recharge: 'go_doghouse',
  cross_bridge: 'go_bridge',
  ride_seesaw: 'go_seesaw'
};

export class RobotBrain {
  constructor(packManager, world, particles, vision, eventBus = defaultEventBus) {
    this.packManager = packManager;
    this.world = world;
    this.particleSystem = particles;
    this.vision = vision;
    this.eventBus = eventBus;

    let storedModel = localStorage.getItem('freellm_model');
    if (!storedModel || storedModel === 'gpt-3.5-turbo') {
      storedModel = 'auto';
      localStorage.setItem('freellm_model', 'auto');
    }

    const storedKey = localStorage.getItem('freellm_apikey') || '';
    let storedEndpoint = localStorage.getItem('freellm_endpoint');
    if (!storedEndpoint) {
      storedEndpoint = 'http://127.0.0.1:31415/v1/chat/completions';
      localStorage.setItem('freellm_endpoint', storedEndpoint);
    }

    this.config = {
      enabled: true,
      endpoint: storedEndpoint,
      apiKey: storedKey,
      model: storedModel,
      systemPrompt: localStorage.getItem('freellm_system_prompt') || '',
      intervalSeconds: parseInt(localStorage.getItem('freellm_interval') || '10', 10),
      autoThink: false
    };

    this.thinkCooldown = 0;
    this.isThinking = false;
    this.isNavigating = false;
    this.navSpeed = 4.8;
    this.navTimer = 0;
    this.navMaxTime = 16.0;
    this.navStuckTime = 0;
    this.onArrivalCallback = null;
    this.lastThought = 'Iniciando mis sensores en el prado verde...';
    this.isVoiceEnabled = appState.isVoiceEnabled !== false;
    this.memoryData = null;

    // Pre-allocated navigation scratch & obstacle list (zero per-frame allocations)
    this._navTarget = new THREE.Vector3();
    this._navLastPos = new THREE.Vector3();
    this._nearObstacles = [];
    this._timers = new TimerRegistry();
    this._unsubs = [];
    this._disposed = false;

    this._unsubs.push(
      this.eventBus.on('robot:switched', ({ robot }) => {
        this.onRobotSwitched(robot);
      }),
      this.eventBus.on('input:action', ({ action, payload }) => {
        if (action === 'remote_chat_command' && payload && payload.text) {
          this.handleUserCommand(payload.text, payload.targetRobot);
        } else if (action === 'brain_action' && payload && payload.action) {
          this.executeAction(payload.action, payload.interaction || null);
        }
      }),
      this.eventBus.on('app:dispose', () => {
        this.dispose();
      })
    );

    this.loadMemoryFromDisk();
  }

  getActiveRobot() {
    if (this.packManager) {
      if (this.packManager.playerDog) return this.packManager.playerDog;
      if (typeof this.packManager.getDog === 'function') {
        const d = this.packManager.getDog(appState.activeRobotName);
        if (d) return d;
      }
      if (this.packManager.currentControlledRobot) return this.packManager.currentControlledRobot;
    }
    return this._robotRef || null;
  }

  _getAnim(dog) {
    return dog ? (dog.animController || dog.anim || null) : null;
  }

  _setDogVelocityY(dog, vy) {
    if (!dog) return;
    if (dog.physics) {
      dog.physics.velocityY = vy;
      dog.physics.isGrounded = false;
    } else {
      dog.velocityY = vy;
    }
  }

  _getProfile(dog) {
    if (!dog) return { name: 'Sparky', title: 'Explorador', description: '', speedMultiplier: 1.0, voicePitch: 1.0 };
    return dog.profile || {
      name: dog.name || 'Sparky',
      title: dog.title || 'RoboPup',
      description: dog.description || 'Cachorro robot curioso',
      speedMultiplier: dog.speedMultiplier || 1.0,
      voicePitch: dog.voicePitch || 1.0
    };
  }

  _getRandomThought(dog) {
    if (!dog) return 'Explorando con alegría.';
    if (typeof dog.getRandomPersonalThought === 'function') return dog.getRandomPersonalThought();
    const thoughts = dog.profile?.thoughts || dog.thoughts;
    if (Array.isArray(thoughts) && thoughts.length > 0) {
      return thoughts[Math.floor(Math.random() * thoughts.length)];
    }
    return 'Explorando felizmente el prado verde.';
  }

  onRobotSwitched(newRobot) {
    this.cancelNavigation();
    this._robotRef = newRobot;
    if (!newRobot) return;
    this.lastThought = this._getRandomThought(newRobot);
    this.eventBus.emit('robot:thought', {
      name: newRobot.name,
      thought: this.lastThought,
      emotion: newRobot.currentEmotion ? newRobot.currentEmotion.id : 'HAPPY',
      action: null
    });
  }

  cancelNavigation() {
    this._timers.clearAll();
    if (this.isNavigating) {
      this.isNavigating = false;
      this.onArrivalCallback = null;
      appState.navigation.active = false;
      appState.navigation.target = null;
      appState.navigation.mode = null;
      const dog = this.getActiveRobot();
      if (dog && typeof dog.clearMission === 'function') {
        dog.clearMission();
      }
    }
  }

  speakThought(text, pitch = 1.0) {
    if (!this.isVoiceEnabled || !appState.isVoiceEnabled || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const clean = String(text)
        .replace(/\[.*?\]/g, '')
        .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]/gu, '')
        .trim();
      if (!clean) return;

      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'es-ES';
      utter.pitch = THREE.MathUtils.clamp((pitch || 1.0) * 1.3, 0.9, 1.9);
      utter.rate = 1.12;
      utter.volume = 0.8;

      const voices = window.speechSynthesis.getVoices();
      for (let i = 0; i < voices.length; i++) {
        if (voices[i].lang && voices[i].lang.toLowerCase().startsWith('es')) {
          utter.voice = voices[i];
          break;
        }
      }
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  saveConfig() {
    localStorage.setItem('freellm_endpoint', this.config.endpoint);
    localStorage.setItem('freellm_apikey', this.config.apiKey);
    localStorage.setItem('freellm_model', this.config.model);
    localStorage.setItem('freellm_system_prompt', this.config.systemPrompt || '');
    localStorage.setItem('freellm_interval', String(this.config.intervalSeconds));
  }

  async loadMemoryFromDisk() {
    try {
      const res = await fetch('/api/memory');
      if (res.ok) {
        this.memoryData = await res.json();
        this.eventBus.emit('brain:memoryUpdated', { memoryData: this.memoryData });
        return;
      }
    } catch (e) {}

    const localSaved = localStorage.getItem('robo_chibi_memory_local');
    if (localSaved) {
      try {
        this.memoryData = JSON.parse(localSaved);
        this.eventBus.emit('brain:memoryUpdated', { memoryData: this.memoryData });
        return;
      } catch (e) {}
    }

    this.memoryData = {
      robot_name: 'Manada Chibi CyberPups',
      model_type: 'Chibi-CyberPup v2.5 Modular',
      personality: '5 Personalidades Únicas (Sparky, Bolt, Pixel, Luna, Rusty)',
      discovered_places: [
        { name: 'Prado Esmeralda', emotion_felt: 'Feliz' },
        { name: 'Lago de Cristal', emotion_felt: 'Curioso' },
        { name: 'Parque de Juegos', emotion_felt: 'Emocionado' },
        { name: 'Trampolín de Salto', emotion_felt: 'Juguetón' },
        { name: 'Pista Disco', emotion_felt: 'Feliz' }
      ],
      friends: [
        { name: 'Sparky', trait: 'Curioso y explorador' },
        { name: 'Bolt', trait: 'Velocista fanático de las pelotas' },
        { name: 'Pixel', trait: 'Hacker y observador del lago' },
        { name: 'Luna', trait: 'Soñadora y cariñosa' },
        { name: 'Rusty', trait: 'Acróbata del parque' }
      ],
      learned_movements: [
        { name: 'Baile de la Alegría', sequence: ['spin', 'wagTail', 'bark', 'jump'] },
        { name: 'Salto Curioso', sequence: ['sniff', 'jump', 'wagTail'] },
        { name: 'Voltereta Eléctrica', sequence: ['jump', 'backflip', 'wagTail'] }
      ],
      journal: [
        { time: new Date().toISOString(), emotion: 'Curioso', thought: 'La manada de perritos robots está explorando el mundo 3D juntos.' }
      ]
    };
    this.eventBus.emit('brain:memoryUpdated', { memoryData: this.memoryData });
  }

  async addJournalEntry(emotion, thought) {
    if (!this.memoryData || this._disposed) return;
    const dog = this.getActiveRobot();
    const author = dog ? dog.name : 'Sparky';
    const entry = {
      author,
      time: new Date().toISOString(),
      emotion,
      thought
    };
    if (!Array.isArray(this.memoryData.journal)) this.memoryData.journal = [];
    this.memoryData.journal.push(entry);
    if (this.memoryData.journal.length > 80) this.memoryData.journal.shift();

    try {
      localStorage.setItem('robo_chibi_memory_local', JSON.stringify(this.memoryData));
    } catch (e) {}

    this.eventBus.emit('brain:memoryUpdated', { memoryData: this.memoryData });

    try {
      await fetch('/api/memory/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emotion, thought: `[${author}] ${thought}` })
      });
    } catch (e) {}
  }

  async addLearnedTrick(name, description, sequence) {
    if (!this.memoryData || this._disposed) return;
    const dog = this.getActiveRobot();
    const author = dog ? dog.name : 'Sparky';
    const trick = {
      name,
      description,
      sequence,
      created_by: author,
      timestamp: new Date().toISOString()
    };
    if (!Array.isArray(this.memoryData.learned_movements)) this.memoryData.learned_movements = [];
    this.memoryData.learned_movements.push(trick);

    try {
      localStorage.setItem('robo_chibi_memory_local', JSON.stringify(this.memoryData));
    } catch (e) {}

    this.eventBus.emit('brain:memoryUpdated', { memoryData: this.memoryData });

    try {
      await fetch('/api/memory/trick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trick)
      });
    } catch (e) {}
  }

  update(dt) {
    if (this._disposed) return;
    if (this.config.autoThink) {
      this.thinkCooldown -= dt;
      if (this.thinkCooldown <= 0 && !this.isThinking) {
        this.thinkCooldown = Math.max(5, this.config.intervalSeconds);
        this.triggerFreeWillThought();
      }
    }
  }

  handleUserCommand(text, targetDogName = null) {
    if (!text || this._disposed) return;
    if (
      targetDogName &&
      targetDogName !== 'ALL' &&
      this.packManager &&
      typeof this.packManager.setPlayerDog === 'function' &&
      appState.activeRobotName !== targetDogName
    ) {
      this.packManager.setPlayerDog(targetDogName);
    }
    this.think(text);
  }

  triggerFreeWillThought() {
    if (this._disposed || this.isThinking) return;
    this.think(null);
  }

  async pingLlm() {
    const t0 = performance.now();
    try {
      const res = await fetch('/api/llm/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: this.config.endpoint,
          apiKey: this.config.apiKey,
          model: this.config.model,
          messages: [{ role: 'user', content: 'Di "OK" en 2 palabras' }],
          max_tokens: 16
        })
      });
      const latencyMs = Math.round(performance.now() - t0);
      const data = await res.json();
      appState.telemetry.apiCalls++;
      if (res.ok && data.choices && data.choices.length > 0) {
        const reply = data.choices[0].message?.content || 'Conectado';
        appState.telemetry.aiPingMs = latencyMs;
        this.eventBus.emit('telemetry:llm', {
          latencyMs,
          model: data.model || this.config.model,
          ok: true,
          preview: reply,
          totalCalls: appState.telemetry.apiCalls
        });
        return { ok: true, latencyMs, model: data.model || this.config.model, reply };
      }
      const errMsg = data.error?.message || data.error || 'Error de autenticación/endpoint';
      this.eventBus.emit('telemetry:llm', {
        latencyMs,
        model: this.config.model,
        ok: false,
        preview: errMsg,
        totalCalls: appState.telemetry.apiCalls
      });
      return { ok: false, latencyMs, error: errMsg };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - t0);
      this.eventBus.emit('telemetry:llm', {
        latencyMs,
        model: this.config.model,
        ok: false,
        preview: err.message,
        totalCalls: appState.telemetry.apiCalls
      });
      return { ok: false, latencyMs, error: err.message };
    }
  }

  async think(customUserPrompt = null) {
    if (this.isThinking || this._disposed) return;
    const dog = this.getActiveRobot();
    if (!dog) return;

    this.isThinking = true;
    this.eventBus.emit('brain:status', { thinking: true });

    let dispatchedAction = null;
    const profile = this._getProfile(dog);

    if (customUserPrompt) {
      const immediate = this.extractIntentFromText(null, customUserPrompt, dog);
      if (immediate && immediate.action && !immediate.invent_movement) {
        dispatchedAction = immediate.action;
        this.executeAction(immediate.action, immediate.interaction);
        if (immediate.emotion && EMOTIONS[immediate.emotion]) {
          dog.setEmotion(EMOTIONS[immediate.emotion]);
        }
        roboAudio.playBoop(profile.voicePitch || 1.0);
      }
    }

    const body = this.vision && typeof this.vision.getBodyState === 'function'
      ? this.vision.getBodyState(dog)
      : {
          name: dog.name,
          position: {
            x: Number(dog.group.position.x.toFixed(1)),
            y: Number(dog.group.position.y.toFixed(1)),
            z: Number(dog.group.position.z.toFixed(1))
          },
          current_area: this.vision ? this.vision.getCurrentLocationName(dog.group.position) : 'Prado Esmeralda',
          current_emotion: dog.currentEmotion ? dog.currentEmotion.name : 'Feliz'
        };

    const visibleObjects = this.vision && typeof this.vision.getVisualSnapshot === 'function'
      ? this.vision.getVisualSnapshot(dog)
      : [];

    const recentMemories = (this.memoryData && Array.isArray(this.memoryData.journal))
      ? this.memoryData.journal.slice(-2).map(j => `[${j.author || 'Perrito'}]: ${j.thought}`)
      : [];

    const sensoryContext = {
      robot_active: dog.name,
      title: profile.title,
      body,
      canine_drives: {
        energy: Math.round(dog.energy ?? 100),
        affection: Math.round(dog.affection ?? 88),
        hydration: Math.round(dog.hydration ?? 90),
        curiosity: Math.round(dog.curiosity ?? 85),
        playfulness: Math.round(dog.playfulness ?? 80)
      },
      sees: visibleObjects,
      holding_in_mouth: dog.carriedObject ? 'Pelota de juego' : 'nada',
      recent_memories: recentMemories,
      user_command: customUserPrompt || null
    };

    let decision = null;
    if (this.config.apiKey && this.config.endpoint) {
      try {
        decision = await this.callLLM(sensoryContext, dog);
      } catch (err) {
        console.warn('[RobotBrain] Fallback heurístico:', err.message);
        decision = this.heuristicDecision(sensoryContext, dog);
      }
    } else {
      decision = this.heuristicDecision(sensoryContext, dog);
    }

    if (!this._disposed) {
      this.applyDecision(decision, dispatchedAction, dog);
    }

    this.isThinking = false;
    this.eventBus.emit('brain:status', { thinking: false });
  }

  async callLLM(sensoryContext, dog) {
    const p = this._getProfile(dog);
    let systemPrompt = `Eres ${p.name} (${p.title}), un perrito robot inteligente con cognición canina avanzada, etología y libre albedrío en un mundo virtual 3D.
Tu personalidad: ${p.description}.
Tus impulsos biológicos caninos actuales son: ${JSON.stringify(sensoryContext.canine_drives)}.
Lugares interactivos: "lago", "trampolin", "carrusel", "porteria", "disco", "snack", "casita", "manada".
Conducta canina: playBow, headTilt, bellyRub, beg, shakeOff, nuzzle, fetch_ball, praise_burst, chorus_howl, scent_track.
Movimientos: walk, run, sit, lieDown, jump, wagTail, bark, sniff, scratch, backflip, spin, roll, wave, recharge, dig, howl, dance, sneak.
Navegación: go_lake, go_playground, go_ball, go_trampoline, go_carousel, go_disco, go_snack, go_doghouse, go_fountain, go_bridge, go_seesaw, go_ballpit, go_slide, go_tunnel, go_target, go_pinata, go_robot_Sparky, go_robot_Bolt, go_robot_Pixel, go_robot_Luna, go_robot_Rusty, call_pack.
Emociones: HAPPY, CURIOUS, LOVING, EXCITED, SLEEPY, ALERT, MISCHIEVOUS, PROUD, SCARED, HUNGRY, PARTY, CONFUSED.
Responde SIEMPRE JSON válido exacto:
{"thought":"...","emotion":"HAPPY","action":"playBow","interaction":"none","invent_movement":null,"remember":"..."}`;

    if (this.config.systemPrompt && this.config.systemPrompt.trim()) {
      systemPrompt = `${this.config.systemPrompt.trim()}\n\n${systemPrompt}`;
    }

    const t0 = performance.now();
    const res = await fetch('/api/llm/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(sensoryContext) }
        ],
        max_tokens: 280,
        temperature: 0.7
      })
    });

    const latencyMs = Math.round(performance.now() - t0);
    appState.telemetry.apiCalls++;

    if (!res.ok) {
      this.eventBus.emit('telemetry:llm', {
        latencyMs,
        model: this.config.model,
        ok: false,
        preview: `HTTP ${res.status}`,
        totalCalls: appState.telemetry.apiCalls
      });
      throw new Error(`Proxy error ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';

    appState.telemetry.aiPingMs = latencyMs;
    this.eventBus.emit('telemetry:llm', {
      latencyMs,
      model: data.model || this.config.model,
      ok: true,
      preview: content,
      totalCalls: appState.telemetry.apiCalls
    });

    return this.parseLLMResponse(content, sensoryContext.user_command, dog);
  }

  cleanThought(raw) {
    if (!raw) return '¡Guau guau! ¡Entendido!';
    let s = String(raw).trim();
    const tMatch = s.match(/(?:^|[{,\s])["']?thought["']?\s*:\s*["']?([^"',}\n]+)["']?/i);
    if (tMatch) {
      s = tMatch[1].trim();
    } else {
      s = s.replace(/^[{\s"']*thought["']?\s*:\s*/i, '');
      s = s.replace(/,?\s*["']?emotion["']?\s*:\s*[^,}\n]+/gi, '');
      s = s.replace(/,?\s*["']?action["']?\s*:\s*[^,}\n]+/gi, '');
      s = s.replace(/,?\s*["']?interaction["']?\s*:\s*[^,}\n]+/gi, '');
      s = s.replace(/[{}"\\]/g, '').trim();
    }
    return s || '¡Guau guau!';
  }

  parseLLMResponse(content, userCommand, dog) {
    if (!content) return this.heuristicDecision({ user_command: userCommand }, dog);

    let jsonStr = '';
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = content.substring(firstBrace, lastBrace + 1).trim();
      }
    }

    let parsed = null;
    if (jsonStr) {
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {}
    }

    if (parsed && typeof parsed === 'object') {
      const emotionKey = (parsed.emotion || 'HAPPY').toUpperCase();
      return {
        thought: this.cleanThought(parsed.thought || content.substring(0, 120)),
        emotion: EMOTIONS[emotionKey] ? emotionKey : 'HAPPY',
        action: parsed.action || 'wagTail',
        interaction: parsed.interaction || null,
        invent_movement: parsed.invent_movement || null,
        remember: parsed.remember || null
      };
    }

    return this.extractIntentFromText(content, userCommand, dog);
  }

  extractIntentFromText(text, userCommand, dog = this.getActiveRobot()) {
    const combined = `${userCommand || ''} ${text || ''}`.toLowerCase();
    const p = this._getProfile(dog);

    let thought = text ? this.cleanThought(text) : '¡Guau! ¡Enseguida lo hago!';
    let emotion = 'HAPPY';
    let action = 'wagTail';
    let interaction = null;
    let invent = null;
    let remember = null;

    if (/buen chico|buena chica|good boy|good girl|hermoso|precioso|te quiero|te amo|lindo perro|crack|campe[oó]n|bien hecho|buen perrito/i.test(combined)) {
      return {
        thought: '¡Guau guau! ❤️ ¡Gracias humano! ¡Me siento el cachorro más feliz y leal del mundo!',
        emotion: 'LOVING',
        action: 'praise_burst',
        interaction: null,
        invent_movement: null,
        remember: 'Mi humano me dijo "buen chico"; sentí una gran felicidad.'
      };
    }

    if (/busca la pelota|trae la pelota|ve por la pelota|juega a la pelota|fetch|ve por el bal[oó]n|tr[aá]emela/i.test(combined)) {
      return {
        thought: '¡Allá voy! ¡Voy a perseguir la pelota a toda velocidad, la atraparé y te la traeré a tus pies!',
        emotion: 'EXCITED',
        action: 'fetch_ball',
        interaction: null,
        invent_movement: null,
        remember: 'Jugamos a traer la pelota.'
      };
    }

    if (/juguemos|a jugar|reverencia|postura de juego|play bow/i.test(combined)) {
      action = 'playBow';
      emotion = 'EXCITED';
      thought = '¡Hago una reverencia de juego! ¡Bajo el pecho y levanto la colita para invitarte a jugar!';
    } else if (/ladea la cabeza|qu[eé] dices|escucha|atento|head tilt/i.test(combined)) {
      action = 'headTilt';
      emotion = 'CURIOUS';
      thought = 'Ladeo mi cabecita y oriento mis orejas para escucharte con atención.';
    } else if (/panza arriba|barriga|cosquillas|belly rub|acaricia la panza/i.test(combined)) {
      action = 'bellyRub';
      emotion = 'LOVING';
      thought = 'Me tiro de espaldas panza arriba con las patitas al aire... ¡Mimos por favor!';
    } else if (/pide|dos patas|suplica|beg/i.test(combined)) {
      action = 'beg';
      emotion = 'HUNGRY';
      thought = 'Me siento sobre mis patitas traseras y levanto las delanteras pidiendo con ternura.';
    } else if (/sac[uú]dete|sacudida|shake off/i.test(combined)) {
      action = 'shakeOff';
      emotion = 'HAPPY';
      thought = 'Me sacudo enérgicamente de cabeza a cola para liberar energía.';
    } else if (/hocico|beso|mimos|boop|nuzzle/i.test(combined)) {
      action = 'nuzzle';
      emotion = 'LOVING';
      thought = 'Acerco mi hocico suavemente para darte un cariñoso "boop".';
    } else if (/a[uú]llen todos|aullido de manada|coro|chorus/i.test(combined)) {
      action = 'chorus_howl';
      emotion = 'EXCITED';
      thought = '¡Auuuú! ¡Convoco a toda la manada a un coro de aullidos al cielo!';
    } else if (/rastrea|olfatea el suelo|sigue el rastro|scent/i.test(combined)) {
      action = 'scent_track';
      emotion = 'CURIOUS';
      thought = 'Bajo mi nariz cibernética al suelo para seguir los rastros de olor en la hierba.';
    } else if (/patrull|per[ií]metro|vigil/i.test(combined)) {
      action = 'patrol_perimeter';
      emotion = 'ALERT';
      thought = '¡Iniciando ronda de vigilancia por los límites y pinos del parque!';
    } else if (/persigue tu cola|mu[eé]rdete la cola|cola gira|chase tail/i.test(combined)) {
      action = 'chase_tail';
      emotion = 'EXCITED';
      thought = '¡A ver si atrapo mi propia cola! ¡Gira, gira sin parar!';
    } else if (/aros|slalom|salto de aros/i.test(combined)) {
      action = 'slalom_rings';
      emotion = 'EXCITED';
      thought = '¡Voy directo a cruzar el circuito de aros con saltos parabólicos!';
    } else if (/remata|chuta|golpe fuerte|patea a porter[ií]a|mete gol/i.test(combined)) {
      action = 'soccer_kick';
      emotion = 'EXCITED';
      thought = '¡Me coloco detrás del balón gigante y suelto un cañonazo a la portería!';
    } else if (/salta en el trampol[ií]n|pirueta trampol[ií]n|s[uú]per salto/i.test(combined)) {
      action = 'trampoline_trick';
      emotion = 'EXCITED';
      thought = '¡A la cama elástica a dar rebotes cada vez más altos con voltereta!';
    } else if (/sube al tobog[aá]n|desl[ií]zate|l[aá]nzate por el tobog[aá]n/i.test(combined)) {
      action = 'slide_down';
      emotion = 'EXCITED';
      thought = '¡Subo la torre del tobogán y me lanzo deslizándome hasta abajo!';
    } else if (/nada en el lago|chapotear|al agua|b[aá]ñate/i.test(combined)) {
      action = 'lake_swim';
      emotion = 'HAPPY';
      thought = '¡Al lago a chapotear y nadar con mis patitas bajo el agua fresca!';
    } else if (/la traes|juguemos a la traes|atr[aá]pame|tag/i.test(combined)) {
      action = 'play_tag';
      emotion = 'EXCITED';
      thought = '¡Juguemos a la traes! ¡Toco a un amigo y salgo corriendo!';
    } else if (/carrera|competencia|reto de velocidad|race/i.test(combined)) {
      action = 'speed_race';
      emotion = 'EXCITED';
      thought = '¡Desafío de carrera! ¡Nos alineamos y a toda velocidad a la meta!';
    } else if (/chismorreo|reuni[oó]n en c[ií]rculo|j[uú]ntense/i.test(combined)) {
      action = 'pack_gossip';
      emotion = 'HAPPY';
      thought = '¡Reunión secreta de la manada en círculo para saludarnos y charlar!';
    } else if (/desentierra|tesoro|cava tesoro|busca tesoro/i.test(combined)) {
      action = 'dig_treasure';
      emotion = 'CURIOUS';
      thought = '¡Mis sensores olfatean algo enterrado cerca de un pino! ¡A cavar!';
    } else if (/caza mariposa|atrapa la mariposa|mariposa/i.test(combined)) {
      action = 'hunt_butterfly';
      emotion = 'CURIOUS';
      thought = '¡Veo una mariposa brillante flotando bajo! Modo sigilo activado... ¡y salto!';
    } else if (/siesta|sombra|descansa bajo el pino|recarga en la sombra/i.test(combined)) {
      action = 'shade_nap';
      emotion = 'SLEEPY';
      thought = 'Mis baterías piden una siesta relajante bajo la sombra fresca de un pino... Zzz.';
    } else if (/mimos a la c[aá]mara|panza arriba c[aá]mara|ac[eé]rcate a m[ií]/i.test(combined)) {
      action = 'beg_pets';
      emotion = 'LOVING';
      thought = '¡Voy corriendo hacia ti para pedirte mimos con la pancita arriba!';
    }

    if (/fiesta|disco|bail|m[uú]sica|dj/i.test(combined)) emotion = 'PARTY';
    else if (/travies|broma|p[ií]caro|mischief/i.test(combined)) emotion = 'MISCHIEVOUS';
    else if (/pro|crack|orgull|campe[oó]n|sunglasses/i.test(combined)) emotion = 'PROUD';
    else if (/miedo|asust|peligro|cuidado|scared/i.test(combined)) emotion = 'SCARED';
    else if (/hambre|galleta|snack|com|rico|delici/i.test(combined)) emotion = 'HUNGRY';
    else if (/qu[eé]|c[oó]mo|d[oó]nde|confund|despist/i.test(combined)) emotion = 'CONFUSED';
    else if (/amor|te quiero|lindo|hermoso|cariñ/i.test(combined)) emotion = 'LOVING';
    else if (/explor|qu[eé] ves|busca|mira|observ/i.test(combined)) emotion = 'CURIOUS';
    else if (/r[aá]pido|corre|vamos|salta|gol|f[uú]tbol/i.test(combined)) emotion = 'EXCITED';

    if (/lago|orilla|bote|nadar|lake/i.test(combined) && action === 'wagTail') {
      action = 'go_lake';
      interaction = 'drink_water';
      thought = '¡Voy corriendo hacia el Lago de Cristal!';
    } else if (/trampol[ií]n|cama el[aá]stica|rebot/i.test(combined) && action === 'wagTail') {
      action = 'go_trampoline';
      interaction = 'bounce_trampoline';
      emotion = 'EXCITED';
      thought = '¡Vamos al trampolín a saltar hasta las nubes!';
    } else if (/carrusel|rueda|giratorio|carousel/i.test(combined)) {
      action = 'go_carousel';
      interaction = 'ride_carousel';
      thought = '¡Al carrusel giratorio a dar vueltas!';
    } else if (/pelota|bal[oó]n|f[uú]tbol|porter[ií]a|arco|patea/i.test(combined) && action === 'wagTail') {
      action = 'go_ball';
      interaction = 'kick_ball';
      emotion = 'EXCITED';
      thought = '¡A jugar al fútbol! ¡Voy por el balón para meter gol!';
    } else if (/disco|fiesta|pista de baile|perrea/i.test(combined)) {
      action = 'go_disco';
      interaction = 'dance_disco';
      emotion = 'PARTY';
      thought = '¡Activando modo fiesta en la pista de baile disco!';
    } else if (/galleta|snack|comer|comida|hambre/i.test(combined)) {
      action = 'go_snack';
      interaction = 'eat_snack';
      emotion = 'HUNGRY';
      thought = '¡Qué rico! ¡Voy por una ciborgalleta energética!';
    } else if (/parque|juegos|playground/i.test(combined)) {
      action = 'go_playground';
      thought = '¡Rumbo al centro del parque de juegos!';
    } else if (/casita|doghouse|estaci[oó]n|recarg/i.test(combined)) {
      action = 'go_doghouse';
      interaction = 'recharge';
      emotion = 'SLEEPY';
      thought = 'Voy a mi casita cibernética para recargar baterías.';
    } else if (/fuente|agua fresca|sed|bebe agua|hidrat/i.test(combined)) {
      action = 'go_fountain';
      interaction = 'drink_water';
      emotion = 'HAPPY';
      thought = '¡Voy a la fuente cibernética a beber agua fresca!';
    } else if (/puente|cruza el puente|bridge/i.test(combined)) {
      action = 'go_bridge';
      interaction = 'cross_bridge';
      emotion = 'CURIOUS';
      thought = '¡Vamos a cruzar el puente arqueado de madera!';
    } else if (/sube y baja|balanc[ií]n|seesaw/i.test(combined)) {
      action = 'go_seesaw';
      interaction = 'ride_seesaw';
      emotion = 'EXCITED';
      thought = '¡Al balancín cibernético a balancearnos!';
    } else if (/piscina|alberca|pelotitas|ballpit/i.test(combined)) {
      action = 'go_ballpit';
      emotion = 'EXCITED';
      thought = '¡A zambullirme en la piscina de pelotas de colores!';
    } else if (/tobog[aá]n|resbaladilla|slide/i.test(combined) && action === 'wagTail') {
      action = 'go_slide';
      emotion = 'EXCITED';
      thought = '¡Voy al tobogán de agilidad!';
    } else if (/t[uú]nel|valla|obst[aá]culo|circuito/i.test(combined)) {
      action = 'go_tunnel';
      emotion = 'CURIOUS';
      thought = '¡A cruzar a toda velocidad el túnel de agilidad!';
    } else if (/diana|tiro al blanco|punter[ií]a|target/i.test(combined)) {
      action = 'go_target';
      emotion = 'PROUD';
      thought = '¡Vamos a la diana de tiro a probar mi puntería!';
    } else if (/pi[ñn]ata|golpea la pi[ñn]ata/i.test(combined)) {
      action = 'go_pinata';
      emotion = 'EXCITED';
      thought = '¡A saltar bajo la piñata para que suelte galletas!';
    } else if (/bolt/i.test(combined)) {
      action = 'go_robot_Bolt';
      thought = '¡Voy a buscar a mi veloz amigo Bolt!';
    } else if (/pixel/i.test(combined)) {
      action = 'go_robot_Pixel';
      thought = '¡Voy a saludar a Pixel!';
    } else if (/luna/i.test(combined)) {
      action = 'go_robot_Luna';
      thought = '¡Voy corriendo a ver a mi amiga Luna!';
    } else if (/rusty/i.test(combined)) {
      action = 'go_robot_Rusty';
      thought = '¡Vamos a ver qué acrobacias hace Rusty!';
    } else if (/sparky/i.test(combined)) {
      action = 'go_robot_Sparky';
      thought = '¡Voy con Sparky!';
    } else if (/todos|manada|vengan|reuni[oó]n|pack/i.test(combined)) {
      action = 'call_pack';
      thought = '¡Auuuú! ¡Llamando a toda la manada!';
    } else if (action === 'wagTail') {
      if (/rueda|maroma|roll|ru[eé]date/i.test(combined)) action = 'roll';
      else if (/saluda|la pata|ch[oó]calas|wave|hola/i.test(combined)) action = 'wave';
      else if (/a[uú]lla|aullido|howl/i.test(combined)) action = 'howl';
      else if (/cava|entierra|rasca/i.test(combined)) action = 'dig';
      else if (/baila|dance|meneate/i.test(combined)) { action = 'dance'; emotion = 'PARTY'; }
      else if (/sigilo|esp[ií]a|agachado|sneak/i.test(combined)) action = 'sneak';
      else if (/voltereta|mortal|backflip/i.test(combined)) { action = 'backflip'; emotion = 'PROUD'; }
      else if (/gira|vuelta|spin/i.test(combined)) action = 'spin';
      else if (/salta|brinca|jump/i.test(combined)) action = 'jump';
      else if (/ladra|guau|bark/i.test(combined)) action = 'bark';
      else if (/si[eé]ntate|sentado|sit/i.test(combined)) action = 'sit';
      else if (/acu[eé]state|échate|t[uú]mbate|dormir/i.test(combined)) { action = 'lieDown'; emotion = 'SLEEPY'; }
      else if (/olfatea|huele|sniff/i.test(combined)) action = 'sniff';
    }

    if (/aprende|inventa|nuevo truco|coreograf[ií]a/i.test(combined)) {
      const baseTitle = TRICK_TITLES[Math.floor(Math.random() * TRICK_TITLES.length)];
      const chosenTitle = `${baseTitle} de ${p.name}`;
      const seq = [
        TRICK_MOVES[Math.floor(Math.random() * TRICK_MOVES.length)],
        TRICK_MOVES[Math.floor(Math.random() * TRICK_MOVES.length)],
        'wagTail'
      ];
      invent = { name: chosenTitle, sequence: seq };
      thought = `¡He inventado un nuevo truco llamado "${chosenTitle}"!`;
      emotion = 'PROUD';
    }

    return {
      thought,
      emotion,
      action,
      interaction,
      invent_movement: invent,
      remember
    };
  }

  heuristicDecision(ctx, dog = this.getActiveRobot()) {
    const p = this._getProfile(dog);
    let thought = this._getRandomThought(dog);
    let emotion = 'HAPPY';
    let action = 'wagTail';
    let interaction = null;
    let invent = null;

    if (ctx.user_command) {
      return this.extractIntentFromText('', ctx.user_command, dog);
    } else if (p.name === 'Bolt') {
      thought = '¡Mis propulsores están al máximo! ¡A toda velocidad hacia la pelota!';
      emotion = 'EXCITED';
      action = 'go_ball';
      interaction = 'kick_ball';
    } else if (p.name === 'Pixel') {
      thought = 'Escaneando las ondas límpidas del lago de cristal.';
      emotion = 'CURIOUS';
      action = 'go_lake';
      interaction = 'drink_water';
    } else if (p.name === 'Luna') {
      thought = 'Qué hermoso es pasear bajo este cielo tranquilo.';
      emotion = 'LOVING';
      action = 'sit';
    } else if (p.name === 'Rusty') {
      thought = '¡Voy a dar un salto acrobático triple en el trampolín!';
      emotion = 'EXCITED';
      action = 'go_trampoline';
      interaction = 'bounce_trampoline';
    }

    if (Math.random() < 0.2) {
      const trickNames = [`Salto Estelar de ${p.name}`, `Giro Veloz ${p.name}`, 'Ola Robótica'];
      const sequences = [
        ['jump', 'backflip', 'wagTail'],
        ['dance', 'spin', 'wave'],
        ['roll', 'howl', 'wagTail']
      ];
      const r = Math.floor(Math.random() * trickNames.length);
      invent = { name: trickNames[r], sequence: sequences[r] };
      thought = `¡Acabo de crear: ${trickNames[r]}!`;
      emotion = 'PROUD';
    }

    return {
      thought,
      emotion,
      action,
      interaction,
      invent_movement: invent,
      remember: null
    };
  }

  applyDecision(dec, alreadyDispatchedAction = null, dog = this.getActiveRobot()) {
    if (!dec || !dog) return;

    if (dec.emotion && EMOTIONS[dec.emotion]) {
      dog.setEmotion(EMOTIONS[dec.emotion]);
      if (this.particleSystem) {
        this.particleSystem.spawnBurst(dog.group.position, dec.emotion);
      }
      this.eventBus.emit('robot:emotion', { name: dog.name, emotion: dec.emotion });
    }

    this.lastThought = dec.thought || 'Explorando...';
    this.eventBus.emit('robot:thought', {
      name: dog.name,
      thought: this.lastThought,
      emotion: dec.emotion || 'HAPPY',
      action: dec.action || null
    });

    let ranSequence = false;
    if (dec.invent_movement && dec.invent_movement.name && Array.isArray(dec.invent_movement.sequence)) {
      this.addLearnedTrick(
        dec.invent_movement.name,
        `Inventado por ${dog.name}`,
        dec.invent_movement.sequence
      );
      roboAudio.playSuccess();
      this.executeMovementSequence(dec.invent_movement.sequence);
      ranSequence = true;
    }

    if (dec.remember) {
      this.addJournalEntry(dec.emotion || 'Curioso', dec.remember);
    } else if (dec.thought) {
      this.addJournalEntry(dec.emotion || 'Curioso', dec.thought);
    }

    if (dec.thought) {
      this.eventBus.emit('chat:message', {
        author: dog.name,
        message: dec.thought,
        role: 'robot',
        targetDog: dog.name,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      this.speakThought(dec.thought, this._getProfile(dog).voicePitch || 1.0);
    }

    if (!ranSequence && dec.action && dec.action !== alreadyDispatchedAction) {
      this.executeAction(dec.action, dec.interaction);
    }
  }

  executeAction(action, interaction = null) {
    if (this._disposed) return;
    let resolvedAction = action;
    if ((!resolvedAction || resolvedAction === 'none' || resolvedAction === 'idle') && interaction && INTERACTION_TO_ACTION[interaction]) {
      resolvedAction = INTERACTION_TO_ACTION[interaction];
    }
    if (!resolvedAction) return;

    this._timers.clearAll();
    const activeBot = this.getActiveRobot();
    if (!activeBot) return;
    const anim = this._getAnim(activeBot);
    const pitch = this._getProfile(activeBot).voicePitch || 1.0;

    this.eventBus.emit('robot:action', { name: activeBot.name, action: resolvedAction, source: 'ai' });

    if (resolvedAction === 'call_pack') {
      if (this.packManager && typeof this.packManager.callPackToPlayer === 'function') {
        this.packManager.callPackToPlayer(activeBot);
      } else {
        this.eventBus.emit('pack:assemble', { leader: activeBot });
      }
      roboAudio.playHowl(pitch);
      if (anim) anim.play('howl', 2.5);
      this.addJournalEntry('Orgulloso', '¡Llamé a toda mi manada y nos reunimos en formación!');
      return;
    }

    if (resolvedAction === 'praise_burst') {
      activeBot.setEmotion(EMOTIONS.LOVING);
      activeBot.affection = Math.min(100, (activeBot.affection || 85) + 25);
      activeBot.curiosity = Math.min(100, (activeBot.curiosity || 80) + 10);
      activeBot.energy = Math.min(100, (activeBot.energy || 80) + 15);
      activeBot.tailHelicopterTimer = 4.0;
      roboAudio.playHappyJingle();
      if (this.particleSystem) {
        this.particleSystem.spawnBurst(activeBot.group.position, 'LOVING');
      }
      if (anim) anim.play(Math.random() < 0.5 ? 'bellyRub' : 'playBow', 3.0);
      this.addJournalEntry('Cariñoso', '¡Mi humano me elogió! Sentí una oleada de amor y lealtad perruna.');
      return;
    }

    if (resolvedAction === 'fetch_ball') {
      let ball = this.world?.soccerBall || null;
      if (!ball && this.world?.balls?.length > 0) {
        ball = this.world.balls[0];
      }
      if (!ball) return;

      const returnPos = activeBot.group.position.clone();
      activeBot.setEmotion(EMOTIONS.EXCITED);
      roboAudio.playYip(1.3);

      this.navigateToward(ball.mesh.position, 7.2, 'run', () => {
        if (typeof activeBot.grabObject === 'function') activeBot.grabObject(ball.mesh);
        ball.carriedBy = activeBot;
        roboAudio.playGrumble(1.1);
        this.addJournalEntry('Juguetón', '¡Atrapé la pelota en mi hocico! Llevándosela a mi humano.');

        this.navigateToward(returnPos, 6.6, 'run', () => {
          const droppedMesh = typeof activeBot.dropObject === 'function' ? activeBot.dropObject() : null;
          ball.carriedBy = null;
          if (droppedMesh && this.world?.scene) {
            this.world.scene.add(droppedMesh);
            droppedMesh.position.copy(activeBot.group.position);
            droppedMesh.position.y = this.world.getHeightAt(droppedMesh.position.x, droppedMesh.position.z) + ball.radius;
            ball.velocity.set(0, 0, 0);
          }
          if (anim) anim.play('playBow', 2.8);
          activeBot.setEmotion(EMOTIONS.HAPPY);
          roboAudio.playHappyJingle();
          this.addJournalEntry('Feliz', '¡Te traje la pelota y la dejé a tus pies! ¡Lánzamela otra vez!');
        });
      });
      return;
    }

    if (resolvedAction === 'chorus_howl') {
      roboAudio.playHowl(pitch);
      if (anim) anim.play('howl', 3.0);
      activeBot.setEmotion(EMOTIONS.EXCITED);
      const dogs = this.packManager?.dogs || (this.packManager?.pack || []);
      for (let idx = 0; idx < dogs.length; idx++) {
        const otherBot = dogs[idx];
        if (!otherBot || otherBot === activeBot) continue;
        this._timers.setTimeout(() => {
          const otherAnim = this._getAnim(otherBot);
          if (otherAnim) otherAnim.play('howl', 2.8);
          otherBot.setEmotion(EMOTIONS.EXCITED);
          otherBot.lookAt(activeBot.group.position);
        }, 350 + idx * 300);
      }
      this.addJournalEntry('Emocionado', '¡Iniciamos un coro de aullidos en manada bajo el cielo virtual!');
      return;
    }

    if (resolvedAction === 'scent_track') {
      if (anim) anim.play('sniff', 3.0);
      activeBot.setEmotion(EMOTIONS.CURIOUS);
      roboAudio.playBoop(1.1);

      let nearestPos = null;
      let minDist = Infinity;
      const rPos = activeBot.group.position;
      if (this.world?.snacks) {
        for (let i = 0; i < this.world.snacks.length; i++) {
          const p = this.world.snacks[i].group.position;
          const d = rPos.distanceTo(p);
          if (d < minDist && d > 1.2) { minDist = d; nearestPos = p; }
        }
      }
      if (this.world?.balls) {
        for (let i = 0; i < this.world.balls.length; i++) {
          const p = this.world.balls[i].mesh.position;
          const d = rPos.distanceTo(p);
          if (d < minDist && d > 1.2) { minDist = d; nearestPos = p; }
        }
      }

      if (nearestPos) {
        this.navigateToward(nearestPos, 3.8, 'walk', () => {
          if (anim) anim.play('wagTail', 2.0);
          activeBot.setEmotion(EMOTIONS.HAPPY);
          roboAudio.playHappyJingle();
          this.addJournalEntry('Curioso', '¡Mi olfato cibernético siguió el rastro y encontré un objeto en el prado!');
        });
      }
      return;
    }

    if (resolvedAction === 'patrol_perimeter') {
      const waypoints = [
        new THREE.Vector3(70, 0, 70),
        new THREE.Vector3(70, 0, -70),
        new THREE.Vector3(-70, 0, -70),
        new THREE.Vector3(-70, 0, 70)
      ];
      let wpIdx = 0;
      const visitNext = () => {
        if (wpIdx >= waypoints.length) {
          if (anim) anim.play('wagTail', 2.0);
          activeBot.setEmotion(EMOTIONS.PROUD);
          this.addJournalEntry('Alerta', '¡Ronda de patrullaje perimetral completada sin novedades!');
          return;
        }
        const wp = waypoints[wpIdx++];
        this.navigateToward(wp, 4.2, 'walk', () => {
          if (anim) anim.play('patrolLook', 2.8);
          activeBot.setEmotion(EMOTIONS.ALERT);
          roboAudio.playBoop(1.2);
          this._timers.setTimeout(visitNext, 2900);
        });
      };
      visitNext();
      return;
    }

    if (resolvedAction === 'chase_tail') {
      activeBot.setEmotion(EMOTIONS.EXCITED);
      if (anim) anim.play('chaseTail', 3.6);
      roboAudio.playYip(1.4);
      this._timers.setTimeout(() => {
        activeBot.setEmotion(EMOTIONS.CONFUSED);
        if (anim) anim.play('dizzy', 2.5);
        if (this.particleSystem) this.particleSystem.spawnBurst(activeBot.group.position, 'CONFUSED');
        roboAudio.playConfused();
        this.addJournalEntry('Juguetón', '¡Giré tanto persiguiéndome la cola que me mareé y caí sentado!');
      }, 3600);
      return;
    }

    if (resolvedAction === 'slalom_rings') {
      if (this.world?.slalomRings?.length > 0) {
        let rIdx = 0;
        const rings = this.world.slalomRings;
        const jumpThroughNext = () => {
          if (rIdx >= rings.length) {
            activeBot.setEmotion(EMOTIONS.PROUD);
            if (anim) anim.play('backflip', 1.6);
            roboAudio.playGoalFanfare();
            this.addJournalEntry('Orgulloso', '¡Completé el circuito de aros de agilidad con saltos perfectos!');
            return;
          }
          const ring = rings[rIdx++];
          this.navigateToward(ring.entryPos, 6.2, 'run', () => {
            roboAudio.playTrampoline();
            if (anim) anim.play('jump', 1.2);
            let p = 0;
            const leapId = this._timers.setInterval(() => {
              p += 0.08;
              activeBot.group.position.lerpVectors(ring.entryPos, ring.exitPos, p);
              activeBot.group.position.y = ring.entryPos.y + 1.6 * (4 * p * (1 - p));
              if (p >= 1.0) {
                this._timers.clear(leapId);
                jumpThroughNext();
              }
            }, 35);
          });
        };
        jumpThroughNext();
      }
      return;
    }

    if (resolvedAction === 'soccer_kick') {
      const ball = this.world?.soccerBall;
      if (ball) {
        const goalPos = TMP.v5.set(25, 1, 40);
        const ballPos = ball.mesh.position;
        const kickDir = TMP.v6.subVectors(goalPos, ballPos).normalize();
        const approachPos = new THREE.Vector3().subVectors(ballPos, kickDir).addScaledVector(kickDir, -1.0);
        approachPos.y = this.world.getHeightAt(approachPos.x, approachPos.z);
        const savedKickDir = kickDir.clone();

        this.navigateToward(approachPos, 7.0, 'run', () => {
          activeBot.lookAt(new THREE.Vector3(25, 1, 40));
          if (anim) anim.play('jump', 1.2);
          roboAudio.playBark(1.3);
          if (typeof this.world.kickBall === 'function') {
            this.world.kickBall(ball, savedKickDir, 26);
          } else {
            ball.velocity.copy(savedKickDir).multiplyScalar(26);
            ball.velocity.y = 8.5;
          }
          activeBot.setEmotion(EMOTIONS.PROUD);
          this.addJournalEntry('Orgulloso', '¡Alineé el tiro y rematé el balón directo al centro de la portería!');
        });
      }
      return;
    }

    if (resolvedAction === 'trampoline_trick') {
      const trampPos = this.world?.trampolinePos || new THREE.Vector3(38, 0, 22);
      this.navigateToward(trampPos, 6.0, 'run', () => {
        let bounces = 0;
        const doBounce = () => {
          bounces++;
          const force = 6.5 + bounces * 1.8;
          this._setDogVelocityY(activeBot, force);
          activeBot.group.position.y += 0.25;
          roboAudio.playTrampoline();
          if (anim) anim.play('backflip', 1.5);
          activeBot.setEmotion(EMOTIONS.EXCITED);
          if (bounces < 3) {
            this._timers.setTimeout(doBounce, 1300);
          } else {
            this.addJournalEntry('Juguetón', '¡Hice 3 rebotes consecutivos cada vez más altos con piruetas 360°!');
          }
        };
        doBounce();
      });
      return;
    }

    if (resolvedAction === 'slide_down' || resolvedAction === 'go_slide') {
      const slidePos = new THREE.Vector3(-18, 0, -32);
      this.navigateToward(slidePos, 5.8, 'run', () => {
        if (this.world?.slide) {
          activeBot.isSliding = true;
          activeBot.group.position.copy(this.world.slide.topPos);
          activeBot.lookAt(new THREE.Vector3(-18, 0, -20));
          if (anim) anim.play('headTilt', 1.0);
          this._timers.setTimeout(() => {
            this.eventBus.emit('world:activity', {
              text: `🎢 ¡${activeBot.name} se lanzó por el tobogán a gran velocidad!`,
              level: 'info'
            });
            let p = 0;
            if (anim) anim.play('roll', 2.0);
            const slideId = this._timers.setInterval(() => {
              p += 0.08;
              activeBot.group.position.lerpVectors(this.world.slide.topPos, this.world.slide.endPos, Math.min(1, p));
              if (p >= 1.0) {
                this._timers.clear(slideId);
                activeBot.isSliding = false;
                if (anim) anim.play('backflip', 1.5);
                roboAudio.playHappyJingle();
                this.addJournalEntry('Juguetón', '¡Me deslicé por el tobogán y aterricé en la colchoneta con estilo!');
              }
            }, 35);
          }, 950);
        }
      });
      return;
    }

    if (resolvedAction === 'lake_swim' || resolvedAction === 'go_lake') {
      const beachPos = new THREE.Vector3(-55, 0, -55);
      this.navigateToward(beachPos, 5.2, 'run', () => {
        const swimPos = new THREE.Vector3(-66, -0.52, -66);
        this.navigateToward(swimPos, 3.2, 'swimming', () => {
          roboAudio.playSplash();
          activeBot.isInWater = true;
          if (anim) anim.play('swimming');
          activeBot.setEmotion(EMOTIONS.HAPPY);
          this.addJournalEntry('Feliz', '¡Nadando en el Lago de Cristal moviendo las patitas bajo la superficie!');

          this._timers.setTimeout(() => {
            this.navigateToward(beachPos, 3.5, 'swimming', () => {
              activeBot.isInWater = false;
              activeBot.wasInWater = false;
              if (anim) anim.play('shakeOff', 2.0);
              roboAudio.playSplash();
              if (this.particleSystem) this.particleSystem.spawnBurst(activeBot.group.position, 'HAPPY');
              this.addJournalEntry('Feliz', '¡Salí del agua a tierra firme y me sacudí con fuerza para secarme!');
            });
          }, 3500);
        });
      });
      return;
    }

    if (resolvedAction === 'play_tag') {
      if (this.packManager && typeof this.packManager.startTagGame === 'function') {
        this.packManager.startTagGame(activeBot);
      } else {
        this.eventBus.emit('pack:tagGame', { initiator: activeBot });
      }
      return;
    }

    if (resolvedAction === 'speed_race') {
      let raceDest = null;
      if (this.packManager && typeof this.packManager.startSpeedRace === 'function') {
        raceDest = this.packManager.startSpeedRace(activeBot);
      } else {
        raceDest = new THREE.Vector3(25, 0, 40);
        this.eventBus.emit('pack:speedRace', { initiator: activeBot, destination: raceDest });
      }
      if (raceDest) {
        this.navigateToward(raceDest, 7.2, 'run', () => {
          if (anim) anim.play('backflip', 1.8);
          activeBot.setEmotion(EMOTIONS.PROUD);
        });
      }
      return;
    }

    if (resolvedAction === 'pack_gossip') {
      if (this.packManager && typeof this.packManager.startPackGossip === 'function') {
        this.packManager.startPackGossip(activeBot);
      } else {
        this.eventBus.emit('pack:gossip', { initiator: activeBot });
      }
      if (anim) anim.play('wagTail', 3.0);
      return;
    }

    if (resolvedAction === 'dig_treasure') {
      let nearestSpot = null;
      let minD = Infinity;
      const rPos = activeBot.group.position;
      if (this.world?.treasureSpots) {
        for (let i = 0; i < this.world.treasureSpots.length; i++) {
          const s = this.world.treasureSpots[i];
          if (!s.dug) {
            const d = Math.hypot(rPos.x - s.x, rPos.z - s.z);
            if (d < minD) { minD = d; nearestSpot = s; }
          }
        }
      }
      const targetP = nearestSpot
        ? new THREE.Vector3(nearestSpot.x, 0, nearestSpot.z)
        : new THREE.Vector3(rPos.x + 2, 0, rPos.z + 2);
      this.navigateToward(targetP, 4.8, 'run', () => {
        if (anim) anim.play('dig', 3.2);
        activeBot.setEmotion(EMOTIONS.CURIOUS);
        roboAudio.playBoop(1.2);
        if (this.particleSystem) this.particleSystem.spawnBurst(activeBot.group.position, 'CURIOUS');
        this._timers.setTimeout(() => {
          if (nearestSpot && this.world && typeof this.world.revealDugTreasure === 'function') {
            this.world.revealDugTreasure(activeBot, nearestSpot);
          }
          if (anim) anim.play('wagTail', 2.0);
          activeBot.setEmotion(EMOTIONS.PROUD);
        }, 3200);
      });
      return;
    }

    if (resolvedAction === 'hunt_butterfly') {
      let targetBfly = null;
      let minD = Infinity;
      const rPos = activeBot.group.position;
      if (this.world?.butterflies?.length > 0) {
        for (let i = 0; i < this.world.butterflies.length; i++) {
          const b = this.world.butterflies[i];
          const bPos = b.sprite ? b.sprite.position : b.position;
          if (!bPos) continue;
          const d = rPos.distanceTo(bPos);
          if (d < minD) { minD = d; targetBfly = bPos; }
        }
      }
      if (targetBfly) {
        this.navigateToward(new THREE.Vector3(targetBfly.x, 0, targetBfly.z), 3.2, 'sneak', () => {
          if (anim) anim.play('jump', 1.4);
          this._setDogVelocityY(activeBot, 6.5);
          activeBot.group.position.y += 0.2;
          roboAudio.playYip(1.5);
          activeBot.setEmotion(EMOTIONS.EXCITED);
          this.addJournalEntry('Curioso', '¡Me acerqué en sigilo y salté alto intentando atrapar la mariposa!');
        });
      }
      return;
    }

    if (resolvedAction === 'shade_nap') {
      this.navigateToward(new THREE.Vector3(-22, 0, 18), 4.0, 'walk', () => {
        if (anim) anim.play('spin', 1.2);
        this._timers.setTimeout(() => {
          if (anim) anim.play('lieDown', 6.0);
          activeBot.setEmotion(EMOTIONS.SLEEPY);
          if (this.particleSystem) this.particleSystem.spawnBurst(activeBot.group.position, 'SLEEPY');
          activeBot.energy = 100;
          this.addJournalEntry('Somnoliento', 'Di dos vueltas sobre mí mismo y me eché a dormir una rica siesta bajo la sombra del pino.');
        }, 1250);
      });
      return;
    }

    if (resolvedAction === 'beg_pets') {
      const curPos = activeBot.group.position;
      activeBot.lookAt(new THREE.Vector3(curPos.x + 1, curPos.y + 1, curPos.z + 2));
      if (anim) anim.play('bellyRub', 4.0);
      activeBot.setEmotion(EMOTIONS.LOVING);
      if (this.particleSystem) this.particleSystem.spawnBurst(activeBot.group.position, 'LOVING');
      roboAudio.playBoop(1.4);
      this.addJournalEntry('Cariñoso', '¡Me puse panza arriba con las patitas al aire esperando tus caricias!');
      return;
    }

    if (DIRECT_ANIMS.has(resolvedAction)) {
      if (resolvedAction === 'jump') {
        this._setDogVelocityY(activeBot, 7.0);
        activeBot.group.position.y += 0.15;
        roboAudio.playJump(pitch);
      } else if (resolvedAction === 'bark') {
        roboAudio.playBark(pitch);
      }
      if (anim) anim.play(resolvedAction, 2.5);
      return;
    }

    if (resolvedAction === 'go_playground') {
      this.navigateToward(new THREE.Vector3(50, 0, 40), 5.5, 'run', () => {
        activeBot.setEmotion(EMOTIONS.EXCITED);
        if (anim) anim.play('wagTail', 2.0);
      });
    } else if (resolvedAction === 'go_trampoline') {
      const trampPos = this.world?.trampolinePos || new THREE.Vector3(38, 0, 22);
      this.navigateToward(trampPos, 5.8, 'run', () => {
        if (this.world && typeof this.world.launchTrampoline === 'function') {
          this.world.launchTrampoline(activeBot);
        }
        this._setDogVelocityY(activeBot, 8.5);
        activeBot.setEmotion(EMOTIONS.EXCITED);
        if (anim) anim.play('backflip', 1.8);
        this.addJournalEntry('Juguetón', '¡Reboté súper alto en el trampolín cibernético!');
      });
    } else if (resolvedAction === 'go_carousel') {
      const carouselPos = this.world?.carouselGroup?.position || new THREE.Vector3(62, 0, 26);
      this.navigateToward(carouselPos, 4.8, 'walk', () => {
        activeBot.setEmotion(EMOTIONS.HAPPY);
        if (anim) anim.play('spin', 3.0);
        this.addJournalEntry('Feliz', 'Me subí al carrusel a dar alegres vueltas.');
      });
    } else if (resolvedAction === 'go_ball') {
      const ball = this.world?.soccerBall || this.world?.balls?.[0] || null;
      const ballPos = ball ? ball.mesh.position : new THREE.Vector3(42, 0.5, 38);
      this.navigateToward(ballPos, 6.4, 'run', () => {
        if (ball) {
          const kickDir = new THREE.Vector3(25, 1, 40).sub(ball.mesh.position).normalize();
          if (typeof this.world.kickBall === 'function') {
            this.world.kickBall(ball, kickDir, 22);
          } else {
            ball.velocity.copy(kickDir).multiplyScalar(22);
            ball.velocity.y = 7;
          }
          roboAudio.playBark(1.2);
          if (anim) anim.play('jump', 1.2);
          activeBot.setEmotion(EMOTIONS.PROUD);
          this.addJournalEntry('Orgulloso', '¡Pateé la pelota de fútbol con toda la potencia hacia la portería!');
        }
      });
    } else if (resolvedAction === 'go_disco') {
      this.navigateToward(new THREE.Vector3(52, 0, 56), 5.4, 'run', () => {
        if (this.world && typeof this.world.triggerDiscoParty === 'function') {
          this.world.triggerDiscoParty();
        }
        activeBot.setEmotion(EMOTIONS.PARTY);
        if (anim) anim.play('dance', 3.5);
        this.addJournalEntry('Fiestero', '¡Llegué a la pista disco a poner el mejor ambiente!');
      });
    } else if (resolvedAction === 'go_snack') {
      const snackPos = this.world?.snacks?.length > 0
        ? this.world.snacks[0].group.position
        : new THREE.Vector3(46, 0, 48);
      this.navigateToward(snackPos, 5.8, 'run', () => {
        activeBot.energy = 100;
        roboAudio.playSnackMunch();
        activeBot.setEmotion(EMOTIONS.HUNGRY);
        if (anim) anim.play('sniff', 2.0);
        this.addJournalEntry('Glotón', '¡Me comí una rica ciborgalleta y recargué mi energía al 100%!');
      });
    } else if (resolvedAction === 'go_doghouse') {
      this.navigateToward(new THREE.Vector3(72, 0, 52), 4.2, 'walk', () => {
        activeBot.energy = 100;
        activeBot.setEmotion(EMOTIONS.SLEEPY);
        if (anim) anim.play('lieDown', 3.0);
        this.addJournalEntry('Somnoliento', 'Descansando plácidamente en la estación de recarga.');
      });
    } else if (resolvedAction === 'go_fountain') {
      this.navigateToward(new THREE.Vector3(12, 0, 10), 5.0, 'walk', () => {
        if (typeof activeBot.quenchThirst === 'function') activeBot.quenchThirst();
        else activeBot.hydration = 100;
        roboAudio.playSplash();
        activeBot.setEmotion(EMOTIONS.HAPPY);
        if (anim) anim.play('wagTail', 2.5);
        this.addJournalEntry('Feliz', 'Bebí agua fresca y deliciosa en la fuente cibernética.');
      });
    } else if (resolvedAction === 'go_bridge') {
      this.navigateToward(new THREE.Vector3(-46, 0, -48), 4.8, 'walk', () => {
        activeBot.setEmotion(EMOTIONS.CURIOUS);
        if (anim) anim.play('headTilt', 2.0);
        this.addJournalEntry('Curioso', 'Crucé el puente de madera sobre el arroyo del lago.');
      });
    } else if (resolvedAction === 'go_seesaw') {
      this.navigateToward(new THREE.Vector3(48, 0, 32), 5.2, 'run', () => {
        activeBot.setEmotion(EMOTIONS.EXCITED);
        if (anim) anim.play('playBow', 2.2);
        this.addJournalEntry('Juguetón', 'Me subí al balancín cibernético para balancearme con mis amigos.');
      });
    } else if (resolvedAction === 'go_ballpit') {
      this.navigateToward(new THREE.Vector3(-32, 0, 48), 5.6, 'run', () => {
        activeBot.setEmotion(EMOTIONS.EXCITED);
        this._setDogVelocityY(activeBot, 6.2);
        if (anim) anim.play('jump', 1.8);
        roboAudio.playSplash();
        if (this.particleSystem) this.particleSystem.spawnBurst(activeBot.group.position, 'EXCITED');
        this.addJournalEntry('Juguetón', '¡Me zambullí de lleno en la piscina de pelotas!');
      });
    } else if (resolvedAction === 'go_tunnel') {
      this.navigateToward(new THREE.Vector3(22, 0, -50), 5.4, 'run', () => {
        activeBot.setEmotion(EMOTIONS.CURIOUS);
        if (anim) anim.play('sneak', 2.0);
        this.addJournalEntry('Curioso', '¡Pasé a toda velocidad por el túnel de agilidad!');
      });
    } else if (resolvedAction === 'go_target') {
      this.navigateToward(new THREE.Vector3(70, 0, 18), 5.6, 'run', () => {
        activeBot.lookAt(new THREE.Vector3(76, 3.2, 18));
        activeBot.setEmotion(EMOTIONS.PROUD);
        if (anim) anim.play('bark', 1.6);
        const ball = this.world?.soccerBall || this.world?.balls?.[0];
        if (ball && this.world) {
          ball.mesh.position.set(68, 1.5, 18);
          const dir = new THREE.Vector3(1, 0.25, 0).normalize();
          if (typeof this.world.kickBall === 'function') {
            this.world.kickBall(ball, dir, 24);
          } else {
            ball.velocity.copy(dir).multiplyScalar(24);
          }
        }
        this.addJournalEntry('Orgulloso', '¡Apunté y lancé el balón hacia la diana de tiro!');
      });
    } else if (resolvedAction === 'go_pinata') {
      this.navigateToward(new THREE.Vector3(-42, 0, 14), 6.0, 'run', () => {
        activeBot.setEmotion(EMOTIONS.EXCITED);
        this._setDogVelocityY(activeBot, 6.8);
        activeBot.group.position.y += 0.35;
        if (anim) anim.play('jump', 1.5);
        this.addJournalEntry('Juguetón', '¡Salté a golpear la piñata de galletas!');
      });
    } else if (resolvedAction.startsWith('go_robot_')) {
      const targetName = resolvedAction.replace('go_robot_', '');
      const targetBot = typeof this.packManager?.getDog === 'function'
        ? this.packManager.getDog(targetName)
        : this.packManager?.allRobots?.[targetName];
      if (targetBot) {
        this.navigateToward(targetBot.group.position, 5.2, 'run', () => {
          activeBot.lookAt(targetBot.group.position);
          if (anim) anim.play('wave', 2.0);
          activeBot.setEmotion(EMOTIONS.LOVING);
          targetBot.lookAt(activeBot.group.position);
          const tAnim = this._getAnim(targetBot);
          if (tAnim) tAnim.play('wagTail', 2.0);
          targetBot.setEmotion(EMOTIONS.HAPPY);
          roboAudio.playBark(pitch);
          this.addJournalEntry('Cariñoso', `Fui a saludar a mi amigo ${targetName} y jugamos juntos.`);
        });
      }
    } else {
      // Safe fallback for unrecognized action labels
      if (anim) anim.play('wagTail', 2.0);
    }
  }

  executeMovementSequence(sequence) {
    const dog = this.getActiveRobot();
    const anim = this._getAnim(dog);
    if (!anim) return;

    const onDone = () => {
      dog.setEmotion(EMOTIONS.HAPPY);
      roboAudio.playHappyJingle();
    };
    if (typeof anim.queueSequence === 'function') {
      anim.queueSequence(sequence, onDone);
    } else if (typeof anim.playSequence === 'function') {
      anim.playSequence(sequence, onDone);
    }
  }

  navigateToward(targetPos, speed = 4.8, animName = 'walk', onArrival = null) {
    const dog = this.getActiveRobot();
    if (!dog || !targetPos) return;
    const anim = this._getAnim(dog);
    if (anim) anim.play(animName);

    this._navTarget.copy(targetPos);
    const mult = this._getProfile(dog).speedMultiplier || 1.0;
    this.navSpeed = speed * mult;
    this.isNavigating = true;
    this.navTimer = 0;
    this.navMaxTime = 16.0;
    this.navStuckTime = 0;
    this._navLastPos.copy(dog.group.position);
    this.onArrivalCallback = onArrival;

    appState.navigation.active = true;
    appState.navigation.target = this._navTarget;
    appState.navigation.mode = animName;

    if (typeof dog.startMission === 'function') {
      dog.startMission(animName, animName, this._navTarget, 16.0, onArrival);
    }
  }

  // Zero-alloc steering helper using TMP.v3 / TMP.v4 and pre-allocated this._nearObstacles
  _computeSteeringDir(pos, desiredDir) {
    if (!this.world || typeof this.world.getNearObstacles !== 'function') return desiredDir;
    const lookAhead = 2.4;
    const probeX = pos.x + desiredDir.x * lookAhead;
    const probeZ = pos.z + desiredDir.z * lookAhead;

    this._nearObstacles.length = 0;
    this.world.getNearObstacles(probeX, probeZ, this._nearObstacles);

    for (let i = 0; i < this._nearObstacles.length; i++) {
      const obs = this._nearObstacles[i];
      if (obs.yMin !== undefined && obs.yMax !== undefined) {
        if (pos.y + 1.1 < obs.yMin || pos.y > obs.yMax) continue;
      }
      const dx = probeX - obs.x;
      const dz = probeZ - obs.z;
      const r = (obs.radius || Math.max(obs.halfW || 1, obs.halfD || 1)) + 1.1;
      const dist = Math.hypot(dx, dz);
      if (dist < r && dist > 0.001) {
        TMP.v3.set(dx / dist, 0, dz / dist);
        desiredDir.addScaledVector(TMP.v3, 1.35).normalize();
        break;
      }
    }
    return desiredDir;
  }

  updateNavigation(dt) {
    if (!this.isNavigating || this._disposed) return;
    const dog = this.getActiveRobot();
    if (!dog) return;
    const anim = this._getAnim(dog);

    this.navTimer += dt;
    if (this.navTimer >= this.navMaxTime) {
      this.isNavigating = false;
      appState.navigation.active = false;
      appState.navigation.target = null;
      appState.navigation.mode = null;
      if (typeof dog.clearMission === 'function') dog.clearMission();
      if (anim) anim.play('idle');
      this.eventBus.emit('world:activity', {
        text: `🐾 ${dog.name} completó su misión y queda libre para explorar.`,
        level: 'info'
      });
      return;
    }

    const curPos = dog.group.position;
    const diff = TMP.v1.subVectors(this._navTarget, curPos);
    diff.y = 0;
    const dist = diff.length();

    const moved = Math.hypot(curPos.x - this._navLastPos.x, curPos.z - this._navLastPos.z);
    this._navLastPos.copy(curPos);
    const actualSpeed = moved / Math.max(dt, 0.001);
    if (actualSpeed < this.navSpeed * 0.25) {
      this.navStuckTime += dt;
      if (this.navStuckTime > 0.65 && dist > 0.001) {
        TMP.v2.set(-diff.z, 0, diff.x).normalize();
        curPos.addScaledVector(TMP.v2, dt * 4.2);
      }
      if (this.navStuckTime > 2.2) {
        this.isNavigating = false;
        appState.navigation.active = false;
        appState.navigation.target = null;
        appState.navigation.mode = null;
        if (typeof dog.clearMission === 'function') dog.clearMission();
        if (this.onArrivalCallback) {
          const cb = this.onArrivalCallback;
          this.onArrivalCallback = null;
          cb();
        }
        return;
      }
    } else {
      this.navStuckTime = Math.max(0, this.navStuckTime - dt * 2);
    }

    if (dist < 2.0) {
      this.isNavigating = false;
      appState.navigation.active = false;
      appState.navigation.target = null;
      appState.navigation.mode = null;
      if (typeof dog.clearMission === 'function') dog.clearMission();
      if (anim) anim.play('idle');
      if (this.onArrivalCallback) {
        const cb = this.onArrivalCallback;
        this.onArrivalCallback = null;
        cb();
      }
      return;
    }

    diff.divideScalar(dist);
    this._computeSteeringDir(curPos, diff);

    const targetAngle = Math.atan2(diff.x, diff.z);
    dog.group.rotation.y = dampAngle(dog.group.rotation.y, targetAngle, 7, dt);

    curPos.addScaledVector(diff, this.navSpeed * dt);
    if (this.world) {
      if (typeof this.world.resolveObstacleCollisions === 'function') {
        this.world.resolveObstacleCollisions(curPos, 0.75, 1.2);
      }
      if (typeof this.world.clampToWorld === 'function') {
        this.world.clampToWorld(curPos, 0.75);
      } else {
        curPos.x = THREE.MathUtils.clamp(curPos.x, -110, 110);
        curPos.z = THREE.MathUtils.clamp(curPos.z, -110, 110);
      }
      const vy = dog.physics ? dog.physics.velocityY : (dog.velocityY || 0);
      if (!dog.isInWater && !(vy > 0) && (!dog.physics || dog.physics.isGrounded !== false)) {
        curPos.y = this.world.getHeightAt(curPos.x, curPos.z);
      }
      if (typeof this.world.handleRobotInteractions === 'function') {
        this.world.handleRobotInteractions(dog, anim, dt);
      }
    }
  }

  dispose() {
    this._disposed = true;
    this.cancelNavigation();
    this._timers.clearAll();
    for (let i = 0; i < this._unsubs.length; i++) {
      this._unsubs[i]();
    }
    this._unsubs.length = 0;
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch (e) {}
    this._nearObstacles.length = 0;
    this.onArrivalCallback = null;
  }
}
