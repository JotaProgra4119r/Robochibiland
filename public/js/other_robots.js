// Complete Pack Manager with Instant Robot Switching / Possession & AI Behaviors
import * as THREE from 'three';
import { ChibiRobotDog, CHARACTER_PROFILES } from './robot.js';
import { AnimationController } from './animations.js';
import { EMOTIONS } from './emotions.js';
import { roboAudio } from './audio.js';

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

    robotNames.forEach((name, idx) => {
      const isInitialPlayer = (name === 'Sparky');
      const startPos = startPositions[name];

      const dog = new ChibiRobotDog(name, {
        isPlayer: isInitialPlayer
      });

      dog.animController = new AnimationController(dog);
      dog.group.position.copy(startPos);
      dog.group.position.y = this.world.getHeightAt(startPos.x, startPos.z);

      this.scene.add(dog.group);
      this.allRobots[name] = dog;

      dog.aiState = {
        state: 'WANDER',
        targetPos: new THREE.Vector3(),
        stateTimer: 2 + Math.random() * 4,
        speed: 3.4 * (dog.profile.speedMultiplier || 1.0),
        lastInteractedDog: null,
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
    const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), pRotY);

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
    if (!initiator || this.pack.length === 0) return;
    const preyDog = this.pack[Math.floor(Math.random() * this.pack.length)];
    if (!preyDog) return;

    this.logActivity(`🏃 ¡Comienza el juego de "La Traes"! ${initiator.name} persigue a ${preyDog.name}!`);
    roboAudio.playYip(1.4);

    initiator.aiState = initiator.aiState || {};
    initiator.aiState.state = 'PLAY_TAG';
    initiator.aiState.tagRole = 'CHASER';
    initiator.aiState.tagTarget = preyDog;
    initiator.aiState.speed = 7.0 * (initiator.profile.speedMultiplier || 1.0);
    initiator.animController.play('run');

    preyDog.aiState.state = 'PLAY_TAG';
    preyDog.aiState.tagRole = 'PREY';
    preyDog.aiState.tagTarget = initiator;
    preyDog.aiState.speed = 6.8 * (preyDog.profile.speedMultiplier || 1.0);
    preyDog.aiState.stateTimer = 16.0;
    preyDog.animController.play('run');
  }

  // Social Game 2: Speed Race to Landmark
  startSpeedRace(initiator) {
    if (!initiator) return;
    const destinations = [
      { name: 'la Portería de Fútbol', pos: new THREE.Vector3(25, 0, 40) },
      { name: 'el Muelle del Lago', pos: new THREE.Vector3(-44, 0, -75) },
      { name: 'la Piscina de Pelotas', pos: new THREE.Vector3(-32, 0, 48) }
    ];
    const target = destinations[Math.floor(Math.random() * destinations.length)];
    const racers = [initiator, ...this.pack.slice(0, 2)];

    this.logActivity(`🏁 ¡RETRO DE VELOCIDAD hacia ${target.name}! ¡3... 2... 1... ¡¡YA!! 🐕⚡`);
    roboAudio.playBark(1.2);

    racers.forEach((r, idx) => {
      r.aiState = r.aiState || {};
      r.aiState.state = 'SPEED_RACE';
      r.aiState.targetPos = target.pos.clone();
      r.aiState.speed = (6.0 + Math.random() * 2.5) * (r.profile.speedMultiplier || 1.0);
      r.aiState.stateTimer = 18.0;
      r.animController.play('run');
    });
  }

  // Social Game 3: Pack Gossip / Small Circle Meeting
  startPackGossip(initiator) {
    const center = initiator ? initiator.group.position.clone() : new THREE.Vector3(0, 0, 0);
    this.logActivity(`💬 ¡Reunión secreta de la manada en círculo para saludarse y charlar!`);
    roboAudio.playHappyJingle();

    const all = [initiator, ...this.pack].filter(Boolean);
    const count = all.length;
    all.forEach((dog, idx) => {
      const angle = (idx / count) * Math.PI * 2;
      const targetX = center.x + Math.cos(angle) * 2.4;
      const targetZ = center.z + Math.sin(angle) * 2.4;

      dog.aiState = dog.aiState || {};
      dog.aiState.state = 'PACK_GOSSIP';
      dog.aiState.targetPos = new THREE.Vector3(targetX, 0, targetZ);
      dog.aiState.speed = 4.2;
      dog.aiState.stateTimer = 12.0;
      dog.animController.play('walk');
    });
  }

  pickNewTarget(dog) {
    const ai = dog.aiState;
    const profile = dog.profile;

    // Biological drives depletion
    dog.energy = Math.max(10, (dog.energy || 100) - 1.5);
    dog.hydration = Math.max(15, (dog.hydration || 90) - 2.0);

    // 1. Biological Need: Urgent Thirst
    if (dog.hydration < 35 && Math.random() < 0.75) {
      ai.targetPos.set(12, 0, 10); // Water fountain
      ai.state = 'WANDER';
      dog.animController.play('walk');
      ai.speed = 3.8 * profile.speedMultiplier;
      ai.stateTimer = 9;
      this.logActivity(`💧 ${dog.name} tiene sed y va a beber a la cibercuenca.`);
      return;
    }

    // 2. Biological Need: Low Energy Recharge
    if (dog.energy < 25 && Math.random() < 0.7) {
      ai.targetPos.set(72, 0, 52); // Cyber doghouse
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
      ai.targetPos.copy(snack.group.position);
      ai.state = 'CHASE_SNACK';
      dog.animController.play('run');
      ai.speed = 5.6 * profile.speedMultiplier;
      ai.stateTimer = 8;
      this.logActivity(`🍪 ${dog.name} olió una galleta y corre a comérsela!`);
      return;
    }

    // 4. Personality & New Playground Attractions Explorer
    const choice = Math.random();

    if (profile.name === 'Bolt') {
      if (this.world.balls.length > 0 && choice < 0.6) {
        const ball = this.world.balls[Math.floor(Math.random() * this.world.balls.length)];
        ai.targetPos.copy(ball.mesh.position);
        ai.state = 'CHASE_BALL';
        dog.animController.play('run');
        ai.speed = 6.4 * profile.speedMultiplier;
        ai.stateTimer = 9;
        this.logActivity(`⚡ ${dog.name} corre a toda velocidad hacia la pelota!`);
      } else {
        // Bolt runs to the obstacle course
        ai.targetPos.set(22, 0, -50);
        ai.state = 'GO_TUNNEL';
        dog.animController.play('run');
        ai.speed = 5.8 * profile.speedMultiplier;
        ai.stateTimer = 8;
      }
    } else if (profile.name === 'Pixel') {
      if (choice < 0.45) {
        // Pixel inspects the lake or pier
        const angle = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 30;
        ai.targetPos.set(-80 + Math.cos(angle) * r, 0, -80 + Math.sin(angle) * r);
        ai.state = 'WANDER';
      } else {
        // Pixel analyzes the Target Toss board
        ai.targetPos.set(76, 0, 18);
        ai.state = 'GO_TARGET';
      }
      dog.animController.play('walk');
      ai.speed = 3.6 * profile.speedMultiplier;
      ai.stateTimer = 10;
    } else if (profile.name === 'Luna') {
      if (choice < 0.4) {
        // Luna dives into the colorful Ball Pit!
        ai.targetPos.set(-32, 0, 48);
        ai.state = 'GO_BALLPIT';
        dog.animController.play('walk');
      } else if (choice < 0.7) {
        ai.targetPos.set(72, 0, 52);
        ai.state = 'GO_RECHARGE';
        dog.animController.play('walk');
      } else {
        // Flower meadow stroll
        const a = Math.random() * Math.PI * 2;
        ai.targetPos.set(Math.cos(a) * 28, 0, Math.sin(a) * 28);
        ai.state = 'WANDER';
        dog.animController.play('walk');
      }
      ai.speed = 3.0 * profile.speedMultiplier;
      ai.stateTimer = 10;
    } else if (profile.name === 'Rusty') {
      if (choice < 0.35) {
        // Rusty loves the Agility Slide!
        ai.targetPos.set(-18, 0, -32);
        ai.state = 'GO_SLIDE';
      } else if (choice < 0.65) {
        // Rusty does trampoline backflips!
        ai.targetPos.set(38, 0, 22);
        ai.state = 'GO_TRAMPOLINE';
      } else {
        // Rusty jumps under the Piñata!
        ai.targetPos.set(-42, 0, 14);
        ai.state = 'GO_PINATA';
      }
      dog.animController.play('run');
      ai.speed = 5.0 * profile.speedMultiplier;
      ai.stateTimer = 9;
    } else {
      // Sparky (balanced explorer)
      const destinations = [
        new THREE.Vector3(-32, 0, 48), // Ball pit
        new THREE.Vector3(-18, 0, -32), // Slide
        new THREE.Vector3(22, 0, -50),  // Tunnel
        new THREE.Vector3(38, 0, 22),   // Trampoline
        new THREE.Vector3(50, 0, 40)    // Soccer field
      ];
      const dest = destinations[Math.floor(Math.random() * destinations.length)];
      ai.targetPos.copy(dest);
      ai.state = 'WANDER';
      dog.animController.play(Math.random() < 0.5 ? 'run' : 'walk');
      ai.speed = 3.8 * profile.speedMultiplier;
      ai.stateTimer = 8;
    }
  }

  update(delta, playerRobot = null) {
    this.pack.forEach(dog => {
      dog.update(delta);
      dog.animController.update(delta);

      if (dog.isPickedUp) return; // Hand Tool is currently holding this puppy in the air!

      const ai = dog.aiState;
      ai.stateTimer -= delta;

      // Handle "La Traes" (Tag) role behavior
      if (ai.state === 'PLAY_TAG') {
        if (!ai.tagTarget) {
          this.pickNewTarget(dog);
          return;
        }
        if (ai.tagRole === 'CHASER') {
          ai.targetPos.copy(ai.tagTarget.group.position);
          const d = dog.group.position.distanceTo(ai.tagTarget.group.position);
          if (d < 1.45) {
            // Tagged! Role reversal!
            roboAudio.playBoop(1.5);
            this.logActivity(`⚡ ¡${dog.name} tocó a ${ai.tagTarget.name}! ¡Ahora la trae ${ai.tagTarget.name}! 🐾`);
            const prevTarget = ai.tagTarget;
            ai.tagRole = 'PREY';
            ai.tagTarget = prevTarget;
            ai.stateTimer = 1.5; // Short delay before running

            if (prevTarget.aiState) {
              prevTarget.aiState.tagRole = 'CHASER';
              prevTarget.aiState.tagTarget = dog;
              prevTarget.animController.play('jump', 1.0);
            }
          }
        } else if (ai.tagRole === 'PREY') {
          const fleeDir = new THREE.Vector3().subVectors(dog.group.position, ai.tagTarget.group.position);
          fleeDir.y = 0;
          fleeDir.normalize();
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
        const d = dog.group.position.distanceTo(ai.targetPos);
        if (d < 2.8) {
          this.logActivity(`🏆 ¡¡${dog.name} GANÓ LA CARRERA!! ¡Es el perrito más veloz del parque! 🥇`);
          roboAudio.playGoalFanfare();
          dog.animController.play('backflip', 2.0);
          dog.setEmotion(EMOTIONS.PROUD);
          this.pack.forEach(d => {
            if (d.aiState && d.aiState.state === 'SPEED_RACE') {
              d.aiState.state = 'PAUSE';
              d.aiState.stateTimer = 3.0;
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
          if (Math.random() < 0.08) {
            dog.animController.play(Math.random() < 0.5 ? 'headTilt' : 'playBow', 1.8);
            roboAudio.playBoop(dog.profile.voicePitch || 1.0);
          }
        }
        if (ai.stateTimer <= 0) {
          this.pickNewTarget(dog);
          return;
        }
      }

      // 1. Social Greeting with Active Player Robot
      if (playerRobot && playerRobot !== dog) {
        const distToPlayer = dog.group.position.distanceTo(playerRobot.group.position);
        if (distToPlayer < 4.2 && ai.state !== 'INTERACT_PLAYER') {
          ai.state = 'INTERACT_PLAYER';
          ai.stateTimer = 3.5;
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
          this.logActivity(greetings[dog.name] || `🐾 ${dog.name} saludó alegremente a ${playerRobot.name}!`);
        }
      }

      // 2. Greeting between Autonomous Dogs (Canine Ethology)
      this.pack.forEach(otherDog => {
        if (otherDog === dog) return;
        const distBetween = dog.group.position.distanceTo(otherDog.group.position);
        if (distBetween < 3.5 && ai.state !== 'INTERACT_DOG' && ai.lastInteractedDog !== otherDog) {
          ai.state = 'INTERACT_DOG';
          ai.stateTimer = 3.2;
          ai.lastInteractedDog = otherDog;
          dog.lookAt(otherDog.group.position);
          otherDog.lookAt(dog.group.position);

          if (Math.random() < 0.45) {
            // Authentic canine play-bow invitation!
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

      if (ai.state === 'ASSEMBLE_PACK' && distToTarget < 2.0) {
        if (playerRobot) dog.lookAt(playerRobot.group.position);
        dog.setEmotion(EMOTIONS.LOVING);
        dog.animController.play('playBow', 2.5);
        roboAudio.playBoop(dog.profile.voicePitch || 1.0);
        ai.state = 'PAUSE';
        ai.stateTimer = 4.0;
      } else if (distToTarget < 2.2 || ai.stateTimer <= 0) {
        if (Math.random() < 0.35) {
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
        const dir = new THREE.Vector3().subVectors(ai.targetPos, curPos);
        dir.y = 0;
        dir.normalize();

        const targetAngle = Math.atan2(dir.x, dir.z);
        dog.group.rotation.y = THREE.MathUtils.lerp(dog.group.rotation.y, targetAngle, delta * 5);

        // Unstuck detector for autonomous dogs
        if (ai.lastPos) {
          const moved = curPos.distanceTo(ai.lastPos);
          ai.lastPos.copy(curPos);
          if (moved < 0.04 && distToTarget > 2.0) {
            ai.stuckTimer = (ai.stuckTimer || 0) + delta;
            if (ai.stuckTimer > 0.8) {
              // Apply tangent steering around obstacle
              const tan = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
              curPos.addScaledVector(tan, delta * 3.6);
            }
            if (ai.stuckTimer > 2.0) {
              ai.stuckTimer = 0;
              this.pickNewTarget(dog);
            }
          } else {
            ai.stuckTimer = Math.max(0, (ai.stuckTimer || 0) - delta * 2);
          }
        }

        curPos.addScaledVector(dir, ai.speed * delta);
        // Resolve obstacles & boundaries
        if (this.world && this.world.resolveObstacleCollisions) {
          this.world.resolveObstacleCollisions(curPos, 0.75);
        }
        curPos.y = this.world.getHeightAt(curPos.x, curPos.z);

        // Process world interactions
        this.world.handleRobotInteractions(dog);
      }

      // Robot-to-Robot Solid Collision Pushout (prevent clipping into each other)
      if (playerRobot) {
        const distToPlayer = dog.group.position.distanceTo(playerRobot.group.position);
        if (distToPlayer < 1.4 && distToPlayer > 0.001) {
          const overlap = 1.4 - distToPlayer;
          const push = new THREE.Vector3().subVectors(dog.group.position, playerRobot.group.position).normalize();
          dog.group.position.addScaledVector(push, overlap * 0.5);
          playerRobot.group.position.addScaledVector(push, -overlap * 0.5);
        }
      }

      this.pack.forEach(otherDog => {
        if (otherDog === dog) return;
        const distBetween = dog.group.position.distanceTo(otherDog.group.position);
        if (distBetween < 1.35 && distBetween > 0.001) {
          const overlap = 1.35 - distBetween;
          const push = new THREE.Vector3().subVectors(dog.group.position, otherDog.group.position).normalize();
          dog.group.position.addScaledVector(push, overlap * 0.5);
          otherDog.group.position.addScaledVector(push, -overlap * 0.5);
        }
      });
    });
  }
}
