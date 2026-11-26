// Smooth Exponential Procedural Animation Controller with Velocity-Synced Gait & Zero-Alloc Loop
import * as THREE from 'three';
import { roboAudio } from './audio.js';
import { damp, wrapAngle } from './core/Scratch.js';

const CLIP_DURATIONS = {
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

const ROLL_CONTROLLED_CLIPS = new Set([
  'roll',
  'bellyRub',
  'scratch',
  'shakeOff',
  'dance',
  'backflip',
  'spin',
  'chaseTail'
]);

export class AnimationController {
  constructor(robot, eventBus = null) {
    this.robot = robot;
    this.nodes = robot.nodes;
    this.eventBus = eventBus;

    this.currentAnim = 'idle';
    this.animTime = 0;
    this.gaitPhase = 0;
    this.animSpeed = 1.0;

    // Locomotion velocity sync state
    this.locomotionSpeed = 0;
    this.isMoving = false;

    // Sequence / Action Queue
    this.actionQueue = [];
    this.onSequenceComplete = null;
    this.onClipComplete = null;
    this.actionTimer = 0;
    this.actionDuration = 0;

    // Edge-triggered one-shot SFX flags
    this._sfxTriggered = false;
    this._flipSoundPlayed = false;

    this.baseBodyY = 0.95;
    this.disposed = false;
  }

  isBodyRollControlled() {
    return ROLL_CONTROLLED_CLIPS.has(this.currentAnim);
  }

  syncLocomotion(speedScalar, isMoving = true) {
    this.locomotionSpeed = Math.max(0, speedScalar || 0);
    this.isMoving = Boolean(isMoving);
  }

  _normalizeTransforms() {
    const { body, neck, tail, earL, earR } = this.nodes;
    if (body) {
      body.rotation.x = wrapAngle(body.rotation.x);
      body.rotation.y = wrapAngle(body.rotation.y);
      body.rotation.z = wrapAngle(body.rotation.z);
    }
    if (neck) {
      neck.rotation.x = wrapAngle(neck.rotation.x);
      neck.rotation.y = wrapAngle(neck.rotation.y);
      neck.rotation.z = wrapAngle(neck.rotation.z);
    }
    if (tail) {
      tail.rotation.x = wrapAngle(tail.rotation.x);
      tail.rotation.y = wrapAngle(tail.rotation.y);
      tail.rotation.z = wrapAngle(tail.rotation.z);
    }
    if (earL) earL.rotation.z = wrapAngle(earL.rotation.z);
    if (earR) earR.rotation.z = wrapAngle(earR.rotation.z);
  }

  play(animName, duration = 0, onComplete = null) {
    if (this.disposed) return;

    // Untimed locomotion/idle clip interrupts any lingering queue cleanly
    if (!duration && this.actionQueue.length > 0 && animName !== this.currentAnim) {
      this.actionQueue.length = 0;
      this.onSequenceComplete = null;
    }

    // Prevent same-frame or mid-action restart pops
    if (this.currentAnim === animName) {
      if (!duration) return;
      if (this.actionDuration > 0 && this.actionTimer < Math.min(0.25, this.actionDuration * 0.45)) {
        return;
      }
    }

    this._normalizeTransforms();

    this.currentAnim = animName;
    this.animTime = 0;
    this._sfxTriggered = false;
    this._flipSoundPlayed = false;
    this.onClipComplete = onComplete;

    if (duration > 0) {
      this.actionDuration = duration;
      this.actionTimer = 0;
    } else {
      this.actionDuration = 0;
      this.actionTimer = 0;
    }
  }

  queueSequence(actionNames, onComplete = null) {
    if (this.disposed || !Array.isArray(actionNames)) return;
    this.actionQueue.length = 0;
    for (let i = 0; i < actionNames.length; i++) {
      this.actionQueue.push(actionNames[i]);
    }
    this.onSequenceComplete = onComplete;
    this._advanceSequence();
  }

  // Legacy alias
  playSequence(actionNames, onComplete = null) {
    this.queueSequence(actionNames, onComplete);
  }

  interruptSequence() {
    this.actionQueue.length = 0;
    this.actionDuration = 0;
    this.actionTimer = 0;
    this.onClipComplete = null;
    this.onSequenceComplete = null;
    this._normalizeTransforms();
    this.play('idle');
  }

  _advanceSequence() {
    const prevClip = this.currentAnim;
    const clipCb = this.onClipComplete;
    this.onClipComplete = null;
    if (clipCb) clipCb(prevClip);

    if (this.eventBus) {
      this.eventBus.emit('anim:complete', { robot: this.robot, anim: prevClip });
    }

    if (this.actionQueue.length === 0) {
      this.play('idle');
      if (this.onSequenceComplete) {
        const seqCb = this.onSequenceComplete;
        this.onSequenceComplete = null;
        seqCb();
      }
      return;
    }

    const nextAction = this.actionQueue.shift();
    const dur = CLIP_DURATIONS[nextAction] || 1.5;
    this.play(nextAction, dur);
  }

  _dampLegNeutral(leg, speed, dt) {
    if (!leg) return;
    leg.hip.rotation.x = damp(leg.hip.rotation.x, 0, speed, dt);
    leg.hip.rotation.y = damp(leg.hip.rotation.y, 0, speed, dt);
    leg.hip.rotation.z = damp(leg.hip.rotation.z, 0, speed, dt);
    leg.knee.rotation.x = damp(leg.knee.rotation.x, 0, speed, dt);
    if (leg.paw) leg.paw.rotation.x = damp(leg.paw.rotation.x, 0, speed, dt);
  }

  dampPoseToNeutral(dt, speed = 8, keepFlags = 0) {
    // Bitflags avoid allocating options objects every frame!
    // 1: bodyPos, 2: bodyRot, 4: bodyScale, 8: neck, 16: tail, 32: ears, 64: legs
    const { body, neck, tail, earL, earR, legs } = this.nodes;
    if (!(keepFlags & 1) && body) {
      body.position.y = damp(body.position.y, this.baseBodyY, speed, dt);
    }
    if (!(keepFlags & 2) && body) {
      body.rotation.x = damp(body.rotation.x, this.robot.pitchLean || 0, speed, dt);
      body.rotation.y = damp(body.rotation.y, 0, speed, dt);
      body.rotation.z = damp(body.rotation.z, this.robot.bankAngle || 0, speed, dt);
    }
    if (!(keepFlags & 4) && body) {
      body.scale.x = damp(body.scale.x, 1.0, speed, dt);
      body.scale.y = damp(body.scale.y, 1.0, speed, dt);
      body.scale.z = damp(body.scale.z, 1.0, speed, dt);
    }
    if (!(keepFlags & 8) && neck && !this.robot.hasTarget) {
      neck.rotation.x = damp(neck.rotation.x, 0, speed, dt);
      neck.rotation.y = damp(neck.rotation.y, 0, speed, dt);
      neck.rotation.z = damp(neck.rotation.z, 0, speed, dt);
    }
    if (!(keepFlags & 16) && tail) {
      tail.rotation.x = damp(tail.rotation.x, 0.55 + (this.robot.tailSpringAngle || 0), speed, dt);
      tail.rotation.y = damp(tail.rotation.y, 0, speed, dt);
      if ((this.robot.tailHelicopterTimer || 0) <= 0) {
        tail.rotation.z = damp(tail.rotation.z, 0, speed, dt);
      }
    }
    if (!(keepFlags & 32) && earL && earR) {
      earL.rotation.x = damp(earL.rotation.x, this.robot.earSpringX || 0, speed, dt);
      earR.rotation.x = damp(earR.rotation.x, this.robot.earSpringX || 0, speed, dt);
    }
    if (!(keepFlags & 64) && legs) {
      this._dampLegNeutral(legs.FL, speed, dt);
      this._dampLegNeutral(legs.FR, speed, dt);
      this._dampLegNeutral(legs.BL, speed, dt);
      this._dampLegNeutral(legs.BR, speed, dt);
    }
  }

  update(delta) {
    if (this.disposed) return;
    const dt = Math.min(delta, 0.05);
    this.animTime += dt * this.animSpeed;

    if (this.actionDuration > 0) {
      this.actionTimer += dt;
      if (this.actionTimer >= this.actionDuration) {
        this._advanceSequence();
        // Fall through intentionally so the new clip renders on this very frame (no 1-frame freeze)
      }
    }

    switch (this.currentAnim) {
      case 'idle': this.animateIdle(dt); break;
      case 'walk': this.animateWalk(dt, 1.0); break;
      case 'run': this.animateWalk(dt, 2.1); break;
      case 'sit': this.animateSit(dt); break;
      case 'lieDown': this.animateLieDown(dt); break;
      case 'jump': this.animateJump(dt); break;
      case 'wagTail': this.animateWagTail(dt); break;
      case 'bark': this.animateBark(dt); break;
      case 'sniff': this.animateSniff(dt); break;
      case 'scratch': this.animateScratch(dt); break;
      case 'backflip': this.animateBackflip(dt); break;
      case 'spin': this.animateSpin(dt); break;
      case 'roll': this.animateRoll(dt); break;
      case 'wave': this.animateWave(dt); break;
      case 'recharge': this.animateRecharge(dt); break;
      case 'dig': this.animateDig(dt); break;
      case 'howl': this.animateHowl(dt); break;
      case 'dance': this.animateDance(dt); break;
      case 'sneak': this.animateSneak(dt); break;
      case 'playBow': this.animatePlayBow(dt); break;
      case 'headTilt': this.animateHeadTilt(dt); break;
      case 'bellyRub': this.animateBellyRub(dt); break;
      case 'beg': this.animateBeg(dt); break;
      case 'shakeOff': this.animateShakeOff(dt); break;
      case 'nuzzle': this.animateNuzzle(dt); break;
      case 'pickedUp': this.animatePickedUp(dt); break;
      case 'chaseTail': this.animateChaseTail(dt); break;
      case 'dizzy': this.animateDizzy(dt); break;
      case 'swimming': this.animateSwimming(dt); break;
      case 'patrolLook': this.animatePatrolLook(dt); break;
      case 'scentTrack': this.animateScentTrack(dt); break;
      default: this.animateIdle(dt); break;
    }
  }

  animateIdle(dt) {
    this.dampPoseToNeutral(dt, 7, 1 | 16 | 32); // keepBodyPos | keepTail | keepEars
    const t = this.animTime;
    const { body, neck, tail, earL, earR } = this.nodes;

    const breath = Math.sin(t * 2.4);
    body.position.y = damp(body.position.y, this.baseBodyY + breath * 0.028, 8, dt);
    body.rotation.x = damp(body.rotation.x, breath * 0.018, 6, dt);

    if (!this.robot.hasTarget && neck) {
      neck.rotation.x = damp(neck.rotation.x, -breath * 0.03 + Math.sin(t * 1.1) * 0.04, 6, dt);
      neck.rotation.y = damp(neck.rotation.y, Math.sin(t * 0.7) * 0.06, 5, dt);
    }

    const earTwitch = Math.pow(Math.max(0, Math.sin(t * 1.7)), 6) * 0.22;
    earL.rotation.x = damp(earL.rotation.x, Math.sin(t * 1.5) * 0.06 + earTwitch, 10, dt);
    earR.rotation.x = damp(earR.rotation.x, Math.sin(t * 1.5 + 0.8) * 0.06, 10, dt);

    tail.rotation.x = damp(tail.rotation.x, 0.55 + Math.cos(t * 2.2) * 0.08, 8, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(t * 3.6) * 0.38, 10, dt);
    if ((this.robot.tailHelicopterTimer || 0) <= 0) {
      tail.rotation.z = damp(tail.rotation.z, Math.cos(t * 1.8) * 0.12, 8, dt);
    }
  }

  _applyLegGait(leg, cycle, strideAmp, kneeLiftAmp, isFront, dt) {
    const hipTarget = Math.sin(cycle) * strideAmp;
    const swingLift = Math.max(0, Math.cos(cycle));
    const kneeTarget = isFront ? swingLift * kneeLiftAmp : -swingLift * kneeLiftAmp * 0.85;
    const pawTarget = -swingLift * 0.35 + Math.sin(cycle) * 0.15;

    leg.hip.rotation.x = damp(leg.hip.rotation.x, hipTarget, 18, dt);
    leg.hip.rotation.z = damp(leg.hip.rotation.z, 0, 12, dt);
    leg.knee.rotation.x = damp(leg.knee.rotation.x, kneeTarget, 18, dt);
    if (leg.paw) {
      leg.paw.rotation.x = damp(leg.paw.rotation.x, pawTarget, 18, dt);
    }
  }

  animateWalk(dt, speedMultiplier = 1.0) {
    this.dampPoseToNeutral(dt, 10, 1 | 2 | 16 | 64);
    const isRun = speedMultiplier > 1.5;
    const nominalSpeed = isRun ? 7.2 : 3.8;
    const actualSpeed = this.locomotionSpeed > 0.01
      ? this.locomotionSpeed
      : (this.robot.physics ? this.robot.physics.speedScalar : nominalSpeed);

    // Velocity-synchronized stride & cadence (prevents foot-sliding on starts, slopes, or walls)
    const speedRatio = THREE.MathUtils.clamp(actualSpeed / nominalSpeed, 0.0, 1.45);
    const baseFreq = isRun ? 10.2 : 6.6;
    const freqScale = speedRatio < 0.08 ? 0 : THREE.MathUtils.clamp(0.45 + speedRatio * 0.65, 0.35, 1.45);

    const prevHalfStep = Math.floor(this.gaitPhase / Math.PI);
    this.gaitPhase += dt * baseFreq * freqScale;
    const nextHalfStep = Math.floor(this.gaitPhase / Math.PI);

    const t = this.gaitPhase;
    const strideAmp = (isRun ? 0.78 : 0.48) * THREE.MathUtils.clamp(speedRatio * 1.05, 0.05, 1.2);
    const kneeLiftAmp = (isRun ? 0.85 : 0.55) * THREE.MathUtils.clamp(speedRatio * 1.05, 0.1, 1.2);

    const { body, neck, tail, legs } = this.nodes;
    const phaseBR = isRun ? 0.35 : 0.15;
    const phaseBL = isRun ? Math.PI + 0.35 : Math.PI + 0.15;

    this._applyLegGait(legs.FL, t, strideAmp, kneeLiftAmp, true, dt);
    this._applyLegGait(legs.BR, t + phaseBR, strideAmp, kneeLiftAmp, false, dt);
    this._applyLegGait(legs.FR, t + Math.PI, strideAmp, kneeLiftAmp, true, dt);
    this._applyLegGait(legs.BL, t + phaseBL, strideAmp, kneeLiftAmp, false, dt);

    const ampBlend = THREE.MathUtils.clamp(speedRatio, 0, 1);
    const bob = Math.abs(Math.sin(t)) * (isRun ? 0.13 : 0.065) * ampBlend;
    body.position.y = damp(body.position.y, this.baseBodyY + bob, 16, dt);
    body.rotation.x = damp(body.rotation.x, (isRun ? Math.cos(t) * 0.09 : Math.cos(t * 2) * 0.025) * ampBlend + (this.robot.pitchLean || 0), 14, dt);
    body.rotation.z = damp(body.rotation.z, (this.robot.bankAngle || 0) + Math.sin(t) * 0.035 * ampBlend, 12, dt);
    body.rotation.y = damp(body.rotation.y, Math.cos(t) * 0.025 * ampBlend, 12, dt);

    if (!this.robot.hasTarget && neck) {
      neck.rotation.x = damp(neck.rotation.x, -Math.sin(t * 2) * 0.06 * ampBlend + (isRun ? 0.12 : 0), 14, dt);
    }

    tail.rotation.x = damp(tail.rotation.x, (isRun ? 0.25 : 0.65) + (this.robot.tailSpringAngle || 0), 10, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(t * 1.5) * (isRun ? 0.55 : 0.75), 14, dt);

    if (nextHalfStep > prevHalfStep && actualSpeed > 0.35) {
      if (this.robot.isPlayer) {
        if (typeof roboAudio.playFootstep === 'function') roboAudio.playFootstep();
        else if (typeof roboAudio.playStep === 'function') roboAudio.playStep();
      }
      if (this.eventBus) {
        this.eventBus.emit('anim:footstep', {
          robot: this.robot,
          speed: actualSpeed,
          isRun
        });
      }
    }
  }

  animateSit(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, 0.58, 7, dt);
    body.rotation.x = damp(body.rotation.x, -0.44, 7, dt);
    body.rotation.z = damp(body.rotation.z, 0, 7, dt);

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.42, 7, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.42, 7, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, 0, 7, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0, 7, dt);
    if (legs.FL.paw) legs.FL.paw.rotation.x = damp(legs.FL.paw.rotation.x, 0.05, 7, dt);
    if (legs.FR.paw) legs.FR.paw.rotation.x = damp(legs.FR.paw.rotation.x, 0.05, 7, dt);

    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -1.22, 7, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -1.22, 7, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, 1.45, 7, dt);
    legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, 1.45, 7, dt);
    if (legs.BL.paw) legs.BL.paw.rotation.x = damp(legs.BL.paw.rotation.x, 0.2, 7, dt);
    if (legs.BR.paw) legs.BR.paw.rotation.x = damp(legs.BR.paw.rotation.x, 0.2, 7, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.42 + Math.sin(this.animTime * 2.2) * 0.04, 7, dt);
    neck.rotation.z = damp(neck.rotation.z, Math.sin(this.animTime * 1.5) * 0.05, 6, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 5.5) * 0.55, 14, dt);
  }

  animateLieDown(dt) {
    this.dampPoseToNeutral(dt, 6, 1 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, 0.32 + Math.sin(this.animTime * 1.8) * 0.015, 6, dt);

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, -1.15, 6, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -1.15, 6, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, 0.25, 6, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0.25, 6, dt);

    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -1.25, 6, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -1.25, 6, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, 1.4, 6, dt);
    legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, 1.4, 6, dt);

    neck.rotation.x = damp(neck.rotation.x, -0.15 + Math.sin(this.animTime * 1.8) * 0.03, 5, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 2.0) * 0.25, 10, dt);
  }

  animateJump(dt) {
    const { body, legs, tail, neck } = this.nodes;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.2));

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playJump(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }

    if (progress < 0.18) {
      body.position.y = damp(body.position.y, this.baseBodyY - 0.22, 18, dt);
      body.scale.x = damp(body.scale.x, 1.06, 18, dt);
      body.scale.y = damp(body.scale.y, 0.92, 18, dt);
      body.scale.z = damp(body.scale.z, 1.04, 18, dt);
      body.rotation.x = damp(body.rotation.x, 0.22, 15, dt);
      legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.65, 16, dt);
      legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.65, 16, dt);
      legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -0.65, 16, dt);
      legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -0.65, 16, dt);
    } else if (progress < 0.82) {
      const airP = (progress - 0.18) / 0.64;
      const jumpHeight = Math.sin(airP * Math.PI) * 1.85;
      body.position.y = damp(body.position.y, this.baseBodyY + jumpHeight, 22, dt);
      body.scale.x = damp(body.scale.x, 0.96, 16, dt);
      body.scale.y = damp(body.scale.y, 1.06, 16, dt);
      body.scale.z = damp(body.scale.z, 1.02, 16, dt);
      body.rotation.x = damp(body.rotation.x, THREE.MathUtils.lerp(-0.38, 0.28, airP), 16, dt);
      neck.rotation.x = damp(neck.rotation.x, -0.2, 14, dt);

      legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, -0.55, 16, dt);
      legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -0.55, 16, dt);
      legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, 0.45, 16, dt);
      legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0.45, 16, dt);
      legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, 0.7, 16, dt);
      legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, 0.7, 16, dt);
      legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, 0.25, 14, dt);
      legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, 0.25, 14, dt);
    } else {
      body.position.y = damp(body.position.y, this.baseBodyY - 0.08, 16, dt);
      body.scale.x = damp(body.scale.x, 1.04, 16, dt);
      body.scale.y = damp(body.scale.y, 0.95, 16, dt);
      body.scale.z = damp(body.scale.z, 1.02, 16, dt);
      this.dampPoseToNeutral(dt, 12, 1 | 4);
    }

    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 14.0) * 0.9, 16, dt);
  }

  animateWagTail(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 16 | 32);
    const { tail, body, earL, earR } = this.nodes;

    body.position.y = damp(body.position.y, this.baseBodyY + Math.abs(Math.sin(this.animTime * 9)) * 0.045, 14, dt);
    body.rotation.y = damp(body.rotation.y, Math.sin(this.animTime * 16.0) * 0.06, 14, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 18.0) * 1.15, 20, dt);
    tail.rotation.x = damp(tail.rotation.x, 0.75, 12, dt);

    earL.rotation.z = damp(earL.rotation.z, 0.35 + Math.sin(this.animTime * 9) * 0.12, 14, dt);
    earR.rotation.z = damp(earR.rotation.z, -0.35 - Math.sin(this.animTime * 9) * 0.12, 14, dt);
  }

  animateBark(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 32);
    const { neck, body, earL, earR } = this.nodes;
    const progress = (this.actionTimer % 0.45) / 0.45;
    const pulse = Math.sin(progress * Math.PI);

    neck.rotation.x = damp(neck.rotation.x, pulse * 0.38, 22, dt);
    body.position.y = damp(body.position.y, this.baseBodyY + pulse * 0.09, 20, dt);
    body.rotation.x = damp(body.rotation.x, -pulse * 0.12, 20, dt);
    earL.rotation.x = damp(earL.rotation.x, -pulse * 0.25, 18, dt);
    earR.rotation.x = damp(earR.rotation.x, -pulse * 0.25, 18, dt);

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playBark(this.robot.profile ? this.robot.profile.voicePitch : 1.1);
    }
  }

  animateSniff(dt) {
    this.dampPoseToNeutral(dt, 7, 1 | 2 | 8 | 16);
    const { neck, body, tail } = this.nodes;

    body.position.y = damp(body.position.y, this.baseBodyY - 0.14, 7, dt);
    body.rotation.x = damp(body.rotation.x, 0.18, 7, dt);
    neck.rotation.x = damp(neck.rotation.x, -0.42 + Math.sin(this.animTime * 14) * 0.04, 10, dt);
    neck.rotation.y = damp(neck.rotation.y, Math.sin(this.animTime * 4.2) * 0.45, 12, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 6.0) * 0.35, 12, dt);
  }

  animateScratch(dt) {
    this.dampPoseToNeutral(dt, 7, 1 | 2 | 8 | 64);
    const { body, legs, neck } = this.nodes;

    body.rotation.z = damp(body.rotation.z, -0.32, 7, dt);
    body.position.y = damp(body.position.y, 0.66, 7, dt);
    neck.rotation.z = damp(neck.rotation.z, 0.28, 7, dt);
    neck.rotation.x = damp(neck.rotation.x, -0.2, 7, dt);

    const scratchFreq = Math.sin(this.animTime * 20.0) * 0.55;
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, 1.05 + scratchFreq, 20, dt);
    legs.BL.hip.rotation.z = damp(legs.BL.hip.rotation.z, 0.45, 12, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, -0.75 + scratchFreq * 0.4, 20, dt);

    this._dampLegNeutral(legs.FL, 8, dt);
    this._dampLegNeutral(legs.FR, 8, dt);
    this._dampLegNeutral(legs.BR, 8, dt);
  }

  animateBackflip(dt) {
    const { body, legs } = this.nodes;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.6));

    const jumpHeight = Math.sin(progress * Math.PI) * 2.35;
    body.position.y = damp(body.position.y, this.baseBodyY + jumpHeight, 22, dt);

    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    body.rotation.x = eased * Math.PI * 2;
    body.rotation.z = damp(body.rotation.z, 0, 12, dt);

    const tuck = Math.sin(progress * Math.PI) * 0.6;
    const kneeTuck = Math.sin(progress * Math.PI) * 0.8;
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, tuck, 18, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, tuck, 18, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, tuck, 18, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, tuck, 18, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, kneeTuck, 18, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, kneeTuck, 18, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, kneeTuck, 18, dt);
    legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, kneeTuck, 18, dt);

    if (progress > 0.92 && this.robot.isPlayer && !this._flipSoundPlayed) {
      this._flipSoundPlayed = true;
      roboAudio.playTrickSuccess();
    }
  }

  animateSpin(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 16 | 64);
    const { body, legs, tail } = this.nodes;

    this.robot.group.rotation.y = wrapAngle(this.robot.group.rotation.y + dt * 6.5);
    body.position.y = damp(body.position.y, this.baseBodyY + Math.abs(Math.sin(this.animTime * 10)) * 0.06, 16, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 15) * 0.95, 16, dt);

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, Math.sin(this.animTime * 12) * 0.45, 18, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, Math.sin(this.animTime * 12 + Math.PI) * 0.45, 18, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, Math.cos(this.animTime * 12) * 0.45, 18, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, Math.cos(this.animTime * 12 + Math.PI) * 0.45, 18, dt);
  }

  animateRoll(dt) {
    this.dampPoseToNeutral(dt, 10, 1 | 2 | 16 | 64);
    const { body, legs, tail } = this.nodes;
    const progress = Math.min(1.0, this.actionTimer / (this.actionDuration || 1.8));

    body.position.y = damp(body.position.y, 0.45 + Math.sin(progress * Math.PI) * 0.32, 12, dt);
    body.rotation.z = progress * Math.PI * 2;

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.55, 14, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.55, 14, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, 0.75, 14, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, 0.75, 14, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 12) * 0.8, 14, dt);
  }

  animateWave(dt) {
    this.dampPoseToNeutral(dt, 7, 1 | 2 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, 1.15, 7, dt);
    body.rotation.x = damp(body.rotation.x, -0.68, 7, dt);

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.5, 7, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -1.25 + Math.sin(this.animTime * 10) * 0.35, 16, dt);
    legs.FR.hip.rotation.z = damp(legs.FR.hip.rotation.z, -0.2 + Math.cos(this.animTime * 10) * 0.2, 16, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0.75 + Math.sin(this.animTime * 10) * 0.3, 16, dt);

    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -1.1, 7, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -1.1, 7, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, 1.3, 7, dt);
    legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, 1.3, 7, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.45, 7, dt);
    neck.rotation.y = damp(neck.rotation.y, Math.sin(this.animTime * 3.5) * 0.2, 10, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 11) * 0.85, 14, dt);

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playWaveSound(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateRecharge(dt) {
    this.dampPoseToNeutral(dt, 5, 1 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, 0.28 + Math.sin(this.animTime * 1.4) * 0.012, 5, dt);
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 1.25, 5, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 1.25, 5, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -1.25, 5, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -1.25, 5, dt);

    neck.rotation.x = damp(neck.rotation.x, -0.38, 5, dt);
    tail.rotation.y = damp(tail.rotation.y, 0, 5, dt);
  }

  animateDig(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, 0.72, 8, dt);
    body.rotation.x = damp(body.rotation.x, 0.36, 8, dt);
    neck.rotation.x = damp(neck.rotation.x, -0.45, 8, dt);

    const digL = Math.sin(this.animTime * 19);
    const digR = Math.sin(this.animTime * 19 + Math.PI);
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.45 + digL * 0.65, 22, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, Math.max(0, -digL * 0.8), 22, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.45 + digR * 0.65, 22, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, Math.max(0, -digR * 0.8), 22, dt);
    this._dampLegNeutral(legs.BL, 8, dt);
    this._dampLegNeutral(legs.BR, 8, dt);

    tail.rotation.x = damp(tail.rotation.x, 0.85, 10, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 15) * 0.9, 16, dt);
  }

  animateHowl(dt) {
    this.dampPoseToNeutral(dt, 6, 1 | 2 | 8 | 16 | 64);
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = damp(body.position.y, 0.62, 6, dt);
    body.rotation.x = damp(body.rotation.x, -0.38, 6, dt);

    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -1.15, 6, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -1.15, 6, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, 1.35, 6, dt);
    legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, 1.35, 6, dt);
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.35, 6, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.35, 6, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.85, 7, dt);
    neck.rotation.y = damp(neck.rotation.y, Math.sin(this.animTime * 2.5) * 0.08, 10, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 6) * 0.3, 12, dt);

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playHowl(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateDance(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const t = this.animTime * 9.2;
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = damp(body.position.y, this.baseBodyY + Math.abs(Math.sin(t)) * 0.22, 18, dt);
    body.rotation.z = damp(body.rotation.z, Math.sin(t * 0.5) * 0.24, 16, dt);
    body.rotation.y = damp(body.rotation.y, Math.cos(t * 0.5) * 0.15, 16, dt);
    neck.rotation.z = damp(neck.rotation.z, -Math.sin(t * 0.5) * 0.22, 16, dt);
    neck.rotation.x = damp(neck.rotation.x, Math.sin(t) * 0.16, 16, dt);

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, Math.sin(t) * 0.6, 18, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, Math.max(0, Math.cos(t) * 0.6), 18, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -Math.sin(t) * 0.6, 18, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -Math.sin(t) * 0.6, 18, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, Math.max(0, -Math.cos(t) * 0.6), 18, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, Math.sin(t) * 0.6, 18, dt);

    tail.rotation.y = damp(tail.rotation.y, Math.sin(t * 2.0) * 1.2, 18, dt);
  }

  animateSneak(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const t = this.animTime * 3.8;
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = damp(body.position.y, 0.55 + Math.sin(t * 2) * 0.025, 8, dt);
    body.rotation.x = damp(body.rotation.x, 0.14, 8, dt);
    neck.rotation.x = damp(neck.rotation.x, -0.24, 8, dt);

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, Math.sin(t) * 0.35, 14, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, Math.sin(t) * 0.35, 14, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, Math.sin(t + Math.PI) * 0.35, 14, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, Math.sin(t + Math.PI) * 0.35, 14, dt);

    tail.rotation.y = damp(tail.rotation.y, Math.sin(t) * 0.3, 12, dt);
  }

  animatePlayBow(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = damp(body.position.y, 0.52, 8, dt);
    body.rotation.x = damp(body.rotation.x, 0.46, 8, dt);

    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.95, 8, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.95, 8, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, -0.6, 8, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, -0.6, 8, dt);

    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -0.2, 8, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -0.2, 8, dt);

    neck.rotation.x = damp(neck.rotation.x, -0.42, 8, dt);
    tail.rotation.x = damp(tail.rotation.x, 0.85, 10, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 18.0) * 1.1, 18, dt);

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playYip(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateHeadTilt(dt) {
    this.dampPoseToNeutral(dt, 7, 8 | 16 | 32);
    const { neck, tail, earL, earR } = this.nodes;

    const tiltCycle = Math.sin(this.animTime * 3.5);
    neck.rotation.z = damp(neck.rotation.z, tiltCycle * 0.44, 7, dt);
    neck.rotation.x = damp(neck.rotation.x, 0.18, 6, dt);

    earL.rotation.z = damp(earL.rotation.z, 0.25 + (tiltCycle > 0 ? 0.35 : -0.15), 12, dt);
    earR.rotation.z = damp(earR.rotation.z, -0.25 + (tiltCycle < 0 ? -0.35 : 0.15), 12, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 5.0) * 0.4, 12, dt);

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playWhine(this.robot.profile ? this.robot.profile.voicePitch : 1.0);
    }
  }

  animateBellyRub(dt) {
    this.dampPoseToNeutral(dt, 6, 1 | 2 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, 0.34, 6, dt);
    body.rotation.z = damp(body.rotation.z, Math.PI * 0.92, 6, dt);

    const pawPaddle = Math.sin(this.animTime * 6.5) * 0.35;
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.75 + pawPaddle, 14, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.75 - pawPaddle, 14, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, 0.45, 10, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0.45, 10, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -0.5 + pawPaddle, 14, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -0.5 - pawPaddle, 14, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.2, 8, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 14.0) * 0.7, 16, dt);
  }

  animateBeg(dt) {
    this.dampPoseToNeutral(dt, 7, 1 | 2 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, 1.24, 7, dt);
    body.rotation.x = damp(body.rotation.x, -0.76, 7, dt);

    const begBob = Math.sin(this.animTime * 8.5) * 0.22;
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, -0.65 + begBob, 8, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -0.65 + begBob, 8, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, 0.92, 8, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0.92, 8, dt);

    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -1.2, 7, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -1.2, 7, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, 1.35, 7, dt);
    legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, 1.35, 7, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.52, 7, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 12.0) * 0.8, 16, dt);
  }

  animateShakeOff(dt) {
    this.dampPoseToNeutral(dt, 8, 2 | 8 | 16 | 32);
    const { body, neck, tail, earL, earR } = this.nodes;

    const envelope = Math.sin(Math.min(1, this.actionTimer / (this.actionDuration || 1.8)) * Math.PI);
    const shakeFreq = Math.sin(this.animTime * 34.0) * envelope;
    body.rotation.z = damp(body.rotation.z, shakeFreq * 0.36, 26, dt);
    neck.rotation.z = damp(neck.rotation.z, -shakeFreq * 0.48, 26, dt);
    tail.rotation.y = damp(tail.rotation.y, -shakeFreq * 0.85, 26, dt);

    earL.rotation.z = damp(earL.rotation.z, 0.25 + shakeFreq * 0.55, 26, dt);
    earR.rotation.z = damp(earR.rotation.z, -0.25 + shakeFreq * 0.55, 26, dt);

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playPlayfulGrumble(1.2);
    }
  }

  animateNuzzle(dt) {
    this.dampPoseToNeutral(dt, 7, 1 | 2 | 8 | 16);
    const { body, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, this.baseBodyY - 0.08, 7, dt);
    body.rotation.z = damp(body.rotation.z, Math.sin(this.animTime * 3.0) * 0.14, 7, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.26, 7, dt);
    neck.rotation.y = damp(neck.rotation.y, Math.sin(this.animTime * 3.2) * 0.26, 12, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 9.0) * 0.75, 16, dt);

    if (!this._sfxTriggered && this.robot.isPlayer) {
      this._sfxTriggered = true;
      roboAudio.playBoop(1.4);
    }
  }

  animatePickedUp(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const { body, legs, neck, tail } = this.nodes;

    body.position.y = damp(body.position.y, this.baseBodyY + 0.15, 7, dt);
    body.rotation.z = damp(body.rotation.z, Math.sin(this.animTime * 4.0) * 0.08, 14, dt);
    body.rotation.x = damp(body.rotation.x, Math.sin(this.animTime * 3.0) * 0.06, 14, dt);

    const paddleSpeed = 12.0;
    const paddleAmp = 0.55;
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, Math.sin(this.animTime * paddleSpeed) * paddleAmp, 20, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -Math.sin(this.animTime * paddleSpeed) * paddleAmp, 20, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -Math.cos(this.animTime * paddleSpeed) * (paddleAmp * 0.8), 20, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, Math.cos(this.animTime * paddleSpeed) * (paddleAmp * 0.8), 20, dt);

    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, 0.4 + Math.sin(this.animTime * paddleSpeed) * 0.3, 20, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0.4 - Math.sin(this.animTime * paddleSpeed) * 0.3, 20, dt);
    legs.BL.knee.rotation.x = damp(legs.BL.knee.rotation.x, 0.4 - Math.cos(this.animTime * paddleSpeed) * 0.3, 20, dt);
    legs.BR.knee.rotation.x = damp(legs.BR.knee.rotation.x, 0.4 + Math.cos(this.animTime * paddleSpeed) * 0.3, 20, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.15 + Math.sin(this.animTime * 5.0) * 0.1, 12, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 14.0) * 0.85, 16, dt);
  }

  animateChaseTail(dt) {
    this.dampPoseToNeutral(dt, 10, 1 | 2 | 8 | 16 | 64);
    const { body, neck, tail, legs } = this.nodes;

    this.robot.group.rotation.y = wrapAngle(this.robot.group.rotation.y + dt * 8.5);
    body.rotation.y = damp(body.rotation.y, Math.sin(this.animTime * 24.0) * 0.2, 20, dt);
    body.rotation.z = damp(body.rotation.z, -0.15, 12, dt);
    body.position.y = damp(body.position.y, this.baseBodyY, 12, dt);

    neck.rotation.y = damp(neck.rotation.y, 0.75, 12, dt);
    neck.rotation.x = damp(neck.rotation.x, 0.3, 12, dt);
    tail.rotation.y = damp(tail.rotation.y, -0.85, 12, dt);

    const legFreq = this.animTime * 18.0;
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, Math.sin(legFreq) * 0.6, 20, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -Math.sin(legFreq) * 0.6, 20, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -Math.sin(legFreq) * 0.6, 20, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, Math.sin(legFreq) * 0.6, 20, dt);
  }

  animateDizzy(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = damp(body.position.y, 0.55, 8, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -1.1, 8, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, -1.1, 8, dt);
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, 0.2, 8, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, 0.2, 8, dt);

    neck.rotation.z = damp(neck.rotation.z, Math.sin(this.animTime * 6.0) * 0.35, 14, dt);
    neck.rotation.y = damp(neck.rotation.y, Math.cos(this.animTime * 4.5) * 0.3, 14, dt);
    neck.rotation.x = damp(neck.rotation.x, 0.25, 10, dt);

    body.rotation.z = damp(body.rotation.z, Math.sin(this.animTime * 5.0) * 0.12, 12, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 2.0) * 0.2, 10, dt);
  }

  animateSwimming(dt) {
    this.dampPoseToNeutral(dt, 8, 1 | 2 | 8 | 16 | 64);
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = damp(body.position.y, 0.45 + Math.sin(this.animTime * 4) * 0.04, 6, dt);
    body.rotation.x = damp(body.rotation.x, 0.14, 6, dt);
    body.rotation.z = damp(body.rotation.z, Math.sin(this.animTime * 6.0) * 0.08, 12, dt);

    neck.rotation.x = damp(neck.rotation.x, -0.36, 6, dt);
    neck.rotation.y = damp(neck.rotation.y, Math.sin(this.animTime * 3.0) * 0.1, 10, dt);

    const paddleSpeed = 8.5;
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, Math.sin(this.animTime * paddleSpeed) * 0.65, 16, dt);
    legs.FL.knee.rotation.x = damp(legs.FL.knee.rotation.x, 0.5 + Math.cos(this.animTime * paddleSpeed) * 0.4, 16, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -Math.sin(this.animTime * paddleSpeed) * 0.65, 16, dt);
    legs.FR.knee.rotation.x = damp(legs.FR.knee.rotation.x, 0.5 - Math.cos(this.animTime * paddleSpeed) * 0.4, 16, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -Math.cos(this.animTime * paddleSpeed) * 0.5, 16, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, Math.cos(this.animTime * paddleSpeed) * 0.5, 16, dt);

    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 10.0) * 0.65, 14, dt);
  }

  animatePatrolLook(dt) {
    this.dampPoseToNeutral(dt, 7, 8 | 16);
    const { neck, tail } = this.nodes;

    const scanCycle = Math.sin(this.animTime * 2.0);
    neck.rotation.y = damp(neck.rotation.y, scanCycle * 0.75, 5, dt);
    neck.rotation.x = damp(neck.rotation.x, -0.15, 5, dt);
    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 4.0) * 0.25, 10, dt);
  }

  animateScentTrack(dt) {
    this.dampPoseToNeutral(dt, 7, 1 | 2 | 8 | 16 | 64);
    const { body, neck, tail, legs } = this.nodes;

    body.position.y = damp(body.position.y, this.baseBodyY - 0.14, 6, dt);
    body.rotation.x = damp(body.rotation.x, 0.18, 6, dt);

    neck.rotation.x = damp(neck.rotation.x, 0.48, 6, dt);
    neck.rotation.y = damp(neck.rotation.y, Math.sin(this.animTime * 4.0) * 0.22, 10, dt);

    const t = this.animTime * 4.2;
    legs.FL.hip.rotation.x = damp(legs.FL.hip.rotation.x, Math.sin(t) * 0.4, 14, dt);
    legs.FR.hip.rotation.x = damp(legs.FR.hip.rotation.x, -Math.sin(t) * 0.4, 14, dt);
    legs.BL.hip.rotation.x = damp(legs.BL.hip.rotation.x, -Math.sin(t) * 0.4, 14, dt);
    legs.BR.hip.rotation.x = damp(legs.BR.hip.rotation.x, Math.sin(t) * 0.4, 14, dt);

    tail.rotation.y = damp(tail.rotation.y, Math.sin(this.animTime * 5.0) * 0.35, 12, dt);
  }

  dispose() {
    this.disposed = true;
    this.actionQueue.length = 0;
    this.onClipComplete = null;
    this.onSequenceComplete = null;
    this.robot = null;
    this.nodes = null;
    this.eventBus = null;
  }
}
