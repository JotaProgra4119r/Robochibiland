// Procedural & Keyframe Animation System for Chibi Robot Dogs
// Features Smooth Exponential Pose Damping, 3-Joint Leg Kinematics (Hip/Knee/Paw) & Squash-and-Stretch
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

  // Frame-rate independent smooth damping helper
  damp(current, target, lambda, delta) {
    return THREE.MathUtils.damp(current, target, lambda, delta);
  }

  // Ensures unused axes smoothly return to neutral between different animations
  dampPoseToNeutral(delta, speed = 8, options = {}) {
    const { body, neck, tail, earL, earR, legs } = this.nodes;
    if (!options.keepBodyPos) {
      body.position.y = this.damp(body.position.y, this.baseBodyY, speed, delta);
    }
    if (!options.keepBodyRot) {
      body.rotation.x = this.damp(body.rotation.x, 0, speed, delta);
      body.rotation.y = this.damp(body.rotation.y, 0, speed, delta);
      body.rotation.z = this.damp(body.rotation.z, this.robot.bankAngle || 0, speed, delta);
    }
    if (!options.keepBodyScale) {
      body.scale.x = this.damp(body.scale.x, 1.0, speed, delta);
      body.scale.y = this.damp(body.scale.y, 1.0, speed, delta);
      body.scale.z = this.damp(body.scale.z, 1.0, speed, delta);
    }
    if (!options.keepNeck && neck && !this.robot.hasTarget) {
      neck.rotation.x = this.damp(neck.rotation.x, 0, speed, delta);
      neck.rotation.y = this.damp(neck.rotation.y, 0, speed, delta);
      neck.rotation.z = this.damp(neck.rotation.z, 0, speed, delta);
    }
    if (!options.keepTail && tail) {
      tail.rotation.x = this.damp(tail.rotation.x, 0.55, speed, delta);
      tail.rotation.y = this.damp(tail.rotation.y, 0, speed, delta);
      tail.rotation.z = this.damp(tail.rotation.z, 0, speed, delta);
    }
    if (!options.keepEars && earL && earR) {
      earL.rotation.x = this.damp(earL.rotation.x, 0, speed, delta);
      earR.rotation.x = this.damp(earR.rotation.x, 0, speed, delta);
    }
    if (!options.keepLegs && legs) {
      Object.values(legs).forEach(leg => {
        leg.hip.rotation.x = this.damp(leg.hip.rotation.x, 0, speed, delta);
        leg.hip.rotation.y = this.damp(leg.hip.rotation.y, 0, speed, delta);
        leg.hip.rotation.z = this.damp(leg.hip.rotation.z, 0, speed, delta);
        leg.knee.rotation.x = this.damp(leg.knee.rotation.x, 0, speed, delta);
        if (leg.paw) leg.paw.rotation.x = this.damp(leg.paw.rotation.x, 0, speed, delta);
      });
    }
  }

  play(animName, duration = 0) {
    if (this.currentAnim === animName && !duration) return;

    // Normalize full-turn rotations (e.g. after backflip or roll) so lerp doesn't unwind violently
    if (this.nodes.body) {
      this.nodes.body.rotation.x = this.nodes.body.rotation.x % (Math.PI * 2);
      this.nodes.body.rotation.z = this.nodes.body.rotation.z % (Math.PI * 2);
    }

    this.currentAnim = animName;
    this.animTime = 0;

    if (duration > 0) {
      this.actionDuration = duration;
      this.actionTimer = 0;
    } else {
      this.actionDuration = 0;
    }
  }

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
        this.animateWalk(delta, 2.1);
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
    this.dampPoseToNeutral(delta, 7, { keepBodyPos: true, keepTail: true, keepEars: true });
    const t = this.animTime;
    const { body, neck, tail, earL, earR } = this.nodes;

    // Natural organic breathing (chest expansion & vertical bob)
    const breath = Math.sin(t * 2.4);
    body.position.y = this.damp(body.position.y, this.baseBodyY + breath * 0.028, 8, delta);
    body.rotation.x = this.damp(body.rotation.x, breath * 0.018, 6, delta);

    if (!this.robot.hasTarget && neck) {
      neck.rotation.x = this.damp(neck.rotation.x, -breath * 0.03 + Math.sin(t * 1.1) * 0.04, 6, delta);
      neck.rotation.y = this.damp(neck.rotation.y, Math.sin(t * 0.7) * 0.06, 5, delta);
    }

    // Playful ear micro-twitches
    const earTwitch = Math.pow(Math.max(0, Math.sin(t * 1.7)), 6) * 0.22;
    earL.rotation.x = this.damp(earL.rotation.x, Math.sin(t * 1.5) * 0.06 + earTwitch, 10, delta);
    earR.rotation.x = this.damp(earR.rotation.x, Math.sin(t * 1.5 + 0.8) * 0.06, 10, delta);

    // Figure-8 happy tail sway
    tail.rotation.x = this.damp(tail.rotation.x, 0.55 + Math.cos(t * 2.2) * 0.08, 8, delta);
    tail.rotation.y = this.damp(tail.rotation.y, Math.sin(t * 3.6) * 0.38, 10, delta);
    tail.rotation.z = this.damp(tail.rotation.z, Math.cos(t * 1.8) * 0.12, 8, delta);
  }

  animateWalk(delta, speedMultiplier = 1.0) {
    this.dampPoseToNeutral(delta, 10, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepTail: true });
    const isRun = speedMultiplier > 1.5;
    const freq = isRun ? 10.5 : 6.8;
    const t = this.animTime * freq;
    const { body, neck, tail, legs } = this.nodes;

    // Quadruped gait: Trot for walk, bounding canter for run
    const phaseFL = 0;
    const phaseBR = isRun ? 0.35 : 0.15;
    const phaseFR = Math.PI;
    const phaseBL = isRun ? Math.PI + 0.35 : Math.PI + 0.15;

    const strideAmp = isRun ? 0.78 : 0.48;
    const kneeLiftAmp = isRun ? 0.85 : 0.55;

    const applyLegKinematics = (leg, phase, isFront) => {
      const cycle = t + phase;
      const hipTarget = Math.sin(cycle) * strideAmp;
      // Lift knee only during forward swing (when cos(cycle) > 0)
      const swingLift = Math.max(0, Math.cos(cycle));
      const kneeTarget = isFront ? swingLift * kneeLiftAmp : -swingLift * kneeLiftAmp * 0.85;
      const pawTarget = -swingLift * 0.35 + Math.sin(cycle) * 0.15;

      leg.hip.rotation.x = this.damp(leg.hip.rotation.x, hipTarget, 18, delta);
      leg.hip.rotation.z = this.damp(leg.hip.rotation.z, 0, 12, delta);
      leg.knee.rotation.x = this.damp(leg.knee.rotation.x, kneeTarget, 18, delta);
      if (leg.paw) {
        leg.paw.rotation.x = this.damp(leg.paw.rotation.x, pawTarget, 18, delta);
      }
    };

    applyLegKinematics(legs.FL, phaseFL, true);
    applyLegKinematics(legs.BR, phaseBR, false);
    applyLegKinematics(legs.FR, phaseFR, true);
    applyLegKinematics(legs.BL, phaseBL, false);

    // Double-frequency vertical bounce & natural spine pitch
    const bob = Math.abs(Math.sin(t)) * (isRun ? 0.13 : 0.065);
    body.position.y = this.damp(body.position.y, this.baseBodyY + bob, 16, delta);
    body.rotation.x = this.damp(body.rotation.x, isRun ? Math.cos(t) * 0.09 : Math.cos(t * 2) * 0.025, 14, delta);
    body.rotation.z = this.damp(body.rotation.z, (this.robot.bankAngle || 0) + Math.sin(t) * 0.035, 12, delta);
    body.rotation.y = this.damp(body.rotation.y, Math.cos(t) * 0.025, 12, delta);

    // Counter-bobbing head for natural balance
    if (!this.robot.hasTarget && neck) {
      neck.rotation.x = this.damp(neck.rotation.x, -Math.sin(t * 2) * 0.06 + (isRun ? 0.12 : 0), 14, delta);
    }

    // Energetic tail counterbalance
    tail.rotation.x = this.damp(tail.rotation.x, isRun ? 0.25 : 0.65, 10, delta);
    tail.rotation.y = Math.sin(t * 1.5) * (isRun ? 0.55 : 0.75);

    // Synchronized footstep audio
    this.stepTimer += delta * freq;
    if (this.stepTimer >= Math.PI) {
      this.stepTimer -= Math.PI;
      if (this.robot.isPlayer) roboAudio.playStep();
    }
  }

  animateSit(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.58, 7, delta);
    body.rotation.x = this.damp(body.rotation.x, -0.44, 7, delta);
    body.rotation.z = this.damp(body.rotation.z, 0, 7, delta);

    // Front legs planted straight
    legs.FL.hip.rotation.x = this.damp(legs.FL.hip.rotation.x, 0.42, 7, delta);
    legs.FR.hip.rotation.x = this.damp(legs.FR.hip.rotation.x, 0.42, 7, delta);
    legs.FL.knee.rotation.x = this.damp(legs.FL.knee.rotation.x, 0, 7, delta);
    legs.FR.knee.rotation.x = this.damp(legs.FR.knee.rotation.x, 0, 7, delta);
    if (legs.FL.paw) legs.FL.paw.rotation.x = this.damp(legs.FL.paw.rotation.x, 0.05, 7, delta);
    if (legs.FR.paw) legs.FR.paw.rotation.x = this.damp(legs.FR.paw.rotation.x, 0.05, 7, delta);

    // Hind legs neatly tucked
    legs.BL.hip.rotation.x = this.damp(legs.BL.hip.rotation.x, -1.22, 7, delta);
    legs.BR.hip.rotation.x = this.damp(legs.BR.hip.rotation.x, -1.22, 7, delta);
    legs.BL.knee.rotation.x = this.damp(legs.BL.knee.rotation.x, 1.45, 7, delta);
    legs.BR.knee.rotation.x = this.damp(legs.BR.knee.rotation.x, 1.45, 7, delta);
    if (legs.BL.paw) legs.BL.paw.rotation.x = this.damp(legs.BL.paw.rotation.x, 0.2, 7, delta);
    if (legs.BR.paw) legs.BR.paw.rotation.x = this.damp(legs.BR.paw.rotation.x, 0.2, 7, delta);

    neck.rotation.x = this.damp(neck.rotation.x, 0.42 + Math.sin(this.animTime * 2.2) * 0.04, 7, delta);
    neck.rotation.z = this.damp(neck.rotation.z, Math.sin(this.animTime * 1.5) * 0.05, 6, delta);
    tail.rotation.y = Math.sin(this.animTime * 5.5) * 0.55;
  }

  animateLieDown(delta) {
    this.dampPoseToNeutral(delta, 6, { keepBodyPos: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.32 + Math.sin(this.animTime * 1.8) * 0.015, 6, delta);

    // Sphinx-style relaxed paws
    legs.FL.hip.rotation.x = this.damp(legs.FL.hip.rotation.x, -1.15, 6, delta);
    legs.FR.hip.rotation.x = this.damp(legs.FR.hip.rotation.x, -1.15, 6, delta);
    legs.FL.knee.rotation.x = this.damp(legs.FL.knee.rotation.x, 0.25, 6, delta);
    legs.FR.knee.rotation.x = this.damp(legs.FR.knee.rotation.x, 0.25, 6, delta);

    legs.BL.hip.rotation.x = this.damp(legs.BL.hip.rotation.x, -1.25, 6, delta);
    legs.BR.hip.rotation.x = this.damp(legs.BR.hip.rotation.x, -1.25, 6, delta);
    legs.BL.knee.rotation.x = this.damp(legs.BL.knee.rotation.x, 1.4, 6, delta);
    legs.BR.knee.rotation.x = this.damp(legs.BR.knee.rotation.x, 1.4, 6, delta);

    neck.rotation.x = this.damp(neck.rotation.x, -0.15 + Math.sin(this.animTime * 1.8) * 0.03, 5, delta);
    tail.rotation.y = Math.sin(this.animTime * 2.0) * 0.25;
  }

  animateJump(delta) {
    const { body, legs, tail, neck } = this.nodes;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.2));

    if (this.actionTimer < 0.05 && this.robot.isPlayer) {
      roboAudio.playJump(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }

    if (progress < 0.18) {
      // Anticipation crouch (Squash)
      body.position.y = this.damp(body.position.y, this.baseBodyY - 0.22, 18, delta);
      body.scale.set(1.06, 0.92, 1.04);
      body.rotation.x = this.damp(body.rotation.x, 0.22, 15, delta);
      legs.FL.hip.rotation.x = 0.65;
      legs.FR.hip.rotation.x = 0.65;
      legs.BL.hip.rotation.x = -0.65;
      legs.BR.hip.rotation.x = -0.65;
    } else if (progress < 0.82) {
      // Parabolic flight arc (Stretch)
      const airP = (progress - 0.18) / 0.64;
      const jumpHeight = Math.sin(airP * Math.PI) * 1.85;
      body.position.y = this.baseBodyY + jumpHeight;
      body.scale.set(0.96, 1.06, 1.02);
      body.rotation.x = THREE.MathUtils.lerp(-0.38, 0.28, airP);
      neck.rotation.x = -0.2;

      legs.FL.hip.rotation.x = -0.55;
      legs.FR.hip.rotation.x = -0.55;
      legs.FL.knee.rotation.x = 0.45;
      legs.FR.knee.rotation.x = 0.45;
      legs.BL.hip.rotation.x = 0.7;
      legs.BR.hip.rotation.x = 0.7;
    } else {
      // Soft landing absorption
      body.position.y = this.damp(body.position.y, this.baseBodyY - 0.08, 16, delta);
      body.scale.set(1.04, 0.95, 1.02);
      body.rotation.x = this.damp(body.rotation.x, 0, 12, delta);
      this.dampPoseToNeutral(delta, 12, { keepBodyPos: true, keepBodyScale: true });
    }

    tail.rotation.y = Math.sin(this.animTime * 14.0) * 0.9;
  }

  animateWagTail(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepTail: true, keepEars: true });
    const { tail, body, earL, earR } = this.nodes;

    body.position.y = this.baseBodyY + Math.abs(Math.sin(this.animTime * 9)) * 0.045;
    body.rotation.y = Math.sin(this.animTime * 16.0) * 0.06; // Happy hip wiggle!
    tail.rotation.y = Math.sin(this.animTime * 18.0) * 1.15;
    tail.rotation.x = 0.75;

    earL.rotation.z = 0.35 + Math.sin(this.animTime * 9) * 0.12;
    earR.rotation.z = -0.35 - Math.sin(this.animTime * 9) * 0.12;
  }

  animateBark(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepNeck: true, keepBodyRot: true });
    const { neck, body, earL, earR } = this.nodes;
    const progress = (this.actionTimer % 0.45) / 0.45;
    const pulse = Math.sin(progress * Math.PI);

    neck.rotation.x = pulse * 0.38;
    body.position.y = this.baseBodyY + pulse * 0.09;
    body.rotation.x = -pulse * 0.12;
    earL.rotation.x = -pulse * 0.25;
    earR.rotation.x = -pulse * 0.25;

    if (this.actionTimer < 0.08 && this.robot.isPlayer) {
      roboAudio.playBark(this.robot.profile ? this.robot.profile.voicePitch : 1.1);
    }
  }

  animateSniff(delta) {
    this.dampPoseToNeutral(delta, 7, { keepBodyPos: true, keepBodyRot: true, keepNeck: true });
    const { neck, body, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, this.baseBodyY - 0.14, 7, delta);
    body.rotation.x = this.damp(body.rotation.x, 0.18, 7, delta);
    neck.rotation.x = this.damp(neck.rotation.x, -0.42 + Math.sin(this.animTime * 14) * 0.04, 8, delta);
    neck.rotation.y = Math.sin(this.animTime * 4.2) * 0.45;
    tail.rotation.y = Math.sin(this.animTime * 6.0) * 0.35;
  }

  animateScratch(delta) {
    this.dampPoseToNeutral(delta, 7, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true });
    const { body, legs, neck } = this.nodes;

    body.rotation.z = this.damp(body.rotation.z, -0.32, 7, delta);
    body.position.y = this.damp(body.position.y, 0.66, 7, delta);
    neck.rotation.z = this.damp(neck.rotation.z, 0.28, 7, delta);
    neck.rotation.x = this.damp(neck.rotation.x, -0.2, 7, delta);

    const scratchFreq = Math.sin(this.animTime * 20.0) * 0.55;
    legs.BL.hip.rotation.x = 1.05 + scratchFreq;
    legs.BL.hip.rotation.z = 0.45;
    legs.BL.knee.rotation.x = -0.75 + scratchFreq * 0.4;
  }

  animateBackflip(delta) {
    const { body, legs } = this.nodes;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.6));

    const jumpHeight = Math.sin(progress * Math.PI) * 2.35;
    body.position.y = this.baseBodyY + jumpHeight;

    // Smooth 360° backflip with ease-in-out
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    body.rotation.x = eased * Math.PI * 2;

    // Tuck legs mid-flip
    const tuck = Math.sin(progress * Math.PI);
    Object.values(legs).forEach(leg => {
      leg.hip.rotation.x = tuck * 0.6;
      leg.knee.rotation.x = tuck * 0.8;
    });

    if (progress > 0.94 && this.robot.isPlayer && !this._flipSoundPlayed) {
      this._flipSoundPlayed = true;
      roboAudio.playTrickSuccess();
    } else if (progress < 0.1) {
      this._flipSoundPlayed = false;
    }
  }

  animateSpin(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepLegs: true, keepTail: true });
    const { body, legs, tail } = this.nodes;

    this.robot.group.rotation.y += delta * 6.5;
    body.position.y = this.baseBodyY + Math.abs(Math.sin(this.animTime * 10)) * 0.06;
    tail.rotation.y = Math.sin(this.animTime * 15) * 0.95;

    legs.FL.hip.rotation.x = Math.sin(this.animTime * 12) * 0.45;
    legs.FR.hip.rotation.x = Math.sin(this.animTime * 12 + Math.PI) * 0.45;
    legs.BL.hip.rotation.x = Math.cos(this.animTime * 12) * 0.45;
    legs.BR.hip.rotation.x = Math.cos(this.animTime * 12 + Math.PI) * 0.45;
  }

  animateRoll(delta) {
    const { body, legs, tail } = this.nodes;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.8));

    body.position.y = this.damp(body.position.y, 0.45 + Math.sin(progress * Math.PI) * 0.32, 10, delta);
    body.rotation.z = progress * Math.PI * 2;

    legs.FL.hip.rotation.x = 0.55;
    legs.FR.hip.rotation.x = 0.55;
    legs.BL.hip.rotation.x = 0.75;
    legs.BR.hip.rotation.x = 0.75;
    tail.rotation.y = Math.sin(this.animTime * 12) * 0.8;
  }

  animateWave(delta) {
    this.dampPoseToNeutral(delta, 7, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, 1.15, 7, delta);
    body.rotation.x = this.damp(body.rotation.x, -0.68, 7, delta);

    legs.FL.hip.rotation.x = this.damp(legs.FL.hip.rotation.x, 0.5, 7, delta);
    legs.FR.hip.rotation.x = -1.25 + Math.sin(this.animTime * 10) * 0.35;
    legs.FR.hip.rotation.z = -0.2 + Math.cos(this.animTime * 10) * 0.2;
    legs.FR.knee.rotation.x = 0.75 + Math.sin(this.animTime * 10) * 0.3;

    legs.BL.hip.rotation.x = this.damp(legs.BL.hip.rotation.x, -1.1, 7, delta);
    legs.BR.hip.rotation.x = this.damp(legs.BR.hip.rotation.x, -1.1, 7, delta);
    legs.BL.knee.rotation.x = this.damp(legs.BL.knee.rotation.x, 1.3, 7, delta);
    legs.BR.knee.rotation.x = this.damp(legs.BR.knee.rotation.x, 1.3, 7, delta);

    neck.rotation.x = this.damp(neck.rotation.x, 0.45, 7, delta);
    neck.rotation.y = Math.sin(this.animTime * 3.5) * 0.2;
    tail.rotation.y = Math.sin(this.animTime * 11) * 0.85;

    if (this.actionTimer < 0.08 && this.robot.isPlayer) {
      roboAudio.playWaveSound(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateRecharge(delta) {
    this.dampPoseToNeutral(delta, 5, { keepBodyPos: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.28 + Math.sin(this.animTime * 1.4) * 0.012, 5, delta);
    legs.FL.hip.rotation.x = this.damp(legs.FL.hip.rotation.x, 1.25, 5, delta);
    legs.FR.hip.rotation.x = this.damp(legs.FR.hip.rotation.x, 1.25, 5, delta);
    legs.BL.hip.rotation.x = this.damp(legs.BL.hip.rotation.x, -1.25, 5, delta);
    legs.BR.hip.rotation.x = this.damp(legs.BR.hip.rotation.x, -1.25, 5, delta);

    neck.rotation.x = this.damp(neck.rotation.x, -0.38, 5, delta);
    tail.rotation.y = this.damp(tail.rotation.y, 0, 5, delta);
  }

  animateDig(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.72, 8, delta);
    body.rotation.x = this.damp(body.rotation.x, 0.36, 8, delta);
    neck.rotation.x = this.damp(neck.rotation.x, -0.45, 8, delta);

    const digL = Math.sin(this.animTime * 19);
    const digR = Math.sin(this.animTime * 19 + Math.PI);
    legs.FL.hip.rotation.x = 0.45 + digL * 0.65;
    legs.FL.knee.rotation.x = Math.max(0, -digL * 0.8);
    legs.FR.hip.rotation.x = 0.45 + digR * 0.65;
    legs.FR.knee.rotation.x = Math.max(0, -digR * 0.8);

    tail.rotation.x = 0.85;
    tail.rotation.y = Math.sin(this.animTime * 15) * 0.9;
  }

  animateHowl(delta) {
    this.dampPoseToNeutral(delta, 6, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.62, 6, delta);
    body.rotation.x = this.damp(body.rotation.x, -0.38, 6, delta);

    legs.BL.hip.rotation.x = this.damp(legs.BL.hip.rotation.x, -1.15, 6, delta);
    legs.BR.hip.rotation.x = this.damp(legs.BR.hip.rotation.x, -1.15, 6, delta);
    legs.BL.knee.rotation.x = this.damp(legs.BL.knee.rotation.x, 1.35, 6, delta);
    legs.BR.knee.rotation.x = this.damp(legs.BR.knee.rotation.x, 1.35, 6, delta);
    legs.FL.hip.rotation.x = this.damp(legs.FL.hip.rotation.x, 0.35, 6, delta);
    legs.FR.hip.rotation.x = this.damp(legs.FR.hip.rotation.x, 0.35, 6, delta);

    neck.rotation.x = this.damp(neck.rotation.x, 0.85, 7, delta);
    neck.rotation.y = Math.sin(this.animTime * 2.5) * 0.08;
    tail.rotation.y = Math.sin(this.animTime * 6) * 0.3;

    if (this.actionTimer < 0.08 && this.robot.isPlayer) {
      roboAudio.playHowl(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateDance(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const t = this.animTime * 9.2;
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = this.baseBodyY + Math.abs(Math.sin(t)) * 0.22;
    body.rotation.z = Math.sin(t * 0.5) * 0.24;
    body.rotation.y = Math.cos(t * 0.5) * 0.15;
    neck.rotation.z = -Math.sin(t * 0.5) * 0.22;
    neck.rotation.x = Math.sin(t) * 0.16;

    legs.FL.hip.rotation.x = Math.sin(t) * 0.6;
    legs.FL.knee.rotation.x = Math.max(0, Math.cos(t) * 0.6);
    legs.BR.hip.rotation.x = -Math.sin(t) * 0.6;
    legs.FR.hip.rotation.x = -Math.sin(t) * 0.6;
    legs.FR.knee.rotation.x = Math.max(0, -Math.cos(t) * 0.6);
    legs.BL.hip.rotation.x = Math.sin(t) * 0.6;

    tail.rotation.y = Math.sin(t * 2.0) * 1.2;
  }

  animateSneak(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true });
    const t = this.animTime * 3.8;
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.55 + Math.sin(t * 2) * 0.025, 8, delta);
    body.rotation.x = this.damp(body.rotation.x, 0.14, 8, delta);
    neck.rotation.x = this.damp(neck.rotation.x, -0.24, 8, delta);

    legs.FL.hip.rotation.x = Math.sin(t) * 0.35;
    legs.BR.hip.rotation.x = Math.sin(t) * 0.35;
    legs.FR.hip.rotation.x = Math.sin(t + Math.PI) * 0.35;
    legs.BL.hip.rotation.x = Math.sin(t + Math.PI) * 0.35;

    tail.rotation.y = Math.sin(t) * 0.3;
  }

  animatePlayBow(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.52, 8, delta);
    body.rotation.x = this.damp(body.rotation.x, 0.46, 8, delta);

    legs.FL.hip.rotation.x = this.damp(legs.FL.hip.rotation.x, 0.95, 8, delta);
    legs.FR.hip.rotation.x = this.damp(legs.FR.hip.rotation.x, 0.95, 8, delta);
    legs.FL.knee.rotation.x = this.damp(legs.FL.knee.rotation.x, -0.6, 8, delta);
    legs.FR.knee.rotation.x = this.damp(legs.FR.knee.rotation.x, -0.6, 8, delta);

    legs.BL.hip.rotation.x = this.damp(legs.BL.hip.rotation.x, -0.2, 8, delta);
    legs.BR.hip.rotation.x = this.damp(legs.BR.hip.rotation.x, -0.2, 8, delta);

    neck.rotation.x = this.damp(neck.rotation.x, -0.42, 8, delta);
    tail.rotation.x = 0.85;
    tail.rotation.y = Math.sin(this.animTime * 18.0) * 1.1;

    if (this.actionTimer < 0.08 && this.robot.isPlayer) {
      roboAudio.playYip(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateHeadTilt(delta) {
    this.dampPoseToNeutral(delta, 7, { keepNeck: true, keepEars: true, keepTail: true });
    const { neck, tail, earL, earR } = this.nodes;

    const tiltCycle = Math.sin(this.animTime * 3.5);
    neck.rotation.z = this.damp(neck.rotation.z, tiltCycle * 0.44, 7, delta);
    neck.rotation.x = this.damp(neck.rotation.x, 0.18, 6, delta);

    earL.rotation.z = 0.25 + (tiltCycle > 0 ? 0.35 : -0.15);
    earR.rotation.z = -0.25 + (tiltCycle < 0 ? -0.35 : 0.15);
    tail.rotation.y = Math.sin(this.animTime * 5.0) * 0.4;

    if (this.actionTimer < 0.08 && this.robot.isPlayer) {
      roboAudio.playWhine(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateBellyRub(delta) {
    this.dampPoseToNeutral(delta, 6, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.34, 6, delta);
    body.rotation.z = this.damp(body.rotation.z, Math.PI * 0.92, 6, delta);

    const pawPaddle = Math.sin(this.animTime * 6.5) * 0.35;
    legs.FL.hip.rotation.x = 0.75 + pawPaddle;
    legs.FR.hip.rotation.x = 0.75 - pawPaddle;
    legs.FL.knee.rotation.x = 0.45;
    legs.FR.knee.rotation.x = 0.45;
    legs.BL.hip.rotation.x = -0.5 + pawPaddle;
    legs.BR.hip.rotation.x = -0.5 - pawPaddle;

    neck.rotation.x = 0.2;
    tail.rotation.y = Math.sin(this.animTime * 14.0) * 0.7;
  }

  animateBeg(delta) {
    this.dampPoseToNeutral(delta, 7, { keepBodyPos: true, keepBodyRot: true, keepLegs: true, keepNeck: true, keepTail: true });
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, 1.24, 7, delta);
    body.rotation.x = this.damp(body.rotation.x, -0.76, 7, delta);

    const begBob = Math.sin(this.animTime * 8.5) * 0.22;
    legs.FL.hip.rotation.x = this.damp(legs.FL.hip.rotation.x, -0.65 + begBob, 8, delta);
    legs.FR.hip.rotation.x = this.damp(legs.FR.hip.rotation.x, -0.65 + begBob, 8, delta);
    legs.FL.knee.rotation.x = this.damp(legs.FL.knee.rotation.x, 0.92, 8, delta);
    legs.FR.knee.rotation.x = this.damp(legs.FR.knee.rotation.x, 0.92, 8, delta);

    legs.BL.hip.rotation.x = this.damp(legs.BL.hip.rotation.x, -1.2, 7, delta);
    legs.BR.hip.rotation.x = this.damp(legs.BR.hip.rotation.x, -1.2, 7, delta);
    legs.BL.knee.rotation.x = this.damp(legs.BL.knee.rotation.x, 1.35, 7, delta);
    legs.BR.knee.rotation.x = this.damp(legs.BR.knee.rotation.x, 1.35, 7, delta);

    neck.rotation.x = this.damp(neck.rotation.x, 0.52, 7, delta);
    tail.rotation.y = Math.sin(this.animTime * 12.0) * 0.8;
  }

  animateShakeOff(delta) {
    this.dampPoseToNeutral(delta, 8, { keepBodyRot: true, keepNeck: true, keepTail: true, keepEars: true });
    const { body, neck, tail, earL, earR } = this.nodes;

    const envelope = Math.sin(Math.min(1, this.actionTimer / (this.actionDuration || 1.8)) * Math.PI);
    const shakeFreq = Math.sin(this.animTime * 34.0) * envelope;
    body.rotation.z = shakeFreq * 0.36;
    neck.rotation.z = -shakeFreq * 0.48;
    tail.rotation.y = -shakeFreq * 0.85;

    earL.rotation.z = 0.25 + shakeFreq * 0.55;
    earR.rotation.z = -0.25 + shakeFreq * 0.55;

    if (this.actionTimer < 0.08 && this.robot.isPlayer) {
      roboAudio.playPlayfulGrumble(1.2);
    }
  }

  animateNuzzle(delta) {
    this.dampPoseToNeutral(delta, 7, { keepBodyPos: true, keepBodyRot: true, keepNeck: true, keepTail: true });
    const { body, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, this.baseBodyY - 0.08, 7, delta);
    body.rotation.z = this.damp(body.rotation.z, Math.sin(this.animTime * 3.0) * 0.14, 7, delta);

    neck.rotation.x = this.damp(neck.rotation.x, 0.26, 7, delta);
    neck.rotation.y = Math.sin(this.animTime * 3.2) * 0.26;
    tail.rotation.y = Math.sin(this.animTime * 9.0) * 0.75;

    if (this.actionTimer < 0.08 && this.robot.isPlayer) {
      roboAudio.playBoop(1.4);
    }
  }

  animatePickedUp(delta) {
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = this.damp(body.position.y, this.baseBodyY + 0.15, 7, delta);
    body.rotation.z = Math.sin(this.animTime * 4.0) * 0.08;
    body.rotation.x = Math.sin(this.animTime * 3.0) * 0.06;

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

  animateChaseTail(delta) {
    const { body, neck, tail, legs } = this.nodes;

    this.robot.group.rotation.y += delta * 8.5;
    body.rotation.y = Math.sin(this.animTime * 24.0) * 0.2;
    body.rotation.z = -0.15;
    body.position.y = this.baseBodyY;

    neck.rotation.y = 0.75;
    neck.rotation.x = 0.3;
    tail.rotation.y = -0.85;

    const legFreq = this.animTime * 18.0;
    legs.FL.hip.rotation.x = Math.sin(legFreq) * 0.6;
    legs.FR.hip.rotation.x = -Math.sin(legFreq) * 0.6;
    legs.BL.hip.rotation.x = -Math.sin(legFreq) * 0.6;
    legs.BR.hip.rotation.x = Math.sin(legFreq) * 0.6;
  }

  animateDizzy(delta) {
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.55, 8, delta);
    legs.BL.hip.rotation.x = -1.1;
    legs.BR.hip.rotation.x = -1.1;
    legs.FL.hip.rotation.x = 0.2;
    legs.FR.hip.rotation.x = 0.2;

    neck.rotation.z = Math.sin(this.animTime * 6.0) * 0.35;
    neck.rotation.y = Math.cos(this.animTime * 4.5) * 0.3;
    neck.rotation.x = 0.25;

    body.rotation.z = Math.sin(this.animTime * 5.0) * 0.12;
    tail.rotation.y = Math.sin(this.animTime * 2.0) * 0.2;
  }

  animateSwimming(delta) {
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = this.damp(body.position.y, 0.45 + Math.sin(this.animTime * 4) * 0.04, 6, delta);
    body.rotation.x = this.damp(body.rotation.x, 0.14, 6, delta);
    body.rotation.z = Math.sin(this.animTime * 6.0) * 0.08;

    neck.rotation.x = this.damp(neck.rotation.x, -0.36, 6, delta);
    neck.rotation.y = Math.sin(this.animTime * 3.0) * 0.1;

    const paddleSpeed = 8.5;
    legs.FL.hip.rotation.x = Math.sin(this.animTime * paddleSpeed) * 0.65;
    legs.FL.knee.rotation.x = 0.5 + Math.cos(this.animTime * paddleSpeed) * 0.4;
    legs.FR.hip.rotation.x = -Math.sin(this.animTime * paddleSpeed) * 0.65;
    legs.FR.knee.rotation.x = 0.5 - Math.cos(this.animTime * paddleSpeed) * 0.4;
    legs.BL.hip.rotation.x = -Math.cos(this.animTime * paddleSpeed) * 0.5;
    legs.BR.hip.rotation.x = Math.cos(this.animTime * paddleSpeed) * 0.5;

    tail.rotation.y = Math.sin(this.animTime * 10.0) * 0.65;
  }

  animatePatrolLook(delta) {
    this.dampPoseToNeutral(delta, 7, { keepNeck: true, keepTail: true });
    const { neck, tail } = this.nodes;

    const scanCycle = Math.sin(this.animTime * 2.0);
    neck.rotation.y = this.damp(neck.rotation.y, scanCycle * 0.75, 5, delta);
    neck.rotation.x = this.damp(neck.rotation.x, -0.15, 5, delta);
    tail.rotation.y = Math.sin(this.animTime * 4.0) * 0.25;
  }

  animateScentTrack(delta) {
    this.dampPoseToNeutral(delta, 7, { keepBodyPos: true, keepBodyRot: true, keepNeck: true, keepLegs: true });
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = this.damp(body.position.y, this.baseBodyY - 0.14, 6, delta);
    body.rotation.x = this.damp(body.rotation.x, 0.18, 6, delta);

    neck.rotation.x = this.damp(neck.rotation.x, 0.48, 6, delta);
    neck.rotation.y = Math.sin(this.animTime * 4.0) * 0.22;

    const t = this.animTime * 4.2;
    legs.FL.hip.rotation.x = Math.sin(t) * 0.4;
    legs.FR.hip.rotation.x = -Math.sin(t) * 0.4;
    legs.BL.hip.rotation.x = -Math.sin(t) * 0.4;
    legs.BR.hip.rotation.x = Math.sin(t) * 0.4;

    tail.rotation.y = Math.sin(this.animTime * 5.0) * 0.35;
  }
}