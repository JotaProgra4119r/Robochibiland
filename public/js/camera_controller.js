// Cinematic Gimbal-Safe CameraController ('YXZ' Euler, Ray/Terrain Anti-Clipping, Banking Tilt & Trauma Shake)
import * as THREE from 'three';
import { TMP, damp, dampAngle, wrapAngle } from './core/Scratch.js';
import { WORLD_RADIUS } from './physics.js';

const PITCH_LIMIT = Math.PI / 2.2;
const MIN_TERRAIN_CLEARANCE = 0.65;
const BASE_FOV = 50;

const MODE_LABELS = {
  diagonal: 'Diag',
  follow: 'Seguir',
  orbit: 'Órbita',
  free: 'Vuelo',
  eye: 'Ojos',
  drone: 'Drone'
};

export class CameraController {
  constructor(camera, domElement, world, eventBus) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.eventBus = eventBus;

    this.camera.rotation.order = 'YXZ';
    this.mode = 'diagonal';

    // Spherical & kinematic state
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.58;
    this.targetDistance = 21.0;
    this.currentDistance = 21.0;

    this.targetPos = new THREE.Vector3(0, 1.3, 0);
    this.currentPos = camera.position.clone();
    this.freeVel = new THREE.Vector3();

    this.rollTilt = 0;
    this.trauma = 0;
    this.elapsedTime = 0;
    this.droneAngle = 0;
    this.currentFov = BASE_FOV;

    this._orbitIdleTimer = 2.0;
    this._prevYaw = this.yaw;
    this._rotSens = 0.0055;
    this._pointerDragEnabled = true;
    this._draggingPointerId = null;
    this._lastPointerX = 0;
    this._lastPointerY = 0;

    // Preallocated anti-clipping helpers (zero RAF allocation)
    this._raycaster = new THREE.Raycaster();
    this._hits = [];
    this._pivot = new THREE.Vector3();
    this._desiredCamPos = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._eyeForward = new THREE.Vector3(0, 0, -1);

    this._unsubTrauma = null;
    if (this.eventBus) {
      this._unsubTrauma = this.eventBus.on('camera:trauma', (payload) => {
        if (payload && typeof payload.amount === 'number') {
          this.addTrauma(payload.amount);
        }
      });
    }

    this._bindDomListeners();
  }

  _bindDomListeners() {
    if (!this.domElement) return;

    this._onPointerDown = (e) => {
      // Touch camera rotation is owned by TouchControls; mouse drag is owned here
      if (!this._pointerDragEnabled || e.pointerType === 'touch') return;
      if (e.button !== 0 && e.button !== 2) return;
      this._draggingPointerId = e.pointerId;
      this._lastPointerX = e.clientX;
      this._lastPointerY = e.clientY;
    };

    this._onPointerMove = (e) => {
      if (!this._pointerDragEnabled || e.pointerId !== this._draggingPointerId) return;
      const dx = e.clientX - this._lastPointerX;
      const dy = e.clientY - this._lastPointerY;
      this._lastPointerX = e.clientX;
      this._lastPointerY = e.clientY;
      this.addOrbitDelta(dx, dy);
    };

    this._onPointerUp = (e) => {
      if (e.pointerId === this._draggingPointerId) {
        this._draggingPointerId = null;
      }
    };

    this._onWheel = (e) => {
      this.addZoomDelta(e.deltaY);
    };

    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    this.domElement.addEventListener('wheel', this._onWheel, { passive: true });
  }

  setPointerDragEnabled(enabled) {
    this._pointerDragEnabled = !!enabled;
    if (!this._pointerDragEnabled) {
      this._draggingPointerId = null;
    }
  }

  setMode(mode) {
    if (!MODE_LABELS[mode]) return;
    const prevMode = this.mode;
    this.mode = mode;

    if (mode === 'diagonal') {
      this.targetDistance = 21.0;
      this.pitch = 0.58;
      if (prevMode === 'free' || prevMode === 'eye') {
        this.yaw = Math.PI * 0.25;
      }
    } else if (mode === 'follow') {
      this.targetDistance = 8.4;
      this.pitch = 0.34;
    } else if (mode === 'orbit') {
      this.targetDistance = 12.0;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.1, 1.1);
    } else if (mode === 'drone') {
      this.targetDistance = 18.0;
      this.pitch = 0.48;
      this.droneAngle = this.yaw;
    } else if (mode === 'free') {
      this.freeVel.set(0, 0, 0);
    }

    if (this.eventBus) {
      this.eventBus.emit('camera:modeChanged', {
        mode: this.mode,
        label: MODE_LABELS[this.mode]
      });
    }
  }

  addOrbitDelta(dx, dy) {
    this.yaw = wrapAngle(this.yaw - dx * this._rotSens);
    const pitchSign = this.mode === 'free' ? -1 : 1;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + dy * this._rotSens * pitchSign,
      -PITCH_LIMIT,
      PITCH_LIMIT
    );
    this._orbitIdleTimer = 0;
  }

  addZoomDelta(dz) {
    if (this.mode === 'free' || this.mode === 'eye') return;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + dz * 0.015, 3.2, 65.0);
  }

  addTrauma(amount) {
    this.trauma = THREE.MathUtils.clamp(this.trauma + Math.max(0, amount), 0, 1.0);
  }

  /**
   * Writes camera-aligned XZ forward and right vectors into caller-supplied Vector3s (zero alloc).
   */
  getGroundForwardRight(outForward, outRight) {
    if (this.mode === 'eye') {
      outForward.copy(this._eyeForward);
      outForward.y = 0;
      if (outForward.lengthSq() < 0.0001) {
        outForward.set(0, 0, -1);
      } else {
        outForward.normalize();
      }
    } else {
      outForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    outRight.set(-outForward.z, 0, outForward.x);
  }

  _computeSafeDistance(pivot, desiredPos, desiredDist) {
    let safeDist = desiredDist;

    this._rayDir.subVectors(desiredPos, pivot);
    const len = this._rayDir.length();
    if (len < 0.001) return desiredDist;
    this._rayDir.multiplyScalar(1.0 / len);

    // 1. Static geometry / wall collider raycast
    if (this.world && this.world.camColliders && this.world.camColliders.length > 0) {
      this._raycaster.set(pivot, this._rayDir);
      this._raycaster.near = 0.25;
      this._raycaster.far = len;
      this._hits.length = 0;
      this._raycaster.intersectObjects(this.world.camColliders, false, this._hits);
      if (this._hits.length > 0 && this._hits[0].distance < safeDist) {
        safeDist = Math.max(1.5, this._hits[0].distance - 0.45);
      }
    }

    // 2. Terrain height ray-marching & lateral sphere-cast probes along arm
    if (this.world && this.world.getHeightAt) {
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const frac = i / steps;
        const probeDist = safeDist * frac;
        const px = pivot.x + this._rayDir.x * probeDist;
        const py = pivot.y + this._rayDir.y * probeDist;
        const pz = pivot.z + this._rayDir.z * probeDist;
        const groundY = this.world.getHeightAt(px, pz) + MIN_TERRAIN_CLEARANCE;
        if (py < groundY && this._rayDir.y < -0.05) {
          // Pull arm closer if ray dips below terrain slope
          const denom = Math.max(0.05, pivot.y - py);
          const ratio = THREE.MathUtils.clamp((pivot.y - groundY) / denom, 0.2, 1.0);
          safeDist = Math.max(1.5, Math.min(safeDist, probeDist * ratio));
        }
      }
    }

    return safeDist;
  }

  _clampAboveTerrain(pos, minClearance) {
    if (!this.world || !this.world.getHeightAt) return;
    let maxFloor = this.world.getHeightAt(pos.x, pos.z);
    // 4-point lateral sphere feeler for steep edges
    const r = 0.45;
    const h1 = this.world.getHeightAt(pos.x + r, pos.z);
    const h2 = this.world.getHeightAt(pos.x - r, pos.z);
    const h3 = this.world.getHeightAt(pos.x, pos.z + r);
    const h4 = this.world.getHeightAt(pos.x, pos.z - r);
    if (h1 > maxFloor) maxFloor = h1;
    if (h2 > maxFloor) maxFloor = h2;
    if (h3 > maxFloor) maxFloor = h3;
    if (h4 > maxFloor) maxFloor = h4;

    const minAllowedY = maxFloor + minClearance;
    if (pos.y < minAllowedY) {
      pos.y = minAllowedY;
    }
  }

  update(dt, targetRobot, moveInput, eyeCamera) {
    const clampedDt = Math.min(Math.max(dt || 0, 0), 0.05);
    this.elapsedTime += clampedDt;
    this._orbitIdleTimer += clampedDt;

    // Decay trauma
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - 1.65 * clampedDt);
    }
    const shake = this.trauma * this.trauma;
    const shakeYaw = shake * 0.032 * Math.sin(this.elapsedTime * 37.3);
    const shakePitch = shake * 0.026 * Math.cos(this.elapsedTime * 43.1);
    const shakeRoll = shake * 0.04 * Math.sin(this.elapsedTime * 29.7);

    const robotPos = targetRobot ? targetRobot.group.position : this.targetPos;
    const robotRotY = targetRobot ? targetRobot.group.rotation.y : 0;
    const robotSpeed = targetRobot
      ? (targetRobot.physics ? targetRobot.physics.speedScalar : (targetRobot.speedScalar || 0))
      : 0;
    const robotBank = targetRobot
      ? (targetRobot.physics ? targetRobot.physics.bankAngle : (targetRobot.bankAngle || 0))
      : 0;

    // Dynamic FOV boost on sprint / high vertical air speed
    const velY = targetRobot
      ? (targetRobot.physics ? targetRobot.physics.velocity.y : (targetRobot.velocityY || 0))
      : 0;
    const speedRatio = THREE.MathUtils.clamp((robotSpeed - 5.2) / 6.0, 0, 1);
    const airRatio = THREE.MathUtils.clamp((Math.abs(velY) - 3.0) / 8.0, 0, 1);
    const targetFov = BASE_FOV + speedRatio * 5.5 + airRatio * 2.5;
    const nextFov = damp(this.currentFov, targetFov, 6.0, clampedDt);
    if (Math.abs(nextFov - this.camera.fov) > 0.02) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.currentFov = nextFov;

    // Update target tracking pivot
    this._pivot.set(robotPos.x, robotPos.y + 1.35, robotPos.z);
    this.targetPos.x = damp(this.targetPos.x, this._pivot.x, 14.0, clampedDt);
    this.targetPos.y = damp(this.targetPos.y, this._pivot.y, 12.0, clampedDt);
    this.targetPos.z = damp(this.targetPos.z, this._pivot.z, 14.0, clampedDt);

    if (this.mode === 'eye' && eyeCamera) {
      eyeCamera.updateWorldMatrix(true, false);
      eyeCamera.getWorldPosition(this.currentPos);
      eyeCamera.getWorldQuaternion(TMP.q1);
      eyeCamera.getWorldDirection(this._eyeForward);

      // Stabilize horizon roll while keeping head yaw/pitch inside safe bounds
      TMP.e1.setFromQuaternion(TMP.q1, 'YXZ');
      TMP.e1.x = THREE.MathUtils.clamp(TMP.e1.x + shakePitch, -PITCH_LIMIT, PITCH_LIMIT);
      TMP.e1.y += shakeYaw;
      TMP.e1.z = damp(TMP.e1.z, 0, 10.0, clampedDt) + shakeRoll;

      this.camera.position.copy(this.currentPos);
      this.camera.quaternion.setFromEuler(TMP.e1);
      this._prevYaw = TMP.e1.y;
      return;
    }

    if (this.mode === 'free') {
      const isShift = moveInput && moveInput.isRunning;
      const flySpeed = isShift ? 42.0 : 22.0;

      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const cosP = Math.cos(this.pitch);
      const sinP = Math.sin(this.pitch);

      // Camera forward & right in YXZ space
      TMP.v1.set(-sinY * cosP, sinP, -cosY * cosP).normalize();
      TMP.v2.set(cosY, 0, -sinY).normalize();

      const mx = moveInput ? (moveInput.x || 0) : 0;
      const mz = moveInput ? (moveInput.z || 0) : 0;
      const my = moveInput ? (moveInput.y || 0) : 0;

      TMP.v3.set(0, 0, 0);
      TMP.v3.addScaledVector(TMP.v1, -mz * flySpeed);
      TMP.v3.addScaledVector(TMP.v2, mx * flySpeed);
      TMP.v3.y += my * flySpeed;

      this.freeVel.x = damp(this.freeVel.x, TMP.v3.x, 10.0, clampedDt);
      this.freeVel.y = damp(this.freeVel.y, TMP.v3.y, 10.0, clampedDt);
      this.freeVel.z = damp(this.freeVel.z, TMP.v3.z, 10.0, clampedDt);

      this.currentPos.addScaledVector(this.freeVel, clampedDt);

      // Clamp free camera inside world sky dome & above terrain
      const flyMax = WORLD_RADIUS + 40;
      const distSq = this.currentPos.x * this.currentPos.x + this.currentPos.z * this.currentPos.z;
      if (distSq > flyMax * flyMax) {
        const s = flyMax / Math.sqrt(distSq);
        this.currentPos.x *= s;
        this.currentPos.z *= s;
      }
      this.currentPos.y = Math.min(this.currentPos.y, 140);
      this._clampAboveTerrain(this.currentPos, 1.2);

      this.camera.position.copy(this.currentPos);
      TMP.e1.set(
        THREE.MathUtils.clamp(this.pitch + shakePitch, -PITCH_LIMIT, PITCH_LIMIT),
        this.yaw + shakeYaw,
        shakeRoll,
        'YXZ'
      );
      this.camera.quaternion.setFromEuler(TMP.e1);
      this._prevYaw = this.yaw;
      return;
    }

    // Orbit-based modes: diagonal, follow, orbit, drone
    if (this.mode === 'drone') {
      this.droneAngle = wrapAngle(this.droneAngle + clampedDt * 0.35);
      this.yaw = this.droneAngle;
    } else if (this.mode === 'follow' && this._orbitIdleTimer > 1.1 && robotSpeed > 0.6) {
      // Gently align chase camera behind robot when user is not manually orbiting
      const desiredChaseYaw = wrapAngle(robotRotY + Math.PI);
      this.yaw = dampAngle(this.yaw, desiredChaseYaw, 2.2, clampedDt);
    }

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    // Compute unobstructed desired camera position along arm
    this._desiredCamPos.set(
      this.targetPos.x + sinY * cosP * this.targetDistance,
      this.targetPos.y + sinP * this.targetDistance,
      this.targetPos.z + cosY * cosP * this.targetDistance
    );

    const safeDist = this._computeSafeDistance(this.targetPos, this._desiredCamPos, this.targetDistance);
    const distLambda = safeDist < this.currentDistance ? 24.0 : 6.0;
    this.currentDistance = damp(this.currentDistance, safeDist, distLambda, clampedDt);

    this.currentPos.set(
      this.targetPos.x + sinY * cosP * this.currentDistance,
      this.targetPos.y + sinP * this.currentDistance,
      this.targetPos.z + cosY * cosP * this.currentDistance
    );
    this._clampAboveTerrain(this.currentPos, MIN_TERRAIN_CLEARANCE);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.targetPos);

    // Apply banking roll tilt + trauma shake cleanly in YXZ Euler order
    const yawRate = wrapAngle(this.yaw - this._prevYaw) / Math.max(clampedDt, 0.001);
    this._prevYaw = this.yaw;
    const targetRoll = THREE.MathUtils.clamp(robotBank * 0.2 + yawRate * 0.015, -0.09, 0.09);
    this.rollTilt = damp(this.rollTilt, targetRoll, 8.0, clampedDt);

    TMP.e1.setFromQuaternion(this.camera.quaternion, 'YXZ');
    TMP.e1.x = THREE.MathUtils.clamp(TMP.e1.x + shakePitch, -PITCH_LIMIT, PITCH_LIMIT);
    TMP.e1.y += shakeYaw;
    TMP.e1.z += this.rollTilt + shakeRoll;
    this.camera.quaternion.setFromEuler(TMP.e1);
  }

  dispose() {
    if (this._unsubTrauma) {
      this._unsubTrauma();
      this._unsubTrauma = null;
    }
    if (this.domElement) {
      this.domElement.removeEventListener('pointerdown', this._onPointerDown);
      this.domElement.removeEventListener('wheel', this._onWheel);
    }
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this._hits.length = 0;
  }
}
