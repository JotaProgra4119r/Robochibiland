// Complete Pack Manager with Instant Robot Switching, Steering Avoidance & Synchronized Pack Games
import * as THREE from 'three';
import { ChibiRobotDog, CHARACTER_PROFILES } from './robot.js';
import { AnimationController } from './animations.js';
import { EMOTIONS } from './emotions.js';
import { roboAudio } from './audio.js';

function lerpAngle(current, target, t) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * Math.min(1, t);
}

export class RobotPackManager {
  constructor(scene, world, onActivityCallback = null) {
    this.scene = scene;
    this.world = world;
    this.onActivity = onActivityCallback;

    this.allRobots = {};
    this.pack = [];
    this.currentControlledRobot = null;

    this.spawnCompletePack();
  }

  logActivity(message) {
    if (this.onActivity) {
      this.onActivity(message);
    }
  }

  spawnCompletePack() {
    const robotNames = ['Sparky', 'Bolt', 'Pixel', 'Luna', 'Rusty'];
    const startPositions = {
      Sparky: new THREE.Vector3(32, 0, 32),
      Bolt: new THREE.Vector3(46, 0, 36),
      Pixel: new THREE.Vector3(-45, 0, -60),
      Luna: new THREE.Vector3(18, 0, -15),
      Rusty: new THREE.Vector3(55, 0, 48)
    };

    robotNames.forEach((name) => {
      const isInitialPlayer = (name === 'Sparky');
      const startPos = startPositions[name];

      const dog = new ChibiRobotDog(name, {
        isPlayer: isInitialPlayer
      });

      dog.animController = new AnimationController(dog);
      dog.group.position.copy(startPos);
      dog.group.position.y = this.world.getHeightAt(startPos.x, startPos.z);
      dog.velocityY = 0;

      this.scene.add(dog.group);
      this.allRobots[name] = dog;

      dog.aiState = {
        state: 'WANDER',
        targetPos: new THREE.Vector3(),
        targetBall: null,
        targetSnack: null,
        stateTimer: 2 + Math.random() * 4,
        speed: 3.4 * (dog.profile.speedMultiplier || 1.0),
        lastInteractedDog: null,
        playerGreetCooldown: 0,
        dogGreetCooldown: 0,
        tagRole: null, // 'CHASER' | 'PREY'
        tagTarget: null,
        stuckTimer: 0,
        lastPos: startPos.clone()
      };

      if (!isInitialPlayer) {
        this.pack.push(dog);
        this.pickNewTarget(dog);
      } else {
        this.currentControlledRobot = dog;
      }
    });
  }

  // Hot-swap player possession to ANY of the 5 robots!
  switchToRobot(name) {
    if (!this.allRobots[name]) return null;
    const targetRobot = this.allRobots[name];
    if (this.currentControlledRobot === targetRobot) return targetRobot;

    // Release old player to autonomous AI
    if (this.currentControlledRobot) {
      this.currentControlledRobot.setAsPlayer(false);
      this.currentControlledRobot.aiState.state = 'WANDER';
      this.currentControlledRobot.aiState.playerGreetCooldown = 6.0;
      this.pickNewTarget(this.currentControlledRobot);
      if (!this.pack.includes(this.currentControlledRobot)) {
        this.pack.push(this.currentControlledRobot);
      }
    }

    // Possess new robot
    targetRobot.setAsPlayer(true);
    this.currentControlledRobot = targetRobot;

    // Remove from autonomous pack list
    const idx = this.pack.indexOf(targetRobot);
    if (idx !== -1) {
      this.pack.splice(idx, 1);
    }

    this.logActivity(`🎮 ¡Has tomado el control de ${targetRobot.name} (${targetRobot.profile.title})!`);
    roboAudio.playBoop(targetRobot.profile.voicePitch || 1.0);
    return targetRobot;
  }

  // Assemble all autonomous robots into an adorable semicircle formation in front of the player
  callPackToPlayer(playerRobot) {
    if (!playerRobot) return;
    const pPos = playerRobot.group.position;
    const pRotY = playerRobot.group.rotation.y;

    this.logActivity(`📣 ¡La manada escuchó tu llamado y se reúne a tu alrededor!`);
    roboAudio.playHappyJingle();

    const count = this.pack.length;
    this.pack.forEach((dog, idx) => {
      const angle = pRotY + (idx - (count - 1) / 2) * 0.55;
      const targetX = pPos.x + Math.sin(angle) * 3.6;
      const targetZ = pPos.z + Math.cos(angle) * 3.6;

      dog.aiState.state = 'ASSEMBLE_PACK';
      dog.aiState.targetPos.set(targetX, 0, targetZ);
      dog.aiState.speed = 6.0 * (dog.profile.speedMultiplier || 1.0);
      dog.aiState.stateTimer = 9.0;
      dog.animController.play('run');
    });
  }

  // Social Game 1: "La Traes" (Tag Chaser vs Prey)
  startTagGame(initiator) {
    if (this.pack.length === 0) return;
    const candidates = this.pack.filter(d => d !== initiator);
    const chaserDog = (initiator && this.pack.includes(initiator)) ? initiator : candidates[0];
    const preyDog = candidates.find(d => d !== chaserDog) || this.pack[0];
    if (!chaserDog || !preyDog) return;

    this.logActivity(`🏃 ¡Comienza el juego de "La Traes"! ¡${chaserDog.name} persigue a ${preyDog.name}!`);
    roboAudio.playYip(1.4);

    chaserDog.aiState.state = 'PLAY_TAG';
    chaserDog.aiState.tagRole = 'CHASER';
    chaserDog.aiState.tagTarget = preyDog;
    chaserDog.aiState.speed = 7.0 * (chaserDog.profile.speedMultiplier || 1.0);
    chaserDog.aiState.stateTimer = 16.0;
    chaserDog.animController.play('run');

    preyDog.aiState.state = 'PLAY_TAG';
    preyDog.aiState.tagRole = 'PREY';
    preyDog.aiState.tagTarget = chaserDog;
    preyDog.aiState.speed = 6.8 * (preyDog.profile.speedMultiplier || 1.0);
    preyDog.aiState.stateTimer = 16.0;
    preyDog.animController.play('run');
  }

  // Social Game 2: Speed Race to Landmark
  startSpeedRace(initiator) {
    const destinations = [
      { name: 'la Portería de Fútbol', pos: new THREE.Vector3(25, 0, 40) },
      { name: 'el Muelle del Lago', pos: new THREE.Vector3(-44, 0, -75) },
      { name: 'la Piscina de Pelotas', pos: new THREE.Vector3(-32, 0, 48) }
    ];
    const target = destinations[Math.floor(Math.random() * destinations.length)];
    const racers = this.pack.slice(0, 3);

    this.logActivity(`🏁 ¡RETO DE VELOCIDAD hacia ${target.name}! ¡3... 2... 1... ¡¡YA!! 🐕⚡`);
    roboAudio.playBark(1.2);

    racers.forEach((r, idx) => {
      const offsetPos = target.pos.clone();
      offsetPos.x += (idx - 1) * 1.4;
      r.aiState.state = 'SPEED_RACE';
      r.aiState.targetPos.copy(offsetPos);
      r.aiState.speed = (6.0 + Math.random() * 2.2) * (r.profile.speedMultiplier || 1.0);
      r.aiState.stateTimer = 18.0;
      r.animController.play('run');
    });

    return target.pos.clone();
  }

  // Social Game 3: Pack Gossip / Small Circle Meeting
  startPackGossip(initiator) {
    const center = initiator ? initiator.group.position.clone() : new THREE.Vector3(0, 0, 0);
    this.logActivity(`💬 ¡Reunión secreta de la manada en círculo para saludarse y charlar!`);
    roboAudio.playHappyJingle();

    const count = this.pack.length;
    this.pack.forEach((dog, idx) => {
      const angle = (idx / Math.max(1, count)) * Math.PI * 2;
      const targetX = center.x + Math.cos(angle) * 2.6;
      const targetZ = center.z + Math.sin(angle) * 2.6;

      dog.aiState.state = 'PACK_GOSSIP';
      dog.aiState.targetPos.set(targetX, 0, targetZ);
      dog.aiState.speed = 4.4;
      dog.aiState.stateTimer = 12.0;
      dog.animController.play('walk');
    });
  }

  pickNewTarget(dog) {
    const ai = dog.aiState;
    const profile = dog.profile;
    ai.targetBall = null;
    ai.targetSnack = null;

    // Biological drives depletion
    dog.energy = Math.max(10, (dog.energy || 100) - 1.5);
    dog.hydration = Math.max(15, (dog.hydration || 90) - 2.0);

    // 1. Biological Need: Urgent Thirst
    if (dog.hydration < 35 && Math.random() < 0.75) {
      ai.targetPos.set(12, 0, 10);
      ai.state = 'WANDER';
      dog.animController.play('walk');
      ai.speed = 3.8 * profile.speedMultiplier;
      ai.stateTimer = 9;
      this.logActivity(`💧 ${dog.name} tiene sed y va a beber a la cibercuenca.`);
      return;
    }

    // 2. Biological Need: Low Energy Recharge
    if (dog.energy < 25 && Math.random() < 0.7) {
      ai.targetPos.set(72, 0, 52);
      ai.state = 'GO_RECHARGE';
      dog.animController.play('walk');
      ai.speed = 3.2 * profile.speedMultiplier;
      ai.stateTimer = 11;
      this.logActivity(`🔋 ${dog.name} tiene poca batería y va a la estación de recarga.`);
      return;
    }

    // 3. Check for dropped snacks!
    if (this.world.snacks && this.world.snacks.length > 0 && Math.random() < 0.65) {
      const snack = this.world.snacks[0];
      ai.targetSnack = snack;
      ai.targetPos.copy(snack.group.position);
      ai.state = 'CHASE_SNACK';
      dog.animController.play('run');
      ai.speed = 5.6 * profile.speedMultiplier;
      ai.stateTimer = 8;
      this.logActivity(`🍪 ¡${dog.name} olió una galleta y corre a comérsela!`);
      return;
    }

    // 4. Personality & Playground Attractions Explorer
    const choice = Math.random();

    if (profile.name === 'Bolt') {
      const availableBalls = (this.world.balls || []).filter(b => !b.carriedBy);
      if (availableBalls.length > 0 && choice < 0.6) {
        const ball = availableBalls[Math.floor(Math.random() * availableBalls.length)];
        ai.targetBall = ball;
        ai.targetPos.copy(ball.mesh.position);
        ai.state = 'CHASE_BALL';
        dog.animController.play('run');
        ai.speed = 6.4 * profile.speedMultiplier;
        ai.stateTimer = 9;
        this.logActivity(`⚡ ¡${dog.name} corre a toda velocidad hacia la pelota!`);
      } else {
        ai.targetPos.set(22, 0, -50);
        ai.state = 'GO_TUNNEL';
        dog.animController.play('run');
        ai.speed = 5.8 * profile.speedMultiplier;
        ai.stateTimer = 8;
      }
    } else if (profile.name === 'Pixel') {
      if (choice < 0.45) {
        const angle = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 30;
        ai.targetPos.set(-80 + Math.cos(angle) * r, 0, -80 + Math.sin(angle) * r);
        ai.state = 'WANDER';
      } else {
        ai.targetPos.set(76, 0, 18);
        ai.state = 'GO_TARGET';
      }
      dog.animController.play('walk');
      ai.speed = 3.6 * profile.speedMultiplier;
      ai.stateTimer = 10;
    } else if (profile.name === 'Luna') {
      if (choice < 0.4) {
        ai.targetPos.set(-32, 0, 48);
        ai.state = 'GO_BALLPIT';
        dog.animController.play('walk');
      } else if (choice < 0.7) {
        ai.targetPos.set(72, 0, 52);
        ai.state = 'GO_RECHARGE';
        dog.animController.play('walk');
      } else {
        const a = Math.random() * Math.PI * 2;
        ai.targetPos.set(Math.cos(a) * 28, 0, Math.sin(a) * 28);
        ai.state = 'WANDER';
        dog.animController.play('walk');
      }
      ai.speed = 3.0 * profile.speedMultiplier;
      ai.stateTimer = 10;
    } else if (profile.name === 'Rusty') {
      if (choice < 0.35) {
        ai.targetPos.set(-18, 0, -32);
        ai.state = 'GO_SLIDE';
      } else if (choice < 0.65) {
        ai.targetPos.set(38, 0, 22);
        ai.state = 'GO_TRAMPOLINE';
      } else {
        ai.targetPos.set(-42, 0, 14);
        ai.state = 'GO_PINATA';
      }
      dog.animController.play('run');
      ai.speed = 5.0 * profile.speedMultiplier;
      ai.stateTimer = 9;
    } else {
      const destinations = [
        new THREE.Vector3(-32, 0, 48),
        new THREE.Vector3(-18, 0, -32),
        new THREE.Vector3(22, 0, -50),
        new THREE.Vector3(38, 0, 22),
        new THREE.Vector3(50, 0, 40)
      ];
      const dest = destinations[Math.floor(Math.random() * destinations.length)];
      ai.targetPos.copy(dest);
      ai.state = 'WANDER';
      dog.animController.play(Math.random() < 0.5 ? 'run' : 'walk');
      ai.speed = 3.8 * profile.speedMultiplier;
      ai.stateTimer = 8;
    }
  }

  // Proactive obstacle feeler so autonomous dogs steer smoothly around trees & walls
  computeAvoidanceDir(pos, desiredDir) {
    if (!this.world || !this.world.getNearObstacles) return desiredDir;
    const lookAhead = 2.4;
    const probeX = pos.x + desiredDir.x * lookAhead;
    const probeZ = pos.z + desiredDir.z * lookAhead;
    const obstacles = this.world.getNearObstacles(probeX, probeZ);

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.yMin !== undefined && obs.yMax !== undefined) {
        if (pos.y + 1.1 < obs.yMin || pos.y > obs.yMax) continue;
      }
      const dx = probeX - obs.x;
      const dz = probeZ - obs.z;
      const r = (obs.radius || Math.max(obs.halfW || 1, obs.halfD || 1)) + 1.1;
      const dist = Math.hypot(dx, dz);
      if (dist < r && dist > 0.001) {
        const steer = new THREE.Vector3(dx / dist, 0, dz / dist);
        return desiredDir.clone().addScaledVector(steer, 1.35).normalize();
      }
    }
    return desiredDir;
  }

  update(delta, playerRobot = null) {
    this.pack.forEach(dog => {
      dog.update(delta);
      dog.animController.update(delta);

      if (dog.isPickedUp || dog.isSliding) return;

      const ai = dog.aiState;
      ai.stateTimer -= delta;
      if (ai.playerGreetCooldown > 0) ai.playerGreetCooldown = Math.max(0, ai.playerGreetCooldown - delta);
      if (ai.dogGreetCooldown > 0) ai.dogGreetCooldown = Math.max(0, ai.dogGreetCooldown - delta);

      // Dynamic tracking for moving balls and snacks
      if (ai.state === 'CHASE_BALL' && ai.targetBall) {
        if (ai.targetBall.carriedBy) {
          this.pickNewTarget(dog);
          return;
        }
        ai.targetPos.copy(ai.targetBall.mesh.position);
      } else if (ai.state === 'CHASE_SNACK') {
        if (!ai.targetSnack || !this.world.snacks.includes(ai.targetSnack)) {
          this.pickNewTarget(dog);
          return;
        }
        ai.targetPos.copy(ai.targetSnack.group.position);
      }

      // Handle "La Traes" (Tag) role behavior
      if (ai.state === 'PLAY_TAG') {
        if (!ai.tagTarget) {
          this.pickNewTarget(dog);
          return;
        }
        if (ai.tagRole === 'CHASER') {
          ai.targetPos.copy(ai.tagTarget.group.position);
          const d = dog.group.position.distanceTo(ai.tagTarget.group.position);
          if (d < 1.5) {
            roboAudio.playBoop(1.5);
            this.logActivity(`⚡ ¡${dog.name} tocó a ${ai.tagTarget.name}! ¡Ahora la trae ${ai.tagTarget.name}! 🐾`);
            const prevTarget = ai.tagTarget;
            ai.tagRole = 'PREY';
            ai.tagTarget = prevTarget;
            ai.stateTimer = 8.0;

            if (prevTarget.aiState) {
              prevTarget.aiState.tagRole = 'CHASER';
              prevTarget.aiState.tagTarget = dog;
              prevTarget.aiState.stateTimer = 8.0;
              prevTarget.animController.play('jump', 1.0);
            }
          }
        } else if (ai.tagRole === 'PREY') {
          const fleeDir = new THREE.Vector3().subVectors(dog.group.position, ai.tagTarget.group.position);
          fleeDir.y = 0;
          if (fleeDir.lengthSq() > 0.001) fleeDir.normalize();
          else fleeDir.set(1, 0, 0);
          ai.targetPos.copy(dog.group.position).addScaledVector(fleeDir, 8);
        }

        if (ai.stateTimer <= 0) {
          ai.state = 'WANDER';
          this.pickNewTarget(dog);
          return;
        }
      }

      // Handle Speed Race Winner check
      if (ai.state === 'SPEED_RACE') {
        const d = Math.hypot(dog.group.position.x - ai.targetPos.x, dog.group.position.z - ai.targetPos.z);
        if (d < 2.8) {
          this.logActivity(`🏆 ¡¡${dog.name} GANÓ LA CARRERA!! ¡Es el perrito más veloz del parque! 🥇`);
          roboAudio.playGoalFanfare();
          dog.animController.play('backflip', 2.0);
          dog.setEmotion(EMOTIONS.PROUD);
          this.pack.forEach(dOther => {
            if (dOther.aiState && dOther.aiState.state === 'SPEED_RACE') {
              dOther.aiState.state = 'PAUSE';
              dOther.aiState.stateTimer = 3.0;
            }
          });
          return;
        }
      }

      // Handle Pack Gossip in circle
      if (ai.state === 'PACK_GOSSIP') {
        const d = Math.hypot(dog.group.position.x - ai.targetPos.x, dog.group.position.z - ai.targetPos.z);
        if (d < 1.8) {
          dog.animController.play('wagTail');
          if (Math.random() < 0.04) {
            dog.animController.play(Math.random() < 0.5 ? 'headTilt' : 'playBow', 1.8);
            roboAudio.playBoop(dog.profile.voicePitch || 1.0);
          }
        }
        if (ai.stateTimer <= 0) {
          this.pickNewTarget(dog);
          return;
        }
      }

      // 1. Social Greeting with Active Player Robot (With Cooldown so it never loops infinitely!)
      if (playerRobot && playerRobot !== dog && ai.playerGreetCooldown <= 0) {
        const distToPlayer = dog.group.position.distanceTo(playerRobot.group.position);
        if (distToPlayer < 4.0 && !['INTERACT_PLAYER', 'PLAY_TAG', 'SPEED_RACE', 'ASSEMBLE_PACK'].includes(ai.state)) {
          ai.state = 'INTERACT_PLAYER';
          ai.stateTimer = 3.2;
          ai.playerGreetCooldown = 18.0; // 18s cooldown before greeting player again
          dog.lookAt(playerRobot.group.position);
          const socialEmotions = [EMOTIONS.HAPPY, EMOTIONS.LOVING, EMOTIONS.EXCITED, EMOTIONS.PROUD];
          dog.setEmotion(socialEmotions[Math.floor(Math.random() * socialEmotions.length)]);
          const socialMoves = ['wave', 'wagTail', 'bark', 'spin', 'dance'];
          dog.animController.play(socialMoves[Math.floor(Math.random() * socialMoves.length)], 2.5);
          roboAudio.playBark(dog.profile.voicePitch || 1.0);

          const greetings = {
            Bolt: `⚡ Bolt: "¡Hola ${playerRobot.name}! ¿Listo para una carrera hacia la portería?"`,
            Pixel: `🔍 Pixel: "He sincronizado mis sensores contigo, ${playerRobot.name}."`,
            Luna: `💖 Luna: "¡Qué lindo verte, ${playerRobot.name}! Te mando mimos cibernéticos."`,
            Rusty: `🤸 Rusty: "¡Mírame, ${playerRobot.name}! ¡Mira qué truco acabo de inventar!"`,
            Sparky: `🐾 Sparky: "¡Hola compañero! El día está perfecto para explorar juntos."`
          };
          this.logActivity(greetings[dog.name] || `🐾 ¡${dog.name} saludó alegremente a ${playerRobot.name}!`);
        }
      }

      // 2. Greeting between Autonomous Dogs (With Cooldown)
      if (ai.dogGreetCooldown <= 0) {
        this.pack.forEach(otherDog => {
          if (otherDog === dog) return;
          const distBetween = dog.group.position.distanceTo(otherDog.group.position);
          if (
            distBetween < 3.4 &&
            ai.state !== 'INTERACT_DOG' &&
            ai.lastInteractedDog !== otherDog &&
            otherDog.aiState.dogGreetCooldown <= 0
          ) {
            ai.state = 'INTERACT_DOG';
            ai.stateTimer = 3.0;
            ai.dogGreetCooldown = 16.0;
            ai.lastInteractedDog = otherDog;
            otherDog.aiState.dogGreetCooldown = 16.0;

            dog.lookAt(otherDog.group.position);
            otherDog.lookAt(dog.group.position);

            if (Math.random() < 0.45) {
              dog.setEmotion(EMOTIONS.EXCITED);
              dog.animController.play('playBow', 2.5);
              otherDog.animController.play('wagTail', 2.5);
              roboAudio.playYip(dog.profile.voicePitch || 1.0);
              this.logActivity(`🐶 ¡${dog.name} hizo una reverencia de juego (play-bow) ante ${otherDog.name}!`);
            } else {
              dog.setEmotion(EMOTIONS.HAPPY);
              dog.animController.play(Math.random() < 0.5 ? 'sniff' : 'nuzzle', 2.2);
              roboAudio.playBoop(dog.profile.voicePitch || 1.0);
              this.logActivity(`🐾 ${dog.name} y ${otherDog.name} se saludaron con un boop de hocicos.`);
            }
          }
        });
      }

      if (ai.state === 'INTERACT_PLAYER') {
        if (playerRobot) dog.lookAt(playerRobot.group.position);
        if (ai.stateTimer <= 0) {
          this.pickNewTarget(dog);
        }
        return;
      }

      if (ai.state === 'INTERACT_DOG') {
        if (ai.stateTimer <= 0) {
          ai.lastInteractedDog = null;
          this.pickNewTarget(dog);
        }
        return;
      }

      // 3. Reached Doghouse Station
      if (ai.state === 'GO_RECHARGE') {
        const distToStation = Math.hypot(dog.group.position.x - 72, dog.group.position.z - 52);
        if (distToStation < 2.5) {
          ai.state = 'RECHARGING';
          ai.stateTimer = 6.0;
          dog.energy = 100;
          dog.setEmotion(EMOTIONS.SLEEPY);
          dog.animController.play('lieDown');
          roboAudio.playBoop(dog.profile.voicePitch || 1.0);
        }
      }

      if (ai.state === 'RECHARGING') {
        if (ai.stateTimer <= 0) {
          dog.setEmotion(EMOTIONS.HAPPY);
          this.pickNewTarget(dog);
        }
        return;
      }

      // 4. Movement Navigation toward target
      const curPos = dog.group.position;
      const distToTarget = Math.hypot(curPos.x - ai.targetPos.x, curPos.z - ai.targetPos.z);

      if (ai.state === 'ASSEMBLE_PACK' && distToTarget < 1.8) {
        if (playerRobot) dog.lookAt(playerRobot.group.position);
        dog.setEmotion(EMOTIONS.LOVING);
        dog.animController.play('playBow', 2.5);
        roboAudio.playBoop(dog.profile.voicePitch || 1.0);
        ai.state = 'PAUSE';
        ai.stateTimer = 4.0;
      } else if (distToTarget < 2.0 || ai.stateTimer <= 0) {
        if (Math.random() < 0.35 && ai.state !== 'PAUSE') {
          const tricks = ['sniff', 'sit', 'wagTail', 'bark', 'spin', 'backflip', 'dance'];
          const trick = tricks[Math.floor(Math.random() * tricks.length)];
          dog.animController.play(trick, 2.5);
          ai.state = 'PAUSE';
          ai.stateTimer = 2.5;
        } else {
          this.pickNewTarget(dog);
        }
      }

      const activeMoveStates = [
        'WANDER', 'CHASE_BALL', 'CHASE_SNACK', 'GO_RECHARGE',
        'GO_TRAMPOLINE', 'GO_BALLPIT', 'GO_SLIDE', 'GO_TUNNEL',
        'GO_TARGET', 'GO_PINATA', 'ASSEMBLE_PACK', 'PLAY_TAG', 'SPEED_RACE', 'PACK_GOSSIP'
      ];

      if (activeMoveStates.includes(ai.state)) {
        const rawDir = new THREE.Vector3().subVectors(ai.targetPos, curPos);
        rawDir.y = 0;
        if (rawDir.lengthSq() > 0.0001) rawDir.normalize();

        const dir = this.computeAvoidanceDir(curPos, rawDir);
        const targetAngle = Math.atan2(dir.x, dir.z);
        dog.group.rotation.y = lerpAngle(dog.group.rotation.y, targetAngle, delta * 6);

        // Unstuck detector for autonomous dogs
        if (ai.lastPos) {
          const moved = Math.hypot(curPos.x - ai.lastPos.x, curPos.z - ai.lastPos.z);
          ai.lastPos.copy(curPos);
          if (moved < 0.035 && distToTarget > 2.0) {
            ai.stuckTimer = (ai.stuckTimer || 0) + delta;
            if (ai.stuckTimer > 0.65) {
              const tan = new THREE.Vector3(-rawDir.z, 0, rawDir.x).normalize();
              curPos.addScaledVector(tan, delta * 3.8);
            }
            if (ai.stuckTimer > 1.8) {
              ai.stuckTimer = 0;
              this.pickNewTarget(dog);
            }
          } else {
            ai.stuckTimer = Math.max(0, (ai.stuckTimer || 0) - delta * 2);
          }
        }

        curPos.addScaledVector(dir, ai.speed * delta);

        if (this.world && this.world.resolveObstacleCollisions) {
          this.world.resolveObstacleCollisions(curPos, 0.75, 1.2);
        }

        // Parabolic vertical physics so trampoline bounces & jumps don't snap to ground immediately
        const groundY = this.world.getHeightAt(curPos.x, curPos.z);
        if (!dog.isInWater) {
          if (curPos.y > groundY + 0.05 || (dog.velocityY && dog.velocityY > 0)) {
            dog.velocityY = (dog.velocityY || 0) - 18.0 * delta;
            curPos.y += dog.velocityY * delta;
            if (curPos.y <= groundY) {
              curPos.y = groundY;
              dog.velocityY = 0;
            }
          } else {
            curPos.y = groundY;
            dog.velocityY = 0;
          }
        }

        // Process world interactions
        const prevY = curPos.y;
        this.world.handleRobotInteractions(dog);
        // Convert instantaneous upward position boosts (like trampoline) into smooth vertical velocity
        if (curPos.y > prevY + 0.5 && !dog.isInWater) {
          dog.velocityY = (curPos.y - prevY) * 3.2;
          curPos.y = prevY + 0.15;
        }
      }

      // Robot-to-Robot Solid Horizontal XZ Collision Pushout (never pushes dogs underground!)
      if (playerRobot && Math.abs(dog.group.position.y - playerRobot.group.position.y) < 1.2) {
        const dx = dog.group.position.x - playerRobot.group.position.x;
        const dz = dog.group.position.z - playerRobot.group.position.z;
        const distToPlayer = Math.hypot(dx, dz);
        if (distToPlayer < 1.4 && distToPlayer > 0.001) {
          const overlap = (1.4 - distToPlayer) * 0.5;
          const nx = dx / distToPlayer;
          const nz = dz / distToPlayer;
          dog.group.position.x += nx * overlap;
          dog.group.position.z += nz * overlap;
          playerRobot.group.position.x -= nx * overlap;
          playerRobot.group.position.z -= nz * overlap;
        }
      }

      this.pack.forEach(otherDog => {
        if (otherDog === dog) return;
        if (Math.abs(dog.group.position.y - otherDog.group.position.y) >= 1.2) return;
        const dx = dog.group.position.x - otherDog.group.position.x;
        const dz = dog.group.position.z - otherDog.group.position.z;
        const distBetween = Math.hypot(dx, dz);
        if (distBetween < 1.35 && distBetween > 0.001) {
          const overlap = (1.35 - distBetween) * 0.5;
          const nx = dx / distBetween;
          const nz = dz / distBetween;
          dog.group.position.x += nx * overlap;
          dog.group.position.z += nz * overlap;
          otherDog.group.position.x -= nx * overlap;
          otherDog.group.position.z -= nz * overlap;
        }
      });
    });
  }
}