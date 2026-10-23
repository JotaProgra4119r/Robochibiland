// FreeLLMsAPI & Cognitive Engine with Dynamic Multi-Robot Personalities
import { EMOTIONS } from './emotions.js';
import { roboAudio } from './audio.js';
import * as THREE from 'three';

export class RobotBrain {
  constructor(robot, vision, world, packManager, particleSystem) {
    this.robot = robot;
    this.vision = vision;
    this.world = world;
    this.packManager = packManager;
    this.particleSystem = particleSystem;

    let storedModel = localStorage.getItem('freellm_model');
    if (!storedModel || storedModel === 'gpt-3.5-turbo') {
      storedModel = 'auto';
      localStorage.setItem('freellm_model', 'auto');
    }

    let storedKey = localStorage.getItem('freellm_apikey');
    if (!storedKey) {
      storedKey = 'freellmapi-dc6415f70139118055e4065b767a1d8acb930795eb3d1384';
      localStorage.setItem('freellm_apikey', storedKey);
    }

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
    this.lastThought = "Iniciando mis sensores en el prado verde...";
    this.onChatResponse = null;

    // Cute Web Speech API synthesis for puppy voice lines
    this.isVoiceEnabled = true;

    this.memoryData = null;
    this.loadMemoryFromDisk();
  }

  speakThought(text, pitch = 1.0) {
    if (!this.isVoiceEnabled || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      // Clean emojis and decorative tags for clean speech
      const clean = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\[.*?\]]/gu, '').trim();
      if (!clean) return;

      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = 'es-ES';
      utter.pitch = THREE.MathUtils.clamp((pitch || 1.0) * 1.3, 0.9, 1.9); // Adorable high-pitched tone
      utter.rate = 1.12;
      utter.volume = 0.8;

      const voices = window.speechSynthesis.getVoices();
      const es = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('es'));
      if (es) utter.voice = es;

      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  setRobot(newRobot) {
    if (this.isNavigating) {
      this.isNavigating = false;
      this.navTarget = null;
      this.onArrivalCallback = null;
    }
    this.robot = newRobot;
    this.lastThought = newRobot.getRandomPersonalThought();
    const thoughtEl = document.getElementById('thought-bubble-text');
    if (thoughtEl) thoughtEl.textContent = this.lastThought;
  }

  saveConfig() {
    localStorage.setItem('freellm_endpoint', this.config.endpoint);
    localStorage.setItem('freellm_apikey', this.config.apiKey);
    localStorage.setItem('freellm_model', this.config.model);
    localStorage.setItem('freellm_system_prompt', this.config.systemPrompt || '');
    localStorage.setItem('freellm_interval', this.config.intervalSeconds.toString());
  }

  async loadMemoryFromDisk() {
    try {
      const res = await fetch('/api/memory');
      if (res.ok) {
        this.memoryData = await res.json();
        this.updateMemoryUI();
        return;
      }
    } catch (e) {}

    const localSaved = localStorage.getItem('robo_chibi_memory_local');
    if (localSaved) {
      try {
        this.memoryData = JSON.parse(localSaved);
        this.updateMemoryUI();
        return;
      } catch (e) {}
    }

    this.memoryData = {
      robot_name: "Manada Chibi CyberPups",
      model_type: "Chibi-CyberPup v2.0 Multi-Possess",
      personality: "5 Personalidades Únicas (Sparky, Bolt, Pixel, Luna, Rusty)",
      discovered_places: [
        { name: "Prado Esmeralda", emotion_felt: "Feliz" },
        { name: "Lago de Cristal", emotion_felt: "Curioso" },
        { name: "Parque de Juegos", emotion_felt: "Emocionado" },
        { name: "Trampolín de Salto", emotion_felt: "Juguetón" },
        { name: "Pista Disco", emotion_felt: "Feliz" }
      ],
      friends: [
        { name: "Sparky", trait: "Curioso y explorador" },
        { name: "Bolt", trait: "Velocista fanático de las pelotas" },
        { name: "Pixel", trait: "Hacker y observador del lago" },
        { name: "Luna", trait: "Soñadora y cariñosa" },
        { name: "Rusty", trait: "Acróbata del parque" }
      ],
      learned_movements: [
        { name: "Baile de la Alegría", sequence: ["spin", "wagTail", "bark", "jump"] },
        { name: "Salto Curioso", sequence: ["sniff", "jump", "wagTail"] },
        { name: "Voltereta Eléctrica", sequence: ["jump", "backflip", "wagTail"] }
      ],
      journal: [
        { time: new Date().toISOString(), emotion: "Curioso", thought: "La manada de perritos robots está explorando el mundo 3D juntos." }
      ]
    };
    this.updateMemoryUI();
  }

  async addJournalEntry(emotion, thought) {
    if (!this.memoryData) return;
    const author = this.robot ? this.robot.name : 'Sparky';
    const entry = {
      author,
      time: new Date().toISOString(),
      emotion: emotion,
      thought: thought
    };
    if (!Array.isArray(this.memoryData.journal)) this.memoryData.journal = [];
    this.memoryData.journal.push(entry);
    if (this.memoryData.journal.length > 80) this.memoryData.journal.shift();

    localStorage.setItem('robo_chibi_memory_local', JSON.stringify(this.memoryData));

    try {
      await fetch('/api/memory/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emotion, thought: `[${author}] ${thought}` })
      });
    } catch (e) {}
    this.updateMemoryUI();
  }

  async addLearnedTrick(name, description, sequence) {
    if (!this.memoryData) return;
    const author = this.robot ? this.robot.name : 'Sparky';
    const trick = {
      name,
      description,
      sequence,
      created_by: author,
      timestamp: new Date().toISOString()
    };
    if (!Array.isArray(this.memoryData.learned_movements)) this.memoryData.learned_movements = [];
    this.memoryData.learned_movements.push(trick);

    localStorage.setItem('robo_chibi_memory_local', JSON.stringify(this.memoryData));

    try {
      await fetch('/api/memory/trick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trick)
      });
    } catch (e) {}
    this.updateMemoryUI();
  }

  updateMemoryUI() {
    const memoryDisplay = document.getElementById('memory-display');
    if (memoryDisplay && this.memoryData) {
      memoryDisplay.textContent = JSON.stringify(this.memoryData, null, 2);
    }

    const tricksList = document.getElementById('learned-tricks-list');
    if (tricksList && this.memoryData && this.memoryData.learned_movements) {
      tricksList.innerHTML = '';
      this.memoryData.learned_movements.forEach((trick) => {
        const btn = document.createElement('button');
        btn.className = 'trick-btn';
        btn.innerHTML = `✨ <strong>${trick.name}</strong> <small>(${trick.created_by || 'IA'})</small><br><small>${trick.sequence.join(' ➔ ')}</small>`;
        btn.onclick = () => {
          this.executeMovementSequence(trick.sequence);
        };
        tricksList.appendChild(btn);
      });
    }
  }

  update(delta) {
    if (this.config.autoThink) {
      this.thinkCooldown -= delta;
      if (this.thinkCooldown <= 0 && !this.isThinking) {
        this.thinkCooldown = Math.max(5, this.config.intervalSeconds);
        this.think();
      }
    }
  }

  async think(customUserPrompt = null) {
    if (this.isThinking) return;
    this.isThinking = true;

    // 0ms Zero-Latency Instant Command Dispatch:
    // If the human typed or gave an order, respond and execute immediately!
    if (customUserPrompt) {
      const immediateDecision = this.extractIntentFromText(null, customUserPrompt);
      if (immediateDecision && immediateDecision.action) {
        this.executeAction(immediateDecision.action, immediateDecision.interaction);
        if (immediateDecision.emotion && EMOTIONS[immediateDecision.emotion]) {
          this.robot.setEmotion(EMOTIONS[immediateDecision.emotion]);
        }
        roboAudio.playBoop(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
        if (this.onChatResponse) {
          this.onChatResponse(this.robot.name, immediateDecision.thought, immediateDecision.action);
        }
      }
    }

    const thinkStatusEl = document.getElementById('think-status');
    if (thinkStatusEl) {
      thinkStatusEl.textContent = '🧠 Pensando...';
      thinkStatusEl.classList.add('pulse');
    }

    const body = this.vision.getBodyState();
    const visibleObjects = this.vision.getVisualSnapshot(this.packManager ? this.packManager.pack : []);

    const recentMemories = (this.memoryData && this.memoryData.journal)
      ? this.memoryData.journal.slice(-2).map(j => `[${j.author || 'Perrito'}]: ${j.thought}`)
      : [];

    const sensoryContext = {
      robot_active: this.robot.name,
      title: this.robot.profile.title,
      body,
      canine_drives: {
        energy: Math.round(this.robot.energy || 100),
        affection: Math.round(this.robot.affection || 88),
        hydration: Math.round(this.robot.hydration || 90),
        curiosity: Math.round(this.robot.curiosity || 85),
        playfulness: Math.round(this.robot.playfulness || 80)
      },
      sees: visibleObjects,
      holding_in_mouth: this.robot.carriedObject ? 'Pelota de juego' : 'nada',
      recent_memories: recentMemories,
      user_command: customUserPrompt || null
    };

    let decision = null;

    if (this.config.apiKey && this.config.endpoint) {
      try {
        decision = await this.callLLM(sensoryContext);
      } catch (err) {
        console.warn("Fallo en FreeLLMsAPI, usando cerebro heurístico:", err);
        decision = this.heuristicDecision(sensoryContext);
      }
    } else {
      decision = this.heuristicDecision(sensoryContext);
    }

    this.applyDecision(decision);

    this.isThinking = false;
    if (thinkStatusEl) {
      thinkStatusEl.textContent = 'Listo';
      thinkStatusEl.classList.remove('pulse');
    }
  }

  async callLLM(sensoryContext) {
    const p = this.robot.profile;
    let systemPrompt = `Eres ${p.name} (${p.title}), un perrito robot inteligente con cognición canina avanzada, etología y libre albedrío en un mundo virtual 3D.
Tu personalidad: ${p.description}.
Tus impulsos biológicos caninos actuales son: ${JSON.stringify(sensoryContext.canine_drives)}.
Lugares interactivos en el mundo:
- "lago": Lago de Cristal con agua fresca reflectante y bote flotante.
- "trampolin": Cama elástica para dar súper saltos en el aire.
- "carrusel": Carrusel mecánico giratorio para pasear.
- "porteria": Cancha con pelota de fútbol interactiva.
- "disco": Pista de baile con luces neón y música.
- "snack": Estación de galletas cibernéticas que recargan energía al 100%.
- "casita": Estación de recarga y descanso.
- "manada": Tus amigos perros robots (Sparky, Bolt, Pixel, Luna, Rusty).

Acciones y comportamientos caninos que puedes ejecutar:
- Conducta canina natural: playBow (reverencia de juego), headTilt (ladear cabeza con curiosidad), bellyRub (ponerse panza arriba pidiendo mimos), beg (pedir de dos patitas), shakeOff (sacudirse de cabeza a cola), nuzzle (apoyar hocico cariñoso), fetch_ball (buscar pelota, cogerla con el hocico y traérsela al humano), praise_burst (reaccionar con alegría desbordante ante elogios), chorus_howl (aullar en coro con la manada), scent_track (rastrear olores por el suelo con la nariz).
- Movimientos: walk, run, sit, lieDown, jump, wagTail, bark, sniff, scratch, backflip, spin, roll, wave, recharge, dig, howl, dance, sneak.
- Navegación: go_lake, go_playground, go_ball, go_trampoline, go_carousel, go_soccer_goal, go_disco, go_snack, go_doghouse, go_robot_Sparky, go_robot_Bolt, go_robot_Pixel, go_robot_Luna, go_robot_Rusty, call_pack.
- Emociones: HAPPY, CURIOUS, LOVING, EXCITED, SLEEPY, ALERT, MISCHIEVOUS, PROUD, SCARED, HUNGRY, PARTY, CONFUSED.

Responde SIEMPRE con un objeto JSON válido con este formato exacto:
{
  "thought": "Tu pensamiento o ladrido en primera persona acorde a tu psicología canina",
  "emotion": "HAPPY",
  "action": "playBow",
  "interaction": "bounce_trampoline | kick_ball | eat_snack | drink_water | none",
  "invent_movement": {"name": "Nombre Truco", "sequence": ["jump", "spin", "backflip"]},
  "remember": "recuerdo clave para guardar en disco"
}`;

    if (this.config.systemPrompt && this.config.systemPrompt.trim()) {
      systemPrompt = `${this.config.systemPrompt.trim()}\n\n${systemPrompt}`;
    }

    const userPrompt = JSON.stringify(sensoryContext);

    const res = await fetch('/api/llm/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: this.config.endpoint,
        apiKey: this.config.apiKey,
        model: this.config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 280,
        temperature: 0.7
      })
    });

    if (!res.ok) throw new Error(`Proxy error ${res.status}`);

    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';

    return this.parseLLMResponse(content, sensoryContext.user_command);
  }

  cleanThought(raw) {
    if (!raw) return "¡Entendido!";
    let s = String(raw).trim();
    // Handle cases where LLM returns: `thought: ..., emotion: ...` or JSON strings
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
    return s || "¡Guau guau!";
  }

  parseLLMResponse(content, userCommand) {
    if (!content) return this.heuristicDecision({ user_command: userCommand });

    // 1. Intentar extraer bloque JSON si viene envuelto en markdown
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
      } catch (e) {
        // Ignorar fallo de parseo y pasar a extractor semántico
      }
    }

    if (parsed && typeof parsed === 'object') {
      // Validar y asegurar campos
      const decision = {
        thought: this.cleanThought(parsed.thought || content.substring(0, 120)),
        emotion: (parsed.emotion || 'HAPPY').toUpperCase(),
        action: parsed.action || 'wagTail',
        interaction: parsed.interaction || null,
        invent_movement: parsed.invent_movement || null,
        remember: parsed.remember || null
      };

      if (!EMOTIONS[decision.emotion]) {
        decision.emotion = 'HAPPY';
      }
      return decision;
    }

    // 2. Si no hubo JSON válido, aplicar Extractor Semántico sobre la respuesta y el comando
    return this.extractIntentFromText(content, userCommand);
  }

  extractIntentFromText(text, userCommand) {
    const combined = `${userCommand || ''} ${text}`.toLowerCase();
    const p = this.robot.profile;

    let thought = text ? this.cleanThought(text) : `¡Entendido!`;
    let emotion = 'HAPPY';
    let action = 'wagTail';
    let interaction = null;
    let invent = null;
    let remember = null;

    // 1. Detección de Elogio / Refuerzo Positivo Canino (Oxytocin Burst)
    if (/buen chico|buena chica|good boy|good girl|hermoso|precioso|te quiero|te amo|lindo perro|crack|campe[oó]n|bien hecho|buen perrito/i.test(combined)) {
      action = 'praise_burst';
      emotion = 'LOVING';
      thought = `¡Guau guau! ❤️ ¡Gracias humano! ¡Me siento el cachorro más feliz y leal del mundo!`;
      remember = 'Mi humano me dijo "buen chico"; sentí una gran felicidad.';
      return { thought, emotion, action, interaction: null, invent_movement: null, remember };
    }

    // 2. Juego de Buscar y Traer la Pelota (Fetch & Bring Back)
    if (/busca la pelota|trae la pelota|ve por la pelota|juega a la pelota|fetch|ve por el bal[oó]n|tr[aá]emela/i.test(combined)) {
      action = 'fetch_ball';
      emotion = 'EXCITED';
      thought = `¡Allá voy! ¡Voy a perseguir la pelota a toda velocidad, la atraparé y te la traeré a tus pies!`;
      return { thought, emotion, action, interaction: null, invent_movement: null, remember: 'Jugamos a traer la pelota.' };
    }

    // 3. Posturas y Comportamientos Caninos Auténticos
    if (/juguemos|a jugar|reverencia|postura de juego|play bow/i.test(combined)) {
      action = 'playBow';
      emotion = 'EXCITED';
      thought = '¡Hago una reverencia de juego! ¡Bajo el pecho y levanto la colita para invitarte a jugar!';
    } else if (/ladea la cabeza|qu[eé] dices|escucha|atento|head tilt/i.test(combined)) {
      action = 'headTilt';
      emotion = 'CURIOUS';
      thought = 'Ladeo mi cabecita a 25 grados y oriento mis orejas para escucharte con atención.';
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
      thought = 'Acerco mi hocico húmedo suavemente para darte un cariñoso "boop".';
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

    // Emociones semánticas
    if (/fiesta|disco|bail|m[uú]sica|dj/i.test(combined)) emotion = 'PARTY';
    else if (/travies|broma|p[ií]caro|mischief/i.test(combined)) emotion = 'MISCHIEVOUS';
    else if (/pro|crack|orgull|campe[oó]n|sunglasses/i.test(combined)) emotion = 'PROUD';
    else if (/miedo|asust|peligro|cuidado|scared/i.test(combined)) emotion = 'SCARED';
    else if (/hambre|galleta|snack|com|rico|delici/i.test(combined)) emotion = 'HUNGRY';
    else if (/qu[eé]|c[oó]mo|d[oó]nde|confund|despist/i.test(combined)) emotion = 'CONFUSED';
    else if (/amor|te quiero|lindo|hermoso|cariñ/i.test(combined)) emotion = 'LOVING';
    else if (/explor|qu[eé] ves|busca|mira|observ/i.test(combined)) emotion = 'CURIOUS';
    else if (/r[aá]pido|corre|vamos|salta|gol|f[uú]tbol/i.test(combined)) emotion = 'EXCITED';

    // Navegación semántica a lugares interactivos
    if (/lago|agua|orilla|bote|nadar|lake/i.test(combined)) {
      action = 'go_lake';
      interaction = 'drink_water';
    } else if (/trampol[ií]n|cama el[aá]stica|rebot/i.test(combined)) {
      action = 'go_trampoline';
      interaction = 'bounce_trampoline';
      emotion = 'EXCITED';
    } else if (/carrusel|rueda|giratorio|carousel/i.test(combined)) {
      action = 'go_carousel';
      interaction = 'ride_carousel';
    } else if (/pelota|bal[oó]n|f[uú]tbol|porter[ií]a|arco|patea/i.test(combined)) {
      action = 'go_ball';
      interaction = 'kick_ball';
      emotion = 'EXCITED';
    } else if (/disco|fiesta|pista de baile|perrea/i.test(combined)) {
      action = 'go_disco';
      interaction = 'dance_disco';
      emotion = 'PARTY';
    } else if (/galleta|snack|comer|comida|hambre/i.test(combined)) {
      action = 'go_snack';
      interaction = 'eat_snack';
      emotion = 'HUNGRY';
    } else if (/parque|juegos|playground/i.test(combined)) {
      action = 'go_playground';
    } else if (/casita|doghouse|estaci[oó]n|recarg/i.test(combined)) {
      action = 'go_doghouse';
      interaction = 'recharge';
      emotion = 'SLEEPY';
    } else if (/fuente|agua fresca|sed|bebe agua|hidrat/i.test(combined)) {
      action = 'go_fountain';
      interaction = 'drink_water';
      emotion = 'HAPPY';
    } else if (/puente|cruza el puente|bridge/i.test(combined)) {
      action = 'go_bridge';
      interaction = 'cross_bridge';
      emotion = 'CURIOUS';
    } else if (/sube y baja|balanc[ií]n|seesaw/i.test(combined)) {
      action = 'go_seesaw';
      interaction = 'ride_seesaw';
      emotion = 'EXCITED';
    } else if (/piscina|alberca|pelotitas|ballpit/i.test(combined)) {
      action = 'go_ballpit';
      emotion = 'EXCITED';
    } else if (/tobog[aá]n|resbaladilla|slide/i.test(combined)) {
      action = 'go_slide';
      emotion = 'EXCITED';
    } else if (/t[uú]nel|valla|obst[aá]culo|circuito/i.test(combined)) {
      action = 'go_tunnel';
      emotion = 'CURIOUS';
    } else if (/diana|tiro al blanco|punter[ií]a|target/i.test(combined)) {
      action = 'go_target';
      emotion = 'PROUD';
    } else if (/pi[ñn]ata|golpea la pi[ñn]ata/i.test(combined)) {
      action = 'go_pinata';
      emotion = 'EXCITED';
    }
    // Social hacia otros robots
    else if (/bolt/i.test(combined)) action = 'go_robot_Bolt';
    else if (/pixel/i.test(combined)) action = 'go_robot_Pixel';
    else if (/luna/i.test(combined)) action = 'go_robot_Luna';
    else if (/rusty/i.test(combined)) action = 'go_robot_Rusty';
    else if (/sparky/i.test(combined)) action = 'go_robot_Sparky';
    else if (/todos|manada|vengan|reun[ií]on|pack/i.test(combined)) action = 'call_pack';
    // Movimientos directos
    else if (/rueda|maroma|roll|ru[eé]date/i.test(combined)) action = 'roll';
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
    else if (/cola|feliz|wag/i.test(combined)) action = 'wagTail';

    // Invención de truco si el usuario lo pide
    if (/aprende|inventa|nuevo truco|coreograf[ií]a/i.test(combined)) {
      const trickTitles = [
        `Tornado Cibernético de ${p.name}`,
        `Súper Combo Lunar de ${p.name}`,
        `Acrobacia Rayo de ${p.name}`,
        `Baile Sónico de ${p.name}`
      ];
      const moves = ['jump', 'spin', 'backflip', 'wave', 'dance', 'roll', 'howl'];
      const chosenTitle = trickTitles[Math.floor(Math.random() * trickTitles.length)];
      const seq = [
        moves[Math.floor(Math.random() * moves.length)],
        moves[Math.floor(Math.random() * moves.length)],
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

  heuristicDecision(ctx) {
    const p = this.robot.profile;
    let thought = this.robot.getRandomPersonalThought();
    let emotion = 'HAPPY';
    let action = 'wagTail';
    let interaction = null;
    let remember = null;
    let invent = null;

    if (ctx.user_command) {
      return this.extractIntentFromText('', ctx.user_command);
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
      const trickNames = [`Salto Estelar de ${p.name}`, `Giro Veloz ${p.name}`, `Ola Robótica`];
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
      remember
    };
  }

  applyDecision(dec) {
    if (!dec) return;

    if (dec.emotion && EMOTIONS[dec.emotion]) {
      this.robot.setEmotion(EMOTIONS[dec.emotion]);
      if (this.particleSystem) {
        this.particleSystem.spawnBurst(this.robot.group.position, dec.emotion);
      }
    }

    this.lastThought = dec.thought || "Explorando...";
    const thoughtEl = document.getElementById('thought-bubble-text');
    if (thoughtEl) thoughtEl.textContent = this.lastThought;

    const worldBubble = document.getElementById('world-speech-bubble');
    if (worldBubble) {
      worldBubble.textContent = `🐾 ${this.robot.name}: "${this.lastThought}"`;
      worldBubble.classList.remove('hidden');
      clearTimeout(this.bubbleTimeout);
      this.bubbleTimeout = setTimeout(() => {
        worldBubble.classList.add('hidden');
      }, 5500);
    }

    if (dec.invent_movement && dec.invent_movement.name && dec.invent_movement.sequence) {
      this.addLearnedTrick(dec.invent_movement.name, `Inventado por ${this.robot.name}`, dec.invent_movement.sequence);
      roboAudio.playTrickSuccess();
      this.executeMovementSequence(dec.invent_movement.sequence);
      return;
    }

    if (dec.remember) {
      this.addJournalEntry(dec.emotion || 'Curioso', dec.remember);
    } else if (dec.thought) {
      this.addJournalEntry(dec.emotion || 'Curioso', dec.thought);
    }

    if (this.onChatResponse && dec.thought) {
      this.onChatResponse(this.robot.name, dec.thought, dec.action);
    }

    if (dec.thought) {
      this.speakThought(dec.thought, this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }

    this.executeAction(dec.action, dec.interaction);
  }

  executeAction(action, interaction = null) {
    if (!action) return;

    // Call Pack assemble!
    if (action === 'call_pack') {
      if (this.packManager && this.packManager.callPackToPlayer) {
        this.packManager.callPackToPlayer(this.robot);
        roboAudio.playHowl();
        this.robot.animController.play('howl', 2.5);
        this.addJournalEntry('Orgulloso', '¡Llamé a toda mi manada y nos reunimos en formación!');
        return;
      }
    }

    // 1. Oxytocin Praise Burst
    if (action === 'praise_burst') {
      this.robot.praise();
      if (this.particleSystem) {
        this.particleSystem.spawnBurst(this.robot.group.position, 'LOVING');
      }
      this.robot.animController.play(Math.random() < 0.5 ? 'bellyRub' : 'playBow', 3.0);
      this.addJournalEntry('Cariñoso', '¡Mi humano me elogió! Sentí una oleada de amor y lealtad perruna.');
      return;
    }

    // 2. Fetch & Bring Back (Cognitive Retrieval Loop)
    if (action === 'fetch_ball') {
      let ball = this.world.soccerBall;
      if (!ball && this.world.balls && this.world.balls.length > 0) {
        ball = this.world.balls[0];
      }
      if (!ball) return;

      const humanPos = this.robot.group.position.clone();
      this.robot.setEmotion(EMOTIONS.EXCITED);
      roboAudio.playYip(1.3);

      // Phase 1: Sprint to the ball
      this.navigateToward(ball.mesh.position, 7.2, 'run', () => {
        // Phase 2: Pick up ball in mouth
        this.robot.grabObject(ball.mesh);
        ball.carriedBy = this.robot;
        roboAudio.playGrumble ? roboAudio.playGrumble(1.1) : roboAudio.playBoop(1.4);
        this.addJournalEntry('Juguetón', '¡Atrapé la pelota en mi hocico! Llevándosela a mi humano.');

        // Phase 3: Return to human starting point
        this.navigateToward(humanPos, 6.6, 'run', () => {
          // Phase 4: Drop ball at feet and perform play-bow
          const droppedMesh = this.robot.dropObject();
          ball.carriedBy = null;
          if (droppedMesh) {
            this.world.scene.add(droppedMesh);
            droppedMesh.position.copy(this.robot.group.position);
            droppedMesh.position.y = this.world.getHeightAt(droppedMesh.position.x, droppedMesh.position.z) + ball.radius;
            ball.velocity.set(0, 0, 0);
          }
          this.robot.animController.play('playBow', 2.8);
          this.robot.setEmotion(EMOTIONS.HAPPY);
          roboAudio.playHappyJingle();
          this.addJournalEntry('Feliz', '¡Te traje la pelota y la dejé a tus pies! ¡Lánzamela otra vez!');
        });
      });
      return;
    }

    // 3. Chorus Howl (Manada sincronizada)
    if (action === 'chorus_howl') {
      roboAudio.playHowl();
      this.robot.animController.play('howl', 3.0);
      this.robot.setEmotion(EMOTIONS.EXCITED);
      if (this.packManager && this.packManager.pack) {
        this.packManager.pack.forEach((otherBot, idx) => {
          setTimeout(() => {
            otherBot.animController.play('howl', 2.8);
            otherBot.setEmotion(EMOTIONS.EXCITED);
            otherBot.lookAt(this.robot.group.position);
          }, 350 + idx * 300);
        });
      }
      this.addJournalEntry('Emocionado', '¡Iniciamos un coro de aullidos en manada bajo el cielo virtual!');
      return;
    }

    // 4. Scent Tracking (Olfato canino)
    if (action === 'scent_track') {
      this.robot.animController.play('sniff', 3.0);
      this.robot.setEmotion(EMOTIONS.CURIOUS);
      roboAudio.playBoop(1.1);

      let nearestPos = null;
      let minDist = Infinity;
      const rPos = this.robot.group.position;
      const candidates = [];
      if (this.world.snacks) this.world.snacks.forEach(s => candidates.push(s.group.position));
      if (this.world.balls) this.world.balls.forEach(b => candidates.push(b.mesh.position));

      candidates.forEach(pos => {
        const d = rPos.distanceTo(pos);
        if (d < minDist && d > 1.2) {
          minDist = d;
          nearestPos = pos;
        }
      });

      if (nearestPos) {
        this.navigateToward(nearestPos, 3.8, 'walk', () => {
          this.robot.animController.play('wagTail', 2.0);
          this.robot.setEmotion(EMOTIONS.HAPPY);
          roboAudio.playHappyJingle();
          this.addJournalEntry('Curioso', '¡Mi olfato cibernético siguió el rastro y encontré un objeto en el prado!');
        });
      }
      return;
    }

    // 5. Patrol Perimeter
    if (action === 'patrol_perimeter') {
      const waypoints = [
        new THREE.Vector3(70, 0, 70),
        new THREE.Vector3(70, 0, -70),
        new THREE.Vector3(-70, 0, -70),
        new THREE.Vector3(-70, 0, 70)
      ];
      let wpIdx = 0;
      const visitNext = () => {
        if (wpIdx >= waypoints.length) {
          this.robot.animController.play('wagTail', 2.0);
          this.robot.setEmotion(EMOTIONS.PROUD);
          this.addJournalEntry('Alerta', '¡Ronda de patrullaje perimetral completada sin novedades!');
          return;
        }
        const wp = waypoints[wpIdx++];
        this.navigateToward(wp, 4.2, 'walk', () => {
          this.robot.animController.play('patrolLook', 2.8);
          this.robot.setEmotion(EMOTIONS.ALERT);
          roboAudio.playBoop(1.2);
          setTimeout(visitNext, 2900);
        });
      };
      visitNext();
      return;
    }

    // 6. Chase Its Own Tail
    if (action === 'chase_tail') {
      this.robot.setEmotion(EMOTIONS.EXCITED);
      this.robot.animController.play('chaseTail', 3.8);
      roboAudio.playYip(1.4);
      let spinTime = 0;
      const spinInterval = setInterval(() => {
        spinTime += 0.05;
        this.robot.group.rotation.y += 0.42;
        if (spinTime >= 3.6) {
          clearInterval(spinInterval);
          this.robot.setEmotion(EMOTIONS.CONFUSED);
          this.robot.animController.play('dizzy', 2.5);
          if (this.particleSystem) this.particleSystem.spawnBurst(this.robot.group.position, 'CONFUSED');
          roboAudio.playConfused();
          this.addJournalEntry('Juguetón', '¡Giré tanto persiguiéndome la cola que me mareé y caí sentado!');
        }
      }, 50);
      return;
    }

    // 7. Slalom Agility Rings
    if (action === 'slalom_rings') {
      if (this.world.slalomRings && this.world.slalomRings.length > 0) {
        let rIdx = 0;
        const rings = this.world.slalomRings;
        const jumpThroughNext = () => {
          if (rIdx >= rings.length) {
            this.robot.setEmotion(EMOTIONS.PROUD);
            this.robot.animController.play('backflip', 1.6);
            roboAudio.playGoalFanfare();
            this.addJournalEntry('Orgulloso', '¡Completé el circuito de aros de agilidad con saltos perfectos!');
            return;
          }
          const ring = rings[rIdx++];
          this.navigateToward(ring.entryPos, 6.2, 'run', () => {
            // Parabolic leap through ring center to exit
            roboAudio.playTrampoline();
            this.robot.animController.play('jump', 1.2);
            let p = 0;
            const leapInterval = setInterval(() => {
              p += 0.08;
              this.robot.group.position.lerpVectors(ring.entryPos, ring.exitPos, p);
              // Parabola: 4 * h * p * (1 - p)
              const leapH = 1.6 * (4 * p * (1 - p));
              this.robot.group.position.y = ring.entryPos.y + leapH;
              if (p >= 1.0) {
                clearInterval(leapInterval);
                jumpThroughNext();
              }
            }, 35);
          });
        };
        jumpThroughNext();
      }
      return;
    }

    // 8. Soccer Kick Shot to Goal
    if (action === 'soccer_kick') {
      const ball = this.world.soccerBall;
      const goalPos = new THREE.Vector3(25, 1, 40);
      if (ball) {
        const ballPos = ball.mesh.position;
        // Calculate approach vector aligned Perro -> Pelota -> Portería
        const kickDir = new THREE.Vector3().subVectors(goalPos, ballPos).normalize();
        const approachPos = new THREE.Vector3().subVectors(ballPos, kickDir.clone().multiplyScalar(2.0));
        approachPos.y = this.world.getHeightAt(approachPos.x, approachPos.z);

        this.navigateToward(approachPos, 7.0, 'run', () => {
          this.robot.lookAt(goalPos);
          this.robot.animController.play('jump', 1.2);
          roboAudio.playBark(1.3);
          // Apply strong impulse to ball
          ball.velocity.copy(kickDir.multiplyScalar(26));
          ball.velocity.y = 8.5;
          this.robot.setEmotion(EMOTIONS.PROUD);
          this.addJournalEntry('Orgulloso', '¡Alineé el tiro y rematé el balón directo al centro de la portería!');
        });
      }
      return;
    }

    // 9. Trampoline Consecutive Bounces
    if (action === 'trampoline_trick') {
      const trampPos = new THREE.Vector3(38, 0, 22);
      this.navigateToward(trampPos, 6.0, 'run', () => {
        let bounces = 0;
        const doBounce = () => {
          bounces++;
          const force = 2.0 + bounces * 0.8;
          this.robot.group.position.y += force;
          roboAudio.playTrampoline();
          this.robot.animController.play('backflip', 1.5);
          this.robot.setEmotion(EMOTIONS.EXCITED);
          if (bounces < 3) {
            setTimeout(doBounce, 1300);
          } else {
            this.addJournalEntry('Juguetón', '¡Hice 3 rebotes consecutivos cada vez más altos con piruetas 360°!');
          }
        };
        doBounce();
      });
      return;
    }

    // 10. Agility Slide
    if (action === 'slide_down') {
      const slidePos = new THREE.Vector3(-18, 0, -32);
      this.navigateToward(slidePos, 5.8, 'run', () => {
        if (this.world.slide) {
          // Pause 1s on top platform
          this.robot.group.position.copy(this.world.slide.topPos);
          this.robot.lookAt(new THREE.Vector3(0, 0, 0));
          this.robot.animController.play('headTilt', 1.2);
          setTimeout(() => {
            // Slide down chute
            this.world.logActivity(`🎢 ¡${this.robot.name} se lanzó por el tobogán a gran velocidad!`);
            let p = 0;
            this.robot.animController.play('roll', 2.0);
            const iv = setInterval(() => {
              p += 0.08;
              this.robot.group.position.lerpVectors(this.world.slide.topPos, this.world.slide.endPos, p);
              this.robot.group.position.y = THREE.MathUtils.lerp(this.world.slide.topPos.y, this.world.slide.endPos.y, p);
              if (p >= 1.0) {
                clearInterval(iv);
                this.robot.animController.play('backflip', 1.5);
                roboAudio.playHappyJingle();
                this.addJournalEntry('Juguetón', '¡Me deslicé por el tobogán y aterricé en la colchoneta con estilo!');
              }
            }, 35);
          }, 1100);
        }
      });
      return;
    }

    // 11. Lake Swimming & Drying Shake-Off
    if (action === 'lake_swim' || action === 'go_lake') {
      // Clear open sandy beach access point
      const beachPos = new THREE.Vector3(-55, 0, -55);
      this.navigateToward(beachPos, 5.2, 'run', () => {
        // Step into water
        const swimPos = new THREE.Vector3(-66, -0.52, -66);
        this.navigateToward(swimPos, 3.2, 'swimming', () => {
          roboAudio.playSplash();
          this.robot.isInWater = true;
          this.robot.animController.play('swimming');
          this.robot.setEmotion(EMOTIONS.HAPPY);
          this.addJournalEntry('Feliz', '¡Nadando en el Lago de Cristal moviendo las patitas bajo la superficie!');

          // Swim in circle for 3.5s then return to shore to dry off
          setTimeout(() => {
            this.navigateToward(beachPos, 3.5, 'swimming', () => {
              this.robot.isInWater = false;
              this.robot.wasInWater = false;
              this.robot.animController.play('shakeOff', 2.0);
              roboAudio.playSplash();
              if (this.particleSystem) this.particleSystem.spawnBurst(this.robot.group.position, 'HAPPY');
              this.addJournalEntry('Feliz', '¡Salí del agua a tierra firme y me sacudí con fuerza para secarme!');
            });
          }, 3500);
        });
      });
      return;
    }

    // 12. Play Tag (La Traes)
    if (action === 'play_tag') {
      if (this.packManager && this.packManager.startTagGame) {
        this.packManager.startTagGame(this.robot);
        return;
      }
    }

    // 13. Speed Race
    if (action === 'speed_race') {
      if (this.packManager && this.packManager.startSpeedRace) {
        this.packManager.startSpeedRace(this.robot);
        return;
      }
    }

    // 14. Pack Gossip / Circle Gathering
    if (action === 'pack_gossip') {
      if (this.packManager && this.packManager.startPackGossip) {
        this.packManager.startPackGossip(this.robot);
        return;
      }
    }

    // 15. Dig Treasure
    if (action === 'dig_treasure') {
      let nearestSpot = null;
      let minD = Infinity;
      const rPos = this.robot.group.position;
      if (this.world.treasureSpots) {
        this.world.treasureSpots.forEach(s => {
          if (!s.dug) {
            const d = Math.hypot(rPos.x - s.x, rPos.z - s.z);
            if (d < minD) { minD = d; nearestSpot = s; }
          }
        });
      }
      const targetP = nearestSpot ? new THREE.Vector3(nearestSpot.x, 0, nearestSpot.z) : new THREE.Vector3(rPos.x + 2, 0, rPos.z + 2);
      this.navigateToward(targetP, 4.8, 'run', () => {
        this.robot.animController.play('dig', 3.2);
        this.robot.setEmotion(EMOTIONS.CURIOUS);
        roboAudio.playBoop(1.2);
        if (this.particleSystem) this.particleSystem.spawnBurst(this.robot.group.position, 'CURIOUS');
        setTimeout(() => {
          if (nearestSpot && this.world.revealDugTreasure) {
            this.world.revealDugTreasure(this.robot, nearestSpot);
          }
          this.robot.animController.play('wagTail', 2.0);
          this.robot.setEmotion(EMOTIONS.PROUD);
        }, 3200);
      });
      return;
    }

    // 16. Hunt Butterfly
    if (action === 'hunt_butterfly') {
      let targetBfly = null;
      let minD = Infinity;
      const rPos = this.robot.group.position;
      if (this.world.butterflies && this.world.butterflies.length > 0) {
        this.world.butterflies.forEach(b => {
          const d = rPos.distanceTo(b.sprite.position);
          if (d < minD) { minD = d; targetBfly = b; }
        });
      }
      if (targetBfly) {
        const dest = new THREE.Vector3(targetBfly.sprite.position.x, 0, targetBfly.sprite.position.z);
        this.navigateToward(dest, 3.2, 'sneak', () => {
          this.robot.animController.play('jump', 1.4);
          this.robot.group.position.y += 1.8;
          roboAudio.playYip(1.5);
          this.robot.setEmotion(EMOTIONS.EXCITED);
          this.addJournalEntry('Curioso', '¡Me acerqué en sigilo y salté alto intentando atrapar la mariposa!');
        });
      }
      return;
    }

    // 17. Pine Tree Shade Nap
    if (action === 'shade_nap') {
      const shadePos = new THREE.Vector3(-22, 0, 18);
      this.navigateToward(shadePos, 4.0, 'walk', () => {
        // Circle 720 degrees
        let rotAngle = 0;
        const circleIv = setInterval(() => {
          rotAngle += 0.25;
          this.robot.group.rotation.y += 0.25;
          if (rotAngle >= Math.PI * 4) {
            clearInterval(circleIv);
            this.robot.animController.play('lieDown', 6.0);
            this.robot.setEmotion(EMOTIONS.SLEEPY);
            if (this.particleSystem) this.particleSystem.spawnBurst(this.robot.group.position, 'SLEEPY');
            this.robot.energy = 100;
            this.addJournalEntry('Somnoliento', 'Di dos vueltas sobre mí mismo y me eché a dormir una rica siesta bajo la sombra del pino.');
          }
        }, 50);
      });
      return;
    }

    // 18. Beg for Pets to Camera
    if (action === 'beg_pets') {
      const curPos = this.robot.group.position;
      this.robot.lookAt(new THREE.Vector3(curPos.x + 1, curPos.y + 1, curPos.z + 2));
      this.robot.animController.play('bellyRub', 4.0);
      this.robot.setEmotion(EMOTIONS.LOVING);
      if (this.particleSystem) this.particleSystem.spawnBurst(this.robot.group.position, 'LOVING');
      roboAudio.playBoop(1.4);
      this.addJournalEntry('Cariñoso', '¡Me puse panza arriba con las patitas al aire esperando tus caricias!');
      return;
    }

    // Direct movement animations (incluyendo posturas etológicas)
    const directAnims = [
      'walk', 'run', 'sit', 'lieDown', 'jump', 'wagTail', 'bark', 'sniff', 'scratch',
      'backflip', 'spin', 'roll', 'wave', 'recharge', 'dig', 'howl', 'dance', 'sneak',
      'playBow', 'headTilt', 'bellyRub', 'beg', 'shakeOff', 'nuzzle', 'dizzy', 'swimming', 'patrolLook', 'scentTrack'
    ];
    if (directAnims.includes(action)) {
      if (this.robot.animController) {
        this.robot.animController.play(action, 2.5);
      }
      return;
    }

    // Interactive Navigations
    if (action === 'go_playground') {
      this.navigateToward(new THREE.Vector3(50, 0, 40), 5.5, 'run', () => {
        this.robot.setEmotion(EMOTIONS.EXCITED);
        this.robot.animController.play('wagTail', 2.0);
      });
    } else if (action === 'go_trampoline') {
      const trampPos = new THREE.Vector3(38, 0, 22);
      this.navigateToward(trampPos, 5.8, 'run', () => {
        this.world.launchTrampoline(this.robot);
        this.robot.setEmotion(EMOTIONS.EXCITED);
        this.robot.animController.play('backflip', 1.8);
        this.addJournalEntry('Juguetón', '¡Reboté súper alto en el trampolín cibernético!');
      });
    } else if (action === 'go_carousel') {
      const carouselPos = new THREE.Vector3(62, 0, 26);
      this.navigateToward(carouselPos, 4.8, 'walk', () => {
        this.robot.setEmotion(EMOTIONS.HAPPY);
        this.robot.animController.play('spin', 3.0);
        this.addJournalEntry('Feliz', 'Me subí al carrusel a dar alegres vueltas.');
      });
    } else if (action === 'go_ball') {
      let ballPos = new THREE.Vector3(42, 0.5, 38);
      if (this.world && this.world.soccerBall) {
        ballPos = this.world.soccerBall.mesh.position;
      }
      this.navigateToward(ballPos, 6.4, 'run', () => {
        if (this.world && this.world.soccerBall) {
          const ball = this.world.soccerBall;
          const goalPos = new THREE.Vector3(25, 1, 40);
          const kickDir = new THREE.Vector3().subVectors(goalPos, ball.mesh.position).normalize();
          ball.velocity.copy(kickDir.multiplyScalar(22));
          ball.velocity.y = 7;
          roboAudio.playBark(1.2);
          this.robot.animController.play('jump', 1.2);
          this.robot.setEmotion(EMOTIONS.PROUD);
          this.addJournalEntry('Orgulloso', '¡Pateé la pelota de fútbol con toda la potencia hacia la portería!');
        }
      });
    } else if (action === 'go_disco') {
      const discoPos = new THREE.Vector3(52, 0, 56);
      this.navigateToward(discoPos, 5.4, 'run', () => {
        this.world.triggerDiscoParty();
        this.robot.setEmotion(EMOTIONS.PARTY);
        this.robot.animController.play('dance', 3.5);
        this.addJournalEntry('Fiestero', '¡Llegué a la pista disco a poner el mejor ambiente!');
      });
    } else if (action === 'go_snack') {
      let snackPos = new THREE.Vector3(46, 0, 48);
      if (this.world.snacks && this.world.snacks.length > 0) {
        snackPos = this.world.snacks[0].group.position;
      }
      this.navigateToward(snackPos, 5.8, 'run', () => {
        this.robot.energy = 100;
        roboAudio.playSnackMunch();
        this.robot.setEmotion(EMOTIONS.HUNGRY);
        this.robot.animController.play('sniff', 2.0);
        this.addJournalEntry('Glotón', '¡Me comí una rica ciborgalleta y recargué mi energía al 100%!');
      });
    } else if (action === 'go_doghouse') {
      const housePos = new THREE.Vector3(72, 0, 52);
      this.navigateToward(housePos, 4.2, 'walk', () => {
        this.robot.energy = 100;
        this.robot.setEmotion(EMOTIONS.SLEEPY);
        this.robot.animController.play('lieDown', 3.0);
        this.addJournalEntry('Somnoliento', 'Descansando plácidamente en la estación de recarga.');
      });
    } else if (action === 'go_fountain') {
      const fPos = new THREE.Vector3(12, 0, 10);
      this.navigateToward(fPos, 5.0, 'walk', () => {
        if (this.robot.quenchThirst) this.robot.quenchThirst(40);
        roboAudio.playSplash();
        this.robot.setEmotion(EMOTIONS.HAPPY);
        this.robot.animController.play('wagTail', 2.5);
        this.addJournalEntry('Feliz', 'Bebí agua fresca y deliciosa en la fuente cibernética.');
      });
    } else if (action === 'go_bridge') {
      const bPos = new THREE.Vector3(-46, 0, -48);
      this.navigateToward(bPos, 4.8, 'walk', () => {
        this.robot.setEmotion(EMOTIONS.CURIOUS);
        this.robot.animController.play('headTilt', 2.0);
        this.addJournalEntry('Curioso', 'Crucé el puente de madera sobre el arroyo del lago.');
      });
    } else if (action === 'go_seesaw') {
      const sPos = new THREE.Vector3(48, 0, 32);
      this.navigateToward(sPos, 5.2, 'run', () => {
        this.robot.setEmotion(EMOTIONS.EXCITED);
        this.robot.animController.play('jump', 1.8);
        this.addJournalEntry('Juguetón', 'Me subí al balancín cibernético para balancearme con mis amigos.');
      });
    } else if (action === 'go_ballpit') {
      const pitPos = new THREE.Vector3(-32, 0, 48);
      this.navigateToward(pitPos, 5.6, 'run', () => {
        this.robot.setEmotion(EMOTIONS.EXCITED);
        this.robot.animController.play('jump', 1.8);
        this.addJournalEntry('Juguetón', '¡Me zambullí de lleno en la piscina de pelotas!');
      });
    } else if (action === 'go_slide') {
      const slidePos = new THREE.Vector3(-18, 0, -32);
      this.navigateToward(slidePos, 5.8, 'run', () => {
        this.robot.setEmotion(EMOTIONS.EXCITED);
        this.addJournalEntry('Juguetón', '¡Subí al tobogán y me deslicé a toda velocidad!');
      });
    } else if (action === 'go_tunnel') {
      const tunnelPos = new THREE.Vector3(22, 0, -50);
      this.navigateToward(tunnelPos, 5.4, 'run', () => {
        this.robot.setEmotion(EMOTIONS.CURIOUS);
        this.robot.animController.play('sneak', 2.0);
        this.addJournalEntry('Curioso', '¡Pasé a toda velocidad por el túnel de agilidad!');
      });
    } else if (action === 'go_target') {
      const targetPos = new THREE.Vector3(76, 0, 18);
      this.navigateToward(targetPos, 5.6, 'run', () => {
        this.robot.setEmotion(EMOTIONS.PROUD);
        this.robot.animController.play('bark', 2.0);
        this.addJournalEntry('Orgulloso', '¡Llegué a la diana de tiro al blanco a probar mi puntería!');
      });
    } else if (action === 'go_pinata') {
      const pinataPos = new THREE.Vector3(-42, 0, 14);
      this.navigateToward(pinataPos, 6.0, 'run', () => {
        this.robot.setEmotion(EMOTIONS.EXCITED);
        this.robot.animController.play('jump', 1.5);
        this.addJournalEntry('Juguetón', '¡Salté a golpear la piñata de galletas!');
      });
    } else if (action.startsWith('go_robot_')) {
      const targetName = action.replace('go_robot_', '');
      if (this.packManager && this.packManager.allRobots[targetName]) {
        const targetBot = this.packManager.allRobots[targetName];
        this.navigateToward(targetBot.group.position, 5.2, 'run', () => {
          this.robot.lookAt(targetBot.group.position);
          this.robot.animController.play('wave', 2.0);
          this.robot.setEmotion(EMOTIONS.LOVING);
          targetBot.lookAt(this.robot.group.position);
          targetBot.animController.play('wagTail', 2.0);
          targetBot.setEmotion(EMOTIONS.HAPPY);
          roboAudio.playBark(this.robot.profile.voicePitch || 1.0);
          this.addJournalEntry('Cariñoso', `Fui a saludar a mi amigo ${targetName} y jugamos juntos.`);
        });
      }
    }
  }

  executeMovementSequence(sequence) {
    if (this.robot.animController) {
      this.robot.animController.playSequence(sequence, () => {
        this.robot.setEmotion(EMOTIONS.HAPPY);
        roboAudio.playHappyJingle();
      });
    }
  }

  navigateToward(targetPos, speed = 4.8, anim = 'walk', onArrival = null) {
    if (this.robot.animController) this.robot.animController.play(anim);
    this.navTarget = targetPos.clone();
    this.navSpeed = speed * (this.robot.profile ? this.robot.profile.speedMultiplier : 1.0);
    this.isNavigating = true;
    this.navTimer = 0;
    this.navMaxTime = 16.0; // 16s mission timeout
    this.navStuckTime = 0;
    this.navLastPos = this.robot.group.position.clone();
    this.onArrivalCallback = onArrival;
    this.robot.startMission(anim, anim, targetPos, 16.0, onArrival);
  }

  updateNavigation(delta) {
    if (!this.isNavigating || !this.navTarget) return;

    this.navTimer += delta;
    // 1. Mission Timeout: If not arrived within max duration, liberate the robot!
    if (this.navTimer >= this.navMaxTime) {
      this.isNavigating = false;
      this.robot.clearMission();
      if (this.robot.animController) this.robot.animController.play('idle');
      this.world.logActivity(`🐾 ${this.robot.name} completó su misión y queda libre para explorar.`);
      return;
    }

    const curPos = this.robot.group.position;
    const diff = new THREE.Vector3().subVectors(this.navTarget, curPos);
    diff.y = 0;
    const dist = diff.length();

    // 2. Unstuck detector: check progress
    if (this.navLastPos) {
      const moved = curPos.distanceTo(this.navLastPos);
      this.navLastPos.copy(curPos);
      if (moved < 0.05) {
        this.navStuckTime += delta;
        if (this.navStuckTime > 0.8) {
          // Tangent steering to slip around obstacles
          const tangent = new THREE.Vector3(-diff.z, 0, diff.x).normalize();
          curPos.addScaledVector(tangent, delta * 3.8);
        }
        if (this.navStuckTime > 2.5) {
          // Finish navigation gracefully to avoid permanent freezing
          this.isNavigating = false;
          this.robot.clearMission();
          if (this.onArrivalCallback) {
            const cb = this.onArrivalCallback;
            this.onArrivalCallback = null;
            cb();
          }
          return;
        }
      } else {
        this.navStuckTime = Math.max(0, this.navStuckTime - delta * 2);
      }
    }

    if (dist < 2.0) {
      this.isNavigating = false;
      this.robot.clearMission();
      if (this.robot.animController) this.robot.animController.play('idle');
      if (this.onArrivalCallback) {
        const cb = this.onArrivalCallback;
        this.onArrivalCallback = null;
        cb();
      }
      return;
    }

    diff.normalize();
    const targetAngle = Math.atan2(diff.x, diff.z);
    this.robot.group.rotation.y = THREE.MathUtils.lerp(this.robot.group.rotation.y, targetAngle, delta * 6);

    curPos.addScaledVector(diff, this.navSpeed * delta);
    if (this.world) {
      if (this.world.resolveObstacleCollisions) {
        this.world.resolveObstacleCollisions(curPos, 0.75);
      }
      curPos.y = this.world.getHeightAt(curPos.x, curPos.z);
      this.world.handleRobotInteractions(this.robot);
    }
  }
}
