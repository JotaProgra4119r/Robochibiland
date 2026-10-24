// Main Coordinator: Multi-Robot Switching, 3D Skybox & Waypoint Beacon, Parabolic Jump Physics & Cyber HUD
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CHARACTER_PROFILES } from './robot.js';
import { WorldManager } from './world.js';
import { RobotPackManager } from './other_robots.js';
import { RobotVisionSystem } from './vision.js';
import { EmotionParticleSystem, EMOTIONS } from './emotions.js';
import { RobotBrain } from './brain_llm.js';
import { roboAudio } from './audio.js';
import { MultiplayerClient } from './multiplayer.js';

function lerpAngle(current, target, t) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * Math.min(1, t);
}

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();

    // Camera modes: 'diagonal', 'follow', 'orbit', 'free', 'eye', 'drone'
    this.cameraMode = 'diagonal';
    this.keys = {};
    this.droneAngle = 0;
    this.minimapScale = 0.55;
    this.radarAngle = 0;
    this.pingRadius = 0;
    this.targetWaypoint = null;
    this.isFreeWillActive = false;
    this.freeWillTimer = 0;
    this.joystickInput = null;
    this.touchControlsInitialized = false;

    // Hand Grab & Move Tool
    this.isHandToolActive = false;
    this.grabbedRobot = null;

    // Independent Chat history & filter
    this.chatFilterDog = 'ALL';
    this.allChatHistory = [];

    // Time of day: 'day', 'sunset', 'night'
    this.timeOfDay = 'day';

    this.initScene();
    this.initLights();
    this.initSkyCelestials();
    this.initWorld();
    this.initWaypointBeacon3D();
    this.initPackAndPlayer();
    this.initVisionAndBrain();
    this.initMinimap();
    this.initUI();
    this.initTouchControls();
    this.initEventListeners();
    this.initLoginAndMultiplayer();
    this.initShareModal();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0028);

    const aspect = window.innerWidth / window.innerHeight || 1.6;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.25, 1000);
    this.camera.position.set(32 + 18, 16, 32 + 18);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (this.container) {
      this.container.appendChild(this.renderer.domElement);
    } else {
      document.body.appendChild(this.renderer.domElement);
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.minDistance = 3.0;
    this.controls.maxDistance = 160;
  }

  initLights() {
    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x388e3c, 0.75);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7ed, 1.35);
    this.sunLight.position.set(120, 160, 90);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 420;
    const d = 110;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(0x0284c7, 0.35);
    this.fillLight.position.set(-80, 60, -80);
    this.scene.add(this.fillLight);
  }

  // 3D Celestial Sun, Glowing Moon & Night Starfield Dome
  initSkyCelestials() {
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    // Glowing Sun Orb
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb, fog: false });
    this.sunOrb = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 24), sunMat);
    this.sunOrb.position.set(150, 185, 110);
    this.skyGroup.add(this.sunOrb);

    // Cyber Moon Orb
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, fog: false });
    this.moonOrb = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 24), moonMat);
    this.moonOrb.position.set(-140, 175, -120);
    this.moonOrb.visible = false;
    this.skyGroup.add(this.moonOrb);

    // Night Starfield
    const starCount = 320;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * (Math.PI * 0.44);
      const r = 310;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.max(35, r * Math.cos(phi));
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xe0f2fe,
      size: 1.6,
      transparent: true,
      opacity: 0.9,
      fog: false
    });
    this.starField = new THREE.Points(starGeo, starMat);
    this.starField.visible = false;
    this.skyGroup.add(this.starField);
  }

  // 3D Tactical Waypoint Ring shown in the 3D world when navigating via Minimap
  initWaypointBeacon3D() {
    this.waypointBeaconGroup = new THREE.Group();
    this.waypointBeaconGroup.visible = false;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    this.waypointBeaconGroup.add(ring);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x22ff88,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 4.5, 24, 1, true), beamMat);
    beam.position.y = 2.25;
    this.waypointBeaconGroup.add(beam);

    this.scene.add(this.waypointBeaconGroup);
  }

  setTimeOfDay(time) {
    this.timeOfDay = time;
    if (time === 'day') {
      this.scene.background.setHex(0x87ceeb);
      this.scene.fog.color.setHex(0x87ceeb);
      this.hemiLight.color.setHex(0xe0f2fe);
      this.hemiLight.groundColor.setHex(0x388e3c);
      this.sunLight.color.setHex(0xfff7ed);
      this.sunLight.intensity = 1.35;
      this.sunLight.position.set(120, 160, 90);
      this.fillLight.color.setHex(0x0284c7);

      if (this.sunOrb) {
        this.sunOrb.visible = true;
        this.sunOrb.material.color.setHex(0xfffbeb);
        this.sunOrb.position.set(150, 185, 110);
      }
      if (this.moonOrb) this.moonOrb.visible = false;
      if (this.starField) this.starField.visible = false;
      this.pushActivity("☀️ Es mediodía brillante en el prado.");
    } else if (time === 'sunset') {
      this.scene.background.setHex(0xfd7e14);
      this.scene.fog.color.setHex(0xfd7e14);
      this.hemiLight.color.setHex(0xfed7aa);
      this.hemiLight.groundColor.setHex(0x7c2d12);
      this.sunLight.color.setHex(0xffedd5);
      this.sunLight.intensity = 1.1;
      this.sunLight.position.set(-160, 65, 90);
      this.fillLight.color.setHex(0xd97706);

      if (this.sunOrb) {
        this.sunOrb.visible = true;
        this.sunOrb.material.color.setHex(0xff7043);
        this.sunOrb.position.set(-210, 68, 110);
      }
      if (this.moonOrb) this.moonOrb.visible = false;
      if (this.starField) this.starField.visible = false;
      this.pushActivity("🌅 El atardecer tiñe el cielo de oro y naranja.");
    } else if (time === 'night') {
      this.scene.background.setHex(0x070b19);
      this.scene.fog.color.setHex(0x070b19);
      this.hemiLight.color.setHex(0x1e293b);
      this.hemiLight.groundColor.setHex(0x022c22);
      this.sunLight.color.setHex(0x38bdf8);
      this.sunLight.intensity = 0.55;
      this.sunLight.position.set(-120, 150, -100);
      this.fillLight.color.setHex(0x6366f1);

      if (this.sunOrb) this.sunOrb.visible = false;
      if (this.moonOrb) this.moonOrb.visible = true;
      if (this.starField) this.starField.visible = true;
      this.pushActivity("🌙 Cae la noche cibernética; las estrellas y luces de neón brillan.");
    }
  }

  initWorld() {
    this.world = new WorldManager(
      this.scene,
      (score) => {
        const goalEl = document.getElementById('soccer-score-num');
        if (goalEl) goalEl.textContent = score;
      },
      (msg) => {
        this.pushActivity(msg);
      }
    );
    this.world.onTargetHit = (score) => {
      const targetEl = document.getElementById('target-score-num');
      if (targetEl) targetEl.textContent = score;
    };
    this.particleSystem = new EmotionParticleSystem(this.scene);
  }

  initPackAndPlayer() {
    this.packManager = new RobotPackManager(this.scene, this.world, (msg) => {
      this.pushActivity(msg);
    });
    this.playerRobot = this.packManager.allRobots['Sparky'];
    this.playerRobot.velocityY = 0;
  }

  initVisionAndBrain() {
    this.vision = new RobotVisionSystem(this.playerRobot, this.scene, this.world);
    const pipCanvas = document.getElementById('pip-canvas');
    if (pipCanvas) {
      this.vision.initPIP(pipCanvas);
    }

    this.brain = new RobotBrain(
      this.playerRobot,
      this.vision,
      this.world,
      this.packManager,
      this.particleSystem
    );
    this.brain.onChatResponse = (author, message, action) => {
      this.addChatMessage(author, message, 'robot');
    };
  }

  initMinimap() {
    this.minimapCanvas = document.getElementById('minimap-canvas');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');

      this.minimapCanvas.addEventListener('click', (e) => {
        const rect = this.minimapCanvas.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) * (this.minimapCanvas.width / rect.width);
        const clickY = (e.clientY - rect.top) * (this.minimapCanvas.height / rect.height);
        const centerX = this.minimapCanvas.width / 2;
        const centerY = this.minimapCanvas.height / 2;
        const pPos = this.playerRobot.group.position;

        const worldX = pPos.x + (clickX - centerX) / this.minimapScale;
        const worldZ = pPos.z + (clickY - centerY) / this.minimapScale;
        const groundY = this.world.getHeightAt(worldX, worldZ);

        this.targetWaypoint = new THREE.Vector3(worldX, groundY, worldZ);
        if (this.waypointBeaconGroup) {
          this.waypointBeaconGroup.position.copy(this.targetWaypoint);
          this.waypointBeaconGroup.visible = true;
        }

        this.brain.navigateToward(this.targetWaypoint, 5.8, 'run', () => {
          this.targetWaypoint = null;
          if (this.waypointBeaconGroup) this.waypointBeaconGroup.visible = false;
        });

        this.pushActivity(`🎯 Navegando hacia punto táctico (${Math.round(worldX)}, ${Math.round(worldZ)})`);
        roboAudio.playBoop(1.3);
      });
    }

    document.getElementById('btn-minimap-zoom-in')?.addEventListener('click', () => {
      this.minimapScale = Math.min(1.2, this.minimapScale + 0.15);
    });
    document.getElementById('btn-minimap-zoom-out')?.addEventListener('click', () => {
      this.minimapScale = Math.max(0.25, this.minimapScale - 0.15);
    });
    document.getElementById('btn-minimap-recenter')?.addEventListener('click', () => {
      this.minimapScale = 0.55;
      this.targetWaypoint = null;
      if (this.waypointBeaconGroup) this.waypointBeaconGroup.visible = false;
    });
  }

  pushActivity(text) {
    const list = document.getElementById('activity-ticker-content');
    if (!list) return;
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.textContent = text;
    list.prepend(item);

    while (list.children.length > 6) {
      list.removeChild(list.lastChild);
    }
  }

  switchToRobot(name) {
    const newPlayer = this.packManager.switchToRobot(name);
    if (!newPlayer) return;

    this.playerRobot = newPlayer;
    this.targetWaypoint = null;
    if (this.waypointBeaconGroup) this.waypointBeaconGroup.visible = false;

    this.vision.attachToRobot(newPlayer);
    this.brain.setRobot(newPlayer);

    // Update HUD
    const nameEl = document.getElementById('robot-name');
    const titleEl = document.getElementById('robot-title-tag');
    const avatarEl = document.querySelector('.robot-avatar');
    const headerAvatarEl = document.getElementById('header-robot-avatar');

    if (nameEl) nameEl.textContent = newPlayer.name;
    if (titleEl) titleEl.textContent = newPlayer.profile.title;
    if (avatarEl) avatarEl.textContent = newPlayer.profile.avatarIcon || "🐾";
    if (headerAvatarEl) headerAvatarEl.textContent = newPlayer.profile.avatarIcon || "🐾";

    document.querySelectorAll('.robo-switch-card').forEach(card => {
      if (card.dataset.robot === name) card.classList.add('active');
      else card.classList.remove('active');
    });

    const switcherStrip = document.getElementById('robot-switcher-strip');
    if (switcherStrip) {
      switcherStrip.classList.add('hidden');
      switcherStrip.classList.remove('popup-open');
      document.getElementById('btn-open-pet-switcher')?.classList.remove('open');
    }

    this.updateHUDStats();
  }

  triggerPlayerJump(boost = 7.2) {
    if (!this.playerRobot) return;
    const groundY = this.world.getHeightAt(this.playerRobot.group.position.x, this.playerRobot.group.position.z);
    if (this.playerRobot.group.position.y <= groundY + 0.25) {
      this.playerRobot.velocityY = boost;
      this.playerRobot.animController.play('jump', 1.2);
      roboAudio.playJump();
    }
  }

  initUI() {
    const nameEl = document.getElementById('robot-name');
    if (nameEl) nameEl.textContent = this.playerRobot.name;
    this.updateHUDStats();

    document.querySelectorAll('.robo-switch-card').forEach(card => {
      card.addEventListener('click', () => {
        const botName = card.dataset.robot;
        if (botName) this.switchToRobot(botName);
      });
    });

    ['day', 'sunset', 'night'].forEach(t => {
      document.getElementById(`btn-time-${t}`)?.addEventListener('click', () => {
        this.setTimeOfDay(t);
        document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`btn-time-${t}`)?.classList.add('active');
      });
    });

    document.getElementById('btn-spawn-snack')?.addEventListener('click', () => {
      const pos = this.playerRobot.group.position.clone();
      const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerRobot.group.rotation.y);
      pos.addScaledVector(fwd, 2.0);
      this.world.spawnCyberSnack(pos);
    });

    document.getElementById('btn-trigger-disco')?.addEventListener('click', () => {
      this.world.triggerDiscoParty();
    });

    document.getElementById('btn-call-pack')?.addEventListener('click', () => {
      this.brain.executeAction('call_pack');
      this.pushActivity('📣 ¡Llamaste con un silbido a toda la manada!');
    });

    document.getElementById('btn-throw-fetch')?.addEventListener('click', () => {
      this.throwFetchBall();
    });

    document.getElementById('btn-praise-dog')?.addEventListener('click', () => {
      this.brain.executeAction('praise_burst');
      this.pushActivity(`❤️ Le dijiste: "¡Buen chico!" a ${this.playerRobot.name}`);
    });

    document.getElementById('btn-drink-water')?.addEventListener('click', () => {
      this.pushActivity(`💧 Llevando a ${this.playerRobot.name} a la fuente de agua fresca...`);
      this.brain.executeAction('go_fountain');
    });

    document.getElementById('btn-slalom-rings')?.addEventListener('click', () => {
      this.brain.executeAction('slalom_rings');
      this.pushActivity(`⭕ ${this.playerRobot.name} va a cruzar el circuito de aros de agilidad.`);
    });

    document.getElementById('btn-lake-swim')?.addEventListener('click', () => {
      this.brain.executeAction('lake_swim');
      this.pushActivity(`🏊 ${this.playerRobot.name} va a nadar al Lago de Cristal.`);
    });

    document.getElementById('btn-dig-treasure')?.addEventListener('click', () => {
      this.brain.executeAction('dig_treasure');
      this.pushActivity(`💎 ${this.playerRobot.name} busca tesoros bajo la tierra.`);
    });

    document.getElementById('btn-speed-race')?.addEventListener('click', () => {
      this.brain.executeAction('speed_race');
      this.pushActivity(`🏁 ¡Iniciando carrera de velocidad con la manada!`);
    });

    const toggleHandTool = () => {
      this.isHandToolActive = !this.isHandToolActive;
      const pill = document.getElementById('pill-toggle-hand');
      const btn = document.getElementById('btn-hand-tool');
      const qbBtn = document.getElementById('quick-bar-hand');
      if (pill) pill.classList.toggle('active', this.isHandToolActive);
      if (btn) btn.classList.toggle('active', this.isHandToolActive);
      if (qbBtn) qbBtn.classList.toggle('active', this.isHandToolActive);
      document.body.classList.toggle('hand-tool-active', this.isHandToolActive);
      this.pushActivity(this.isHandToolActive ? '✋ Modo Mano Activo: Haz clic y arrastra cualquier perrito para moverlo por los aires.' : '✋ Modo Mano Desactivado.');
      roboAudio.playBoop(this.isHandToolActive ? 1.6 : 0.9);
    };
    document.getElementById('pill-toggle-hand')?.addEventListener('click', toggleHandTool);
    document.getElementById('btn-hand-tool')?.addEventListener('click', toggleHandTool);

    document.querySelectorAll('.chat-dog-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.chat-dog-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.chatFilterDog = pill.getAttribute('data-dog') || 'ALL';
        this.renderChatFeed();
      });
    });

    const bottomDock = document.getElementById('bottom-dock');
    const toggleIcon = document.getElementById('dock-toggle-icon');
    const quickBar = document.getElementById('roblox-quick-bar');

    const updateDockUI = () => {
      if (!bottomDock) return;
      const isCollapsed = bottomDock.classList.contains('collapsed');
      if (toggleIcon) toggleIcon.textContent = isCollapsed ? '▲' : '▼';
      if (quickBar) quickBar.classList.toggle('hidden-by-dock', !isCollapsed);
    };

    document.querySelectorAll('.dock-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.dataset.tab;
        if (!tab) return;
        document.querySelectorAll('.dock-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        tabBtn.classList.add('active');
        const pane = document.getElementById(`tab-pane-${tab}`);
        if (pane) pane.classList.add('active');

        if (bottomDock && bottomDock.classList.contains('collapsed')) {
          bottomDock.classList.remove('collapsed');
          updateDockUI();
        }
      });
    });

    const toggleDockBtn = document.getElementById('btn-toggle-bottom-dock');
    const closeDockBtn = document.getElementById('btn-close-bottom-dock');

    toggleDockBtn?.addEventListener('click', () => {
      if (!bottomDock) return;
      bottomDock.classList.toggle('collapsed');
      updateDockUI();
    });

    closeDockBtn?.addEventListener('click', () => {
      if (!bottomDock) return;
      bottomDock.classList.add('collapsed');
      updateDockUI();
    });

    document.getElementById('quick-bar-more')?.addEventListener('click', () => {
      if (!bottomDock) return;
      bottomDock.classList.toggle('collapsed');
      updateDockUI();
    });

    document.getElementById('quick-bar-hand')?.addEventListener('click', () => {
      toggleHandTool();
    });

    document.getElementById('quick-bar-fetch')?.addEventListener('click', () => {
      document.getElementById('btn-throw-fetch')?.click();
    });

    document.getElementById('quick-bar-snack')?.addEventListener('click', () => {
      document.getElementById('btn-spawn-snack')?.click();
    });

    document.getElementById('quick-bar-pet')?.addEventListener('click', () => {
      document.getElementById('btn-pet-robot')?.click();
    });

    const openChatTab = () => {
      const chatTab = document.querySelector('.dock-tab[data-tab="chat"]');
      if (chatTab) chatTab.click();
      if (bottomDock) {
        bottomDock.classList.remove('collapsed');
        updateDockUI();
      }
      setTimeout(() => document.getElementById('chat-input')?.focus(), 250);
    };

    document.getElementById('quick-bar-chat')?.addEventListener('click', openChatTab);
    document.getElementById('btn-toggle-chat')?.addEventListener('click', () => {
      if (!bottomDock || bottomDock.classList.contains('collapsed')) {
        openChatTab();
      } else {
        bottomDock.classList.add('collapsed');
        updateDockUI();
      }
    });

    const petSwitcherBtn = document.getElementById('btn-open-pet-switcher');
    const switcherStrip = document.getElementById('robot-switcher-strip');
    const closeSwitcherBtn = document.getElementById('btn-close-switcher');

    petSwitcherBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!switcherStrip) return;
      const willOpen = switcherStrip.classList.contains('hidden');
      switcherStrip.classList.toggle('hidden', !willOpen);
      switcherStrip.classList.toggle('popup-open', willOpen);
      petSwitcherBtn.classList.toggle('open', willOpen);
    });

    closeSwitcherBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!switcherStrip) return;
      switcherStrip.classList.add('hidden');
      switcherStrip.classList.remove('popup-open');
      petSwitcherBtn?.classList.remove('open');
    });

    document.addEventListener('click', (e) => {
      if (switcherStrip && !switcherStrip.contains(e.target) && !petSwitcherBtn?.contains(e.target)) {
        switcherStrip.classList.add('hidden');
        switcherStrip.classList.remove('popup-open');
        petSwitcherBtn?.classList.remove('open');
      }
    });

    const isFsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);

    const updateFsUI = () => {
      const active = isFsActive();
      const fsBtn = document.getElementById('btn-toggle-fullscreen');
      const menuFsBtn = document.getElementById('menu-btn-fullscreen');
      if (fsBtn) {
        fsBtn.classList.toggle('active', active);
        fsBtn.innerHTML = `${active ? '🗗' : '⛶'} <span class="btn-text-label">${active ? 'Salir' : 'Completa'}</span>`;
        fsBtn.title = active ? 'Salir de pantalla completa' : 'Pantalla Completa (F11 / Móvil)';
      }
      if (menuFsBtn) {
        const strong = menuFsBtn.querySelector('strong');
        const small = menuFsBtn.querySelector('small');
        if (strong) strong.textContent = active ? 'Salir Pantalla Completa' : 'Pantalla Completa';
        if (small) small.textContent = active ? 'Restaurar ventana' : 'Ocultar barras del navegador';
      }
    };

    const toggleFullscreenMode = () => {
      const doc = document;
      const docEl = document.documentElement;

      if (!isFsActive()) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(err => console.warn('FS error:', err));
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(err => console.warn('Exit FS error:', err));
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
      }
    };

    document.getElementById('btn-toggle-fullscreen')?.addEventListener('click', toggleFullscreenMode);
    document.getElementById('menu-btn-fullscreen')?.addEventListener('click', () => {
      toggleFullscreenMode();
      document.getElementById('modal-game-menu')?.classList.add('hidden');
    });

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
      document.addEventListener(evt, updateFsUI);
    });

    const gameMenuModal = document.getElementById('modal-game-menu');
    const openMenuBtn = document.getElementById('btn-open-game-menu');
    const closeMenuBtn = document.getElementById('btn-close-game-menu');

    openMenuBtn?.addEventListener('click', () => {
      if (!gameMenuModal) return;
      gameMenuModal.classList.remove('hidden');
      const usrCount = document.getElementById('mobile-menu-users-count');
      const onlineCount = document.getElementById('online-users-count');
      if (usrCount && onlineCount) usrCount.textContent = onlineCount.textContent;
      const userNameEl = document.getElementById('mobile-menu-user-name');
      const headerUser = document.getElementById('header-user-name');
      if (userNameEl && headerUser) userNameEl.textContent = headerUser.textContent;
    });

    closeMenuBtn?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
    });

    document.getElementById('menu-btn-profile')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      document.getElementById('modal-login')?.classList.remove('hidden');
    });

    document.getElementById('menu-btn-pip')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      const pipPanel = document.getElementById('pip-panel');
      if (!pipPanel) return;
      pipPanel.classList.toggle('hidden');
      const isShown = !pipPanel.classList.contains('hidden');
      document.getElementById('pill-toggle-pip')?.classList.toggle('active', isShown);
    });

    document.getElementById('menu-btn-share')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      document.getElementById('btn-open-share')?.click();
    });

    document.getElementById('menu-btn-zen')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      this.toggleZenMode();
    });

    document.getElementById('menu-btn-touch')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      document.getElementById('btn-toggle-touch')?.click();
    });

    document.getElementById('menu-btn-memory')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      document.getElementById('btn-open-memory')?.click();
    });

    document.getElementById('menu-btn-settings')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      document.getElementById('btn-open-settings')?.click();
    });

    document.getElementById('menu-btn-users')?.addEventListener('click', () => {
      gameMenuModal?.classList.add('hidden');
      document.getElementById('pill-toggle-users')?.click();
    });

    document.getElementById('btn-toggle-zen')?.addEventListener('click', () => this.toggleZenMode());
    document.getElementById('btn-exit-zen')?.addEventListener('click', () => this.toggleZenMode());

    const wirePill = (pillId, panelId) => {
      const pill = document.getElementById(pillId);
      const panel = document.getElementById(panelId);
      if (!pill || !panel) return;
      pill.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        const isShown = !panel.classList.contains('hidden');
        pill.classList.toggle('active', isShown);
      });
    };

    wirePill('pill-toggle-minimap', 'minimap-panel');
    wirePill('pill-toggle-pip', 'pip-panel');
    wirePill('pill-toggle-users', 'online-users-panel');

    const setupMinimize = (btnId, panelId) => {
      const btn = document.getElementById(btnId);
      const panel = document.getElementById(panelId);
      if (!btn || !panel) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('minimized');
        const isMin = panel.classList.contains('minimized');
        btn.textContent = isMin ? '▢' : '—';
        btn.title = isMin ? 'Expandir' : 'Minimizar';
      });
    };

    setupMinimize('btn-min-upperleft', 'thought-panel');
    setupMinimize('btn-min-ticker', 'ticker-panel');
    setupMinimize('btn-min-minimap', 'minimap-panel');
    setupMinimize('btn-min-pip', 'pip-panel');

    document.getElementById('btn-close-minimap')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('minimap-panel')?.classList.add('hidden');
      document.getElementById('pill-toggle-minimap')?.classList.remove('active');
    });

    document.getElementById('btn-close-pip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('pip-panel')?.classList.add('hidden');
      document.getElementById('pill-toggle-pip')?.classList.remove('active');
    });

    if (window.innerWidth <= 900) {
      const thoughtPanel = document.getElementById('thought-panel');
      const minBtn = document.getElementById('btn-min-upperleft');
      if (thoughtPanel) thoughtPanel.classList.add('minimized');
      if (minBtn) minBtn.textContent = '▢';
    }

    document.getElementById('btn-clear-chat-log')?.addEventListener('click', () => {
      this.allChatHistory = [];
      const feed = document.getElementById('chat-history-feed');
      if (feed) {
        feed.innerHTML = `<div class="chat-bubble chat-system"><span class="chat-author">🤖 Sistema:</span> Historial reiniciado.</div>`;
      }
    });

    const freewillBtn = document.getElementById('btn-toggle-freewill');
    freewillBtn?.addEventListener('click', () => {
      this.isFreeWillActive = !this.isFreeWillActive;
      if (this.isFreeWillActive) {
        freewillBtn.textContent = '🐾 Modo Libre: ON';
        freewillBtn.classList.add('active');
        this.pushActivity(`🐾 Modo Libre Activado: ${this.playerRobot.name} explorará por su cuenta.`);
      } else {
        freewillBtn.textContent = '🐾 Modo Libre: OFF';
        freewillBtn.classList.remove('active');
        this.pushActivity(`🎮 Control Manual Activado.`);
      }
    });

    document.getElementById('btn-toggle-touch')?.addEventListener('click', () => {
      const touchOverlay = document.getElementById('virtual-touch-controls');
      if (touchOverlay) {
        touchOverlay.classList.toggle('hidden');
        const isShown = !touchOverlay.classList.contains('hidden');
        this.pushActivity(isShown ? '📱 Joystick táctil dinámico activado.' : '📱 Controles táctiles ocultados.');
      }
    });

    // FreeLLMsAPI Modal Inputs
    const endpointInput = document.getElementById('cfg-endpoint');
    const apikeyInput = document.getElementById('cfg-apikey');
    const modelSelect = document.getElementById('cfg-model-select');
    const modelCustom = document.getElementById('cfg-model-custom');
    const systemPromptInput = document.getElementById('cfg-system-prompt');
    const intervalInput = document.getElementById('cfg-interval');
    const intervalVal = document.getElementById('cfg-interval-val');
    const autoThinkCheck = document.getElementById('cfg-autothink');

    if (endpointInput) {
      endpointInput.value = this.brain.config.endpoint || 'http://127.0.0.1:31415/v1/chat/completions';
    }
    if (apikeyInput) {
      apikeyInput.value = this.brain.config.apiKey || 'freellmapi-dc6415f70139118055e4065b767a1d8acb930795eb3d1384';
    }
    if (systemPromptInput) {
      systemPromptInput.value = this.brain.config.systemPrompt || '';
    }

    if (modelSelect) {
      const savedModel = this.brain.config.model || 'auto';
      let found = false;
      for (let opt of modelSelect.options) {
        if (opt.value === savedModel) {
          modelSelect.value = savedModel;
          found = true;
          break;
        }
      }
      if (!found && savedModel !== 'auto') {
        modelSelect.value = 'custom';
        if (modelCustom) {
          modelCustom.value = savedModel;
          modelCustom.classList.remove('hidden');
        }
      }

      modelSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          modelCustom?.classList.remove('hidden');
        } else {
          modelCustom?.classList.add('hidden');
        }
      });
    }

    if (intervalInput) {
      intervalInput.value = this.brain.config.intervalSeconds;
      if (intervalVal) intervalVal.textContent = `${this.brain.config.intervalSeconds}s`;
      intervalInput.oninput = (e) => {
        if (intervalVal) intervalVal.textContent = `${e.target.value}s`;
        this.brain.config.intervalSeconds = parseInt(e.target.value, 10);
      };
    }
    if (autoThinkCheck) autoThinkCheck.checked = this.brain.config.autoThink;

    const sanitizeUrl = (raw) => {
      if (!raw) return 'http://127.0.0.1:31415/v1/chat/completions';
      const m = raw.match(/https?:\/\/[^\s"']+/i);
      let u = m ? m[0] : raw.trim();
      u = u.replace(/\/+$/, '');
      if (!u.endsWith('/chat/completions')) {
        if (u.endsWith('/v1')) u += '/chat/completions';
        else u += '/v1/chat/completions';
      }
      return u;
    };

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      const cleanEp = sanitizeUrl(endpointInput?.value || '');
      if (endpointInput) endpointInput.value = cleanEp;

      let chosenModel = modelSelect ? modelSelect.value : 'auto';
      if (chosenModel === 'custom' && modelCustom && modelCustom.value.trim()) {
        chosenModel = modelCustom.value.trim();
      }

      this.brain.config.endpoint = cleanEp;
      this.brain.config.apiKey = apikeyInput ? apikeyInput.value.trim() : '';
      this.brain.config.model = chosenModel;
      this.brain.config.systemPrompt = systemPromptInput ? systemPromptInput.value.trim() : '';
      if (autoThinkCheck) this.brain.config.autoThink = autoThinkCheck.checked;
      this.brain.saveConfig();

      this.pushActivity(`⚙️ FreeLLMAPI guardado: ${chosenModel}`);
      alert(`Configuración guardada exitosamente.\nModelo: ${chosenModel}\nEndpoint: ${cleanEp}`);
      document.getElementById('modal-settings')?.classList.add('hidden');
    });

    document.getElementById('btn-test-connection')?.addEventListener('click', async () => {
      const statusEl = document.getElementById('api-test-status');
      if (!statusEl) return;
      statusEl.textContent = 'Probando conexión con FreeLLMAPI...';
      try {
        const cleanEp = sanitizeUrl(endpointInput?.value || '');
        const key = apikeyInput ? apikeyInput.value.trim() : '';
        let mdl = modelSelect ? modelSelect.value : 'auto';
        if (mdl === 'custom' && modelCustom && modelCustom.value.trim()) {
          mdl = modelCustom.value.trim();
        }

        const res = await fetch('/api/llm/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: cleanEp,
            apiKey: key,
            model: mdl,
            messages: [{ role: 'user', content: 'Di "Conexión Exitosa con FreeLLMAPI" en 5 palabras' }],
            max_tokens: 20
          })
        });
        const data = await res.json();
        if (res.ok && data.choices && data.choices.length > 0) {
          const reply = data.choices[0].message?.content || 'Conectado';
          statusEl.textContent = `✅ Éxito [${data.model || mdl}]: ${reply}`;
          statusEl.style.color = '#22ff88';
          this.pushActivity(`✅ Conexión exitosa con FreeLLMAPI (${data.model || mdl})`);
        } else {
          statusEl.textContent = `❌ Error: ${data.error?.message || data.error || 'Fallo de autenticación o endpoint'}`;
          statusEl.style.color = '#ff3d00';
        }
      } catch (err) {
        statusEl.textContent = `❌ Error de red: ${err.message}`;
        statusEl.style.color = '#ff3d00';
      }
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      document.getElementById('modal-settings')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-settings')?.addEventListener('click', () => {
      document.getElementById('modal-settings')?.classList.add('hidden');
    });

    document.getElementById('btn-open-memory')?.addEventListener('click', () => {
      this.brain.loadMemoryFromDisk();
      document.getElementById('modal-memory')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-memory')?.addEventListener('click', () => {
      document.getElementById('modal-memory')?.classList.add('hidden');
    });

    document.getElementById('btn-download-memory')?.addEventListener('click', () => {
      if (!this.brain.memoryData) return;
      const blob = new Blob([JSON.stringify(this.brain.memoryData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.playerRobot.name}_RoboMemory.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Movements & Ethological Canine Behaviors
    const actions = [
      'walk', 'run', 'sit', 'lieDown', 'jump', 'wagTail', 'bark', 'sniff', 'scratch',
      'backflip', 'spin', 'roll', 'wave', 'recharge', 'dig', 'howl', 'dance', 'sneak',
      'playBow', 'headTilt', 'bellyRub', 'beg', 'shakeOff', 'nuzzle'
    ];
    actions.forEach(action => {
      document.getElementById(`btn-anim-${action}`)?.addEventListener('click', () => {
        if (action === 'jump') {
          this.triggerPlayerJump(7.2);
        } else {
          this.playerRobot.animController.play(action, 2.5);
        }
      });
    });

    // Emotions
    Object.keys(EMOTIONS).forEach(key => {
      document.getElementById(`btn-emo-${key.toLowerCase()}`)?.addEventListener('click', () => {
        this.playerRobot.setEmotion(EMOTIONS[key]);
        this.particleSystem.spawnBurst(this.playerRobot.group.position, key);
        this.brain.addJournalEntry(EMOTIONS[key].name, `Cambié mi emoción a ${EMOTIONS[key].name}`);
      });
    });

    document.getElementById('btn-pet-robot')?.addEventListener('click', () => {
      this.playerRobot.petRobot();
      this.particleSystem.spawnBurst(this.playerRobot.group.position, 'LOVING');
      this.pushActivity(`💖 ¡Acariciaste a ${this.playerRobot.name}!`);
    });

    const chatInput = document.getElementById('chat-input');
    const chatBtn = document.getElementById('chat-btn');
    const sendChat = () => {
      if (!chatInput) return;
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      const userName = (this.currentUser && this.currentUser.username) ? this.currentUser.username : 'Tú';

      const targetDog = (this.chatFilterDog && this.chatFilterDog !== 'ALL') ? this.chatFilterDog : this.playerRobot.name;
      if (targetDog !== this.playerRobot.name && this.packManager && this.packManager.allRobots[targetDog]) {
        this.switchToRobot(targetDog);
      }

      this.pushActivity(`💬 ${userName} a ${this.playerRobot.name}: "${text}"`);
      this.addChatMessage(userName, text, 'user', this.playerRobot.name);
      if (this.multiplayer) {
        this.multiplayer.sendChatCommand(text, this.playerRobot.name);
      }
      this.brain.think(text);
    };
    chatBtn?.addEventListener('click', sendChat);
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChat();
    });

    document.getElementById('btn-manual-think')?.addEventListener('click', () => {
      this.brain.think();
    });

    const camModes = ['diagonal', 'follow', 'orbit', 'free', 'eye', 'drone'];
    camModes.forEach(mode => {
      document.getElementById(`btn-cam-${mode}`)?.addEventListener('click', () => {
        this.cameraMode = mode;
        this.updateCamBtnState();
        if (mode === 'free') {
          this.pushActivity('🛸 Modo Libre Activo: Vuela con W/A/S/D y ratón.');
        }
      });
    });

    const camCycleOrder = ['follow', 'diagonal', 'orbit', 'drone', 'eye', 'free'];
    document.getElementById('btn-cam-cycle')?.addEventListener('click', () => {
      const idx = camCycleOrder.indexOf(this.cameraMode);
      const next = camCycleOrder[(idx + 1) % camCycleOrder.length];
      this.cameraMode = next;
      this.updateCamBtnState();
      this.pushActivity(`🎥 Cámara cambiada a: ${next.toUpperCase()}`);
    });

    this.updateCamBtnState();
  }

  toggleZenMode() {
    const hud = document.getElementById('hud-overlay');
    const exitBtn = document.getElementById('btn-exit-zen');
    if (!hud) return;
    hud.classList.toggle('zen-mode');
    const isZen = hud.classList.contains('zen-mode');
    if (exitBtn) {
      if (isZen) exitBtn.classList.remove('hidden');
      else exitBtn.classList.add('hidden');
    }
    this.pushActivity(isZen ? '👁️ Modo Zen activado (Inmersión 3D completa).' : '👁️ Modo Zen desactivado.');
  }

  // Guarded with touchControlsInitialized so listeners are never registered twice
  initTouchControls() {
    if (this.touchControlsInitialized) return;
    this.touchControlsInitialized = true;

    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickStick = document.getElementById('joystick-stick');
    if (!joystickZone || !joystickBase || !joystickStick) return;

    let touchId = null;
    let centerX = 0;
    let centerY = 0;
    const maxRadius = 45;

    const onTouchStart = (e) => {
      const touch = e.changedTouches ? e.changedTouches[0] : e;
      touchId = touch.identifier !== undefined ? touch.identifier : 'mouse';
      centerX = touch.clientX;
      centerY = touch.clientY;

      joystickBase.style.left = `${centerX}px`;
      joystickBase.style.top = `${centerY}px`;
      joystickStick.style.transform = `translate(-50%, -50%)`;
      joystickBase.classList.remove('hidden');

      this.joystickInput = { x: 0, z: 0, isRunning: false };
    };

    const onTouchMove = (e) => {
      if (touchId === null) return;
      let touch = null;
      if (e.changedTouches) {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            touch = e.changedTouches[i];
            break;
          }
        }
      } else {
        touch = e;
      }
      if (!touch) return;

      const dx = touch.clientX - centerX;
      const dy = touch.clientY - centerY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const clampedDist = Math.min(dist, maxRadius);

      const stickX = Math.cos(angle) * clampedDist;
      const stickY = Math.sin(angle) * clampedDist;
      joystickStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;

      const normDist = clampedDist / maxRadius;
      this.joystickInput = {
        x: (stickX / maxRadius),
        z: (stickY / maxRadius),
        isRunning: normDist > 0.72 || !!this.keys['shift']
      };
    };

    const onTouchEnd = () => {
      touchId = null;
      joystickBase.classList.add('hidden');
      this.joystickInput = null;
    };

    joystickZone.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    document.querySelectorAll('.touch-act-btn').forEach(btn => {
      const key = btn.dataset.key;
      let lastTrigger = 0;
      const trigger = () => {
        const now = Date.now();
        if (now - lastTrigger < 180) return;
        lastTrigger = now;

        if (key === 'shift') {
          this.keys['shift'] = !this.keys['shift'];
          btn.classList.toggle('pressed', this.keys['shift']);
        } else if (key === ' ') {
          this.triggerPlayerJump(7.2);
        } else if (key === 'b') {
          this.playerRobot.animController.play('bark', 1.0);
          roboAudio.playBark(this.playerRobot.profile ? this.playerRobot.profile.voicePitch : 1.0);
        } else if (key === 'g') {
          this.throwFetchBall();
        } else if (key === 'p') {
          this.playerRobot.petRobot();
          if (this.particleSystem) this.particleSystem.spawnBurst(this.playerRobot.group.position, 'LOVING');
        }
      };

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        trigger();
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        trigger();
      });
    });

    if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 768) {
      document.getElementById('virtual-touch-controls')?.classList.remove('hidden');
    }
  }

  updateCamBtnState() {
    const camLabels = {
      follow: 'Seguir',
      diagonal: 'Diag',
      orbit: 'Órbita',
      free: 'Vuelo',
      eye: 'Ojos',
      drone: 'Drone'
    };

    ['diagonal', 'follow', 'orbit', 'free', 'eye', 'drone'].forEach(m => {
      const btn = document.getElementById(`btn-cam-${m}`);
      if (btn) {
        if (m === this.cameraMode) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });

    const camCycleText = document.getElementById('cam-current-name');
    if (camCycleText) {
      camCycleText.textContent = camLabels[this.cameraMode] || this.cameraMode;
    }
  }

  initEventListeners() {
    window.addEventListener('resize', () => {
      const aspect = window.innerWidth / window.innerHeight || 1.6;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);

      const pipCanvas = document.getElementById('pip-canvas');
      if (pipCanvas && this.vision.pipRenderer) {
        const w = Math.max(pipCanvas.clientWidth || 220, 100);
        const h = Math.max(pipCanvas.clientHeight || 130, 60);
        this.vision.pipRenderer.setSize(w, h, false);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys[e.key.toLowerCase()] = true;
      roboAudio.ensureContext();

      if (e.key === ' ') {
        this.triggerPlayerJump(7.2);
      } else if (e.key.toLowerCase() === 'p') {
        this.playerRobot.petRobot();
        this.particleSystem.spawnBurst(this.playerRobot.group.position, 'LOVING');
        this.pushActivity(`💖 ¡Mimos para ${this.playerRobot.name}!`);
      } else if (e.key.toLowerCase() === 'b') {
        this.playerRobot.animController.play('bark', 1.0);
      } else if (e.key.toLowerCase() === 'f') {
        this.playerRobot.animController.play('backflip', 1.6);
      } else if (e.key.toLowerCase() === 'g') {
        this.throwFetchBall();
      } else if (e.key.toLowerCase() === 't') {
        this.playerRobot.animController.play('headTilt', 2.5);
      } else if (e.key.toLowerCase() === 'l') {
        this.cameraMode = (this.cameraMode === 'free') ? 'diagonal' : 'free';
        this.updateCamBtnState();
        this.pushActivity(this.cameraMode === 'free' ? '🛸 Modo Libre Cámara: Vuela libremente con W/A/S/D y ratón' : '📐 Cámara fijada en el robot');
      } else if (e.key.toLowerCase() === 'h') {
        this.toggleZenMode();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const order = ['Sparky', 'Bolt', 'Pixel', 'Luna', 'Rusty'];
        const curIdx = order.indexOf(this.playerRobot.name);
        const nextName = order[(curIdx + 1) % order.length];
        this.switchToRobot(nextName);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownTime = 0;
    let pointerDownPos = { x: 0, y: 0 };
    let candidateRobot = null;
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const planeIntersect = new THREE.Vector3();

    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      pointerDownTime = Date.now();
      pointerDownPos = { x: e.clientX, y: e.clientY };

      const allMeshes = Object.values(this.packManager.allRobots).map(r => r.group);
      const intersects = raycaster.intersectObjects(allMeshes, true);

      if (intersects.length > 0) {
        let hitGroup = intersects[0].object;
        while (hitGroup.parent && !hitGroup.name.startsWith('ChibiRobot_')) {
          hitGroup = hitGroup.parent;
        }
        if (hitGroup && hitGroup.name.startsWith('ChibiRobot_')) {
          const clickedName = hitGroup.name.replace('ChibiRobot_', '');
          candidateRobot = this.packManager.allRobots[clickedName];
          if (this.isHandToolActive && candidateRobot) {
            this.grabRobot(candidateRobot);
          }
        }
      }
    });

    this.renderer.domElement.addEventListener('pointermove', (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);

      if (candidateRobot && !this.grabbedRobot && (Date.now() - pointerDownTime > 110)) {
        const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (moved > 6) {
          this.grabRobot(candidateRobot);
        }
      }

      if (this.grabbedRobot) {
        const groundY = this.world.getHeightAt(this.grabbedRobot.group.position.x, this.grabbedRobot.group.position.z);
        const targetH = groundY + 2.4;
        groundPlane.constant = -targetH;
        if (raycaster.ray.intersectPlane(groundPlane, planeIntersect)) {
          this.grabbedRobot.group.position.x = THREE.MathUtils.lerp(this.grabbedRobot.group.position.x, planeIntersect.x, 0.45);
          this.grabbedRobot.group.position.z = THREE.MathUtils.lerp(this.grabbedRobot.group.position.z, planeIntersect.z, 0.45);
          this.grabbedRobot.group.position.y = targetH;
        }
      }
    });

    this.renderer.domElement.addEventListener('pointerup', () => {
      if (this.grabbedRobot) {
        this.releaseGrabbedRobot();
        candidateRobot = null;
        return;
      }

      if (candidateRobot && Date.now() - pointerDownTime < 260) {
        if (candidateRobot === this.playerRobot) {
          this.playerRobot.petRobot();
          this.particleSystem.spawnBurst(this.playerRobot.group.position, 'LOVING');
          this.pushActivity(`💖 ¡Mimos para ${this.playerRobot.name}!`);
        } else {
          this.switchToRobot(candidateRobot.name);
        }
      }
      candidateRobot = null;
    });
  }

  grabRobot(robot) {
    if (!robot || this.grabbedRobot) return;
    this.grabbedRobot = robot;
    robot.isPickedUp = true;
    robot.velocityY = 0;
    if (robot === this.playerRobot && this.brain) {
      this.brain.cancelNavigation();
    }
    if (robot.animController) robot.animController.play('pickedUp');
    document.body.classList.add('is-grabbing');
    roboAudio.playBoop(1.5);
    if (this.particleSystem) this.particleSystem.spawnBurst(robot.group.position, 'EXCITED');
    this.pushActivity(`✋ ¡Levantaste a ${robot.name} en el aire con la mano!`);
  }

  releaseGrabbedRobot() {
    if (!this.grabbedRobot) return;
    const released = this.grabbedRobot;
    this.grabbedRobot = null;
    released.isPickedUp = false;
    released.velocityY = -2.5;
    document.body.classList.remove('is-grabbing');
    this.pushActivity(`🐾 ¡Soltaste a ${released.name}! Cayendo suavemente al terreno.`);
  }

  addChatMessage(author, message, role = 'robot', targetDog = null) {
    const cleanMsg = (role === 'robot' && this.brain) ? this.brain.cleanThought(message) : message;

    const dog = targetDog || (role === 'robot' ? author : (this.playerRobot ? this.playerRobot.name : null));
    const entry = {
      author,
      message: cleanMsg,
      role,
      targetDog: dog,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    this.allChatHistory.push(entry);
    if (this.allChatHistory.length > 80) this.allChatHistory.shift();

    if (dog && this.packManager && this.packManager.allRobots[dog]) {
      this.packManager.allRobots[dog].addDialogue(role, author, cleanMsg);
    }

    this.renderChatFeed();
  }

  renderChatFeed() {
    const feed = document.getElementById('chat-history-feed');
    if (!feed) return;
    feed.innerHTML = '';

    const filter = this.chatFilterDog || 'ALL';
    const filtered = this.allChatHistory.filter(entry => {
      if (filter === 'ALL') return true;
      if (entry.role === 'system') return true;
      return entry.author === filter || entry.targetDog === filter;
    });

    filtered.forEach(entry => {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble chat-${entry.role}`;
      const icon = entry.role === 'user' ? '👤' : (entry.role === 'system' ? '🤖' : '🐾');
      bubble.innerHTML = `<span class="chat-author">${icon} ${entry.author}:</span> ${entry.message}`;
      feed.appendChild(bubble);
    });

    feed.scrollTop = feed.scrollHeight;
  }

  initLoginAndMultiplayer() {
    let savedUser = null;
    try {
      savedUser = JSON.parse(localStorage.getItem('robochibi_user'));
    } catch (e) { }

    let selectedAvatar = (savedUser && savedUser.avatar) || '🐾';

    const loginModal = document.getElementById('modal-login');
    const usernameInput = document.getElementById('login-username-input');
    const submitBtn = document.getElementById('btn-login-submit');
    const avatarBtns = document.querySelectorAll('.avatar-opt');

    avatarBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        avatarBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedAvatar = btn.getAttribute('data-avatar') || '🐾';
      });
    });

    const updateUserProfileUI = () => {
      const headerAvatar = document.getElementById('header-user-avatar');
      const headerName = document.getElementById('header-user-name');
      if (headerAvatar) headerAvatar.textContent = this.currentUser.avatar || '🐾';
      if (headerName) headerName.textContent = this.currentUser.username || 'Humano';
    };

    const confirmLogin = () => {
      let username = usernameInput ? usernameInput.value.trim() : '';
      if (!username) username = `Explorador_${Math.floor(100 + Math.random() * 900)}`;

      this.currentUser = {
        username,
        avatar: selectedAvatar
      };
      localStorage.setItem('robochibi_user', JSON.stringify(this.currentUser));
      updateUserProfileUI();
      if (loginModal) loginModal.classList.add('hidden');

      if (!this.multiplayer) {
        this.setupMultiplayer();
      } else {
        this.multiplayer.updateUser(this.currentUser);
      }

      this.pushActivity(`🎉 ¡Bienvenido, ${this.currentUser.username}! Puedes darle órdenes a los perritos.`);
    };

    submitBtn?.addEventListener('click', confirmLogin);
    usernameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmLogin();
    });

    document.getElementById('user-profile-badge')?.addEventListener('click', () => {
      if (usernameInput) usernameInput.value = this.currentUser ? this.currentUser.username : '';
      if (loginModal) loginModal.classList.remove('hidden');
      if (usernameInput) usernameInput.focus();
    });

    if (savedUser && savedUser.username) {
      this.currentUser = savedUser;
      updateUserProfileUI();
      this.setupMultiplayer();
    } else {
      if (loginModal) loginModal.classList.remove('hidden');
      setTimeout(() => { if (usernameInput) usernameInput.focus(); }, 100);
    }
  }

  setupMultiplayer() {
    this.multiplayer = new MultiplayerClient({
      onStatusChange: (connected) => {
        const dot = document.querySelector('.online-indicator-dot');
        if (dot) dot.style.background = connected ? '#22c55e' : '#ef4444';
      },
      onUsersListUpdated: (users) => {
        const countEl = document.getElementById('online-users-count');
        if (countEl) countEl.textContent = users.length;

        const listEl = document.getElementById('online-users-list');
        if (!listEl) return;

        listEl.innerHTML = users.map(u => {
          const isMe = this.currentUser && u.username === this.currentUser.username;
          return `
            <div class="user-pill-item ${isMe ? 'current-user' : ''}">
              <span class="user-pill-avatar">${u.avatar || '🐾'}</span>
              <span class="user-pill-name">${u.username}</span>
              ${isMe ? '<span class="user-pill-tag">Tú</span>' : ''}
            </div>
          `;
        }).join('');
      },
      onUserJoined: (user) => {
        roboAudio.playHappyJingle();
        this.addChatMessage('Sistema', `👋 ${user.avatar || '🐾'} <strong>${user.username}</strong> se ha unido al mundo virtual.`, 'system');
        this.pushActivity(`👋 ${user.username} se unió a la sesión.`);
      },
      onUserLeft: (user) => {
        this.addChatMessage('Sistema', `🚪 ${user.avatar || '🐾'} <strong>${user.username}</strong> salió de la sesión.`, 'system');
        this.pushActivity(`🚪 ${user.username} salió del mundo.`);
      },
      onCommandReceived: (sender, text) => {
        if (this.currentUser && sender.username === this.currentUser.username) return;

        this.addChatMessage(`${sender.avatar || '👤'} ${sender.username}`, text, 'user');
        this.pushActivity(`💬 ${sender.username} ordenó: "${text}"`);
        this.brain.think(text);
      },
      onRobotActionReceived: () => { }
    });

    if (this.currentUser) {
      this.multiplayer.init(this.currentUser);
    }
  }

  initShareModal() {
    const shareModal = document.getElementById('modal-share');
    const openBtns = [document.getElementById('btn-open-share'), document.getElementById('btn-share-server')];
    const closeBtns = [document.getElementById('btn-close-share'), document.getElementById('btn-close-share-bottom')];

    openBtns.forEach(btn => {
      btn?.addEventListener('click', async () => {
        if (shareModal) shareModal.classList.remove('hidden');
        try {
          const fetchNetwork = async () => {
            const res = await fetch('/api/network-info');
            if (res.ok) {
              const data = await res.json();
              const tunInput = document.getElementById('share-tunnel-url');
              const lanInput = document.getElementById('share-lan-url');
              if (tunInput && data.tunnelUrl) tunInput.value = data.tunnelUrl;
              if (lanInput && data.lanUrl) lanInput.value = data.lanUrl;
              return data.tunnelUrl && !data.tunnelUrl.includes('Generando');
            }
            return false;
          };

          const ready = await fetchNetwork();
          if (!ready) {
            let attempts = 0;
            const poller = setInterval(async () => {
              attempts++;
              const isReady = await fetchNetwork();
              if (isReady || attempts >= 8) clearInterval(poller);
            }, 2000);
          }
        } catch (e) {
          if (!window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
            const tunInput = document.getElementById('share-tunnel-url');
            if (tunInput) tunInput.value = window.location.origin;
          }
        }
      });
    });

    closeBtns.forEach(btn => {
      btn?.addEventListener('click', () => {
        if (shareModal) shareModal.classList.add('hidden');
      });
    });

    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        navigator.clipboard.writeText(input.value).then(() => {
          const original = btn.textContent;
          btn.textContent = '✅ ¡Copiado!';
          btn.style.background = '#22c55e';
          setTimeout(() => {
            btn.textContent = original;
            btn.style.background = '';
          }, 2000);
        });
      });
    });
  }

  throwFetchBall() {
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerRobot.group.rotation.y);
    this.world.throwBall(this.playerRobot.group.position, fwd, 24);
    setTimeout(() => {
      this.brain.executeAction('fetch_ball');
    }, 450);
  }

  handleManualMovement(delta) {
    if (this.cameraMode === 'free' || this.playerRobot.isPickedUp || this.playerRobot.isSliding) return;

    let moveX = 0;
    let moveZ = 0;
    let isRunning = !!this.keys['shift'];

    if (this.joystickInput) {
      moveX = this.joystickInput.x;
      moveZ = this.joystickInput.z;
      if (this.joystickInput.isRunning) isRunning = true;
    } else {
      if (this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
      if (this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
      if (this.keys['d'] || this.keys['arrowright']) moveX += 1;
    }

    // Manual input immediately overrides any autonomous navigation waypoint
    if ((moveX !== 0 || moveZ !== 0) && this.brain && this.brain.isNavigating) {
      this.brain.cancelNavigation();
      this.targetWaypoint = null;
      if (this.waypointBeaconGroup) this.waypointBeaconGroup.visible = false;
    }

    if (this.brain && this.brain.isNavigating) return;

    const rPos = this.playerRobot.group.position;

    if (moveX !== 0 || moveZ !== 0) {
      this.freeWillTimer = 3.0;
      const camYaw = Math.atan2(
        this.camera.position.x - rPos.x,
        this.camera.position.z - rPos.z
      );

      const inputAngle = Math.atan2(moveX, -moveZ);
      const targetAngle = camYaw + inputAngle;

      // Shortest angle difference prevents 360° spin wrap-around glitches
      const shortestDiff = Math.atan2(
        Math.sin(targetAngle - this.playerRobot.group.rotation.y),
        Math.cos(targetAngle - this.playerRobot.group.rotation.y)
      );
      this.playerRobot.bankAngle = THREE.MathUtils.clamp(-shortestDiff * 0.35, -0.22, 0.22);
      this.playerRobot.group.rotation.y = lerpAngle(
        this.playerRobot.group.rotation.y,
        targetAngle,
        delta * 12
      );

      const baseSpeed = isRunning ? 9.5 : 4.8;
      const speed = baseSpeed * (this.playerRobot.profile ? this.playerRobot.profile.speedMultiplier : 1.0);
      const anim = isRunning ? 'run' : 'walk';

      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.playerRobot.group.rotation.y);
      rPos.addScaledVector(forward, speed * delta);

      // 1. Resolve Solid Obstacle Collisions
      if (this.world && this.world.resolveObstacleCollisions) {
        this.world.resolveObstacleCollisions(rPos, 0.75, 1.2);
      }

      // 2. Robot-to-Robot Solid Horizontal XZ Collision Pushout
      if (this.packManager && this.packManager.pack) {
        this.packManager.pack.forEach(bot => {
          if (Math.abs(rPos.y - bot.group.position.y) >= 1.2) return;
          const dx = rPos.x - bot.group.position.x;
          const dz = rPos.z - bot.group.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.4 && dist > 0.001) {
            const overlap = (1.4 - dist) * 0.5;
            const nx = dx / dist;
            const nz = dz / dist;
            rPos.x += nx * overlap;
            rPos.z += nz * overlap;
            bot.group.position.x -= nx * overlap;
            bot.group.position.z -= nz * overlap;
          }
        });
      }

      if (!this.playerRobot.isInWater && this.playerRobot.animController.currentAnim !== 'jump' && this.playerRobot.animController.currentAnim !== 'backflip') {
        this.playerRobot.animController.play(anim);
      }
    } else {
      this.playerRobot.bankAngle = THREE.MathUtils.lerp(this.playerRobot.bankAngle || 0, 0, delta * 10);

      if (this.isFreeWillActive) {
        this.freeWillTimer -= delta;
        if (this.freeWillTimer <= 0) {
          this.freeWillTimer = 4.0 + Math.random() * 5.0;
          if (Math.random() < 0.6) {
            const targets = ['go_ball', 'go_trampoline', 'go_lake', 'go_carousel', 'go_disco', 'go_snack'];
            const chosen = targets[Math.floor(Math.random() * targets.length)];
            this.brain.executeAction(chosen);
          } else {
            const idleTricks = ['wagTail', 'sniff', 'spin', 'wave', 'dance', 'roll', 'howl'];
            const trick = idleTricks[Math.floor(Math.random() * idleTricks.length)];
            this.playerRobot.animController.play(trick, 2.5);
          }
        }
      } else {
        if (['walk', 'run'].includes(this.playerRobot.animController.currentAnim)) {
          this.playerRobot.animController.play('idle');
        }
      }
    }

    // Unified Parabolic Vertical Physics & World Interactions for Player Robot
    const groundY = this.world.getHeightAt(rPos.x, rPos.z);
    if (!this.playerRobot.isInWater) {
      if (rPos.y > groundY + 0.04 || (this.playerRobot.velocityY && this.playerRobot.velocityY !== 0)) {
        this.playerRobot.velocityY = (this.playerRobot.velocityY || 0) - 18.5 * delta;
        rPos.y += this.playerRobot.velocityY * delta;
        if (rPos.y <= groundY) {
          rPos.y = groundY;
          if (this.playerRobot.velocityY < -10) {
            if (this.particleSystem) this.particleSystem.spawnBurst(rPos, 'HAPPY');
          }
          this.playerRobot.velocityY = 0;
        }
      } else {
        rPos.y = groundY;
        this.playerRobot.velocityY = 0;
      }
    }

    const prevY = rPos.y;
    this.world.handleRobotInteractions(this.playerRobot);
    // If trampoline or world interaction boosted player Y upward, convert to smooth vertical velocity
    if (rPos.y > prevY + 0.5 && !this.playerRobot.isInWater) {
      this.playerRobot.velocityY = (rPos.y - prevY) * 3.2;
      rPos.y = prevY + 0.15;
    }
  }

  updateHUDStats() {
    const locEl = document.getElementById('stat-location');
    const emoEl = document.getElementById('stat-emotion');
    const nrgEl = document.getElementById('stat-energy');
    const curEl = document.getElementById('stat-curiosity');
    const nrgBar = document.getElementById('bar-energy');
    const curBar = document.getElementById('bar-curiosity');

    if (locEl && this.vision) locEl.textContent = this.vision.getCurrentLocationName(this.playerRobot.group.position);
    if (emoEl && this.playerRobot.currentEmotion) {
      emoEl.textContent = `${this.playerRobot.currentEmotion.icon} ${this.playerRobot.currentEmotion.name}`;
      emoEl.style.color = this.playerRobot.currentEmotion.cssColor;
    }
    const nrg = Math.round(this.playerRobot.energy || 100);
    const cur = Math.round(this.playerRobot.curiosity || 80);
    const aff = Math.round(this.playerRobot.affection || 88);
    const hyd = Math.round(this.playerRobot.hydration || 90);

    if (nrgEl) nrgEl.textContent = `${nrg}%`;
    if (curEl) curEl.textContent = `${cur}%`;
    if (nrgBar) nrgBar.style.width = `${nrg}%`;
    if (curBar) curBar.style.width = `${cur}%`;

    const affEl = document.getElementById('stat-affection');
    const hydEl = document.getElementById('stat-hydration');
    const affBar = document.getElementById('bar-affection');
    const hydBar = document.getElementById('bar-hydration');

    if (affEl) affEl.textContent = `${aff}%`;
    if (hydEl) hydEl.textContent = `${hyd}%`;
    if (affBar) affBar.style.width = `${aff}%`;
    if (hydBar) hydBar.style.width = `${hyd}%`;
  }

  updateCamera(delta) {
    const target = this.playerRobot.group.position;

    if (this.cameraMode === 'diagonal') {
      this.controls.enabled = true;
      const offset = 14;
      const height = 15;
      const desiredPos = new THREE.Vector3(target.x + offset, target.y + height, target.z + offset);

      this.camera.position.lerp(desiredPos, delta * 5);
      this.controls.target.lerp(new THREE.Vector3(target.x, target.y + 1.2, target.z), delta * 7);
      this.controls.update();
    } else if (this.cameraMode === 'follow') {
      this.controls.enabled = true;
      const rotY = this.playerRobot.group.rotation.y;
      const dist = 7.5;
      const height = 3.6;

      const camX = target.x - Math.sin(rotY) * dist;
      const camZ = target.z - Math.cos(rotY) * dist;
      const camY = target.y + height;

      this.camera.position.lerp(new THREE.Vector3(camX, camY, camZ), delta * 6);
      this.controls.target.lerp(new THREE.Vector3(target.x, target.y + 1.2, target.z), delta * 8);
      this.controls.update();
    } else if (this.cameraMode === 'orbit') {
      this.controls.enabled = true;
      this.controls.target.lerp(new THREE.Vector3(target.x, target.y + 1.2, target.z), delta * 4);
      this.controls.update();
    } else if (this.cameraMode === 'free') {
      this.controls.enabled = true;
      const flySpeed = (this.keys['shift'] ? 48 : 24) * delta;
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const side = new THREE.Vector3();
      side.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      if (this.keys['w'] || this.keys['arrowup']) {
        this.controls.target.addScaledVector(forward, flySpeed);
        this.camera.position.addScaledVector(forward, flySpeed);
      }
      if (this.keys['s'] || this.keys['arrowdown']) {
        this.controls.target.addScaledVector(forward, -flySpeed);
        this.camera.position.addScaledVector(forward, -flySpeed);
      }
      if (this.keys['a'] || this.keys['arrowleft']) {
        this.controls.target.addScaledVector(side, -flySpeed);
        this.camera.position.addScaledVector(side, -flySpeed);
      }
      if (this.keys['d'] || this.keys['arrowright']) {
        this.controls.target.addScaledVector(side, flySpeed);
        this.camera.position.addScaledVector(side, flySpeed);
      }
      if (this.keys['q'] || this.keys['pageup']) {
        this.controls.target.y += flySpeed;
        this.camera.position.y += flySpeed;
      }
      if (this.keys['e'] || this.keys['pagedown']) {
        this.controls.target.y = Math.max(1.0, this.controls.target.y - flySpeed);
        this.camera.position.y = Math.max(1.8, this.camera.position.y - flySpeed);
      }
      this.controls.update();
    } else if (this.cameraMode === 'eye') {
      this.controls.enabled = false;
      this.vision.eyeCamera.updateWorldMatrix(true, false);
      this.vision.eyeCamera.getWorldPosition(this.camera.position);
      this.vision.eyeCamera.getWorldQuaternion(this.camera.quaternion);
    } else if (this.cameraMode === 'drone') {
      this.controls.enabled = false;
      this.droneAngle += delta * 0.35;
      const radius = 18;
      const height = 10;
      const dx = target.x + Math.sin(this.droneAngle) * radius;
      const dz = target.z + Math.cos(this.droneAngle) * radius;

      this.camera.position.set(dx, target.y + height, dz);
      this.camera.lookAt(target.x, target.y + 1.2, target.z);
    }
  }

  renderMinimap(delta = 0.016) {
    if (!this.minimapCtx || !this.minimapCanvas) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    const centerX = w / 2;
    const centerY = h / 2;
    const scale = this.minimapScale || 0.55;
    const pPos = this.playerRobot.group.position;

    this.radarAngle = (this.radarAngle || 0) + delta * 2.2;
    this.pingRadius = ((this.pingRadius || 0) + delta * 28) % 45;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.07)';
    ctx.lineWidth = 1;
    const gridSize = 25;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    [25, 50, 75].forEach(r => {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, r * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.font = '8px monospace';
      ctx.fillText(`${r}m`, centerX + 4, centerY - r * scale + 9);
    });

    ctx.save();
    ctx.translate(centerX, centerY);
    const grad = ctx.createRadialGradient(0, 0, 5, 0, 0, 95);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.3)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 95, this.radarAngle, this.radarAngle + 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Lake of Crystal
    const lakeMapX = centerX + (-80 - pPos.x) * scale;
    const lakeMapY = centerY + (-80 - pPos.z) * scale;
    const lakeRadius = 65 * scale;

    ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
    ctx.beginPath();
    ctx.arc(lakeMapX, lakeMapY, lakeRadius + 6, 0, Math.PI * 2);
    ctx.fill();

    const lakeGrad = ctx.createRadialGradient(lakeMapX, lakeMapY, 4, lakeMapX, lakeMapY, lakeRadius);
    lakeGrad.addColorStop(0, 'rgba(2, 132, 199, 0.65)');
    lakeGrad.addColorStop(1, 'rgba(3, 105, 161, 0.85)');
    ctx.fillStyle = lakeGrad;
    ctx.beginPath();
    ctx.arc(lakeMapX, lakeMapY, lakeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const pierX = centerX + (-44 - pPos.x) * scale;
    const pierY = centerY + (-80 - pPos.z) * scale;
    ctx.fillStyle = '#b45309';
    ctx.fillRect(pierX - 6, pierY - 3, 14, 6);

    const boatX = centerX + (-80 - pPos.x) * scale;
    const boatY = centerY + (-65 - pPos.z) * scale;
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px sans-serif';
    ctx.fillText('⛵', boatX - 5, boatY + 4);

    // Playground Zone
    const playMapX = centerX + (50 - pPos.x) * scale;
    const playMapY = centerY + (40 - pPos.z) * scale;
    const playRadius = 36 * scale;

    ctx.fillStyle = 'rgba(234, 88, 12, 0.14)';
    ctx.beginPath();
    ctx.arc(playMapX, playMapY, playRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.35)';
    ctx.stroke();

    // Soccer Field & Goal
    const goalX = centerX + (25 - pPos.x) * scale;
    const goalY = centerY + (40 - pPos.z) * scale;
    ctx.fillStyle = 'rgba(22, 101, 52, 0.55)';
    ctx.fillRect(goalX - 4, goalY - 14, 30, 28);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(goalX - 4, goalY - 14, 30, 28);
    ctx.beginPath();
    ctx.arc(goalX + 11, goalY, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.fillText('🥅', goalX - 10, goalY + 4);

    // Attractions Icons on Radar
    const drawIcon = (wx, wz, emoji) => {
      const ix = centerX + (wx - pPos.x) * scale;
      const iy = centerY + (wz - pPos.z) * scale;
      ctx.font = '10px sans-serif';
      ctx.fillText(emoji, ix - 5, iy + 4);
    };
    drawIcon(38, 22, '🎪');   // Trampoline
    drawIcon(62, 26, '🎠');   // Carousel
    drawIcon(52, 56, '🪩');   // Disco Pad
    drawIcon(72, 52, '🏠');   // Doghouse
    drawIcon(12, 10, '💧');   // Water Fountain
    drawIcon(-46, -48, '🌉'); // Wooden Bridge
    drawIcon(-32, 48, '🟣');  // Ball Pit
    drawIcon(-18, -32, '🎢'); // Agility Slide
    drawIcon(22, -50, '🌀');  // Obstacle Course
    drawIcon(76, 18, '🎯');   // Target Toss
    drawIcon(-42, 14, '🪅');  // Piñata

    // Soccer Ball & Playground Balls
    if (this.world && this.world.soccerBall) {
      const sbPos = this.world.soccerBall.mesh.position;
      const bx = centerX + (sbPos.x - pPos.x) * scale;
      const by = centerY + (sbPos.z - pPos.z) * scale;
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.fillText('⚽', bx - 5, by + 4);
    }

    if (this.world && this.world.balls) {
      this.world.balls.forEach(b => {
        if (b === this.world.soccerBall) return;
        const bx = centerX + (b.mesh.position.x - pPos.x) * scale;
        const by = centerY + (b.mesh.position.z - pPos.z) * scale;
        ctx.fillStyle = '#00e5ff';
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Snacks
    if (this.world && this.world.snacks) {
      this.world.snacks.forEach(s => {
        const sx = centerX + (s.group.position.x - pPos.x) * scale;
        const sy = centerY + (s.group.position.z - pPos.z) * scale;
        ctx.fillStyle = '#facc15';
        ctx.font = '9px sans-serif';
        ctx.fillText('🍪', sx - 4, sy + 3);
      });
    }

    // Active Waypoint Line & Target Beacon
    if (this.targetWaypoint) {
      const wx = centerX + (this.targetWaypoint.x - pPos.x) * scale;
      const wy = centerY + (this.targetWaypoint.z - pPos.z) * scale;

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(wx, wy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(wx, wy, 8 + Math.sin(this.radarAngle * 4) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText('🎯', wx - 6, wy + 4);
    }

    // Pack Robots
    if (this.packManager && this.packManager.allRobots) {
      Object.values(this.packManager.allRobots).forEach(bot => {
        if (bot === this.playerRobot) return;
        const bx = centerX + (bot.group.position.x - pPos.x) * scale;
        const by = centerY + (bot.group.position.z - pPos.z) * scale;

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(bot.group.rotation.y);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.08)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 16, -0.4, 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        const color = bot.currentEmotion ? bot.currentEmotion.cssColor : '#00e5ff';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 9px Outfit, sans-serif';
        const icon = bot.profile.avatarIcon || '🐾';
        ctx.fillText(`${icon} ${bot.name}`, bx + 7, by + 3);
      });
    }

    // Player Robot
    ctx.strokeStyle = `rgba(34, 255, 136, ${Math.max(0, 1 - this.pingRadius / 45)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, this.pingRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.playerRobot.group.rotation.y);

    ctx.fillStyle = 'rgba(34, 255, 136, 0.15)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 22, -0.45, 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#22ff88';
    ctx.shadowColor = '#22ff88';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.lineTo(7, -7);
    ctx.lineTo(0, -3);
    ctx.lineTo(-7, -7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#22ff88';
    ctx.font = 'bold 10px Outfit, sans-serif';
    ctx.fillText(`★ ${this.playerRobot.name}`, centerX - 18, centerY + 18);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('▲ N', centerX - 8, 12);
    ctx.fillText('S', centerX - 4, h - 5);
    ctx.fillText('W', 5, centerY + 4);
    ctx.fillText('E', w - 12, centerY + 4);
  }

  // Prevents inverted projection when robot is behind camera frustum (screenPos.z > 1)
  updateSpeechBubblePos() {
    const bubble = document.getElementById('world-speech-bubble');
    if (!bubble || bubble.classList.contains('hidden') || !this.playerRobot.nodes.overheadAnchor) return;

    const screenPos = new THREE.Vector3();
    this.playerRobot.nodes.overheadAnchor.getWorldPosition(screenPos);
    screenPos.project(this.camera);

    if (screenPos.z > 1.0) {
      bubble.style.opacity = '0';
      return;
    }
    bubble.style.opacity = '1';

    const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(screenPos.y * 0.5) + 0.5) * window.innerHeight;

    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  animate() {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.1);

    try {
      this.handleManualMovement(delta);
      if (this.brain) this.brain.updateNavigation(delta);

      this.playerRobot.update(delta);
      this.playerRobot.animController.update(delta);

      if (this.waypointBeaconGroup && this.waypointBeaconGroup.visible) {
        this.waypointBeaconGroup.rotation.y += delta * 2.0;
      }

      if (this.starField && this.starField.visible) {
        this.starField.rotation.y += delta * 0.005;
      }

      if (this.packManager) this.packManager.update(delta, this.playerRobot);
      if (this.world) this.world.update(delta);
      if (this.particleSystem) this.particleSystem.update(delta);
      if (this.brain) this.brain.update(delta);

      this.updateCamera(delta);
      this.renderer.render(this.scene, this.camera);

      const pipPanel = document.getElementById('pip-panel');
      if (this.vision && pipPanel && !pipPanel.classList.contains('hidden') && !pipPanel.classList.contains('minimized')) {
        this.vision.renderPIP();
      }

      this.updateHUDStats();

      const minimapPanel = document.getElementById('minimap-panel');
      if (minimapPanel && !minimapPanel.classList.contains('hidden') && !minimapPanel.classList.contains('minimized')) {
        this.renderMinimap(delta);
      }
      this.updateSpeechBubblePos();
    } catch (err) {
      console.error("Render loop notice:", err);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new App();
});