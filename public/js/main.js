// Main Application Coordinator: Zero-Allocation 60FPS Loop, Subsystem Wiring & Full Lifecycle Disposal
import * as THREE from 'three';
import { eventBus } from './core/EventBus.js';
import { appState } from './core/AppState.js';
import { assetCache } from './core/AssetCache.js';
import { TMP, TimerRegistry, damp } from './core/Scratch.js';
import { GfxPipeline } from './gfx_pipeline.js';
import { WorldManager } from './world.js';
import { CameraController } from './camera_controller.js';
import { stepRobotPhysics, resolvePackPushout, WORLD_RADIUS } from './physics.js';
import { EmotionParticleSystem, EMOTIONS } from './emotions.js';
import { RobotPackManager } from './other_robots.js';
import { RobotVisionSystem } from './vision.js';
import { RobotBrain } from './brain_llm.js';
import { roboAudio } from './audio.js';
import { MultiplayerClient } from './multiplayer.js';
import { UiHud } from './ui_hud.js';
import { TouchControls } from './touch_controls.js';

const CAMERA_MODES = ['follow', 'diagonal', 'orbit', 'drone', 'eye', 'free'];
const ROBOT_ORDER = ['Sparky', 'Bolt', 'Pixel', 'Luna', 'Rusty'];
const TELEMETRY_INTERVAL = 0.25;
const MINIMAP_INTERVAL = 0.066;

export class App {
  constructor() {
    this.container = document.getElementById('canvas-container') || document.body;
    this.timer = new THREE.Timer();
    this.timers = new TimerRegistry();
    this.disposed = false;
    this._rafId = null;

    this.elapsedTime = 0;
    this._telemetryTimer = 0;
    this._telemetryFrames = 0;
    this._minimapTimer = 0;
    this._freeWillTimer = 3.0;
    this._jumpQueued = false;

    // Preallocated input & telemetry structs (zero RAF allocation)
    this.keys = Object.create(null);
    this._moveInput = { x: 0, y: 0, z: 0, isRunning: false };
    this._touchVec = new THREE.Vector2();
    this._telemetry = {
      fps: 60,
      frameMs: 16.6,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      heapMB: null
    };
    this._robotStats = {
      name: 'Sparky',
      emotion: null,
      energy: 100,
      curiosity: 85,
      affection: 88,
      hydration: 90,
      location: 'Prado Esmeralda'
    };

    // Preallocated raycasting & grab state
    this._raycaster = new THREE.Raycaster();
    this._pointerNDC = new THREE.Vector2();
    this._pointerHits = [];
    this._planeIntersect = new THREE.Vector3();
    this._dogsList = [];
    this._dogsGroups = [];
    this._unsubs = [];

    this.grabbedRobot = null;
    this._candidateRobot = null;
    this._pointerDownTime = 0;
    this._pointerDownX = 0;
    this._pointerDownY = 0;
    this._lastDragTime = 0;
    this._wasNavigating = false;

    // Cached DOM refs for visibility checks in RAF
    this._pipPanel = document.getElementById('pip-panel');
    this._pipCanvas = document.getElementById('pip-canvas');
    this._minimapPanel = document.getElementById('minimap-panel');

    this._initSubsystems();
    this._initWaypointBeacon();
    this._bindEvents();

    this._animate = this._animate.bind(this);
    this._rafId = requestAnimationFrame(this._animate);
  }

  _initSubsystems() {
    // 1. Graphics Pipeline (Renderer, Scene, Lights, Sky, Fog, PMREM)
    this.gfx = new GfxPipeline(this.container, assetCache, eventBus);

    // 2. Camera & Gimbal-Safe Controller
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.25, 1000);
    this.camera.position.set(16, 15, 16);

    // 3. World Environment & Colliders
    this.world = new WorldManager(this.gfx.scene, assetCache, eventBus);
    this.cameraController = new CameraController(
      this.camera,
      this.gfx.renderer.domElement,
      this.world,
      eventBus
    );
    this.cameraController.setMode(appState.cameraMode || 'diagonal');

    // 4. Pooled Particles & Robot Pack
    this.particles = new EmotionParticleSystem(this.gfx.scene, assetCache);
    this.packManager = new RobotPackManager(this.gfx.scene, this.world, assetCache, eventBus);

    this._rebuildDogCaches();
    this.playerRobot = this.packManager.playerDog || this.packManager.getDog(appState.activeRobotName) || this._dogsList[0];
    if (this.playerRobot) {
      appState.activeRobotName = this.playerRobot.name;
    }

    // 5. Vision & AI Brain
    this.vision = new RobotVisionSystem(this.world, eventBus);
    if (this.playerRobot) {
      this.vision.attachToRobot(this.playerRobot);
    }
    this.brain = new RobotBrain(this.packManager, this.world, this.particles, this.vision, eventBus);

    // 6. Multiplayer, Touch Controls & HUD
    this.multiplayer = new MultiplayerClient(eventBus, appState);
    this.touchControls = new TouchControls(
      this.gfx.renderer.domElement,
      this.cameraController,
      eventBus,
      appState
    );
    this.uiHud = new UiHud(
      eventBus,
      appState,
      this.world,
      this.packManager,
      this.brain,
      this.vision,
      this.multiplayer
    );
  }

  _rebuildDogCaches() {
    this._dogsList.length = 0;
    this._dogsGroups.length = 0;
    const dogs = this.packManager ? this.packManager.dogs : null;
    if (!dogs) return;

    if (Array.isArray(dogs)) {
      for (let i = 0; i < dogs.length; i++) {
        if (dogs[i]) {
          this._dogsList.push(dogs[i]);
          this._dogsGroups.push(dogs[i].group);
        }
      }
    } else if (dogs instanceof Map) {
      for (const dog of dogs.values()) {
        if (dog) {
          this._dogsList.push(dog);
          this._dogsGroups.push(dog.group);
        }
      }
    } else {
      for (const key in dogs) {
        if (Object.prototype.hasOwnProperty.call(dogs, key) && dogs[key]) {
          this._dogsList.push(dogs[key]);
          this._dogsGroups.push(dogs[key].group);
        }
      }
    }
  }

  _initWaypointBeacon() {
    const ringGeo = assetCache.getGeometry('waypoint_ring', () => {
      const g = new THREE.RingGeometry(0.9, 1.25, 24);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    const ringMat = assetCache.getMaterial('waypoint_ring_mat', () => new THREE.MeshBasicMaterial({
      color: 0x22ff88,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    }));
    const beamGeo = assetCache.getGeometry('waypoint_beam', () => new THREE.CylinderGeometry(0.85, 0.85, 4.2, 16, 1, true));
    const beamMat = assetCache.getMaterial('waypoint_beam_mat', () => new THREE.MeshBasicMaterial({
      color: 0x22ff88,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    }));

    this.waypointBeacon = new THREE.Group();
    this.waypointBeacon.visible = false;

    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.12;
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 2.1;
    this.waypointBeacon.add(ring, beam);
    this.gfx.scene.add(this.waypointBeacon);
  }

  _bindEvents() {
    this._onResize = () => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.gfx.resize(w, h);
    };
    window.addEventListener('resize', this._onResize);

    this._onKeyDown = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      this.keys[key] = true;
      roboAudio.init();

      if (e.key === ' ') {
        e.preventDefault();
        this._jumpQueued = true;
      } else if (key === 'p') {
        this._petActiveRobot();
      } else if (key === 'b') {
        this._barkActiveRobot();
      } else if (key === 'f') {
        if (this.playerRobot && this.playerRobot.animController) {
          this.playerRobot.animController.play('backflip', 1.6);
          eventBus.emit('camera:trauma', { amount: 0.15 });
        }
      } else if (key === 'g') {
        this.throwFetchBall();
      } else if (key === 't') {
        if (this.playerRobot && this.playerRobot.animController) {
          this.playerRobot.animController.play('headTilt', 2.0);
        }
      } else if (key === 'l') {
        const nextMode = this.cameraController.mode === 'free' ? 'diagonal' : 'free';
        this.setCameraMode(nextMode);
      } else if (key === 'c') {
        this.cycleCameraMode();
      } else if (key === 'h') {
        this.toggleZenMode();
      } else if (key === 'tab') {
        e.preventDefault();
        const curIdx = ROBOT_ORDER.indexOf(appState.activeRobotName);
        const nextName = ROBOT_ORDER[(curIdx + 1) % ROBOT_ORDER.length];
        this.switchToRobot(nextName);
      }
    };
    window.addEventListener('keydown', this._onKeyDown);

    this._onKeyUp = (e) => {
      this.keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keyup', this._onKeyUp);

    this._onBlur = () => {
      for (const k in this.keys) {
        this.keys[k] = false;
      }
      this._jumpQueued = false;
    };
    window.addEventListener('blur', this._onBlur);

    // Canvas Pointer Raycasting (Pet / Switch / Hand-Tool Grab)
    const dom = this.gfx.renderer.domElement;

    this._onPointerDown = (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const rect = dom.getBoundingClientRect();
      this._pointerNDC.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      this._pointerNDC.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

      this._raycaster.setFromCamera(this._pointerNDC, this.camera);
      this._pointerDownTime = performance.now();
      this._pointerDownX = e.clientX;
      this._pointerDownY = e.clientY;
      this._candidateRobot = null;

      this._pointerHits.length = 0;
      this._raycaster.intersectObjects(this._dogsGroups, true, this._pointerHits);
      if (this._pointerHits.length > 0) {
        let obj = this._pointerHits[0].object;
        while (obj && obj.parent && !obj.name.startsWith('ChibiRobot_')) {
          obj = obj.parent;
        }
        if (obj && obj.name.startsWith('ChibiRobot_')) {
          const botName = obj.name.slice('ChibiRobot_'.length);
          this._candidateRobot = this.packManager.getDog(botName);
          if (appState.isHandToolActive && this._candidateRobot) {
            this._grabRobot(this._candidateRobot);
          }
        }
      }
    };

    this._onPointerMove = (e) => {
      if (!this._candidateRobot && !this.grabbedRobot) return;

      if (this._candidateRobot && !this.grabbedRobot) {
        const dtMs = performance.now() - this._pointerDownTime;
        const distPx = Math.hypot(e.clientX - this._pointerDownX, e.clientY - this._pointerDownY);
        if (dtMs > 130 && distPx > 6) {
          this._grabRobot(this._candidateRobot);
        }
      }

      if (this.grabbedRobot) {
        const rect = dom.getBoundingClientRect();
        this._pointerNDC.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        this._pointerNDC.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

        this._raycaster.setFromCamera(this._pointerNDC, this.camera);
        const pos = this.grabbedRobot.group.position;
        const groundY = this.world.getHeightAt(pos.x, pos.z);
        const targetH = groundY + 2.4;

        TMP.plane.set(TMP.v1.set(0, 1, 0), -targetH);
        if (this._raycaster.ray.intersectPlane(TMP.plane, this._planeIntersect)) {
          const maxR = WORLD_RADIUS - 4;
          const distSq = this._planeIntersect.x * this._planeIntersect.x + this._planeIntersect.z * this._planeIntersect.z;
          if (distSq > maxR * maxR) {
            const s = maxR / Math.sqrt(distSq);
            this._planeIntersect.x *= s;
            this._planeIntersect.z *= s;
          }
          const now = performance.now();
          const dragDt = this._lastDragTime > 0
            ? Math.min(0.05, Math.max(0.001, (now - this._lastDragTime) * 0.001))
            : 0.016;
          this._lastDragTime = now;
          pos.x = damp(pos.x, this._planeIntersect.x, 18.0, dragDt);
          pos.z = damp(pos.z, this._planeIntersect.z, 18.0, dragDt);
          pos.y = targetH;
        }
      }
    };

    this._onPointerUp = () => {
      if (this.grabbedRobot) {
        this._releaseGrabbedRobot();
        this._candidateRobot = null;
        return;
      }

      if (this._candidateRobot && (performance.now() - this._pointerDownTime) < 260) {
        if (this._candidateRobot === this.playerRobot) {
          this._petActiveRobot();
        } else {
          this.switchToRobot(this._candidateRobot.name);
        }
      }
      this._candidateRobot = null;
    };

    dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

    // EventBus Command Dispatch
    this._unsubs.push(
      eventBus.on('input:action', (payload) => this._handleInputAction(payload)),
      eventBus.on('world:timeChanged', ({ timeOfDay }) => {
        if (timeOfDay) {
          appState.timeOfDay = timeOfDay;
          this.gfx.setTimeOfDay(timeOfDay);
        }
      }),
      eventBus.on('world:weatherChanged', ({ mode }) => {
        if (mode !== undefined) {
          appState.weatherMode = mode;
          this.gfx.setWeatherMode(mode);
        }
      }),
      eventBus.on('world:visionChanged', ({ mode }) => {
        if (mode !== undefined) {
          appState.visionMode = mode;
          this.gfx.setVisionMode(mode);
        }
      }),
      eventBus.on('app:dispose', () => this.dispose())
    );
  }

  _handleInputAction(payload) {
    if (!payload) return;
    const { action, payload: data } = payload;

    switch (action) {
      case 'jump':
        this._jumpQueued = true;
        break;
      case 'bark':
        this._barkActiveRobot();
        break;
      case 'pet':
        this._petActiveRobot();
        break;
      case 'praise':
        if (this.playerRobot && this.playerRobot.praise) {
          this.playerRobot.praise();
          this.particles.spawnBurst(this.playerRobot.group.position, 'LOVING');
        }
        break;
      case 'throwBall':
        this.throwFetchBall();
        break;
      case 'spawnSnack':
        this._spawnSnackAhead();
        break;
      case 'disco':
        this.world.triggerDiscoParty();
        break;
      case 'switchRobot':
        if (data && data.name) this.switchToRobot(data.name);
        break;
      case 'setCamera':
        if (data && data.mode) this.setCameraMode(data.mode);
        break;
      case 'cycleCamera':
        this.cycleCameraMode();
        break;
      case 'toggleHandTool':
        appState.isHandToolActive = !appState.isHandToolActive;
        eventBus.emit('ui:toast', {
          message: appState.isHandToolActive
            ? '✋ Modo Mano Activo: Arrastra a cualquier robot'
            : '✋ Modo Mano Desactivado',
          durationMs: 2200
        });
        break;
      case 'toggleZen':
        this.toggleZenMode();
        break;
      case 'toggleFreeWill':
        appState.isFreeWill = !appState.isFreeWill;
        break;
      case 'setTimeOfDay':
        if (data && data.timeOfDay) {
          appState.timeOfDay = data.timeOfDay;
          this.gfx.setTimeOfDay(data.timeOfDay);
          eventBus.emit('world:timeChanged', { timeOfDay: data.timeOfDay });
        }
        break;
      case 'setWeatherMode':
        if (data && data.mode !== undefined) {
          appState.weatherMode = data.mode;
          this.gfx.setWeatherMode(data.mode);
          eventBus.emit('world:weatherChanged', { mode: data.mode });
        }
        break;
      case 'setVisionMode':
        if (data && data.mode !== undefined) {
          appState.visionMode = data.mode;
          this.gfx.setVisionMode(data.mode);
          eventBus.emit('world:visionChanged', { mode: data.mode });
        }
        break;
      case 'setEmotion':
        if (data && data.emotionKey && EMOTIONS[data.emotionKey] && this.playerRobot) {
          this.playerRobot.setEmotion(EMOTIONS[data.emotionKey]);
          this.particles.spawnBurst(this.playerRobot.group.position, data.emotionKey);
        }
        break;
      case 'playAnim':
        if (data && data.anim && this.playerRobot && this.playerRobot.animController) {
          if (data.anim === 'jump') {
            this._jumpQueued = true;
          } else {
            this.playerRobot.animController.play(data.anim, data.duration || 2.2);
          }
        }
        break;
      case 'navigateTo':
        if (data && typeof data.x === 'number' && typeof data.z === 'number') {
          const y = this.world.getHeightAt(data.x, data.z);
          appState.navigation.active = true;
          appState.navigation.target = { x: data.x, y, z: data.z };
          appState.navigation.mode = 'waypoint';
          if (this.waypointBeacon) {
            this.waypointBeacon.position.set(data.x, y, data.z);
            this.waypointBeacon.visible = true;
          }
          if (this.brain && this.brain.handleUserCommand) {
            this.brain.handleUserCommand(`ve a (${Math.round(data.x)}, ${Math.round(data.z)})`, appState.activeRobotName);
          }
        }
        break;
      case 'cancelNavigation':
        appState.navigation.active = false;
        appState.navigation.target = null;
        if (this.waypointBeacon) this.waypointBeacon.visible = false;
        break;
      default:
        break;
    }
  }

  _petActiveRobot() {
    if (!this.playerRobot) return;
    if (this.playerRobot.setEmotion) this.playerRobot.setEmotion(EMOTIONS.LOVING);
    if (this.playerRobot.praise) this.playerRobot.praise();
    this.particles.spawnBurst(this.playerRobot.group.position, 'LOVING');
    eventBus.emit('haptic:pulse', { pattern: 15 });
    eventBus.emit('world:activity', { text: `💖 ¡Acariciaste a ${this.playerRobot.name}!`, level: 'info' });
  }

  _barkActiveRobot() {
    if (!this.playerRobot) return;
    if (this.playerRobot.bark) this.playerRobot.bark();
    else if (this.playerRobot.animController) this.playerRobot.animController.play('bark', 1.0);
    const pitch = this.playerRobot.profile ? this.playerRobot.profile.voicePitch : 1.0;
    roboAudio.playBark(pitch);
    eventBus.emit('haptic:pulse', { pattern: 10 });
  }

  _spawnSnackAhead() {
    if (!this.playerRobot) return;
    const rotY = this.playerRobot.group.rotation.y;
    TMP.v1.copy(this.playerRobot.group.position);
    TMP.v1.x += Math.sin(rotY) * 2.0;
    TMP.v1.z += Math.cos(rotY) * 2.0;
    this.world.spawnCyberSnack(TMP.v1);
  }

  throwFetchBall() {
    if (!this.playerRobot) return;
    const balls = this.world.balls;
    if (!balls || balls.length === 0) return;

    const rPos = this.playerRobot.group.position;
    const rotY = this.playerRobot.group.rotation.y;
    TMP.v1.set(Math.sin(rotY), 0.25, Math.cos(rotY)).normalize();

    const ball = balls[0];
    if (ball && ball.mesh) {
      ball.mesh.position.set(rPos.x + TMP.v1.x * 1.4, rPos.y + 0.7, rPos.z + TMP.v1.z * 1.4);
      this.world.kickBall(ball, TMP.v1, 22);
      eventBus.emit('camera:trauma', { amount: 0.14 });
      eventBus.emit('haptic:pulse', { pattern: 15 });
    }

    this.timers.setTimeout(() => {
      if (!this.disposed && this.brain && this.brain.handleUserCommand) {
        this.brain.handleUserCommand('busca la pelota', this.playerRobot.name);
      }
    }, 400);
  }

  switchToRobot(name) {
    const prevName = appState.activeRobotName;
    if (this.packManager && this.packManager.setPlayerDog) {
      this.packManager.setPlayerDog(name);
    }
    const nextDog = this.packManager.getDog(name) || this.packManager.playerDog;
    if (!nextDog) return;

    this.playerRobot = nextDog;
    appState.activeRobotName = nextDog.name;
    appState.navigation.active = false;
    appState.navigation.target = null;
    if (this.waypointBeacon) this.waypointBeacon.visible = false;

    this.vision.attachToRobot(nextDog);
    eventBus.emit('robot:switched', {
      robot: nextDog,
      name: nextDog.name,
      previousName: prevName
    });
    eventBus.emit('haptic:pulse', { pattern: 15 });
  }

  setCameraMode(mode) {
    appState.cameraMode = mode;
    this.cameraController.setMode(mode);
  }

  cycleCameraMode() {
    const idx = CAMERA_MODES.indexOf(this.cameraController.mode);
    const next = CAMERA_MODES[(idx + 1) % CAMERA_MODES.length];
    this.setCameraMode(next);
  }

  toggleZenMode() {
    appState.isZenMode = !appState.isZenMode;
    const hud = document.getElementById('hud-overlay');
    if (hud) hud.classList.toggle('zen-mode', appState.isZenMode);
    const exitBtn = document.getElementById('btn-exit-zen');
    if (exitBtn) exitBtn.classList.toggle('hidden', !appState.isZenMode);
  }

  _grabRobot(robot) {
    if (!robot || this.grabbedRobot) return;
    this.grabbedRobot = robot;
    robot.isPickedUp = true;
    if (robot.physics) {
      robot.physics.velocity.set(0, 0, 0);
      robot.physics.isGrounded = false;
    }
    this.cameraController.setPointerDragEnabled(false);
    if (robot.animController) robot.animController.play('pickedUp');
    document.body.classList.add('is-grabbing');
    roboAudio.init();
    this.particles.spawnBurst(robot.group.position, 'EXCITED');
    eventBus.emit('haptic:pulse', { pattern: 18 });
  }

  _releaseGrabbedRobot() {
    if (!this.grabbedRobot) return;
    const released = this.grabbedRobot;
    this.grabbedRobot = null;
    released.isPickedUp = false;
    if (released.physics) {
      released.physics.velocity.set(0, -2.5, 0);
      released.physics.isGrounded = false;
    }
    this.cameraController.setPointerDragEnabled(true);
    document.body.classList.remove('is-grabbing');
  }

  _gatherInput(dt) {
    let rawX = 0;
    let rawZ = 0;
    let rawY = 0;
    let isRunning = !!this.keys['shift'];

    if (this.touchControls) {
      this.touchControls.getMoveVector(this._touchVec);
      if (Math.abs(this._touchVec.x) > 0.01 || Math.abs(this._touchVec.y) > 0.01) {
        rawX = this._touchVec.x;
        rawZ = this._touchVec.y;
      }
      if (this.touchControls.isRunning()) isRunning = true;
    }

    if (rawX === 0 && rawZ === 0) {
      if (this.keys['w'] || this.keys['arrowup']) rawZ -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) rawZ += 1;
      if (this.keys['a'] || this.keys['arrowleft']) rawX -= 1;
      if (this.keys['d'] || this.keys['arrowright']) rawX += 1;
    }

    if (this.keys['q'] || this.keys['pageup']) rawY += 1;
    if (this.keys['e'] || this.keys['pagedown']) rawY -= 1;

    this._moveInput.x = rawX;
    this._moveInput.y = rawY;
    this._moveInput.z = rawZ;
    this._moveInput.isRunning = isRunning;

    // In free-fly camera mode, movement input drives camera only (not player robot)
    if (this.cameraController.mode === 'free') {
      this._jumpQueued = false;
      return;
    }

    if (!this.playerRobot) return;

    const hasInput = Math.abs(rawX) > 0.02 || Math.abs(rawZ) > 0.02;
    if (hasInput && this.brain && this.brain.isNavigating) {
      this._handleInputAction({ action: 'cancelNavigation' });
    }

    // Transform screen-space input (X right, Z down/back) into camera-relative world XZ
    let worldMoveX = 0;
    let worldMoveZ = 0;
    if (hasInput) {
      this.cameraController.getGroundForwardRight(TMP.v1, TMP.v2);
      const fwdAmt = -rawZ;
      const rightAmt = rawX;
      worldMoveX = TMP.v1.x * fwdAmt + TMP.v2.x * rightAmt;
      worldMoveZ = TMP.v1.z * fwdAmt + TMP.v2.z * rightAmt;
    }

    const jumpNow = this._jumpQueued;
    this._jumpQueued = false;
    if (jumpNow) {
      roboAudio.playJump();
    }

    // When brain is actively navigating player dog, brain drives target steering; physics still handles gravity/collisions
    if (!this.brain || !this.brain.isNavigating) {
      stepRobotPhysics(
        this.playerRobot,
        worldMoveX,
        worldMoveZ,
        isRunning,
        jumpNow,
        this.world,
        dt,
        eventBus
      );

      if (this.playerRobot.animController && this.playerRobot.animController.syncLocomotion) {
        const spd = this.playerRobot.physics ? this.playerRobot.physics.speedScalar : 0;
        this.playerRobot.animController.syncLocomotion(spd, hasInput);
      }
    }

    if (hasInput) {
      this._freeWillTimer = 3.0;
    } else if (appState.isFreeWill && (!this.brain || !this.brain.isNavigating)) {
      this._freeWillTimer -= dt;
      if (this._freeWillTimer <= 0) {
        this._freeWillTimer = 4.5 + Math.random() * 4.5;
        if (this.brain && this.brain.triggerFreeWillThought) {
          this.brain.triggerFreeWillThought();
        }
      }
    }

    // World interactions (trampoline, lake, fountain, seesaw, snacks, balls)
    this.world.handleRobotInteractions(this.playerRobot, this.playerRobot.animController, dt);
  }

  _animate() {
    if (this.disposed) return;
    this._rafId = requestAnimationFrame(this._animate);

    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsedTime += dt;

    try {
      this._gatherInput(dt);

      if (this.brain) {
        this.brain.updateNavigation(dt);
        if (this._wasNavigating && !this.brain.isNavigating) {
          appState.navigation.active = false;
          appState.navigation.target = null;
          if (this.waypointBeacon) this.waypointBeacon.visible = false;
        }
        this._wasNavigating = !!this.brain.isNavigating;
      }

      if (this.playerRobot) {
        this.playerRobot.update(dt);
        if (this.playerRobot.animController) {
          this.playerRobot.animController.update(dt);
        }
      }

      if (this.packManager) {
        this.packManager.update(dt);
      }

      resolvePackPushout(this._dogsList, this.world);

      if (this.world) {
        this.world.update(dt, this.elapsedTime);
      }
      if (this.particles) {
        this.particles.update(dt);
      }
      if (this.vision && this.playerRobot) {
        this.vision.update(dt, this.playerRobot);
      }
      if (this.gfx && this.playerRobot) {
        this.gfx.update(dt, this.playerRobot.group.position, this.elapsedTime);
      }

      if (this.waypointBeacon && this.waypointBeacon.visible) {
        this.waypointBeacon.rotation.y += dt * 2.0;
        if (!appState.navigation.active) {
          this.waypointBeacon.visible = false;
        }
      }

      // Camera update & main render
      this.cameraController.update(
        dt,
        this.playerRobot,
        this._moveInput,
        this.vision ? this.vision.eyeCamera : null
      );
      this.gfx.render(this.camera);

      // Eye PIP render when visible
      if (
        this.vision &&
        this._pipPanel &&
        this._pipCanvas &&
        !this._pipPanel.classList.contains('hidden') &&
        !this._pipPanel.classList.contains('minimized')
      ) {
        this.vision.renderPIP(this.gfx, this._pipCanvas);
      }

      // Speech bubble GPU transform sync
      if (this.uiHud && this.playerRobot) {
        this.uiHud.updateSpeechBubble(this.playerRobot, this.camera);
      }

      // Throttled Minimap (~15 Hz)
      this._minimapTimer += dt;
      if (this._minimapTimer >= MINIMAP_INTERVAL) {
        this._minimapTimer = 0;
        if (
          this.uiHud &&
          this._minimapPanel &&
          !this._minimapPanel.classList.contains('hidden') &&
          !this._minimapPanel.classList.contains('minimized')
        ) {
          this.uiHud.updateMinimap(this.playerRobot, this._dogsList);
        }
      }

      // Throttled Telemetry (4 Hz)
      this._telemetryTimer += dt;
      this._telemetryFrames++;
      if (this._telemetryTimer >= TELEMETRY_INTERVAL) {
        const windowSec = this._telemetryTimer;
        const fps = Math.round(this._telemetryFrames / windowSec);
        const frameMs = Number(((windowSec / Math.max(1, this._telemetryFrames)) * 1000).toFixed(1));

        this._telemetry.fps = fps;
        this._telemetry.frameMs = frameMs;
        this.gfx.getTelemetry(this._telemetry);
        this._telemetry.heapMB = performance && performance.memory
          ? Math.round(performance.memory.usedJSHeapSize / 1048576)
          : null;

        appState.telemetry.fps = fps;
        appState.telemetry.frameMs = frameMs;
        appState.telemetry.drawCalls = this._telemetry.drawCalls;
        appState.telemetry.triangles = this._telemetry.triangles;
        appState.telemetry.geometries = this._telemetry.geometries;
        appState.telemetry.textures = this._telemetry.textures;

        eventBus.emit('telemetry:frame', this._telemetry);
        if (this.uiHud) {
          this.uiHud.updateTelemetry(this._telemetry);
        }

        if (this.playerRobot) {
          this._robotStats.name = this.playerRobot.name;
          this._robotStats.emotion = this.playerRobot.currentEmotion || null;
          this._robotStats.energy = this.playerRobot.energy ?? 100;
          this._robotStats.curiosity = this.playerRobot.curiosity ?? 85;
          this._robotStats.affection = this.playerRobot.affection ?? 88;
          this._robotStats.hydration = this.playerRobot.hydration ?? 90;
          this._robotStats.location = this.vision
            ? this.vision.getCurrentLocationName(this.playerRobot.group.position)
            : 'Prado Esmeralda';
          eventBus.emit('robot:stats', this._robotStats);
        }

        this._telemetryTimer = 0;
        this._telemetryFrames = 0;
      }
    } catch (err) {
      console.error('[App] RAF error:', err);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this.timers.clearAll();
    this.timer?.dispose?.();

    for (let i = 0; i < this._unsubs.length; i++) {
      this._unsubs[i]();
    }
    this._unsubs.length = 0;

    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);

    if (this.gfx && this.gfx.renderer && this.gfx.renderer.domElement) {
      this.gfx.renderer.domElement.removeEventListener('pointerdown', this._onPointerDown);
    }

    this.cameraController?.dispose();
    this.uiHud?.dispose();
    this.touchControls?.dispose();
    this.brain?.dispose();
    this.vision?.dispose();
    this.packManager?.dispose();
    this.particles?.dispose();
    this.world?.dispose();
    this.multiplayer?.dispose();
    roboAudio?.dispose?.();
    this.gfx?.dispose();
    assetCache.disposeAll();
    eventBus.clear();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__roboApp = new App();
});
