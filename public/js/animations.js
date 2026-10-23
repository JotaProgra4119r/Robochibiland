// Procedural & Keyframe Animation System for Chibi Robot Dogs
import * as THREE from 'three';
import { roboAudio } from './audio.js';

export class AnimationController {
  constructor(robot) {
    this.robot = robot;
    this.nodes = robot.nodes;
    this.currentAnim = 'idle';
    this.animTime = 0;
    this.animSpeed = 1.0;

    // Sequence / Action Queue for programmable movements
    this.actionQueue = [];
    this.currentAction = null;
    this.actionTimer = 0;
    this.actionDuration = 0;

    // Default base poses
    this.baseBodyY = 0.95;
    this.stepTimer = 0;
  }

  play(animName, duration = 0) {
    if (this.currentAnim === animName && !duration) return;
    this.currentAnim = animName;
    this.animTime = 0;

    if (duration > 0) {
      this.actionDuration = duration;
      this.actionTimer = 0;
    } else {
      this.actionDuration = 0;
    }
  }

  // Execute a sequence of pre-recorded or learned movements
  playSequence(actionNames, onComplete = null) {
    this.actionQueue = [...actionNames];
    this.onSequenceComplete = onComplete;
    this.advanceSequence();
  }

  advanceSequence() {
    if (this.actionQueue.length === 0) {
      this.play('idle');
      if (this.onSequenceComplete) {
        this.onSequenceComplete();
        this.onSequenceComplete = null;
      }
      return;
    }

    const nextAction = this.actionQueue.shift();
    const durations = {
      idle: 1.0,
      walk: 1.5,
      run: 1.5,
      sit: 2.0,
      lieDown: 2.5,
      jump: 1.2,
      wagTail: 1.5,
      bark: 1.0,
      sniff: 2.0,
      scratch: 2.2,
      backflip: 1.6,
      spin: 1.5,
      roll: 1.8,
      wave: 2.0,
      recharge: 3.0,
      dig: 2.2,
      howl: 2.4,
      dance: 2.5,
      sneak: 2.0,
      playBow: 2.2,
      headTilt: 2.2,
      bellyRub: 3.0,
      beg: 2.5,
      shakeOff: 1.8,
      nuzzle: 2.0
    };

    const dur = durations[nextAction] || 1.5;
    this.play(nextAction, dur);
  }

  update(delta) {
    this.animTime += delta * this.animSpeed;

    // Check action duration timeout
    if (this.actionDuration > 0) {
      this.actionTimer += delta;
      if (this.actionTimer >= this.actionDuration) {
        this.advanceSequence();
        return;
      }
    }

    switch (this.currentAnim) {
      case 'idle':
        this.animateIdle(delta);
        break;
      case 'walk':
        this.animateWalk(delta, 1.0);
        break;
      case 'run':
        this.animateWalk(delta, 2.2);
        break;
      case 'sit':
        this.animateSit(delta);
        break;
      case 'lieDown':
        this.animateLieDown(delta);
        break;
      case 'jump':
        this.animateJump(delta);
        break;
      case 'wagTail':
        this.animateWagTail(delta);
        break;
      case 'bark':
        this.animateBark(delta);
        break;
      case 'sniff':
        this.animateSniff(delta);
        break;
      case 'scratch':
        this.animateScratch(delta);
        break;
      case 'backflip':
        this.animateBackflip(delta);
        break;
      case 'spin':
        this.animateSpin(delta);
        break;
      case 'roll':
        this.animateRoll(delta);
        break;
      case 'wave':
        this.animateWave(delta);
        break;
      case 'recharge':
        this.animateRecharge(delta);
        break;
      case 'dig':
        this.animateDig(delta);
        break;
      case 'howl':
        this.animateHowl(delta);
        break;
      case 'dance':
        this.animateDance(delta);
        break;
      case 'sneak':
        this.animateSneak(delta);
        break;
      case 'playBow':
        this.animatePlayBow(delta);
        break;
      case 'headTilt':
        this.animateHeadTilt(delta);
        break;
      case 'bellyRub':
        this.animateBellyRub(delta);
        break;
      case 'beg':
        this.animateBeg(delta);
        break;
      case 'shakeOff':
        this.animateShakeOff(delta);
        break;
      case 'nuzzle':
        this.animateNuzzle(delta);
        break;
      case 'pickedUp':
        this.animatePickedUp(delta);
        break;
      case 'chaseTail':
        this.animateChaseTail(delta);
        break;
      case 'dizzy':
        this.animateDizzy(delta);
        break;
      case 'swimming':
        this.animateSwimming(delta);
        break;
      case 'patrolLook':
        this.animatePatrolLook(delta);
        break;
      case 'scentTrack':
        this.animateScentTrack(delta);
        break;
      default:
        this.animateIdle(delta);
        break;
    }
  }

  animateIdle(delta) {
    const t = this.animTime;
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const earL = this.nodes.earL;
    const earR = this.nodes.earR;
    const legs = this.nodes.legs;

    // Subtle gentle breathing
    body.position.y = THREE.MathUtils.lerp(body.position.y, this.baseBodyY + Math.sin(t * 2.2) * 0.03, delta * 6);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, 0, delta * 6);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, 0, delta * 6);

    // Ears twitching
    earL.rotation.x = Math.sin(t * 1.5) * 0.08;
    earR.rotation.x = Math.sin(t * 1.5 + 0.5) * 0.08;

    // Tail gentle wag
    tail.rotation.y = Math.sin(t * 3.5) * 0.35;
    tail.rotation.z = Math.sin(t * 2.0) * 0.15;

    // Reset legs to upright stance
    Object.values(legs).forEach(leg => {
      leg.hip.rotation.x = THREE.MathUtils.lerp(leg.hip.rotation.x, 0, delta * 6);
      leg.hip.rotation.z = THREE.MathUtils.lerp(leg.hip.rotation.z, 0, delta * 6);
      leg.knee.rotation.x = THREE.MathUtils.lerp(leg.knee.rotation.x, 0, delta * 6);
    });
  }

  animateWalk(delta, speedMultiplier = 1.0) {
    const t = this.animTime * 6.5 * speedMultiplier;
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    // Body bob and sway
    const bob = Math.abs(Math.sin(t)) * 0.08;
    body.position.y = this.baseBodyY + bob;
    body.rotation.z = Math.sin(t) * 0.04;
    body.rotation.y = Math.cos(t) * 0.03;

    // Quadruped diagonal gait cycle:
    // Pair 1: Front-Left & Back-Right
    // Pair 2: Front-Right & Back-Left
    const swingFL = Math.sin(t) * 0.55 * speedMultiplier;
    const swingBR = Math.sin(t) * 0.55 * speedMultiplier;
    const swingFR = Math.sin(t + Math.PI) * 0.55 * speedMultiplier;
    const swingBL = Math.sin(t + Math.PI) * 0.55 * speedMultiplier;

    legs.FL.hip.rotation.x = swingFL;
    legs.FL.knee.rotation.x = Math.max(0, -swingFL * 0.7);

    legs.BR.hip.rotation.x = swingBR;
    legs.BR.knee.rotation.x = Math.max(0, swingBR * 0.7);

    legs.FR.hip.rotation.x = swingFR;
    legs.FR.knee.rotation.x = Math.max(0, -swingFR * 0.7);

    legs.BL.hip.rotation.x = swingBL;
    legs.BL.knee.rotation.x = Math.max(0, swingBL * 0.7);

    // Energetic tail wag
    tail.rotation.y = Math.sin(t * 1.8) * 0.75;

    // Sound of tiny robotic footsteps
    this.stepTimer += delta * 6.5 * speedMultiplier;
    if (this.stepTimer >= Math.PI) {
      this.stepTimer = 0;
      if (this.robot.isPlayer) roboAudio.playStep();
    }
  }

  animateSit(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    // Torso tilts back and lowers
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.58, delta * 6);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, -0.42, delta * 6);

    // Front paws straight down
    legs.FL.hip.rotation.x = THREE.MathUtils.lerp(legs.FL.hip.rotation.x, 0.38, delta * 6);
    legs.FR.hip.rotation.x = THREE.MathUtils.lerp(legs.FR.hip.rotation.x, 0.38, delta * 6);
    legs.FL.knee.rotation.x = THREE.MathUtils.lerp(legs.FL.knee.rotation.x, 0, delta * 6);
    legs.FR.knee.rotation.x = THREE.MathUtils.lerp(legs.FR.knee.rotation.x, 0, delta * 6);

    // Back legs folded
    legs.BL.hip.rotation.x = THREE.MathUtils.lerp(legs.BL.hip.rotation.x, -1.2, delta * 6);
    legs.BR.hip.rotation.x = THREE.MathUtils.lerp(legs.BR.hip.rotation.x, -1.2, delta * 6);
    legs.BL.knee.rotation.x = THREE.MathUtils.lerp(legs.BL.knee.rotation.x, 1.4, delta * 6);
    legs.BR.knee.rotation.x = THREE.MathUtils.lerp(legs.BR.knee.rotation.x, 1.4, delta * 6);

    // Head looks up proudly
    neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, 0.45, delta * 6);

    // Tail wags along floor
    tail.rotation.y = Math.sin(this.animTime * 5.0) * 0.5;
  }

  animateLieDown(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.32, delta * 5);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, 0, delta * 5);

    // All paws splayed or folded
    legs.FL.hip.rotation.x = THREE.MathUtils.lerp(legs.FL.hip.rotation.x, 1.1, delta * 5);
    legs.FR.hip.rotation.x = THREE.MathUtils.lerp(legs.FR.hip.rotation.x, 1.1, delta * 5);
    legs.BL.hip.rotation.x = THREE.MathUtils.lerp(legs.BL.hip.rotation.x, -1.1, delta * 5);
    legs.BR.hip.rotation.x = THREE.MathUtils.lerp(legs.BR.hip.rotation.x, -1.1, delta * 5);

    neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, -0.2, delta * 5);
    tail.rotation.y = Math.sin(this.animTime * 1.5) * 0.2;
  }

  animateJump(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const tail = this.nodes.tail;

    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.2));

    // Parabolic jump arc: 4 * h * p * (1 - p)
    const jumpHeight = Math.sin(progress * Math.PI) * 1.8;
    body.position.y = this.baseBodyY + jumpHeight;

    if (progress < 0.2) {
      // Crouch prepare
      body.rotation.x = 0.2;
      legs.FL.hip.rotation.x = 0.6;
      legs.FR.hip.rotation.x = 0.6;
    } else if (progress < 0.7) {
      // Mid-air leap
      body.rotation.x = -0.3;
      legs.FL.hip.rotation.x = -0.5;
      legs.FR.hip.rotation.x = -0.5;
      legs.BL.hip.rotation.x = 0.6;
      legs.BR.hip.rotation.x = 0.6;
    } else {
      // Land
      body.rotation.x = 0.1;
      legs.FL.hip.rotation.x = 0;
      legs.FR.hip.rotation.x = 0;
    }

    tail.rotation.y = Math.sin(this.animTime * 12.0) * 0.9;
  }

  animateWagTail(delta) {
    const tail = this.nodes.tail;
    const body = this.nodes.body;
    const earL = this.nodes.earL;
    const earR = this.nodes.earR;

    body.position.y = this.baseBodyY + Math.sin(this.animTime * 8) * 0.04;
    // Super fast excited tail wag
    tail.rotation.y = Math.sin(this.animTime * 16.0) * 1.1;

    // Ears twitch excited
    earL.rotation.z = 0.35 + Math.sin(this.animTime * 8) * 0.1;
    earR.rotation.z = -0.35 - Math.sin(this.animTime * 8) * 0.1;
  }

  animateBark(delta) {
    const neck = this.nodes.neck;
    const body = this.nodes.body;
    const progress = (this.actionTimer % 0.5) / 0.5;

    // Head tosses up and barks
    neck.rotation.x = Math.sin(progress * Math.PI) * 0.35;
    body.position.y = this.baseBodyY + Math.sin(progress * Math.PI) * 0.08;

    if (this.actionTimer < 0.1 && this.robot.isPlayer) {
      roboAudio.playBark(1.1);
    }
  }

  animateSniff(delta) {
    const neck = this.nodes.neck;
    const body = this.nodes.body;

    // Head lowers near ground and turns left-right curiously
    neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, -0.4, delta * 6);
    neck.rotation.y = Math.sin(this.animTime * 4.0) * 0.45;
    body.position.y = THREE.MathUtils.lerp(body.position.y, this.baseBodyY - 0.12, delta * 6);
  }

  animateScratch(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;

    // Lean to the right
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, -0.3, delta * 6);
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.65, delta * 6);

    // Left hind leg scratches ear rapidly
    const scratchFreq = Math.sin(this.animTime * 18.0) * 0.6;
    legs.BL.hip.rotation.x = 1.0 + scratchFreq;
    legs.BL.hip.rotation.z = 0.5;
    legs.BL.knee.rotation.x = -0.8;
  }

  animateBackflip(delta) {
    const body = this.nodes.body;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.6));

    const jumpHeight = Math.sin(progress * Math.PI) * 2.2;
    body.position.y = this.baseBodyY + jumpHeight;

    // Full 360 flip
    body.rotation.x = progress * Math.PI * 2;

    if (progress > 0.95 && this.robot.isPlayer) {
      roboAudio.playTrickSuccess();
    }
  }

  animateSpin(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const tail = this.nodes.tail;

    this.robot.group.rotation.y += delta * 6.0;
    body.position.y = this.baseBodyY + Math.sin(this.animTime * 8) * 0.05;
    tail.rotation.y = Math.sin(this.animTime * 14) * 0.9;

    // Walking in spin
    legs.FL.hip.rotation.x = Math.sin(this.animTime * 10) * 0.4;
    legs.FR.hip.rotation.x = Math.sin(this.animTime * 10 + Math.PI) * 0.4;
  }

  animateRoll(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const tail = this.nodes.tail;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.8));

    // Full 360 barrel roll on Z axis
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.45 + Math.sin(progress * Math.PI) * 0.35, delta * 8);
    body.rotation.z = progress * Math.PI * 2;

    // Legs tucked playfully
    legs.FL.hip.rotation.x = 0.5;
    legs.FR.hip.rotation.x = 0.5;
    legs.BL.hip.rotation.x = 0.8;
    legs.BR.hip.rotation.x = 0.8;
    tail.rotation.y = Math.sin(this.animTime * 12) * 0.8;
  }

  animateWave(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    // Sit up on hind paws
    body.position.y = THREE.MathUtils.lerp(body.position.y, 1.15, delta * 6);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, -0.65, delta * 6);

    // Left front paw rests down, Right front paw raises and waves high!
    legs.FL.hip.rotation.x = THREE.MathUtils.lerp(legs.FL.hip.rotation.x, 0.5, delta * 6);
    legs.FR.hip.rotation.x = -1.2 + Math.sin(this.animTime * 10) * 0.35;
    legs.FR.knee.rotation.x = 0.8 + Math.sin(this.animTime * 10) * 0.3;

    // Back legs supporting
    legs.BL.hip.rotation.x = THREE.MathUtils.lerp(legs.BL.hip.rotation.x, -1.1, delta * 6);
    legs.BR.hip.rotation.x = THREE.MathUtils.lerp(legs.BR.hip.rotation.x, -1.1, delta * 6);

    neck.rotation.x = 0.4;
    neck.rotation.y = Math.sin(this.animTime * 3) * 0.2;
    tail.rotation.y = Math.sin(this.animTime * 10) * 0.8;

    if (this.actionTimer < 0.1 && this.robot.isPlayer) {
      roboAudio.playWaveSound(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateRecharge(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.28, delta * 4);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, 0, delta * 4);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, 0, delta * 4);

    // All paws flat
    legs.FL.hip.rotation.x = THREE.MathUtils.lerp(legs.FL.hip.rotation.x, 1.25, delta * 4);
    legs.FR.hip.rotation.x = THREE.MathUtils.lerp(legs.FR.hip.rotation.x, 1.25, delta * 4);
    legs.BL.hip.rotation.x = THREE.MathUtils.lerp(legs.BL.hip.rotation.x, -1.25, delta * 4);
    legs.BR.hip.rotation.x = THREE.MathUtils.lerp(legs.BR.hip.rotation.x, -1.25, delta * 4);

    neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, -0.4, delta * 4);
    tail.rotation.y = 0;
  }

  animateDig(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.72, delta * 6);
    body.rotation.x = 0.35;
    neck.rotation.x = -0.45;

    // Fast alternate digging front paws
    const digL = Math.sin(this.animTime * 18) * 0.7;
    const digR = Math.sin(this.animTime * 18 + Math.PI) * 0.7;
    legs.FL.hip.rotation.x = 0.5 + digL;
    legs.FR.hip.rotation.x = 0.5 + digR;

    // Tail high and excited
    tail.rotation.x = 0.8;
    tail.rotation.y = Math.sin(this.animTime * 14) * 0.9;
  }

  animateHowl(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    // Sitting position with neck tilted back high
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.62, delta * 5);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, -0.38, delta * 5);

    legs.BL.hip.rotation.x = -1.1;
    legs.BR.hip.rotation.x = -1.1;
    legs.FL.hip.rotation.x = 0.35;
    legs.FR.hip.rotation.x = 0.35;

    // Chin up towards the sky
    neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, 0.82, delta * 6);
    neck.rotation.y = Math.sin(this.animTime * 2.5) * 0.08;
    tail.rotation.y = Math.sin(this.animTime * 6) * 0.3;

    if (this.actionTimer < 0.1 && this.robot.isPlayer) {
      roboAudio.playHowl(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateDance(delta) {
    const t = this.animTime * 9.0;
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    // Party rhythmic bounce & roll
    body.position.y = this.baseBodyY + Math.abs(Math.sin(t)) * 0.22;
    body.rotation.z = Math.sin(t * 0.5) * 0.25;
    neck.rotation.z = -Math.sin(t * 0.5) * 0.2;
    neck.rotation.x = Math.sin(t) * 0.15;

    // Stepping paws
    legs.FL.hip.rotation.x = Math.sin(t) * 0.6;
    legs.BR.hip.rotation.x = -Math.sin(t) * 0.6;
    legs.FR.hip.rotation.x = -Math.sin(t) * 0.6;
    legs.BL.hip.rotation.x = Math.sin(t) * 0.6;

    tail.rotation.y = Math.sin(t * 2.0) * 1.2;
  }

  animateSneak(delta) {
    const t = this.animTime * 3.5;
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    // Stalking low to the ground
    body.position.y = 0.55 + Math.sin(t * 2) * 0.03;
    body.rotation.x = 0.15;
    neck.rotation.x = -0.25;

    legs.FL.hip.rotation.x = Math.sin(t) * 0.35;
    legs.BR.hip.rotation.x = Math.sin(t) * 0.35;
    legs.FR.hip.rotation.x = Math.sin(t + Math.PI) * 0.35;
    legs.BL.hip.rotation.x = Math.sin(t + Math.PI) * 0.35;

    tail.rotation.y = Math.sin(t) * 0.3;
  }

  // Authentic Canine Play-Bow (Universal invitation to play!)
  animatePlayBow(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    // Front low to floor, rear angled up high in the air
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.52, delta * 7);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, 0.45, delta * 7);

    // Front elbows splayed forward touching ground
    legs.FL.hip.rotation.x = THREE.MathUtils.lerp(legs.FL.hip.rotation.x, 0.95, delta * 7);
    legs.FR.hip.rotation.x = THREE.MathUtils.lerp(legs.FR.hip.rotation.x, 0.95, delta * 7);
    legs.FL.knee.rotation.x = THREE.MathUtils.lerp(legs.FL.knee.rotation.x, -0.6, delta * 7);
    legs.FR.knee.rotation.x = THREE.MathUtils.lerp(legs.FR.knee.rotation.x, -0.6, delta * 7);

    // Back legs straight and rear held high
    legs.BL.hip.rotation.x = THREE.MathUtils.lerp(legs.BL.hip.rotation.x, -0.2, delta * 7);
    legs.BR.hip.rotation.x = THREE.MathUtils.lerp(legs.BR.hip.rotation.x, -0.2, delta * 7);

    // Head tilted up looking expectantly at play partner
    neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, -0.4, delta * 7);

    // Super enthusiastic high tail wag
    tail.rotation.x = 0.8;
    tail.rotation.y = Math.sin(this.animTime * 18.0) * 1.1;

    if (this.actionTimer < 0.1 && this.robot.isPlayer) {
      roboAudio.playYip(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  // Inquisitive Head Tilt (Cognitive attention & listening)
  animateHeadTilt(delta) {
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const earL = this.nodes.earL;
    const earR = this.nodes.earR;

    // Head tilts 25 degrees left or right with gentle oscillation
    const tiltCycle = Math.sin(this.animTime * 3.5);
    neck.rotation.z = THREE.MathUtils.lerp(neck.rotation.z, tiltCycle * 0.42, delta * 6);
    neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, 0.18, delta * 5);

    // One ear perks up while the other softens
    earL.rotation.z = 0.25 + (tiltCycle > 0 ? 0.35 : -0.15);
    earR.rotation.z = -0.25 + (tiltCycle < 0 ? -0.35 : 0.15);

    tail.rotation.y = Math.sin(this.animTime * 5.0) * 0.4;

    if (this.actionTimer < 0.1 && this.robot.isPlayer) {
      roboAudio.playWhine(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  // Belly Rub Posture (Total trust, loyalty and affection)
  animateBellyRub(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    // Rolled over completely onto back
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.32, delta * 6);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, Math.PI * 0.9, delta * 6);

    // Paws paddling lazily in the air
    const pawPaddle = Math.sin(this.animTime * 6.0) * 0.35;
    legs.FL.hip.rotation.x = 0.8 + pawPaddle;
    legs.FR.hip.rotation.x = 0.8 - pawPaddle;
    legs.BL.hip.rotation.x = -0.5 + pawPaddle;
    legs.BR.hip.rotation.x = -0.5 - pawPaddle;

    neck.rotation.x = 0.2;
    tail.rotation.y = Math.sin(this.animTime * 14.0) * 0.7;
  }

  // Begging Posture (Standing on hind legs with front paws up)
  animateBeg(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    body.position.y = THREE.MathUtils.lerp(body.position.y, 1.25, delta * 6);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, -0.75, delta * 6);

    // Both front paws held up together, bobbing cutely
    const begBob = Math.sin(this.animTime * 8.0) * 0.2;
    legs.FL.hip.rotation.x = THREE.MathUtils.lerp(legs.FL.hip.rotation.x, -0.65 + begBob, delta * 7);
    legs.FR.hip.rotation.x = THREE.MathUtils.lerp(legs.FR.hip.rotation.x, -0.65 + begBob, delta * 7);
    legs.FL.knee.rotation.x = THREE.MathUtils.lerp(legs.FL.knee.rotation.x, 0.9, delta * 7);
    legs.FR.knee.rotation.x = THREE.MathUtils.lerp(legs.FR.knee.rotation.x, 0.9, delta * 7);

    // Hind legs squatting firmly
    legs.BL.hip.rotation.x = THREE.MathUtils.lerp(legs.BL.hip.rotation.x, -1.2, delta * 6);
    legs.BR.hip.rotation.x = THREE.MathUtils.lerp(legs.BR.hip.rotation.x, -1.2, delta * 6);

    neck.rotation.x = 0.5;
    tail.rotation.y = Math.sin(this.animTime * 12.0) * 0.8;
  }

  // Centrifugal Body Shake-Off (Arousal reset & drying)
  animateShakeOff(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const earL = this.nodes.earL;
    const earR = this.nodes.earR;

    // Fast violent side-to-side torsional oscillation
    const shakeFreq = Math.sin(this.animTime * 32.0);
    body.rotation.z = shakeFreq * 0.35;
    neck.rotation.z = -shakeFreq * 0.45;
    tail.rotation.y = -shakeFreq * 0.8;

    earL.rotation.z = 0.25 + shakeFreq * 0.5;
    earR.rotation.z = -0.25 + shakeFreq * 0.5;

    if (this.actionTimer < 0.1 && this.robot.isPlayer) {
      roboAudio.playPlayfulGrumble ? roboAudio.playPlayfulGrumble(1.2) : roboAudio.playBoop(0.8);
    }
  }

  // Nuzzle / Affectionate Boop
  animateNuzzle(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    body.position.y = THREE.MathUtils.lerp(body.position.y, this.baseBodyY - 0.08, delta * 6);
    body.rotation.z = 0.12;

    // Head extends forward and leans in gently
    neck.rotation.x = 0.25;
    neck.rotation.y = Math.sin(this.animTime * 3.0) * 0.25;
    tail.rotation.y = Math.sin(this.animTime * 8.0) * 0.7;

    if (this.actionTimer < 0.1 && this.robot.isPlayer) {
      roboAudio.playBoop(1.4);
    }
  }

  // Picked up by the user's hand (Legs paddling adorably in the air)
  animatePickedUp(delta) {
    const body = this.nodes.body;
    const legs = this.nodes.legs;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;

    body.position.y = THREE.MathUtils.lerp(body.position.y, this.baseBodyY + 0.15, delta * 6);
    body.rotation.z = Math.sin(this.animTime * 4.0) * 0.08;
    body.rotation.x = Math.sin(this.animTime * 3.0) * 0.05;

    // Fast adorable mid-air paddling
    const paddleSpeed = 12.0;
    const paddleAmp = 0.55;
    legs.FL.hip.rotation.x = Math.sin(this.animTime * paddleSpeed) * paddleAmp;
    legs.FR.hip.rotation.x = -Math.sin(this.animTime * paddleSpeed) * paddleAmp;
    legs.BL.hip.rotation.x = -Math.cos(this.animTime * paddleSpeed) * (paddleAmp * 0.8);
    legs.BR.hip.rotation.x = Math.cos(this.animTime * paddleSpeed) * (paddleAmp * 0.8);

    legs.FL.knee.rotation.x = 0.4 + Math.sin(this.animTime * paddleSpeed) * 0.3;
    legs.FR.knee.rotation.x = 0.4 - Math.sin(this.animTime * paddleSpeed) * 0.3;
    legs.BL.knee.rotation.x = 0.4 - Math.cos(this.animTime * paddleSpeed) * 0.3;
    legs.BR.knee.rotation.x = 0.4 + Math.cos(this.animTime * paddleSpeed) * 0.3;

    neck.rotation.x = 0.15 + Math.sin(this.animTime * 5.0) * 0.1;
    tail.rotation.y = Math.sin(this.animTime * 14.0) * 0.85;
  }

  // Chase its own tail (Spinning rapidly on itself trying to bite tail)
  animateChaseTail(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    // Body curved laterally
    body.rotation.y = Math.sin(this.animTime * 24.0) * 0.2;
    body.rotation.z = -0.15;
    body.position.y = this.baseBodyY;

    // Head turned sharply inward towards tail
    neck.rotation.y = 0.75;
    neck.rotation.x = 0.3;

    // Tail curved towards head
    tail.rotation.y = -0.85;

    // Fast running step cadence
    const legFreq = this.animTime * 18.0;
    legs.FL.hip.rotation.x = Math.sin(legFreq) * 0.6;
    legs.FR.hip.rotation.x = -Math.sin(legFreq) * 0.6;
    legs.BL.hip.rotation.x = -Math.sin(legFreq) * 0.6;
    legs.BR.hip.rotation.x = Math.sin(legFreq) * 0.6;
  }

  // Dizzy Wobble (Seated with spinning head wobble)
  animateDizzy(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    // Seated firmly
    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.55, delta * 8);
    legs.BL.hip.rotation.x = -1.1;
    legs.BR.hip.rotation.x = -1.1;
    legs.FL.hip.rotation.x = 0.2;
    legs.FR.hip.rotation.x = 0.2;

    // Wobbling head rotation in roll and yaw
    neck.rotation.z = Math.sin(this.animTime * 6.0) * 0.35;
    neck.rotation.y = Math.cos(this.animTime * 4.5) * 0.3;
    neck.rotation.x = 0.25;

    body.rotation.z = Math.sin(this.animTime * 5.0) * 0.12;
    tail.rotation.y = Math.sin(this.animTime * 2.0) * 0.2;
  }

  // Swimming in water (Low profile with rhythmic doggy paddle)
  animateSwimming(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    body.position.y = THREE.MathUtils.lerp(body.position.y, 0.45, delta * 6);
    body.rotation.x = 0.12; // tilted slightly forward
    body.rotation.z = Math.sin(this.animTime * 6.0) * 0.08;

    // Head held high above the water surface
    neck.rotation.x = -0.35;
    neck.rotation.y = Math.sin(this.animTime * 3.0) * 0.1;

    // Doggy paddling legs
    const paddleSpeed = 8.0;
    legs.FL.hip.rotation.x = Math.sin(this.animTime * paddleSpeed) * 0.65;
    legs.FR.hip.rotation.x = -Math.sin(this.animTime * paddleSpeed) * 0.65;
    legs.BL.hip.rotation.x = -Math.cos(this.animTime * paddleSpeed) * 0.5;
    legs.BR.hip.rotation.x = Math.cos(this.animTime * paddleSpeed) * 0.5;

    tail.rotation.y = Math.sin(this.animTime * 10.0) * 0.6;
  }

  // Perimeter Lookout (Standing alert, scanning left and right)
  animatePatrolLook(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    body.position.y = this.baseBodyY;
    legs.FL.hip.rotation.x = 0;
    legs.FR.hip.rotation.x = 0;
    legs.BL.hip.rotation.x = 0;
    legs.BR.hip.rotation.x = 0;

    // Smooth head scan cycle
    const scanCycle = Math.sin(this.animTime * 2.0);
    neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, scanCycle * 0.75, delta * 5);
    neck.rotation.x = -0.15; // attentive upward look

    tail.rotation.y = Math.sin(this.animTime * 4.0) * 0.25;
  }

  // Scent Track (Head low to ground, slow deliberate walk)
  animateScentTrack(delta) {
    const body = this.nodes.body;
    const neck = this.nodes.neck;
    const tail = this.nodes.tail;
    const legs = this.nodes.legs;

    body.position.y = THREE.MathUtils.lerp(body.position.y, this.baseBodyY - 0.14, delta * 6);
    body.rotation.x = 0.18; // body angled down to grass

    // Nose sniff hovering above ground
    neck.rotation.x = 0.48;
    neck.rotation.y = Math.sin(this.animTime * 4.0) * 0.22;

    // Gentle slow walk cycle
    const t = this.animTime * 4.2;
    legs.FL.hip.rotation.x = Math.sin(t) * 0.4;
    legs.FR.hip.rotation.x = -Math.sin(t) * 0.4;
    legs.BL.hip.rotation.x = -Math.sin(t) * 0.4;
    legs.BR.hip.rotation.x = Math.sin(t) * 0.4;

    tail.rotation.y = Math.sin(this.animTime * 5.0) * 0.35;
  }
}
