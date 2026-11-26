// Compact Mobile-First HUD, Live renderer.info Telemetry Widget, Minimap, Macros, STT & EventBus Wiring
import * as THREE from 'three';
import { EMOTIONS } from './emotions.js';
import { roboAudio } from './audio.js';

const WEATHER_MODES = ['CLEAR', 'CYBER_RAIN', 'FIREFLIES', 'STARDUST'];
const WEATHER_LABELS = {
  CLEAR: '☀️ Clima Despejado',
  CYBER_RAIN: '🌧️ Lluvia Neón',
  FIREFLIES: '✨ Luciérnagas',
  STARDUST: '❄️ Polvo Estelar'
};
const VISION_MODES = ['', 'fx-crt', 'fx-nightvision', 'fx-thermal', 'fx-cinema'];
const VISION_LABELS = [
  '🕶️ Óptica: Estándar',
  '📺 Óptica: CRT',
  '🟢 Óptica: Nocturna',
  '🔥 Óptica: Térmica',
  '🎬 Óptica: Cine'
];
const CAM_LABELS = {
  follow: 'Seguir',
  diagonal: 'Diag',
  orbit: 'Órbita',
  free: 'Vuelo',
  eye: 'Ojos',
  drone: 'Drone'
};
const CAM_CYCLE_ORDER = ['follow', 'diagonal', 'orbit', 'drone', 'eye', 'free'];
const TIME_ORDER = ['day', 'sunset', 'night'];

const STATIC_ATTRACTIONS = [
  [38, 22, '🎪'],
  [62, 26, '🎠'],
  [52, 56, '🪩'],
  [72, 52, '🏠'],
  [12, 10, '💧'],
  [-46, -48, '🌉'],
  [-32, 48, '🟣'],
  [-18, -32, '🎢'],
  [22, -50, '🌀'],
  [76, 18, '🎯'],
  [-42, 14, '🪅']
];

export class UiHud {
  constructor(eventBus, appState, world, packManager, brain, vision, multiplayer) {
    this.eventBus = eventBus;
    this.appState = appState;
    this.world = world;
    this.packManager = packManager;
    this.brain = brain;
    this.vision = vision;
    this.multiplayer = multiplayer;

    this._ac = new AbortController();
    this._unsubs = [];
    this._timers = new Set();

    // Scratch & state caches (zero per-frame allocations)
    this._speechVec = new THREE.Vector3();
    this._lastBubbleX = -9999;
    this._lastBubbleY = -9999;
    this._bubbleVisible = false;
    this._speechHideTimer = null;

    this._minimapAccum = 0;
    this._minimapScale = 0.55;
    this._radarAngle = 0;
    this._pingRadius = 0;
    this._targetWaypoint = null;
    this._minimapSnapshot = { soccerBallPos: null, ballPositions: [], snackPositions: [] };

    // Telemetry ring buffer (no push/shift array churn)
    this._fpsHistory = new Float32Array(48);
    this._fpsHistory.fill(60);
    this._fpsHead = 0;
    this._telemetryOpen = false;
    this._lastTelemetryMs = 0;
    this._lastStats = { nrg: -1, cur: -1, aff: -1, hyd: -1, emo: '', loc: '' };

    // Chat & Macro state
    this._chatFilterDog = 'ALL';
    this._allChatHistory = [];
    this._macroQueue = [
      { id: 'btn-anim-playBow', label: '🙇 Reverencia' },
      { id: 'btn-anim-spin', label: '🔄 Girar' },
      { id: 'btn-anim-backflip', label: '🤸 Voltereta' },
      { id: 'btn-emo-happy', label: '😊 Feliz' }
    ];
    this._macroLoop = false;
    this._macroRunning = false;

    this._cacheElements();
    this._initMinimapCanvas();
    this._bindControls();
    this._bindModalsAndExtras();
    this._bindEventBus();
    this._initResponsiveDefaults();
    this._initSavedUser();
    this._renderMacroTimeline(-1);
  }

  _trackTimer(id) {
    this._timers.add(id);
    return id;
  }

  _setTimeout(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    return this._trackTimer(id);
  }

  _setInterval(fn, ms) {
    const id = setInterval(fn, ms);
    return this._trackTimer(id);
  }

  _clearTimer(id) {
    if (id === null || id === undefined) return;
    clearTimeout(id);
    clearInterval(id);
    this._timers.delete(id);
  }

  _emitAction(action, payload = null) {
    this._pulseHaptic(15);
    if (this.eventBus) {
      this.eventBus.emit('input:action', { action, payload });
    }
  }

  _pulseHaptic(pattern = 15) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  _cacheElements() {
    this.el = {
      hudOverlay: document.getElementById('hud-overlay'),
      speechBubble: document.getElementById('world-speech-bubble'),
      toastContainer: document.getElementById('cyber-toast-container'),

      robotName: document.getElementById('robot-name'),
      robotTitle: document.getElementById('robot-title-tag'),
      headerAvatar: document.getElementById('header-robot-avatar'),
      thinkStatus: document.getElementById('think-status'),
      statLocation: document.getElementById('stat-location'),
      statEmotion: document.getElementById('stat-emotion'),
      statEnergy: document.getElementById('stat-energy'),
      statCuriosity: document.getElementById('stat-curiosity'),
      statAffection: document.getElementById('stat-affection'),
      statHydration: document.getElementById('stat-hydration'),
      barEnergy: document.getElementById('bar-energy'),
      barCuriosity: document.getElementById('bar-curiosity'),
      barAffection: document.getElementById('bar-affection'),
      barHydration: document.getElementById('bar-hydration'),

      soccerScore: document.getElementById('soccer-score-num'),
      targetScore: document.getElementById('target-score-num'),

      perfPill: document.getElementById('cyber-perf-pill'),
      perfDot: document.getElementById('perf-status-dot'),
      hudFps: document.getElementById('hud-fps-counter'),
      hudCalls: document.getElementById('hud-calls-counter'),
      hudAiPing: document.getElementById('hud-ai-ping'),

      telemetryWidget: document.getElementById('telemetry-widget'),
      telemetryBudgetBadge: document.getElementById('telemetry-budget-badge'),
      twFps: document.getElementById('tw-fps'),
      twMs: document.getElementById('tw-ms'),
      twCalls: document.getElementById('tw-calls'),
      twTris: document.getElementById('tw-tris'),
      twGeos: document.getElementById('tw-geos'),
      twTexs: document.getElementById('tw-texs'),
      twHeap: document.getElementById('tw-heap'),
      twPing: document.getElementById('tw-ping'),
      twChart: document.getElementById('telemetry-widget-chart'),

      tValFps: document.getElementById('t-val-fps'),
      tValMs: document.getElementById('t-val-ms'),
      tValCalls: document.getElementById('t-val-calls'),
      tValTris: document.getElementById('t-val-tris'),
      tValGeos: document.getElementById('t-val-geos'),
      tValTexs: document.getElementById('t-val-texs'),
      tValPing: document.getElementById('t-val-ping'),
      tValApiCalls: document.getElementById('t-val-api-calls'),
      tHeapLabel: document.getElementById('telemetry-heap-label'),
      tChart: document.getElementById('telemetry-chart-canvas'),
      llmLog: document.getElementById('llm-inspector-log'),

      camCurrentName: document.getElementById('cam-current-name'),
      thoughtText: document.getElementById('thought-bubble-text'),
      activityList: document.getElementById('activity-ticker-content'),
      chatFeed: document.getElementById('chat-history-feed'),
      chatInput: document.getElementById('chat-input'),
      bottomDock: document.getElementById('bottom-dock'),
      dockToggleIcon: document.getElementById('dock-toggle-icon'),
      quickBar: document.getElementById('roblox-quick-bar'),

      minimapPanel: document.getElementById('minimap-panel'),
      minimapCanvas: document.getElementById('minimap-canvas'),
      pipPanel: document.getElementById('pip-panel'),
      usersPanel: document.getElementById('online-users-panel'),
      usersCount: document.getElementById('online-users-count'),
      usersList: document.getElementById('online-users-list'),
      headerUserAvatar: document.getElementById('header-user-avatar'),
      headerUserName: document.getElementById('header-user-name')
    };

    this.twCtx = this.el.twChart ? this.el.twChart.getContext('2d') : null;
    this.tCtx = this.el.tChart ? this.el.tChart.getContext('2d') : null;
  }

  _initResponsiveDefaults() {
    if (window.innerWidth <= 900) {
      const thoughtPanel = document.getElementById('thought-panel');
      const minBtn = document.getElementById('btn-min-upperleft');
      if (thoughtPanel) thoughtPanel.classList.add('minimized');
      if (minBtn) minBtn.textContent = '▢';
    }
  }

  _initSavedUser() {
    let savedUser = null;
    try {
      savedUser = JSON.parse(localStorage.getItem('robochibi_user'));
    } catch {}
    if (savedUser && savedUser.username) {
      this._applyUserLogin(savedUser);
    } else {
      document.getElementById('modal-login')?.classList.remove('hidden');
    }
  }

  _applyUserLogin(user) {
    if (!user) return;
    if (this.appState?.net) this.appState.net.user = user;
    if (this.el.headerUserAvatar) this.el.headerUserAvatar.textContent = user.avatar || '🐾';
    if (this.el.headerUserName) this.el.headerUserName.textContent = user.username || 'Humano';
    if (this.multiplayer) {
      if (this.appState?.net?.connected && this.multiplayer.updateUser) {
        this.multiplayer.updateUser(user);
      } else if (this.multiplayer.connect) {
        this.multiplayer.connect(user);
      }
    }
  }

  _initMinimapCanvas() {
    this.minimapCtx = this.el.minimapCanvas ? this.el.minimapCanvas.getContext('2d') : null;
    if (!this.el.minimapCanvas) return;

    const sig = { signal: this._ac.signal };
    this.el.minimapCanvas.addEventListener('click', (e) => {
      const playerDog = this.packManager?.playerDog || this.packManager?.getDog?.(this.appState?.activeRobotName);
      if (!playerDog) return;
      const rect = this.el.minimapCanvas.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) * (this.el.minimapCanvas.width / rect.width);
      const clickY = (e.clientY - rect.top) * (this.el.minimapCanvas.height / rect.height);
      const centerX = this.el.minimapCanvas.width * 0.5;
      const centerY = this.el.minimapCanvas.height * 0.5;
      const pPos = playerDog.group.position;

      const worldX = pPos.x + (clickX - centerX) / this._minimapScale;
      const worldZ = pPos.z + (clickY - centerY) / this._minimapScale;
      this._targetWaypoint = { x: worldX, z: worldZ };
      this._emitAction('navigateTo', { x: worldX, z: worldZ });
    }, sig);

    document.getElementById('btn-minimap-zoom-in')?.addEventListener('click', () => {
      this._minimapScale = Math.min(1.2, this._minimapScale + 0.15);
    }, sig);
    document.getElementById('btn-minimap-zoom-out')?.addEventListener('click', () => {
      this._minimapScale = Math.max(0.25, this._minimapScale - 0.15);
    }, sig);
    document.getElementById('btn-minimap-recenter')?.addEventListener('click', () => {
      this._minimapScale = 0.55;
      this._targetWaypoint = null;
      this._emitAction('cancelNavigation');
    }, sig);
  }

  _bindControls() {
    const sig = { signal: this._ac.signal };
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn, sig);

    // Pet switcher
    const petBtn = document.getElementById('btn-open-pet-switcher');
    const switcher = document.getElementById('robot-switcher-strip');
    on('btn-open-pet-switcher', (e) => {
      e.stopPropagation();
      if (!switcher) return;
      const open = switcher.classList.contains('hidden');
      switcher.classList.toggle('hidden', !open);
      petBtn?.classList.toggle('open', open);
    });
    on('btn-close-switcher', (e) => {
      e.stopPropagation();
      switcher?.classList.add('hidden');
      petBtn?.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (switcher && !switcher.classList.contains('hidden') && !switcher.contains(e.target) && !petBtn?.contains(e.target)) {
        switcher.classList.add('hidden');
        petBtn?.classList.remove('open');
      }
    }, sig);

    const cards = document.querySelectorAll('.robo-switch-card');
    for (let i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', () => {
        const botName = cards[i].dataset.robot;
        if (botName) {
          this._emitAction('switchRobot', { name: botName });
          switcher?.classList.add('hidden');
          petBtn?.classList.remove('open');
        }
      }, sig);
    }

    // Time, weather & vision
    for (let i = 0; i < TIME_ORDER.length; i++) {
      const t = TIME_ORDER[i];
      on(`btn-time-${t}`, () => this._emitAction('setTimeOfDay', { timeOfDay: t }));
    }
    on('btn-cycle-weather', () => {
      const cur = this.appState?.weatherMode || 'CLEAR';
      const next = WEATHER_MODES[(WEATHER_MODES.indexOf(cur) + 1) % WEATHER_MODES.length];
      this._emitAction('setWeatherMode', { mode: next });
    });
    on('btn-cycle-vision', () => {
      const cur = this.appState?.visionMode || '';
      const next = VISION_MODES[(VISION_MODES.indexOf(cur) + 1) % VISION_MODES.length];
      this._emitAction('setVisionMode', { mode: next });
    });

    // Telemetry Widget toggle
    on('cyber-perf-pill', () => {
      this._telemetryOpen = !this._telemetryOpen;
      this.el.telemetryWidget?.classList.toggle('collapsed', !this._telemetryOpen);
      this._pulseHaptic(10);
    });
    on('btn-close-telemetry-widget', () => {
      this._telemetryOpen = false;
      this.el.telemetryWidget?.classList.add('collapsed');
    });

    // Main-bus action bindings
    const busActions = {
      'btn-throw-fetch': 'throwBall',
      'quick-bar-fetch': 'throwBall',
      'btn-spawn-snack': 'spawnSnack',
      'quick-bar-snack': 'spawnSnack',
      'btn-praise-dog': 'praise',
      'btn-pet-robot': 'pet',
      'quick-bar-pet': 'pet',
      'btn-trigger-disco': 'disco'
    };
    const busKeys = Object.keys(busActions);
    for (let i = 0; i < busKeys.length; i++) {
      const id = busKeys[i];
      const act = busActions[id];
      on(id, () => this._emitAction(act));
    }

    // Brain cognitive/pack actions
    const brainActions = {
      'btn-call-pack': 'call_pack',
      'btn-drink-water': 'go_fountain',
      'btn-slalom-rings': 'slalom_rings',
      'btn-lake-swim': 'lake_swim',
      'btn-dig-treasure': 'dig_treasure',
      'btn-speed-race': 'speed_race'
    };
    const brainKeys = Object.keys(brainActions);
    for (let i = 0; i < brainKeys.length; i++) {
      const id = brainKeys[i];
      const act = brainActions[id];
      on(id, () => {
        this._pulseHaptic(15);
        this.brain?.executeAction?.(act);
      });
    }
    on('btn-manual-think', () => {
      this._pulseHaptic(12);
      this.brain?.triggerFreeWillThought?.();
    });

    // Hand tool, Free Will, Audio Mute & Touch Controls toggles
    const syncHandUI = () => {
      const active = !!this.appState?.isHandToolActive;
      document.getElementById('btn-hand-tool')?.classList.toggle('active', active);
      document.getElementById('pill-toggle-hand')?.classList.toggle('active', active);
      document.getElementById('quick-bar-hand')?.classList.toggle('active', active);
      document.body.classList.toggle('hand-tool-active', active);
    };
    const toggleHand = () => {
      this._emitAction('toggleHandTool');
      syncHandUI();
    };
    on('btn-hand-tool', toggleHand);
    on('pill-toggle-hand', toggleHand);
    on('quick-bar-hand', toggleHand);

    on('btn-toggle-freewill', () => {
      this._emitAction('toggleFreeWill');
      const active = !!this.appState?.isFreeWill;
      const btn = document.getElementById('btn-toggle-freewill');
      if (btn) {
        btn.classList.toggle('active', active);
        btn.textContent = active ? '🐾 Modo Libre: ON' : '🐾 Modo Libre: OFF';
      }
      this.showToast(active ? '🐾 Modo Libre Activado' : '🎮 Control Manual');
    });

    on('btn-toggle-sfx', () => {
      this._pulseHaptic(10);
      const nextMuted = !(this.appState?.isMuted ?? false);
      if (this.appState) this.appState.isMuted = nextMuted;
      roboAudio?.setMuted?.(nextMuted);
      const btn = document.getElementById('btn-toggle-sfx');
      if (btn) btn.textContent = nextMuted ? '🔇' : '🔊';
      this.showToast(nextMuted ? '🔇 Audio silenciado' : '🔊 Audio activado');
    });

    on('btn-toggle-touch', () => {
      this._pulseHaptic(10);
      const overlay = document.getElementById('virtual-touch-controls');
      if (!overlay) return;
      const nextVis = overlay.classList.contains('hidden');
      overlay.classList.toggle('hidden', !nextVis);
      if (this.appState) this.appState.isTouchVisible = nextVis;
      this.showToast(nextVis ? '📱 Joystick táctil visible' : '📱 Joystick oculto');
    });

    // Animations & Emotions
    const animList = [
      'walk', 'run', 'sit', 'lieDown', 'jump', 'wagTail', 'bark', 'sniff', 'scratch',
      'backflip', 'spin', 'roll', 'wave', 'recharge', 'dig', 'howl', 'dance', 'sneak',
      'playBow', 'headTilt', 'bellyRub', 'beg', 'shakeOff', 'nuzzle'
    ];
    for (let i = 0; i < animList.length; i++) {
      const anim = animList[i];
      on(`btn-anim-${anim}`, () => {
        if (anim === 'jump') this._emitAction('jump');
        else this._emitAction('playAnim', { anim, duration: 2.5 });
      });
    }

    const emoKeys = Object.keys(EMOTIONS);
    for (let i = 0; i < emoKeys.length; i++) {
      const key = emoKeys[i];
      on(`btn-emo-${key.toLowerCase()}`, () => this._emitAction('setEmotion', { emotionKey: key }));
    }

    // Camera mode cycling & buttons
    on('btn-cam-cycle', () => this._emitAction('cycleCamera'));
    on('quick-bar-cam', () => this._emitAction('cycleCamera'));
    for (let i = 0; i < CAM_CYCLE_ORDER.length; i++) {
      const mode = CAM_CYCLE_ORDER[i];
      on(`btn-cam-${mode}`, () => this._emitAction('setCamera', { mode }));
    }

    // Bottom dock tabs & collapse
    const updateDockUI = () => {
      if (!this.el.bottomDock) return;
      const isCollapsed = this.el.bottomDock.classList.contains('collapsed');
      if (this.el.dockToggleIcon) this.el.dockToggleIcon.textContent = isCollapsed ? '▲' : '▼';
      this.el.quickBar?.classList.toggle('hidden-by-dock', !isCollapsed);
    };

    const dockTabs = document.querySelectorAll('.dock-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');
    for (let i = 0; i < dockTabs.length; i++) {
      const tabBtn = dockTabs[i];
      tabBtn.addEventListener('click', () => {
        const target = tabBtn.dataset.tab;
        if (!target) return;
        for (let j = 0; j < dockTabs.length; j++) dockTabs[j].classList.toggle('active', dockTabs[j] === tabBtn);
        for (let j = 0; j < tabPanes.length; j++) tabPanes[j].classList.toggle('active', tabPanes[j].id === `tab-pane-${target}`);
        this.el.bottomDock?.classList.remove('collapsed');
        updateDockUI();
      }, sig);
    }

    on('btn-toggle-bottom-dock', () => {
      this.el.bottomDock?.classList.toggle('collapsed');
      updateDockUI();
    });
    on('btn-close-bottom-dock', () => {
      this.el.bottomDock?.classList.add('collapsed');
      updateDockUI();
    });
    on('quick-bar-more', () => {
      this.el.bottomDock?.classList.toggle('collapsed');
      updateDockUI();
    });

    const openChatTab = () => {
      document.querySelector('.dock-tab[data-tab="chat"]')?.click();
      this._setTimeout(() => this.el.chatInput?.focus(), 180);
    };
    on('quick-bar-chat', openChatTab);
    on('btn-toggle-chat', () => {
      if (!this.el.bottomDock || this.el.bottomDock.classList.contains('collapsed')) {
        openChatTab();
      } else {
        this.el.bottomDock.classList.add('collapsed');
        updateDockUI();
      }
    });

    // Side panel toggles & minimizes
    const wirePill = (pillId, panel) => {
      const pill = document.getElementById(pillId);
      if (!pill || !panel) return;
      pill.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        pill.classList.toggle('active', !panel.classList.contains('hidden'));
      }, sig);
    };
    wirePill('pill-toggle-minimap', this.el.minimapPanel);
    wirePill('pill-toggle-pip', this.el.pipPanel);
    wirePill('pill-toggle-users', this.el.usersPanel);

    const setupMinimize = (btnId, panelId) => {
      const btn = document.getElementById(btnId);
      const panel = document.getElementById(panelId);
      if (!btn || !panel) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('minimized');
        btn.textContent = panel.classList.contains('minimized') ? '▢' : '—';
      }, sig);
    };
    setupMinimize('btn-min-upperleft', 'thought-panel');
    setupMinimize('btn-min-ticker', 'ticker-panel');
    setupMinimize('btn-min-minimap', 'minimap-panel');
    setupMinimize('btn-min-pip', 'pip-panel');

    on('btn-close-minimap', (e) => {
      e.stopPropagation();
      this.el.minimapPanel?.classList.add('hidden');
      document.getElementById('pill-toggle-minimap')?.classList.remove('active');
    });
    on('btn-close-pip', (e) => {
      e.stopPropagation();
      this.el.pipPanel?.classList.add('hidden');
      document.getElementById('pill-toggle-pip')?.classList.remove('active');
    });

    // Zen & Fullscreen
    on('btn-toggle-zen', () => this._emitAction('toggleZen'));
    on('btn-exit-zen', () => this._emitAction('toggleZen'));

    const toggleFullscreen = () => {
      const docEl = document.documentElement;
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFs) {
        (docEl.requestFullscreen || docEl.webkitRequestFullscreen)?.call(docEl)?.catch?.(() => {});
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
      }
    };
    on('btn-toggle-fullscreen', toggleFullscreen);

    // Chat & Dog filter
    const filterPills = document.querySelectorAll('.chat-dog-pill');
    for (let i = 0; i < filterPills.length; i++) {
      const pill = filterPills[i];
      pill.addEventListener('click', () => {
        for (let j = 0; j < filterPills.length; j++) filterPills[j].classList.remove('active');
        pill.classList.add('active');
        this._chatFilterDog = pill.getAttribute('data-dog') || 'ALL';
        this._renderChatFeed();
      }, sig);
    }

    const sendChat = () => {
      if (!this.el.chatInput) return;
      const text = this.el.chatInput.value.trim();
      if (!text) return;
      this.el.chatInput.value = '';
      this._pulseHaptic(12);

      const targetDog = (this._chatFilterDog && this._chatFilterDog !== 'ALL')
        ? this._chatFilterDog
        : (this.appState?.activeRobotName || 'Sparky');

      if (targetDog !== this.appState?.activeRobotName) {
        this._emitAction('switchRobot', { name: targetDog });
      }

      const userName = this.appState?.net?.user?.username || 'Tú';
      const msgEntry = {
        author: userName,
        message: text,
        role: 'user',
        targetDog,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      this.eventBus?.emit('chat:message', msgEntry);
      this.multiplayer?.sendChat?.(text, targetDog);
      this.brain?.handleUserCommand?.(text, targetDog);
    };
    on('chat-btn', sendChat);
    this.el.chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    }, sig);
    on('btn-clear-chat-log', () => {
      this._allChatHistory = [];
      if (this.el.chatFeed) {
        this.el.chatFeed.innerHTML = '<div class="chat-bubble chat-system"><span class="chat-author">🤖 Sistema:</span> Historial reiniciado.</div>';
      }
    });
    on('btn-toggle-voice', () => {
      const btn = document.getElementById('btn-toggle-voice');
      const next = !(this.appState?.isVoiceEnabled ?? true);
      if (this.appState) this.appState.isVoiceEnabled = next;
      if (this.brain) this.brain.isVoiceEnabled = next;
      if (btn) {
        btn.classList.toggle('active', next);
        btn.textContent = next ? '🔊 Voz: ON' : '🔇 Voz: OFF';
      }
    });
  }

  _bindModalsAndExtras() {
    const sig = { signal: this._ac.signal };
    const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn, sig);

    // Game Menu Modal
    const gameMenu = document.getElementById('modal-game-menu');
    on('btn-open-game-menu', () => {
      if (!gameMenu) return;
      gameMenu.classList.remove('hidden');
      const mc = document.getElementById('mobile-menu-users-count');
      if (mc && this.el.usersCount) mc.textContent = this.el.usersCount.textContent;
      const mn = document.getElementById('mobile-menu-user-name');
      if (mn && this.el.headerUserName) mn.textContent = this.el.headerUserName.textContent;
    });
    on('btn-close-game-menu', () => gameMenu?.classList.add('hidden'));

    const closeMenuThen = (fn) => {
      gameMenu?.classList.add('hidden');
      fn();
    };
    on('menu-btn-fullscreen', () => closeMenuThen(() => document.getElementById('btn-toggle-fullscreen')?.click()));
    on('menu-btn-time', () => closeMenuThen(() => {
      const cur = this.appState?.timeOfDay || 'day';
      const next = TIME_ORDER[(TIME_ORDER.indexOf(cur) + 1) % TIME_ORDER.length];
      this._emitAction('setTimeOfDay', { timeOfDay: next });
    }));
    on('menu-btn-weather', () => closeMenuThen(() => document.getElementById('btn-cycle-weather')?.click()));
    on('menu-btn-vision', () => closeMenuThen(() => document.getElementById('btn-cycle-vision')?.click()));
    on('menu-btn-radar', () => closeMenuThen(() => document.getElementById('pill-toggle-minimap')?.click()));
    on('menu-btn-pip', () => closeMenuThen(() => document.getElementById('pill-toggle-pip')?.click()));
    on('menu-btn-telemetry', () => closeMenuThen(() => {
      this._telemetryOpen = true;
      this.el.telemetryWidget?.classList.remove('collapsed');
    }));
    on('menu-btn-profile', () => closeMenuThen(() => document.getElementById('modal-login')?.classList.remove('hidden')));
    on('menu-btn-share', () => closeMenuThen(() => document.getElementById('btn-open-share')?.click()));
    on('menu-btn-zen', () => closeMenuThen(() => this._emitAction('toggleZen')));
    on('menu-btn-touch', () => closeMenuThen(() => document.getElementById('btn-toggle-touch')?.click()));
    on('menu-btn-memory', () => closeMenuThen(() => document.getElementById('btn-open-memory')?.click()));
    on('menu-btn-settings', () => closeMenuThen(() => document.getElementById('btn-open-settings')?.click()));
    on('menu-btn-users', () => closeMenuThen(() => document.getElementById('pill-toggle-users')?.click()));

    // FreeLLMAPI Settings Modal
    const epInput = document.getElementById('cfg-endpoint');
    const keyInput = document.getElementById('cfg-apikey');
    const modelSel = document.getElementById('cfg-model-select');
    const modelCustom = document.getElementById('cfg-model-custom');
    const sysInput = document.getElementById('cfg-system-prompt');
    const intInput = document.getElementById('cfg-interval');
    const intVal = document.getElementById('cfg-interval-val');
    const autoCheck = document.getElementById('cfg-autothink');

    if (this.brain && this.brain.config) {
      if (epInput) epInput.value = this.brain.config.endpoint || '';
      if (keyInput) keyInput.value = this.brain.config.apiKey || '';
      if (sysInput) sysInput.value = this.brain.config.systemPrompt || '';
      if (intInput) {
        intInput.value = this.brain.config.intervalSeconds || 10;
        if (intVal) intVal.textContent = `${intInput.value}s`;
      }
      if (autoCheck) autoCheck.checked = !!this.brain.config.autoThink;
    }

    intInput?.addEventListener('input', (e) => {
      if (intVal) intVal.textContent = `${e.target.value}s`;
    }, sig);
    modelSel?.addEventListener('change', (e) => {
      modelCustom?.classList.toggle('hidden', e.target.value !== 'custom');
    }, sig);

    on('btn-open-settings', () => document.getElementById('modal-settings')?.classList.remove('hidden'));
    on('btn-close-settings', () => document.getElementById('modal-settings')?.classList.add('hidden'));
    on('btn-save-settings', () => {
      if (this.brain && this.brain.config) {
        this.brain.config.endpoint = epInput?.value.trim() || this.brain.config.endpoint;
        this.brain.config.apiKey = keyInput?.value.trim() || '';
        const chosen = modelSel?.value === 'custom' && modelCustom?.value.trim() ? modelCustom.value.trim() : (modelSel?.value || 'auto');
        this.brain.config.model = chosen;
        this.brain.config.systemPrompt = sysInput?.value.trim() || '';
        this.brain.config.intervalSeconds = parseInt(intInput?.value || '10', 10);
        this.brain.config.autoThink = !!autoCheck?.checked;
        this.brain.saveConfig?.();
      }
      document.getElementById('modal-settings')?.classList.add('hidden');
      this.showToast('⚙️ Configuración FreeLLMAPI guardada');
    });

    const pingRouter = async () => {
      const statusEl = document.getElementById('api-test-status');
      if (this.brain?.pingLlm) {
        await this.brain.pingLlm();
        return;
      }
      if (statusEl) statusEl.textContent = 'Probando conexión...';
      try {
        const res = await fetch('/api/llm/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: epInput?.value.trim() || 'http://127.0.0.1:31415/v1/chat/completions',
            apiKey: keyInput?.value.trim() || '',
            model: modelSel?.value || 'auto',
            messages: [{ role: 'user', content: 'Responde OK' }],
            max_tokens: 12
          })
        });
        const data = await res.json();
        if (res.ok && data.choices?.length) {
          if (statusEl) statusEl.textContent = `✅ Conectado (${data.model || 'auto'})`;
          this.showToast('✅ Router FreeLLMAPI operativo');
        } else if (statusEl) {
          statusEl.textContent = `❌ ${data.error?.message || data.error || 'Error de conexión'}`;
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `❌ ${err.message}`;
      }
    };
    on('btn-test-connection', pingRouter);
    on('btn-ping-llm-now', pingRouter);

    // Memory Modal
    on('btn-open-memory', () => {
      this.brain?.loadMemoryFromDisk?.();
      const memPre = document.getElementById('memory-display');
      if (memPre && this.brain?.memoryData) {
        memPre.textContent = JSON.stringify(this.brain.memoryData, null, 2);
      }
      document.getElementById('modal-memory')?.classList.remove('hidden');
    });
    on('btn-close-memory', () => document.getElementById('modal-memory')?.classList.add('hidden'));
    on('btn-download-memory', () => {
      if (!this.brain?.memoryData) return;
      const blob = new Blob([JSON.stringify(this.brain.memoryData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.appState?.activeRobotName || 'RoboChibi'}_Memory.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Share Modal (tracked poller)
    let sharePollerId = null;
    const shareModal = document.getElementById('modal-share');
    const closeShare = () => {
      shareModal?.classList.add('hidden');
      if (sharePollerId !== null) {
        this._clearTimer(sharePollerId);
        sharePollerId = null;
      }
    };
    const openShare = async () => {
      shareModal?.classList.remove('hidden');
      const fetchNet = async () => {
        try {
          const res = await fetch('/api/network-info');
          if (!res.ok) return false;
          const data = await res.json();
          const tun = document.getElementById('share-tunnel-url');
          const lan = document.getElementById('share-lan-url');
          if (tun && data.tunnelUrl) tun.value = data.tunnelUrl;
          if (lan && data.lanUrl) lan.value = data.lanUrl;
          return Boolean(data.tunnelUrl && !data.tunnelUrl.includes('Generando'));
        } catch {
          return true;
        }
      };
      const done = await fetchNet();
      if (!done && sharePollerId === null) {
        let tries = 0;
        sharePollerId = this._setInterval(async () => {
          tries++;
          if ((await fetchNet()) || tries >= 6) {
            this._clearTimer(sharePollerId);
            sharePollerId = null;
          }
        }, 2000);
      }
    };
    on('btn-open-share', openShare);
    on('btn-share-server', openShare);
    on('btn-close-share', closeShare);
    on('btn-close-share-bottom', closeShare);

    const copyBtns = document.querySelectorAll('.copy-btn');
    for (let i = 0; i < copyBtns.length; i++) {
      copyBtns[i].addEventListener('click', () => {
        const input = document.getElementById(copyBtns[i].getAttribute('data-target'));
        if (!input || !navigator.clipboard) return;
        navigator.clipboard.writeText(input.value).then(() => this.showToast('📋 Enlace copiado'));
      }, sig);
    }

    // Login Modal
    const loginModal = document.getElementById('modal-login');
    const userInput = document.getElementById('login-username-input');
    const avatarOpts = document.querySelectorAll('.avatar-opt');
    let selectedAvatar = this.appState?.net?.user?.avatar || '🐾';
    for (let i = 0; i < avatarOpts.length; i++) {
      avatarOpts[i].addEventListener('click', () => {
        for (let j = 0; j < avatarOpts.length; j++) avatarOpts[j].classList.remove('active');
        avatarOpts[i].classList.add('active');
        selectedAvatar = avatarOpts[i].getAttribute('data-avatar') || '🐾';
      }, sig);
    }
    const submitLogin = () => {
      const username = userInput?.value.trim() || `Explorador_${Math.floor(100 + Math.random() * 900)}`;
      const user = { username, avatar: selectedAvatar };
      try { localStorage.setItem('robochibi_user', JSON.stringify(user)); } catch {}
      loginModal?.classList.add('hidden');
      this._applyUserLogin(user);
      this.showToast(`🎉 ¡Bienvenido, ${username}!`);
    };
    on('btn-login-submit', submitLogin);
    on('user-profile-badge', () => {
      if (userInput && this.appState?.net?.user?.username) userInput.value = this.appState.net.user.username;
      loginModal?.classList.remove('hidden');
    });
    userInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitLogin();
    }, sig);

    // Web Speech Recognition (STT)
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('btn-voice-stt');
    const quickMic = document.getElementById('pill-quick-mic');
    if (SpeechRec) {
      const rec = new SpeechRec();
      rec.lang = 'es-ES';
      rec.interimResults = true;
      rec.continuous = false;
      let recording = false;
      const toggleStt = () => {
        if (recording) rec.stop();
        else {
          try {
            rec.start();
            recording = true;
            micBtn?.classList.add('recording');
            this.showToast('🎙️ Escuchando orden...');
          } catch {}
        }
      };
      rec.onresult = (ev) => {
        let txt = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        if (this.el.chatInput) this.el.chatInput.value = txt;
        if (ev.results[0]?.isFinal) {
          this._setTimeout(() => document.getElementById('chat-btn')?.click(), 160);
        }
      };
      rec.onend = () => {
        recording = false;
        micBtn?.classList.remove('recording');
      };
      micBtn?.addEventListener('click', toggleStt, sig);
      quickMic?.addEventListener('click', toggleStt, sig);
    }

    // Macro Sequencer
    const macroAddBtns = document.querySelectorAll('[data-macro-add]');
    for (let i = 0; i < macroAddBtns.length; i++) {
      macroAddBtns[i].addEventListener('click', () => {
        const id = macroAddBtns[i].getAttribute('data-macro-add');
        this._macroQueue.push({ id, label: macroAddBtns[i].textContent.replace('+ ', '') });
        this._renderMacroTimeline(-1);
      }, sig);
    }
    on('btn-macro-play', () => this._runMacroSequence());
    on('btn-macro-loop', () => {
      this._macroLoop = !this._macroLoop;
      const b = document.getElementById('btn-macro-loop');
      if (b) b.textContent = `🔁 Bucle: ${this._macroLoop ? 'ON' : 'OFF'}`;
    });
    on('btn-macro-clear', () => {
      this._macroRunning = false;
      this._macroQueue.length = 0;
      this._renderMacroTimeline(-1);
    });

    const loadPreset = (steps, name) => {
      this._macroRunning = false;
      this._macroQueue = steps;
      this._renderMacroTimeline(-1);
      this.showToast(`⚡ Protocolo: ${name}`);
      this._runMacroSequence();
    };
    on('preset-macro-show', () => loadPreset([
      { id: 'btn-call-pack', label: '📣 Manada' },
      { id: 'btn-anim-playBow', label: '🙇 Reverencia' },
      { id: 'btn-anim-backflip', label: '🤸 Voltereta' },
      { id: 'btn-anim-dance', label: '🪩 Bailar' }
    ], 'Show Acrobático'));
    on('preset-macro-guard', () => loadPreset([
      { id: 'btn-emo-alert', label: '⚠️ Alerta' },
      { id: 'btn-anim-sniff', label: '🔍 Olfatear' },
      { id: 'btn-anim-sneak', label: '🕵️ Sigilo' },
      { id: 'btn-anim-bark', label: '🗣️ Ladrar' }
    ], 'Patrulla Táctica'));
    on('preset-macro-fiesta', () => loadPreset([
      { id: 'btn-trigger-disco', label: '🪩 Disco' },
      { id: 'btn-emo-party', label: '🎉 Fiestero' },
      { id: 'btn-anim-dance', label: '🕺 Bailar' },
      { id: 'btn-anim-howl', label: '🐺 Aullar' }
    ], 'Fiesta Total'));
    on('preset-macro-training', () => loadPreset([
      { id: 'btn-slalom-rings', label: '⭕ Aros' },
      { id: 'btn-anim-jump', label: '🦘 Saltar' },
      { id: 'btn-throw-fetch', label: '🎾 Pelota' },
      { id: 'btn-praise-dog', label: '❤️ Elogiar' }
    ], 'Entrenamiento'));

    // Command Palette (Ctrl+K)
    const cmdModal = document.getElementById('modal-cmd-palette');
    const cmdInput = document.getElementById('cmd-palette-input');
    const cmdResults = document.getElementById('cmd-palette-results');
    const catalog = [
      { name: '🐾 Poseer a Sparky', tag: 'Robot', run: () => this._emitAction('switchRobot', { name: 'Sparky' }) },
      { name: '⚡ Poseer a Bolt', tag: 'Robot', run: () => this._emitAction('switchRobot', { name: 'Bolt' }) },
      { name: '🔍 Poseer a Pixel', tag: 'Robot', run: () => this._emitAction('switchRobot', { name: 'Pixel' }) },
      { name: '💖 Poseer a Luna', tag: 'Robot', run: () => this._emitAction('switchRobot', { name: 'Luna' }) },
      { name: '🤸 Poseer a Rusty', tag: 'Robot', run: () => this._emitAction('switchRobot', { name: 'Rusty' }) },
      { name: '🎾 Lanzar Pelota', tag: 'G', run: () => this._emitAction('throwBall') },
      { name: '🪩 Activar Fiesta Disco', tag: 'Evento', run: () => this._emitAction('disco') },
      { name: '🤸 Hacer Voltereta', tag: 'F', run: () => this._emitAction('playAnim', { anim: 'backflip', duration: 1.6 }) },
      { name: '🌦️ Cambiar Clima', tag: 'Clima', run: () => document.getElementById('btn-cycle-weather')?.click() },
      { name: '🕶️ Cambiar Óptica', tag: 'FX', run: () => document.getElementById('btn-cycle-vision')?.click() },
      { name: '📊 Abrir Telemetría GPU', tag: 'GPU', run: () => document.getElementById('cyber-perf-pill')?.click() }
    ];
    const renderCmd = (q = '') => {
      if (!cmdResults) return;
      cmdResults.innerHTML = '';
      const lower = q.toLowerCase().trim();
      for (let i = 0; i < catalog.length; i++) {
        const c = catalog[i];
        if (lower && !c.name.toLowerCase().includes(lower) && !c.tag.toLowerCase().includes(lower)) continue;
        const item = document.createElement('div');
        item.className = 'cmd-result-item';
        item.innerHTML = `<span>${c.name}</span><span class="cmd-shortcut-kbd">${c.tag}</span>`;
        item.addEventListener('click', () => {
          c.run();
          cmdModal?.classList.add('hidden');
        });
        cmdResults.appendChild(item);
      }
    };
    on('btn-open-cmd-palette', () => {
      cmdModal?.classList.remove('hidden');
      if (cmdInput) { cmdInput.value = ''; renderCmd(''); cmdInput.focus(); }
    });
    on('btn-close-cmd-palette', () => cmdModal?.classList.add('hidden'));
    cmdInput?.addEventListener('input', () => renderCmd(cmdInput.value), sig);
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (cmdModal?.classList.contains('hidden')) {
          cmdModal.classList.remove('hidden');
          if (cmdInput) { cmdInput.value = ''; renderCmd(''); cmdInput.focus(); }
        } else {
          cmdModal?.classList.add('hidden');
        }
      }
    }, sig);
  }

  _renderMacroTimeline(activeIdx) {
    const el = document.getElementById('macro-timeline');
    if (!el) return;
    el.innerHTML = '';
    if (this._macroQueue.length === 0) {
      el.innerHTML = '<small style="color:#64748b;">Cola vacía...</small>';
      return;
    }
    for (let i = 0; i < this._macroQueue.length; i++) {
      const chip = document.createElement('span');
      chip.className = 'macro-step-chip' + (i === activeIdx ? ' active-step' : '');
      chip.textContent = `${i + 1}. ${this._macroQueue[i].label}`;
      chip.addEventListener('click', () => {
        if (!this._macroRunning) {
          this._macroQueue.splice(i, 1);
          this._renderMacroTimeline(-1);
        }
      });
      el.appendChild(chip);
    }
  }

  _runMacroSequence() {
    if (this._macroRunning || this._macroQueue.length === 0) return;
    this._macroRunning = true;
    const badge = document.getElementById('macro-status-badge');
    if (badge) badge.textContent = 'EJECUTANDO';

    let step = 0;
    const tick = () => {
      if (!this._macroRunning) {
        this._renderMacroTimeline(-1);
        if (badge) badge.textContent = 'LISTO';
        return;
      }
      if (step >= this._macroQueue.length) {
        if (this._macroLoop) step = 0;
        else {
          this._macroRunning = false;
          this._renderMacroTimeline(-1);
          if (badge) badge.textContent = 'LISTO';
          return;
        }
      }
      this._renderMacroTimeline(step);
      document.getElementById(this._macroQueue[step].id)?.click();
      step++;
      this._setTimeout(tick, 1750);
    };
    tick();
  }

  _bindEventBus() {
    if (!this.eventBus) return;
    const sub = (ev, fn) => this._unsubs.push(this.eventBus.on(ev, fn));

    sub('robot:switched', ({ robot, name }) => {
      if (this.el.robotName) this.el.robotName.textContent = name || robot?.name || 'Sparky';
      if (this.el.robotTitle && robot?.profile) this.el.robotTitle.textContent = robot.profile.title;
      if (this.el.headerAvatar && robot?.profile) this.el.headerAvatar.textContent = robot.profile.avatarIcon || '🐾';

      const cards = document.querySelectorAll('.robo-switch-card');
      for (let i = 0; i < cards.length; i++) {
        cards[i].classList.toggle('active', cards[i].dataset.robot === (name || robot?.name));
      }
      this._lastStats.nrg = -1;
      this._targetWaypoint = null;
      this._pulseHaptic(15);
    });

    sub('robot:stats', (s) => {
      if (!s) return;
      const nrg = Math.round(s.energy ?? 100);
      const cur = Math.round(s.curiosity ?? 85);
      const aff = Math.round(s.affection ?? 88);
      const hyd = Math.round(s.hydration ?? 90);

      if (nrg !== this._lastStats.nrg) {
        this._lastStats.nrg = nrg;
        if (this.el.statEnergy) this.el.statEnergy.textContent = `${nrg}%`;
        if (this.el.barEnergy) this.el.barEnergy.style.transform = `scaleX(${Math.max(0, Math.min(1, nrg / 100))})`;
      }
      if (cur !== this._lastStats.cur) {
        this._lastStats.cur = cur;
        if (this.el.statCuriosity) this.el.statCuriosity.textContent = `${cur}%`;
        if (this.el.barCuriosity) this.el.barCuriosity.style.transform = `scaleX(${Math.max(0, Math.min(1, cur / 100))})`;
      }
      if (aff !== this._lastStats.aff) {
        this._lastStats.aff = aff;
        if (this.el.statAffection) this.el.statAffection.textContent = `${aff}%`;
        if (this.el.barAffection) this.el.barAffection.style.transform = `scaleX(${Math.max(0, Math.min(1, aff / 100))})`;
      }
      if (hyd !== this._lastStats.hyd) {
        this._lastStats.hyd = hyd;
        if (this.el.statHydration) this.el.statHydration.textContent = `${hyd}%`;
        if (this.el.barHydration) this.el.barHydration.style.transform = `scaleX(${Math.max(0, Math.min(1, hyd / 100))})`;
      }
      if (s.location && s.location !== this._lastStats.loc) {
        this._lastStats.loc = s.location;
        if (this.el.statLocation) this.el.statLocation.textContent = s.location;
      }
      const emoKey = s.emotion ? `${s.emotion.icon || ''}${s.emotion.name || s.emotion}` : '';
      if (emoKey && emoKey !== this._lastStats.emo && this.el.statEmotion) {
        this._lastStats.emo = emoKey;
        this.el.statEmotion.textContent = `${s.emotion.icon || ''} ${s.emotion.name || s.emotion}`.trim();
        if (s.emotion.cssColor) this.el.statEmotion.style.color = s.emotion.cssColor;
      }
    });

    sub('robot:thought', ({ thought }) => {
      if (this.el.thoughtText && thought) this.el.thoughtText.textContent = thought;
      if (this.el.speechBubble && thought) {
        this.el.speechBubble.textContent = thought;
        this.el.speechBubble.classList.remove('hidden');
        this._bubbleVisible = true;
        if (this._speechHideTimer !== null) this._clearTimer(this._speechHideTimer);
        this._speechHideTimer = this._setTimeout(() => {
          this.el.speechBubble?.classList.add('hidden');
          this._bubbleVisible = false;
          this._speechHideTimer = null;
        }, 4200);
      }
    });

    sub('camera:modeChanged', ({ mode, label }) => {
      if (this.el.camCurrentName) this.el.camCurrentName.textContent = label || CAM_LABELS[mode] || mode;
      for (let i = 0; i < CAM_CYCLE_ORDER.length; i++) {
        const m = CAM_CYCLE_ORDER[i];
        document.getElementById(`btn-cam-${m}`)?.classList.toggle('active', m === mode);
      }
    });

    sub('world:timeChanged', ({ timeOfDay }) => {
      for (let i = 0; i < TIME_ORDER.length; i++) {
        const t = TIME_ORDER[i];
        document.getElementById(`btn-time-${t}`)?.classList.toggle('active', t === timeOfDay);
      }
    });

    sub('world:weatherChanged', ({ mode }) => {
      if (WEATHER_LABELS[mode]) this.showToast(WEATHER_LABELS[mode]);
    });

    sub('world:visionChanged', ({ mode }) => {
      for (let i = 0; i < VISION_MODES.length; i++) {
        if (VISION_MODES[i]) document.body.classList.remove(VISION_MODES[i]);
      }
      if (mode) document.body.classList.add(mode);
      const idx = Math.max(0, VISION_MODES.indexOf(mode || ''));
      this.showToast(VISION_LABELS[idx]);
    });

    sub('world:scoreGoal', ({ score }) => {
      if (this.el.soccerScore) this.el.soccerScore.textContent = score;
      this._pulseHaptic([15, 30, 20]);
    });

    sub('world:scoreTarget', ({ score }) => {
      if (this.el.targetScore) this.el.targetScore.textContent = score;
      this._pulseHaptic([12, 20, 15]);
    });

    sub('world:activity', ({ text }) => this._pushActivity(text));

    sub('chat:message', (entry) => {
      this._allChatHistory.push(entry);
      if (this._allChatHistory.length > 80) this._allChatHistory.shift();
      this._renderChatFeed();
    });

    sub('telemetry:llm', ({ latencyMs, model, ok, preview, totalCalls }) => {
      const pingText = ok ? `${latencyMs}ms` : 'OFFLINE';
      if (this.el.hudAiPing) this.el.hudAiPing.textContent = `IA: ${pingText}`;
      if (this.el.tValPing) this.el.tValPing.textContent = ok ? `${latencyMs} ms` : 'ERR';
      if (this.el.twPing) this.el.twPing.textContent = ok ? `${latencyMs}` : 'ERR';
      if (this.el.tValApiCalls && totalCalls !== undefined) this.el.tValApiCalls.textContent = totalCalls;
      if (this.el.llmLog && preview) {
        this.el.llmLog.textContent = `[${model || 'auto'} | ${pingText}]\n${preview}`;
      }
    });

    sub('ui:toast', ({ message, durationMs }) => this.showToast(message, durationMs));
    sub('haptic:pulse', ({ pattern }) => this._pulseHaptic(pattern));

    sub('net:status', ({ connected, users }) => {
      const dot = document.querySelector('.online-green-dot');
      if (dot) dot.style.backgroundColor = connected ? '#22c55e' : '#ef4444';
      if (!Array.isArray(users)) return;
      if (this.el.usersCount) this.el.usersCount.textContent = users.length;
      if (this.el.usersList) {
        this.el.usersList.innerHTML = users.map((u) => {
          const isMe = this.appState?.net?.user && u.username === this.appState.net.user.username;
          return `<div class="user-pill-item ${isMe ? 'current-user' : ''}"><span class="user-pill-avatar">${u.avatar || '🐾'}</span><span class="user-pill-name">${u.username}</span>${isMe ? '<span class="user-pill-tag">Tú</span>' : ''}</div>`;
        }).join('');
      }
    });
  }

  _pushActivity(text) {
    if (!this.el.activityList || !text) return;
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.textContent = text;
    this.el.activityList.prepend(item);
    while (this.el.activityList.children.length > 5) {
      this.el.activityList.removeChild(this.el.activityList.lastChild);
    }
  }

  _renderChatFeed() {
    if (!this.el.chatFeed) return;
    this.el.chatFeed.innerHTML = '';
    const filter = this._chatFilterDog;
    for (let i = 0; i < this._allChatHistory.length; i++) {
      const e = this._allChatHistory[i];
      if (filter !== 'ALL' && e.role !== 'system' && e.author !== filter && e.targetDog !== filter) continue;
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble chat-${e.role}`;
      const icon = e.role === 'user' ? '👤' : (e.role === 'system' ? '🤖' : '🐾');
      bubble.innerHTML = `<span class="chat-author">${icon} ${e.author}:</span> ${e.message}`;
      this.el.chatFeed.appendChild(bubble);
    }
    this.el.chatFeed.scrollTop = this.el.chatFeed.scrollHeight;
  }

  updateTelemetry(data) {
    if (!data) return;
    const now = performance.now();
    if (now - this._lastTelemetryMs < 80) return;
    this._lastTelemetryMs = now;

    const fps = Math.round(data.fps ?? 60);
    const frameMs = (data.frameMs ?? 16.6).toFixed(1);
    const calls = data.drawCalls ?? 0;
    const tris = data.triangles ?? 0;
    const geos = data.geometries ?? 0;
    const texs = data.textures ?? 0;
    const heapMB = data.heapMB ? `${data.heapMB}` : '--';

    this._fpsHistory[this._fpsHead] = fps;
    this._fpsHead = (this._fpsHead + 1) % this._fpsHistory.length;

    if (this.el.hudFps) this.el.hudFps.textContent = `${fps} FPS`;
    if (this.el.hudCalls) this.el.hudCalls.textContent = `${calls} DC`;

    const isCrit = calls > 45 || fps < 35;
    const isWarn = !isCrit && (calls > 38 || fps < 52);
    if (this.el.perfDot) {
      this.el.perfDot.classList.toggle('crit', isCrit);
      this.el.perfDot.classList.toggle('warn', isWarn);
    }
    if (this.el.telemetryBudgetBadge) {
      this.el.telemetryBudgetBadge.textContent = `${calls}/45 DC`;
      this.el.telemetryBudgetBadge.classList.toggle('crit', isCrit);
      this.el.telemetryBudgetBadge.classList.toggle('warn', isWarn);
    }

    if (this._telemetryOpen) {
      if (this.el.twFps) this.el.twFps.textContent = fps;
      if (this.el.twMs) this.el.twMs.textContent = frameMs;
      if (this.el.twCalls) this.el.twCalls.textContent = calls;
      if (this.el.twTris) this.el.twTris.textContent = tris > 999 ? `${(tris / 1000).toFixed(1)}k` : tris;
      if (this.el.twGeos) this.el.twGeos.textContent = geos;
      if (this.el.twTexs) this.el.twTexs.textContent = texs;
      if (this.el.twHeap) this.el.twHeap.textContent = heapMB;
      this._drawSparkline(this.twCtx, this.el.twChart);
    }

    if (this.el.tValFps) this.el.tValFps.textContent = fps;
    if (this.el.tValMs) this.el.tValMs.textContent = frameMs;
    if (this.el.tValCalls) this.el.tValCalls.textContent = calls;
    if (this.el.tValTris) this.el.tValTris.textContent = tris;
    if (this.el.tValGeos) this.el.tValGeos.textContent = geos;
    if (this.el.tValTexs) this.el.tValTexs.textContent = texs;
    if (this.el.tHeapLabel) this.el.tHeapLabel.textContent = `MEM: ${heapMB} MB`;

    if (this.el.bottomDock && !this.el.bottomDock.classList.contains('collapsed')) {
      this._drawSparkline(this.tCtx, this.el.tChart);
    }
  }

  _drawSparkline(ctx, canvas) {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const len = this._fpsHistory.length;
    ctx.clearRect(0, 0, w, h);

    const y60 = h - (60 / 90) * (h - 8) - 4;
    ctx.strokeStyle = 'rgba(34, 255, 136, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y60);
    ctx.lineTo(w, y60);
    ctx.stroke();

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const idx = (this._fpsHead + i) % len;
      const v = this._fpsHistory[idx];
      const x = (i / (len - 1)) * w;
      const y = h - Math.min(1, v / 90) * (h - 8) - 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  updateSpeechBubble(dog, camera) {
    const bubble = this.el.speechBubble;
    if (!bubble || !this._bubbleVisible || !dog || !dog.nodes || !dog.nodes.overheadAnchor || !camera) return;

    dog.nodes.overheadAnchor.getWorldPosition(this._speechVec);
    this._speechVec.project(camera);

    if (this._speechVec.z > 1.0) {
      if (bubble.style.opacity !== '0') bubble.style.opacity = '0';
      return;
    }
    if (bubble.style.opacity !== '1') bubble.style.opacity = '1';

    const x = Math.round((this._speechVec.x * 0.5 + 0.5) * window.innerWidth);
    const y = Math.round((-(this._speechVec.y * 0.5) + 0.5) * window.innerHeight);

    if (Math.abs(x - this._lastBubbleX) >= 1 || Math.abs(y - this._lastBubbleY) >= 1) {
      this._lastBubbleX = x;
      this._lastBubbleY = y;
      bubble.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    }
  }

  updateMinimap(playerDog, dogs) {
    if (!this.minimapCtx || !this.el.minimapCanvas || !this.el.minimapPanel) return;
    if (this.el.minimapPanel.classList.contains('hidden') || this.el.minimapPanel.classList.contains('minimized')) return;
    if (!playerDog) return;

    const now = performance.now();
    const dt = Math.min(0.1, (now - this._minimapAccum) * 0.001);
    this._minimapAccum = now;

    const ctx = this.minimapCtx;
    const w = this.el.minimapCanvas.width;
    const h = this.el.minimapCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const scale = this._minimapScale;
    const pPos = playerDog.group.position;

    this._radarAngle = (this._radarAngle + dt * 2.2) % (Math.PI * 2);
    this._pingRadius = (this._pingRadius + dt * 28) % 45;

    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 25 * scale, 0, Math.PI * 2);
    ctx.arc(cx, cy, 50 * scale, 0, Math.PI * 2);
    ctx.stroke();

    const lx = cx + (-80 - pPos.x) * scale;
    const ly = cy + (-80 - pPos.z) * scale;
    ctx.fillStyle = 'rgba(2, 132, 199, 0.55)';
    ctx.beginPath();
    ctx.arc(lx, ly, 65 * scale, 0, Math.PI * 2);
    ctx.fill();

    const px = cx + (50 - pPos.x) * scale;
    const py = cy + (40 - pPos.z) * scale;
    ctx.fillStyle = 'rgba(234, 88, 12, 0.22)';
    ctx.beginPath();
    ctx.arc(px, py, 36 * scale, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '10px sans-serif';
    for (let i = 0; i < STATIC_ATTRACTIONS.length; i++) {
      const a = STATIC_ATTRACTIONS[i];
      const ax = cx + (a[0] - pPos.x) * scale;
      const ay = cy + (a[1] - pPos.z) * scale;
      if (ax > -12 && ax < w + 12 && ay > -12 && ay < h + 12) {
        ctx.fillText(a[2], ax - 5, ay + 4);
      }
    }

    if (this.world && this.world.getMinimapSnapshot) {
      this.world.getMinimapSnapshot(this._minimapSnapshot);
      const sb = this._minimapSnapshot.soccerBallPos;
      if (sb) {
        ctx.fillText('⚽', cx + (sb.x - pPos.x) * scale - 5, cy + (sb.z - pPos.z) * scale + 4);
      }
      const balls = this._minimapSnapshot.ballPositions;
      if (balls) {
        ctx.fillStyle = '#00e5ff';
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          ctx.beginPath();
          ctx.arc(cx + (b.x - pPos.x) * scale, cy + (b.z - pPos.z) * scale, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const snacks = this._minimapSnapshot.snackPositions;
      if (snacks) {
        ctx.fillStyle = '#facc15';
        for (let i = 0; i < snacks.length; i++) {
          const s = snacks[i];
          ctx.beginPath();
          ctx.arc(cx + (s.x - pPos.x) * scale, cy + (s.z - pPos.z) * scale, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (this._targetWaypoint) {
      const wx = cx + (this._targetWaypoint.x - pPos.x) * scale;
      const wy = cy + (this._targetWaypoint.z - pPos.z) * scale;
      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(wx, wy);
      ctx.stroke();
      ctx.fillText('🎯', wx - 6, wy + 4);
    }

    if (dogs) {
      if (Array.isArray(dogs)) {
        for (let i = 0; i < dogs.length; i++) {
          this._drawBotDot(ctx, dogs[i], playerDog, pPos, cx, cy, scale);
        }
      } else {
        for (const k in dogs) {
          if (Object.prototype.hasOwnProperty.call(dogs, k)) {
            this._drawBotDot(ctx, dogs[k], playerDog, pPos, cx, cy, scale);
          }
        }
      }
    }

    ctx.strokeStyle = `rgba(34, 255, 136, ${Math.max(0, 1 - this._pingRadius / 45)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, this._pingRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(playerDog.group.rotation.y);
    ctx.fillStyle = '#22ff88';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(6, -6);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawBotDot(ctx, bot, playerDog, pPos, cx, cy, scale) {
    if (!bot || bot === playerDog) return;
    const bx = cx + (bot.group.position.x - pPos.x) * scale;
    const by = cy + (bot.group.position.z - pPos.z) * scale;
    ctx.fillStyle = bot.currentEmotion ? bot.currentEmotion.cssColor : '#00e5ff';
    ctx.beginPath();
    ctx.arc(bx, by, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  showToast(msg, durationMs = 2600) {
    if (!this.el.toastContainer || !msg) return;
    const toast = document.createElement('div');
    toast.className = 'cyber-toast';
    toast.textContent = msg;
    this.el.toastContainer.appendChild(toast);
    while (this.el.toastContainer.children.length > 4) {
      this.el.toastContainer.removeChild(this.el.toastContainer.firstChild);
    }
    this._setTimeout(() => {
      toast.style.opacity = '0';
      this._setTimeout(() => toast.remove(), 220);
    }, durationMs);
  }

  dispose() {
    this._macroRunning = false;
    this._ac.abort();
    for (let i = 0; i < this._unsubs.length; i++) {
      if (typeof this._unsubs[i] === 'function') this._unsubs[i]();
    }
    this._unsubs.length = 0;
    this._timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    this._timers.clear();
  }
}
