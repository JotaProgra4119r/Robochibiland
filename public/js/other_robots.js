// Pack Manager with Formal 5-State FSM (PATROL/ALERT/CHASE/ACTION/RECOVER), 3-Whisker Steering & Zero-Alloc Loop
import * as THREE from 'three';
import { ChibiRobotDog } from './robot.js';
import { AnimationController } from './animations.js';
import { EMOTIONS } from './emotions.js';
import { roboAudio } from './audio.js';
import { TMP, damp, dampAngle, wrapAngle } from './core/Scratch.js';

export const AI_STATES = {
  PATROL: 'PATROL',
  ALERT: 'ALERT',
  CHASE: 'CHASE',
  ACTION: 'ACTION',
  RECOVER: 'RECOVER'
};

const WORLD_LIMIT = 190;
const LAKE_CX = -80;
const LAKE_CZ = -80;
const LAKE_AVOID_R = 60.5;

const PATROL_WAYPOINTS = [
  { x: -32, z: 48, sub: 'ballpit' },
  { x: -18, z: -32, sub: 'slide' },
  { x: 22, z: -50, sub: 'tunnel' },
  { x: 38, z: 22, sub: 'trampoline' },
  { x: 50, z: 40, sub: 'playground' },
  { x: 12, z: 10, sub: 'fountain' },
  { x: 76, z: 18, sub: 'target' },
  { x: -42, z: 14, sub: 'pinata' }
];

const RACE_DESTINATIONS = [
  { name: 'la Portería de Fútbol', x: 25, z: 40 },
  { name: 'el Muelle del Lago', x: -44, z: -75 },
  { name: 'la Piscina de Pelotas', x: -32, z: 48 }
];

const GREETINGS = {
  Bolt: '⚡ Bolt: "¡Hola {player}! ¿Listo para una carrera hacia la portería?"',
  Pixel: '🔍 Pixel: "He sincronizado mis sensores contigo, {player}."',
  Luna: '💖 Luna: "¡Qué lindo verte, {player}! Te mando mimos cibernéticos."',
  Rusty: '🤸 Rusty: "¡Mírame, {player}! ¡Mira qué truco acabo de inventar!"',
  Sparky: '🐾 Sparky: "¡Hola compañero! El día está perfecto para explorar juntos."'
};

const SOCIAL_EMOTIONS = [EMOTIONS.HAPPY, EMOTIONS.LOVING, EMOTIONS.EXCITED, EMOTIONS.PROUD];
const SOCIAL_MOVES = ['wave', 'wagTail', 'bark', 'spin', 'dance'];
const TRICKS = ['sniff', 'sit', 'wagTail', 'bark', 'spin', 'backflip', 'dance'];

// Pre-allocated 3-sensor feeler angles (center 0, left +32°, right -32°)
const WHISKER_ANGLES = [0, 0.56, -0.56];
const WHISKER_LENGTHS = [3.2, 2.4, 2.4];
const RECOVER_ANGLES = [0.78, -0.78, 1.57, -1.57, 2.35, -2.35];

export class RobotPackManager {
  constructor(scene, world, assetCache = null, eventBus = null, onActivityCallback = null) {
    this.scene = scene;
    this.world = world;
    this.assetCache = assetCache;
    this.eventBus = eventBus;
    this.onActivity = onActivityCallback;

    // Support legacy 3-arg signature (scene, world, onActivityCallback)
    if (typeof assetCache === 'function') {
      this.onActivity = assetCache;
      this.assetCache = null;
      this.eventBus = null;
    }

    this.dogs = {};
    this.allRobots = this.dogs;
    this.dogList = [];
    this.pack = [];
    this.playerDog = null;
    this.currentControlledRobot = null;

    // Reusable buffers for zero-alloc queries
    this._obsBuffer = [];
    this._steerOut = new THREE.Vector3();
    this._rawDir = new THREE.Vector3();
    this._feelerProbe = new THREE.Vector3();
    this._repelSum = new THREE.Vector3();
    this.disposed = false;

    this.spawnCompletePack();
  }

  logActivity(message) {
    if (this.onActivity) {
      this.onActivity(message);
    }
    if (this.eventBus) {
      this.eventBus.emit('world:activity', { text: message, level: 'info' });
    }
  }

  getDog(name) {
    return this.dogs[name] || null;
  }

  spawnCompletePack() {
    const configs = [
      { name: 'Sparky', x: 32, z: 32 },
      { name: 'Bolt', x: 46, z: 36 },
      { name: 'Pixel', x: -45, z: -60 },
      { name: 'Luna', x: 18, z: -15 },
      { name: 'Rusty', x: 55, z: 48 }
    ];

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const isInitialPlayer = cfg.name === 'Sparky';
      const dog = new ChibiRobotDog(cfg.name, isInitialPlayer, this.assetCache);
      dog.animController = new AnimationController(dog, this.eventBus);

      const gy = this.world ? this.world.getHeightAt(cfg.x, cfg.z) : 0;
      dog.group.position.set(cfg.x, gy, cfg.z);
      dog.lastPosition.set(cfg.x, gy, cfg.z);
      dog.physics.velocityY = 0;
      dog.physics.groundY = gy;

      this.scene.add(dog.group);
      this.dogs[cfg.name] = dog;
      this.dogList.push(dog);

      dog.aiState = {
        state: AI_STATES.PATROL,
        subAction: 'wander',
        targetPos: new THREE.Vector3(cfg.x, gy, cfg.z),
        targetBall: null,
        targetSnack: null,
        targetDog: null,
        pendingState: null,
        pendingSubAction: null,
        stateTimer: 2 + Math.random() * 3,
        stateElapsed: 0,
        desiredSpeed: 3.4 * (dog.profile.speedMultiplier || 1.0),
        playerGreetCooldown: 0,
        dogGreetCooldown: 0,
        alertCooldown: 0,
        tagRole: null,
        tagTarget: null,
        stuckTimer: 0,
        recoverDir: new THREE.Vector3(1, 0, 0),
        lastPos: new THREE.Vector3(cfg.x, gy, cfg.z)
      };

      if (!isInitialPlayer) {
        this.pack.push(dog);
        this.pickNewPatrolTarget(dog);
      } else {
        this.playerDog = dog;
        this.currentControlledRobot = dog;
      }
    }
  }

  setPlayerDog(name) {
    return this.switchToRobot(name);
  }

  switchToRobot(name) {
    const targetRobot = this.dogs[name];
    if (!targetRobot) return null;
    if (this.playerDog === targetRobot) return targetRobot;

    const prevName = this.playerDog ? this.playerDog.name : null;

    if (this.playerDog) {
      const oldPlayer = this.playerDog;
      oldPlayer.setAsPlayer(false);
      oldPlayer.clearLookTarget();
      oldPlayer.aiState.playerGreetCooldown = 6.0;
      if (this.pack.indexOf(oldPlayer) === -1) {
        this.pack.push(oldPlayer);
      }
      this.pickNewPatrolTarget(oldPlayer);
    }

    targetRobot.setAsPlayer(true);
    targetRobot.clearLookTarget();
    this.playerDog = targetRobot;
    this.currentControlledRobot = targetRobot;

    const idx = this.pack.indexOf(targetRobot);
    if (idx !== -1) {
      this.pack.splice(idx, 1);
    }

    this.logActivity(`🎮 ¡Has tomado el control de ${targetRobot.name} (${targetRobot.profile.title})!`);
    roboAudio.playBoop(targetRobot.profile.voicePitch || 1.0);
    if (this.eventBus) {
      this.eventBus.emit('robot:switched', {
        robot: targetRobot,
        name: targetRobot.name,
        previousName: prevName
      });
    }
    return targetRobot;
  }

  transitionTo(dog, nextState, subAction = 'wander', timer = 5.0) {
    const ai = dog.aiState;
    // Exit old state cleanup
    if (ai.state === AI_STATES.ALERT || ai.state === AI_STATES.ACTION) {
      dog.clearLookTarget();
    }

    ai.state = nextState;
    ai.subAction = subAction;
    ai.stateTimer = timer;
    ai.stateElapsed = 0;
    ai.stuckTimer = 0;

    if (nextState === AI_STATES.PATROL) {
      dog.animController.play(ai.desiredSpeed > 4.8 ? 'run' : 'walk');
    } else if (nextState === AI_STATES.ALERT) {
      ai.desiredSpeed = 0;
      dog.animController.syncLocomotion(0, false);
      dog.animController.play('patrolLook', timer);
    } else if (nextState === AI_STATES.CHASE) {
      dog.animController.play('run');
    } else if (nextState === AI_STATES.RECOVER) {
      ai.desiredSpeed = 3.2 * (dog.profile.speedMultiplier || 1.0);
      dog.setEmotion(EMOTIONS.CONFUSED, true);
      dog.animController.play('walk');
    }
  }

  _sanitizeGoal(vec) {
    // Keep patrol/flee destinations out of lake water and inside safe world perimeter
    const dx = vec.x - LAKE_CX;
    const dz = vec.z - LAKE_CZ;
    const dLake = Math.hypot(dx, dz);
    if (dLake < LAKE_AVOID_R) {
      const nx = dLake > 0.01 ? dx / dLake : 1;
      const nz = dLake > 0.01 ? dz / dLake : 0;
      vec.x = LAKE_CX + nx * (LAKE_AVOID_R + 3.0);
      vec.z = LAKE_CZ + nz * (LAKE_AVOID_R + 3.0);
    }
    const r = Math.hypot(vec.x, vec.z);
    if (r > WORLD_LIMIT - 8) {
      const s = (WORLD_LIMIT - 8) / r;
      vec.x *= s;
      vec.z *= s;
    }
  }

  callPackToPlayer(playerRobot = this.playerDog) {
    if (!playerRobot) return;
    const pPos = playerRobot.group.position;
    const pRotY = playerRobot.group.rotation.y;

    this.logActivity('📣 ¡La manada escuchó tu llamado y se reúne a tu alrededor!');
    roboAudio.playHappyJingle();

    const count = this.pack.length;
    for (let i = 0; i < count; i++) {
      const dog = this.pack[i];
      const ai = dog.aiState;
      const angle = pRotY + (i - (count - 1) / 2) * 0.55;
      ai.targetPos.set(pPos.x + Math.sin(angle) * 3.6, 0, pPos.z + Math.cos(angle) * 3.6);
      this._sanitizeGoal(ai.targetPos);
      ai.desiredSpeed = 6.0 * (dog.profile.speedMultiplier || 1.0);
      this.transitionTo(dog, AI_STATES.CHASE, 'assemble', 9.0);
    }
  }

  startTagGame(initiator) {
    if (this.pack.length < 2) return;
    let chaserDog = (initiator && this.pack.indexOf(initiator) !== -1) ? initiator : this.pack[0];
    let preyDog = null;
    for (let i = 0; i < this.pack.length; i++) {
      if (this.pack[i] !== chaserDog) {
        preyDog = this.pack[i];
        break;
      }
    }
    if (!chaserDog || !preyDog) return;

    this.logActivity(`🏃 ¡Comienza el juego de "La Traes"! ¡${chaserDog.name} persigue a ${preyDog.name}!`);
    roboAudio.playYip(1.4);

    chaserDog.aiState.tagRole = 'CHASER';
    chaserDog.aiState.tagTarget = preyDog;
    chaserDog.aiState.desiredSpeed = 6.8 * (chaserDog.profile.speedMultiplier || 1.0);
    this.transitionTo(chaserDog, AI_STATES.CHASE, 'play_tag', 16.0);

    preyDog.aiState.tagRole = 'PREY';
    preyDog.aiState.tagTarget = chaserDog;
    preyDog.aiState.desiredSpeed = 6.6 * (preyDog.profile.speedMultiplier || 1.0);
    this.transitionTo(preyDog, AI_STATES.CHASE, 'play_tag', 16.0);
  }

  startSpeedRace() {
    const dest = RACE_DESTINATIONS[Math.floor(Math.random() * RACE_DESTINATIONS.length)];
    const count = Math.min(3, this.pack.length);

    this.logActivity(`🏁 ¡RETO DE VELOCIDAD hacia ${dest.name}! ¡3... 2... 1... ¡¡YA!! 🐕⚡`);
    roboAudio.playBark(1.2);

    for (let i = 0; i < count; i++) {
      const r = this.pack[i];
      r.aiState.targetPos.set(dest.x + (i - 1) * 1.6, 0, dest.z);
      r.aiState.desiredSpeed = (6.0 + Math.random() * 2.0) * (r.profile.speedMultiplier || 1.0);
      this.transitionTo(r, AI_STATES.CHASE, 'speed_race', 18.0);
    }

    return new THREE.Vector3(dest.x, 0, dest.z);
  }

  startPackGossip(initiator) {
    const cx = initiator ? initiator.group.position.x : 0;
    const cz = initiator ? initiator.group.position.z : 0;
    this.logActivity('💬 ¡Reunión secreta de la manada en círculo para saludarse y charlar!');
    roboAudio.playHappyJingle();

    const count = Math.max(1, this.pack.length);
    for (let i = 0; i < this.pack.length; i++) {
      const dog = this.pack[i];
      const angle = (i / count) * Math.PI * 2;
      dog.aiState.targetPos.set(cx + Math.cos(angle) * 2.6, 0, cz + Math.sin(angle) * 2.6);
      this._sanitizeGoal(dog.aiState.targetPos);
      dog.aiState.desiredSpeed = 4.4;
      this.transitionTo(dog, AI_STATES.CHASE, 'pack_gossip', 12.0);
    }
  }

  pickNewPatrolTarget(dog) {
    const ai = dog.aiState;
    const profile = dog.profile;
    ai.targetBall = null;
    ai.targetSnack = null;
    ai.targetDog = null;

    dog.energy = Math.max(10, (dog.energy || 100) - 1.5);
    dog.hydration = Math.max(15, (dog.hydration || 90) - 2.0);

    // 1. Thirst -> drink
    if (dog.hydration < 35 && Math.random() < 0.75) {
      ai.targetPos.set(12, 0, 10);
      ai.desiredSpeed = 3.8 * profile.speedMultiplier;
      this.transitionTo(dog, AI_STATES.CHASE, 'drink', 9.0);
      this.logActivity(`💧 ${dog.name} tiene sed y va a beber a la cibercuenca.`);
      return;
    }

    // 2. Low energy -> recharge
    if (dog.energy < 25 && Math.random() < 0.7) {
      ai.targetPos.set(72, 0, 52);
      ai.desiredSpeed = 3.2 * profile.speedMultiplier;
      this.transitionTo(dog, AI_STATES.CHASE, 'recharge', 11.0);
      this.logActivity(`🔋 ${dog.name} tiene poca batería y va a la estación de recarga.`);
      return;
    }

    // 3. Dropped snack -> alert -> chase snack
    if (this.world && this.world.snacks && this.world.snacks.length > 0 && Math.random() < 0.65) {
      const snack = this.world.snacks[0];
      ai.targetSnack = snack;
      ai.targetPos.copy(snack.group.position);
      ai.desiredSpeed = 5.6 * profile.speedMultiplier;
      this.transitionTo(dog, AI_STATES.CHASE, 'snack', 8.0);
      this.logActivity(`🍪 ¡${dog.name} olió una galleta y corre a comérsela!`);
      return;
    }

    // 4. Personality-driven exploration
    const choice = Math.random();
    if (profile.name === 'Bolt' && this.world && this.world.balls && this.world.balls.length > 0 && choice < 0.6) {
      for (let i = 0; i < this.world.balls.length; i++) {
        const b = this.world.balls[i];
        if (!b.carriedBy) {
          ai.targetBall = b;
          ai.targetPos.copy(b.mesh.position);
          ai.desiredSpeed = 6.2 * profile.speedMultiplier;
          this.transitionTo(dog, AI_STATES.CHASE, 'ball', 9.0);
          this.logActivity(`⚡ ¡${dog.name} corre a toda velocidad hacia la pelota!`);
          return;
        }
      }
    }

    if (profile.name === 'Pixel' && choice < 0.45) {
      const angle = Math.random() * Math.PI * 2;
      const r = 64 + Math.random() * 14; // Lake shore perimeter!
      ai.targetPos.set(LAKE_CX + Math.cos(angle) * r, 0, LAKE_CZ + Math.sin(angle) * r);
      this._sanitizeGoal(ai.targetPos);
      ai.desiredSpeed = 3.6 * profile.speedMultiplier;
      this.transitionTo(dog, AI_STATES.PATROL, 'shore', 10.0);
      return;
    }

    if (profile.name === 'Luna' && choice < 0.35) {
      ai.targetPos.set(72, 0, 52);
      ai.desiredSpeed = 3.0 * profile.speedMultiplier;
      this.transitionTo(dog, AI_STATES.CHASE, 'recharge', 10.0);
      return;
    }

    const wp = PATROL_WAYPOINTS[Math.floor(Math.random() * PATROL_WAYPOINTS.length)];
    ai.targetPos.set(wp.x + (Math.random() - 0.5) * 4, 0, wp.z + (Math.random() - 0.5) * 4);
    this._sanitizeGoal(ai.targetPos);
    const fast = profile.name === 'Rusty' || profile.name === 'Bolt' || choice > 0.5;
    ai.desiredSpeed = (fast ? 5.0 : 3.5) * profile.speedMultiplier;
    this.transitionTo(dog, AI_STATES.PATROL, wp.sub, 9.0);
  }

  // Legacy alias
  pickNewTarget(dog) {
    this.pickNewPatrolTarget(dog);
  }

  // Zero-alloc 3-whisker steering avoidance (accumulates ALL obstacles, lake edge, world bounds & peer dogs)
  computeAvoidanceDir(pos, desiredDir, outDir = null, selfDog = null) {
    const res = outDir || this._steerOut;
    res.copy(desiredDir);
    res.y = 0;
    if (res.lengthSq() < 1e-6) {
      res.set(0, 0, 1);
      return res;
    }
    res.normalize();

    this._repelSum.set(0, 0, 0);
    const baseYaw = Math.atan2(res.x, res.z);

    // 1. Sample 3 forward feelers against nearby solid obstacles
    if (this.world && this.world.getNearObstacles) {
      for (let w = 0; w < 3; w++) {
        const yaw = baseYaw + WHISKER_ANGLES[w];
        const len = WHISKER_LENGTHS[w];
        const px = pos.x + Math.sin(yaw) * len;
        const pz = pos.z + Math.cos(yaw) * len;

        this._obsBuffer.length = 0;
        const obstacles = this.world.getNearObstacles(px, pz, this._obsBuffer) || this._obsBuffer;

        for (let i = 0; i < obstacles.length; i++) {
          const obs = obstacles[i];
          if (obs.yMin !== undefined && obs.yMax !== undefined) {
            if (pos.y + 1.1 < obs.yMin || pos.y > obs.yMax) continue;
          }
          const dx = px - obs.x;
          const dz = pz - obs.z;
          const r = (obs.radius || Math.max(obs.halfW || 1, obs.halfD || 1)) + 1.15;
          const dist = Math.hypot(dx, dz);
          if (dist < r && dist > 0.001) {
            const weight = ((r - dist) / r) * (w === 0 ? 1.55 : 1.05);
            this._repelSum.x += (dx / dist) * weight;
            this._repelSum.z += (dz / dist) * weight;
          }
        }
      }
    }

    // 2. Peer & player separation so dogs steer around each other smoothly
    for (let i = 0; i < this.dogList.length; i++) {
      const other = this.dogList[i];
      if (other === selfDog) continue;
      if (Math.abs(other.group.position.y - pos.y) > 1.5) continue;
      const dx = pos.x - other.group.position.x;
      const dz = pos.z - other.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.2 && d > 0.001) {
        const w = (2.2 - d) / 2.2 * 1.1;
        this._repelSum.x += (dx / d) * w;
        this._repelSum.z += (dz / d) * w;
      }
    }

    // 3. Lake shore avoidance (unless swimming)
    if (!selfDog || !selfDog.isInWater) {
      const lx = pos.x + res.x * 2.2 - LAKE_CX;
      const lz = pos.z + res.z * 2.2 - LAKE_CZ;
      const lDist = Math.hypot(lx, lz);
      if (lDist < LAKE_AVOID_R && lDist > 0.01) {
        const w = (LAKE_AVOID_R - lDist) * 0.4;
        this._repelSum.x += (lx / lDist) * w;
        this._repelSum.z += (lz / lDist) * w;
      }
    }

    // 4. World perimeter soft push-in
    const rCenter = Math.hypot(pos.x, pos.z);
    if (rCenter > WORLD_LIMIT - 6) {
      const w = (rCenter - (WORLD_LIMIT - 6)) * 0.35;
      this._repelSum.x -= (pos.x / rCenter) * w;
      this._repelSum.z -= (pos.z / rCenter) * w;
    }

    res.add(this._repelSum);
    res.y = 0;
    if (res.lengthSq() > 1e-6) {
      res.normalize();
    } else {
      res.copy(desiredDir).normalize();
    }
    return res;
  }

  _scoreRecoverDirection(pos, yaw) {
    const px = pos.x + Math.sin(yaw) * 2.6;
    const pz = pos.z + Math.cos(yaw) * 2.6;
    let score = 0;

    // Penalize lake
    const lDist = Math.hypot(px - LAKE_CX, pz - LAKE_CZ);
    if (lDist < LAKE_AVOID_R) score -= 50;

    // Penalize out-of-bounds
    if (Math.hypot(px, pz) > WORLD_LIMIT - 4) score -= 50;

    // Penalize obstacles
    if (this.world && this.world.getNearObstacles) {
      this._obsBuffer.length = 0;
      const obstacles = this.world.getNearObstacles(px, pz, this._obsBuffer) || this._obsBuffer;
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        const r = (obs.radius || Math.max(obs.halfW || 1, obs.halfD || 1)) + 1.2;
        const d = Math.hypot(px - obs.x, pz - obs.z);
        if (d < r) score -= (r - d) * 15;
      }
    }
    return score;
  }

  _startRecover(dog) {
    const ai = dog.aiState;
    const pos = dog.group.position;
    const baseYaw = dog.group.rotation.y;

    let bestYaw = baseYaw + Math.PI;
    let bestScore = -Infinity;
    for (let i = 0; i < RECOVER_ANGLES.length; i++) {
      const cand = baseYaw + RECOVER_ANGLES[i];
      const sc = this._scoreRecoverDirection(pos, cand);
      if (sc > bestScore) {
        bestScore = sc;
        bestYaw = cand;
      }
    }
    ai.recoverDir.set(Math.sin(bestYaw), 0, Math.cos(bestYaw)).normalize();
    this.transitionTo(dog, AI_STATES.RECOVER, 'unstuck', 1.15);
  }

  _handleArrivedAction(dog, playerRobot) {
    const ai = dog.aiState;
    const sub = ai.subAction;

    if (sub === 'assemble') {
      if (playerRobot) dog.lookAt(playerRobot.group.position, 3.5);
      dog.setEmotion(EMOTIONS.LOVING, true);
      dog.animController.play('playBow', 2.5);
      roboAudio.playBoop(dog.profile.voicePitch || 1.0);
      this.transitionTo(dog, AI_STATES.ACTION, 'trick', 3.2);
      return;
    }

    if (sub === 'recharge') {
      dog.energy = 100;
      dog.setEmotion(EMOTIONS.SLEEPY, true);
      dog.animController.play('lieDown', 5.0);
      roboAudio.playBoop(dog.profile.voicePitch || 1.0);
      this.transitionTo(dog, AI_STATES.ACTION, 'recharging', 5.0);
      return;
    }

    if (sub === 'drink') {
      if (dog.quenchThirst) dog.quenchThirst();
      dog.animController.play('wagTail', 2.2);
      this.transitionTo(dog, AI_STATES.ACTION, 'drinking', 2.2);
      return;
    }

    if (sub === 'ball' && ai.targetBall && !ai.targetBall.carriedBy && this.world && this.world.kickBall) {
      this._rawDir.subVectors(ai.targetBall.mesh.position, dog.group.position);
      this._rawDir.y = 0;
      if (this._rawDir.lengthSq() > 0.001) this._rawDir.normalize();
      else this._rawDir.set(0, 0, 1);
      this.world.kickBall(ai.targetBall, this._rawDir, 11.5);
      dog.setEmotion(EMOTIONS.EXCITED, true);
      dog.animController.play('playBow', 1.8);
      this.logActivity(`⚽ ¡${dog.name} pateó la pelota con entusiasmo!`);
      this.transitionTo(dog, AI_STATES.ACTION, 'kick_celebrate', 1.8);
      return;
    }

    if (sub === 'speed_race') {
      this.logActivity(`🏆 ¡¡${dog.name} GANÓ LA CARRERA!! ¡Es el perrito más veloz del parque! 🥇`);
      roboAudio.playGoalFanfare();
      dog.animController.play('backflip', 2.0);
      dog.setEmotion(EMOTIONS.PROUD, true);
      for (let i = 0; i < this.pack.length; i++) {
        const other = this.pack[i];
        if (other !== dog && other.aiState.subAction === 'speed_race') {
          other.animController.play('wagTail', 2.5);
          this.transitionTo(other, AI_STATES.ACTION, 'race_finish', 2.5);
        }
      }
      this.transitionTo(dog, AI_STATES.ACTION, 'race_win', 2.5);
      return;
    }

    if (sub === 'pack_gossip') {
      dog.animController.play(Math.random() < 0.4 ? 'headTilt' : 'wagTail', 2.4);
      this.transitionTo(dog, AI_STATES.ACTION, 'gossiping', 2.4);
      return;
    }

    if (Math.random() < 0.45) {
      const trick = TRICKS[Math.floor(Math.random() * TRICKS.length)];
      dog.animController.play(trick, 2.2);
      this.transitionTo(dog, AI_STATES.ACTION, 'trick', 2.2);
    } else {
      this.pickNewPatrolTarget(dog);
    }
  }

  update(delta, playerRobotOverride = null) {
    if (this.disposed) return;
    const dt = Math.min(delta, 0.05);
    const playerRobot = playerRobotOverride || this.playerDog;

    for (let i = 0; i < this.pack.length; i++) {
      const dog = this.pack[i];
      const ai = dog.aiState;
      const curPos = dog.group.position;

      dog.update(dt);
      dog.animController.update(dt);

      if (dog.isPickedUp || dog.isSliding) continue;

      ai.stateTimer -= dt;
      ai.stateElapsed += dt;
      if (ai.playerGreetCooldown > 0) ai.playerGreetCooldown = Math.max(0, ai.playerGreetCooldown - dt);
      if (ai.dogGreetCooldown > 0) ai.dogGreetCooldown = Math.max(0, ai.dogGreetCooldown - dt);
      if (ai.alertCooldown > 0) ai.alertCooldown = Math.max(0, ai.alertCooldown - dt);

      // Reactive Stimulus -> ALERT transition (approaching fast player or close dynamic ball)
      if (ai.state === AI_STATES.PATROL && ai.alertCooldown <= 0 && playerRobot && playerRobot !== dog) {
        const distP = curPos.distanceTo(playerRobot.group.position);
        if (distP < 6.8 && playerRobot.physics.speedScalar > 4.5 && ai.playerGreetCooldown <= 0) {
          ai.alertCooldown = 10.0;
          ai.targetDog = playerRobot;
          dog.lookAt(playerRobot.group.position, 1.2);
          dog.setEmotion(EMOTIONS.ALERT, true);
          ai.pendingState = AI_STATES.ACTION;
          ai.pendingSubAction = 'greet_player';
          this.transitionTo(dog, AI_STATES.ALERT, 'notice_player', 0.75);
          continue;
        }
      }

      // Dynamic target updates during CHASE
      if (ai.state === AI_STATES.CHASE) {
        if (ai.subAction === 'ball') {
          if (!ai.targetBall || ai.targetBall.carriedBy) {
            this.pickNewPatrolTarget(dog);
            continue;
          }
          ai.targetPos.copy(ai.targetBall.mesh.position);
        } else if (ai.subAction === 'snack') {
          if (!ai.targetSnack || !this.world || this.world.snacks.indexOf(ai.targetSnack) === -1) {
            this.pickNewPatrolTarget(dog);
            continue;
          }
          ai.targetPos.copy(ai.targetSnack.group.position);
        } else if (ai.subAction === 'play_tag') {
          if (!ai.tagTarget) {
            this.pickNewPatrolTarget(dog);
            continue;
          }
          if (ai.tagRole === 'CHASER') {
            ai.targetPos.copy(ai.tagTarget.group.position);
            if (curPos.distanceTo(ai.tagTarget.group.position) < 1.55) {
              roboAudio.playBoop(1.5);
              this.logActivity(`⚡ ¡${dog.name} tocó a ${ai.tagTarget.name}! ¡Ahora la trae ${ai.tagTarget.name}! 🐾`);
              const prev = ai.tagTarget;
              ai.tagRole = 'PREY';
              ai.stateTimer = 8.0;
              if (prev.aiState) {
                prev.aiState.tagRole = 'CHASER';
                prev.aiState.tagTarget = dog;
                prev.aiState.stateTimer = 8.0;
                prev.animController.play('jump', 1.0);
              }
            }
          } else {
            this._rawDir.subVectors(curPos, ai.tagTarget.group.position);
            this._rawDir.y = 0;
            if (this._rawDir.lengthSq() > 0.001) this._rawDir.normalize();
            else this._rawDir.set(1, 0, 0);
            ai.targetPos.copy(curPos).addScaledVector(this._rawDir, 8);
            this._sanitizeGoal(ai.targetPos);
          }
        }
      }

      // Social greetings (Player)
      if (
        playerRobot &&
        playerRobot !== dog &&
        ai.playerGreetCooldown <= 0 &&
        (ai.state === AI_STATES.PATROL || (ai.state === AI_STATES.CHASE && ai.subAction !== 'play_tag' && ai.subAction !== 'speed_race' && ai.subAction !== 'assemble'))
      ) {
        if (curPos.distanceTo(playerRobot.group.position) < 3.8) {
          ai.playerGreetCooldown = 18.0;
          dog.lookAt(playerRobot.group.position, 3.2);
          dog.setEmotion(SOCIAL_EMOTIONS[Math.floor(Math.random() * SOCIAL_EMOTIONS.length)], true);
          dog.animController.play(SOCIAL_MOVES[Math.floor(Math.random() * SOCIAL_MOVES.length)], 2.5);
          roboAudio.playBark(dog.profile.voicePitch || 1.0);
          const tpl = GREETINGS[dog.name] || '🐾 ¡{name} saludó alegremente a {player}!';
          this.logActivity(tpl.replace('{player}', playerRobot.name).replace('{name}', dog.name));
          this.transitionTo(dog, AI_STATES.ACTION, 'greet_player', 3.0);
          continue;
        }
      }

      // Social greetings (Peer Dogs — synchronized both partners!)
      if (ai.dogGreetCooldown <= 0 && ai.state === AI_STATES.PATROL) {
        for (let j = 0; j < this.pack.length; j++) {
          const otherDog = this.pack[j];
          if (otherDog === dog) continue;
          if (otherDog.aiState.state !== AI_STATES.PATROL || otherDog.aiState.dogGreetCooldown > 0) continue;
          if (curPos.distanceTo(otherDog.group.position) < 3.2) {
            ai.dogGreetCooldown = 16.0;
            otherDog.aiState.dogGreetCooldown = 16.0;

            dog.lookAt(otherDog.group.position, 2.8);
            otherDog.lookAt(curPos, 2.8);

            if (Math.random() < 0.45) {
              dog.setEmotion(EMOTIONS.EXCITED, true);
              dog.animController.play('playBow', 2.4);
              otherDog.animController.play('wagTail', 2.4);
              roboAudio.playYip(dog.profile.voicePitch || 1.0);
              this.logActivity(`🐶 ¡${dog.name} hizo una reverencia de juego ante ${otherDog.name}!`);
            } else {
              dog.setEmotion(EMOTIONS.HAPPY, true);
              dog.animController.play('sniff', 2.2);
              otherDog.animController.play('nuzzle', 2.2);
              roboAudio.playBoop(dog.profile.voicePitch || 1.0);
              this.logActivity(`🐾 ${dog.name} y ${otherDog.name} se saludaron con un boop de hocicos.`);
            }
            this.transitionTo(dog, AI_STATES.ACTION, 'greet_dog', 2.5);
            this.transitionTo(otherDog, AI_STATES.ACTION, 'greet_dog', 2.5);
            break;
          }
        }
      }

      // State Machine Execution
      if (ai.state === AI_STATES.ALERT) {
        dog.animController.syncLocomotion(0, false);
        dog.bankAngle = damp(dog.bankAngle, 0, 10, dt);
        if (ai.stateTimer <= 0) {
          if (ai.pendingState === AI_STATES.ACTION && ai.pendingSubAction === 'greet_player' && playerRobot) {
            ai.pendingState = null;
            ai.playerGreetCooldown = 16.0;
            dog.lookAt(playerRobot.group.position, 2.8);
            dog.setEmotion(EMOTIONS.HAPPY, true);
            dog.animController.play('wave', 2.4);
            this.transitionTo(dog, AI_STATES.ACTION, 'greet_player', 2.4);
          } else {
            this.pickNewPatrolTarget(dog);
          }
        }
        continue;
      }

      if (ai.state === AI_STATES.ACTION) {
        dog.animController.syncLocomotion(0, false);
        dog.bankAngle = damp(dog.bankAngle, 0, 10, dt);
        if (ai.subAction === 'greet_player' && playerRobot) {
          dog.lookAt(playerRobot.group.position, 0.5);
        }
        if (ai.stateTimer <= 0) {
          if (ai.subAction === 'recharging') dog.setEmotion(EMOTIONS.HAPPY, true);
          this.pickNewPatrolTarget(dog);
        }
        continue;
      }

      // Locomotion States: PATROL | CHASE | RECOVER
      const distToTarget = Math.hypot(curPos.x - ai.targetPos.x, curPos.z - ai.targetPos.z);

      if (ai.state === AI_STATES.RECOVER) {
        const dir = this.computeAvoidanceDir(curPos, ai.recoverDir, this._steerOut, dog);
        const targetAngle = Math.atan2(dir.x, dir.z);
        dog.group.rotation.y = dampAngle(dog.group.rotation.y, targetAngle, 7, dt);
        curPos.addScaledVector(dir, ai.desiredSpeed * dt);
        dog.animController.syncLocomotion(dog.physics.speedScalar, true);

        if (ai.stateTimer <= 0) {
          this.pickNewPatrolTarget(dog);
        }
      } else {
        // PATROL or CHASE
        const arrivalR = ai.subAction === 'speed_race' ? 2.8 : 2.0;
        if (distToTarget < arrivalR) {
          this._handleArrivedAction(dog, playerRobot);
          continue;
        }
        if (ai.stateTimer <= 0) {
          this.pickNewPatrolTarget(dog);
          continue;
        }

        this._rawDir.subVectors(ai.targetPos, curPos);
        this._rawDir.y = 0;
        if (this._rawDir.lengthSq() > 1e-6) this._rawDir.normalize();

        const dir = this.computeAvoidanceDir(curPos, this._rawDir, this._steerOut, dog);
        const targetAngle = Math.atan2(dir.x, dir.z);
        const yawDiff = wrapAngle(targetAngle - dog.group.rotation.y);
        dog.group.rotation.y = dampAngle(dog.group.rotation.y, targetAngle, 6.5, dt);
        dog.bankAngle = damp(dog.bankAngle, THREE.MathUtils.clamp(-yawDiff * 0.42, -0.26, 0.26), 8, dt);

        // Frame-rate-independent velocity-ratio stuck detection
        const movedStep = Math.hypot(curPos.x - ai.lastPos.x, curPos.z - ai.lastPos.z);
        ai.lastPos.copy(curPos);
        const actualSpeed = movedStep / Math.max(dt, 0.001);
        if (actualSpeed < ai.desiredSpeed * 0.25 && distToTarget > 2.2) {
          ai.stuckTimer += dt;
          if (ai.stuckTimer > 0.65) {
            this._startRecover(dog);
            continue;
          }
        } else {
          ai.stuckTimer = Math.max(0, ai.stuckTimer - dt * 2.0);
        }

        curPos.addScaledVector(dir, ai.desiredSpeed * dt);
        dog.animController.syncLocomotion(dog.physics.speedScalar, true);
      }

      // World Obstacle & Boundary Clamp
      if (this.world) {
        if (this.world.resolveObstacleCollisions) {
          this.world.resolveObstacleCollisions(curPos, 0.75, 1.2);
        }
        if (this.world.clampToWorld) {
          this.world.clampToWorld(curPos, 2.0);
        } else {
          const r = Math.hypot(curPos.x, curPos.z);
          if (r > WORLD_LIMIT) {
            const s = WORLD_LIMIT / r;
            curPos.x *= s;
            curPos.z *= s;
          }
        }

        // Ground & Vertical Parabolic Physics
        const groundY = this.world.getHeightAt(curPos.x, curPos.z);
        if (!dog.isInWater) {
          if (curPos.y > groundY + 0.14 || dog.physics.velocityY > 0) {
            dog.physics.velocityY -= 18.5 * dt;
            curPos.y += dog.physics.velocityY * dt;
            if (curPos.y <= groundY) {
              curPos.y = groundY;
              dog.physics.velocityY = 0;
              dog.physics.isGrounded = true;
            }
          } else {
            curPos.y = groundY;
            dog.physics.velocityY = 0;
            dog.physics.isGrounded = true;
          }
        }

        const prevY = curPos.y;
        this.world.handleRobotInteractions(dog, dog.animController, dt);
        if (curPos.y > prevY + 0.5 && !dog.isInWater) {
          dog.physics.velocityY = (curPos.y - prevY) * 3.2;
          curPos.y = prevY + 0.15;
          dog.physics.isGrounded = false;
        }
      }
    }

    // Solid Horizontal Separation + Post-Pushout Obstacle Re-Clamp (never pushes into walls!)
    for (let i = 0; i < this.pack.length; i++) {
      const dog = this.pack[i];
      if (dog.isPickedUp) continue;
      const p1 = dog.group.position;

      if (playerRobot && playerRobot !== dog && Math.abs(p1.y - playerRobot.group.position.y) < 1.2) {
        const p2 = playerRobot.group.position;
        const dx = p1.x - p2.x;
        const dz = p1.z - p2.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.4 && d > 0.001) {
          const ov = (1.4 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          p1.x += nx * ov; p1.z += nz * ov;
          p2.x -= nx * ov; p2.z -= nz * ov;
          if (this.world && this.world.resolveObstacleCollisions) {
            this.world.resolveObstacleCollisions(p2, 0.75, 1.2);
          }
        }
      }

      for (let j = i + 1; j < this.pack.length; j++) {
        const other = this.pack[j];
        if (other.isPickedUp) continue;
        const p2 = other.group.position;
        if (Math.abs(p1.y - p2.y) >= 1.2) continue;
        const dx = p1.x - p2.x;
        const dz = p1.z - p2.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.35 && d > 0.001) {
          const ov = (1.35 - d) * 0.5;
          const nx = dx / d;
          const nz = dz / d;
          p1.x += nx * ov; p1.z += nz * ov;
          p2.x -= nx * ov; p2.z -= nz * ov;
        }
      }

      if (this.world && this.world.resolveObstacleCollisions) {
        this.world.resolveObstacleCollisions(p1, 0.75, 1.2);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = 0; i < this.dogList.length; i++) {
      const dog = this.dogList[i];
      if (this.scene && dog.group) {
        this.scene.remove(dog.group);
      }
      if (dog.animController) dog.animController.dispose();
      dog.dispose();
    }
    this.dogList.length = 0;
    this.pack.length = 0;
    this.dogs = {};
    this.allRobots = this.dogs;
    this.playerDog = null;
    this.currentControlledRobot = null;
    this._obsBuffer.length = 0;
  }
}
