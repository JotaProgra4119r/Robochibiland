// Deterministic Frame-Rate Independent Robot Physics (Coyote Time, Jump Buffer, Slope Stick & Collisions)
import * as THREE from 'three';
import { TMP, damp, dampAngle, wrapAngle } from './core/Scratch.js';

export const WORLD_RADIUS = 195;

const GRAVITY = 20.0;
const COYOTE_DURATION = 0.14;
const JUMP_BUFFER_DURATION = 0.14;
const GROUND_STICK_TOLERANCE = 0.22;
const JUMP_VELOCITY = 7.8;
const ROBOT_RADIUS = 0.75;

/**
 * Ensures the dog has a deterministic physics state object initialized once.
 */
function ensurePhysicsState(dog) {
  if (!dog.physics) {
    dog.physics = {
      velocity: new THREE.Vector3(),
      isGrounded: true,
      coyoteTimer: COYOTE_DURATION,
      jumpBufferTimer: 0,
      speedScalar: 0,
      bankAngle: 0
    };
  } else if (!dog.physics.velocity) {
    dog.physics.velocity = new THREE.Vector3();
  }
  return dog.physics;
}

/**
 * Applies an instant vertical launch impulse (e.g., trampoline or bounce pad).
 */
export function triggerDogBounce(dog, force = 12.0) {
  if (!dog || !dog.group) return;
  const p = ensurePhysicsState(dog);
  p.velocity.y = force;
  p.isGrounded = false;
  p.coyoteTimer = 0;
  p.jumpBufferTimer = 0;
  dog.velocityY = force;
  dog.group.position.y += 0.06;
}

/**
 * Clamps a world-space position inside the circular world boundary without allocating.
 */
function clampRadialWorld(pos, radiusLimit) {
  const distSq = pos.x * pos.x + pos.z * pos.z;
  if (distSq > radiusLimit * radiusLimit) {
    const invDist = radiusLimit / Math.sqrt(distSq);
    pos.x *= invDist;
    pos.z *= invDist;
  }
}

/**
 * Advances a robot's deterministic ground/air/water physics for one clamped frame step.
 */
export function stepRobotPhysics(dog, moveDirX, moveDirZ, isRunning, jumpPressed, world, dt, eventBus) {
  if (!dog || !dog.group) return;

  const clampedDt = Math.min(Math.max(dt || 0, 0), 0.05);
  const p = ensurePhysicsState(dog);
  const pos = dog.group.position;

  if (dog.isPickedUp || dog.isSliding) {
    p.velocity.set(0, 0, 0);
    p.speedScalar = 0;
    dog.speedScalar = 0;
    dog.velocityY = 0;
    return;
  }

  // 1. Jump buffering & coyote time
  if (jumpPressed) {
    p.jumpBufferTimer = JUMP_BUFFER_DURATION;
  } else if (p.jumpBufferTimer > 0) {
    p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - clampedDt);
  }

  if (p.isGrounded) {
    p.coyoteTimer = COYOTE_DURATION;
  } else if (p.coyoteTimer > 0) {
    p.coyoteTimer = Math.max(0, p.coyoteTimer - clampedDt);
  }

  if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0 && !dog.isInWater) {
    p.velocity.y = JUMP_VELOCITY;
    p.isGrounded = false;
    p.coyoteTimer = 0;
    p.jumpBufferTimer = 0;
    dog.velocityY = JUMP_VELOCITY;

    if (dog.animController && dog.animController.play) {
      dog.animController.play('jump', 0.65);
    }
    if (eventBus) {
      eventBus.emit('robot:action', {
        name: dog.name,
        action: 'jump',
        source: dog.isPlayer ? 'player' : 'ai'
      });
      if (dog.isPlayer) {
        eventBus.emit('haptic:pulse', { pattern: 12 });
      }
    }
  }

  // 2. Horizontal movement with normalized direction & exponential damping
  let inX = moveDirX || 0;
  let inZ = moveDirZ || 0;
  const inputMagSq = inX * inX + inZ * inZ;
  const hasInput = inputMagSq > 0.0025;

  if (inputMagSq > 1.0) {
    const invLen = 1.0 / Math.sqrt(inputMagSq);
    inX *= invLen;
    inZ *= invLen;
  }

  const speedMult = dog.profile ? (dog.profile.speedMultiplier || 1.0) : 1.0;
  const baseSpeed = isRunning ? 9.5 : 4.8;
  const waterFactor = dog.isInWater ? 0.62 : 1.0;
  const maxSpeed = baseSpeed * speedMult * waterFactor;

  const targetVx = hasInput ? inX * maxSpeed : 0;
  const targetVz = hasInput ? inZ * maxSpeed : 0;
  const horizLambda = p.isGrounded ? (hasInput ? 16.0 : 14.0) : (hasInput ? 6.0 : 2.5);

  p.velocity.x = damp(p.velocity.x, targetVx, horizLambda, clampedDt);
  p.velocity.z = damp(p.velocity.z, targetVz, horizLambda, clampedDt);

  // Clean small residual drift when idle
  if (!hasInput && (p.velocity.x * p.velocity.x + p.velocity.z * p.velocity.z) < 0.0004) {
    p.velocity.x = 0;
    p.velocity.z = 0;
  }

  // 3. Smooth orientation & banking tilt
  if (hasInput) {
    const targetYaw = Math.atan2(inX, inZ);
    const yawDiff = wrapAngle(targetYaw - dog.group.rotation.y);
    dog.group.rotation.y = dampAngle(dog.group.rotation.y, targetYaw, 13.0, clampedDt);
    const targetBank = THREE.MathUtils.clamp(-yawDiff * 0.35, -0.24, 0.24);
    p.bankAngle = damp(p.bankAngle || 0, targetBank, 12.0, clampedDt);
  } else {
    p.bankAngle = damp(p.bankAngle || 0, 0, 10.0, clampedDt);
  }
  dog.bankAngle = p.bankAngle;

  // Integrate XZ
  pos.x += p.velocity.x * clampedDt;
  pos.z += p.velocity.z * clampedDt;

  // 4. Obstacle collision resolution & world boundary clamping
  if (world && world.resolveObstacleCollisions) {
    world.resolveObstacleCollisions(pos, ROBOT_RADIUS);
  }
  if (world && world.clampToWorld) {
    world.clampToWorld(pos, 2.0);
  }
  clampRadialWorld(pos, WORLD_RADIUS);

  // 5. Vertical gravity, slope sticking & water buoyancy
  const groundY = world ? world.getHeightAt(pos.x, pos.z) : 0;
  let inLake = false;
  if (world && world.lakeCenter) {
    const ldx = pos.x - world.lakeCenter.x;
    const ldz = pos.z - world.lakeCenter.z;
    const lakeRad = (world.lakeRadius || 60) - 2.0;
    if ((ldx * ldx + ldz * ldz) < (lakeRad * lakeRad) && groundY < -0.1) {
      inLake = true;
    }
  }

  if (inLake) {
    dog.isInWater = true;
    p.isGrounded = false;
    p.velocity.y = 0;
    pos.y = damp(pos.y, -0.52, 10.0, clampedDt);
  } else {
    dog.isInWater = false;

    if (!p.isGrounded || p.velocity.y > 0) {
      p.velocity.y -= GRAVITY * clampedDt;
      pos.y += p.velocity.y * clampedDt;

      if (pos.y <= groundY) {
        if (!p.isGrounded && p.velocity.y < -9.5 && dog.isPlayer && eventBus) {
          const impactTrauma = Math.min(0.45, (-p.velocity.y - 9.0) * 0.04);
          eventBus.emit('camera:trauma', { amount: impactTrauma });
          eventBus.emit('haptic:pulse', { pattern: 18 });
        }
        pos.y = groundY;
        p.velocity.y = 0;
        p.isGrounded = true;
      }
    } else {
      // Grounded slope stick: hug downward slopes without micro-hopping
      const drop = pos.y - groundY;
      if (drop <= GROUND_STICK_TOLERANCE) {
        pos.y = groundY;
        p.velocity.y = 0;
        p.isGrounded = true;
      } else {
        p.isGrounded = false;
      }
    }
  }

  // Sync legacy fields for downstream animations/HUD readers
  p.speedScalar = Math.hypot(p.velocity.x, p.velocity.z);
  dog.speedScalar = p.speedScalar;
  dog.velocityY = p.velocity.y;
}

/**
 * Resolves solid horizontal XZ pushout between robots followed by obstacle/world re-clamping.
 * Zero-allocation outer pass called after individual physics steps.
 */
export function resolvePackPushout(dogsArray, world) {
  if (!dogsArray || dogsArray.length < 2) return;
  const minDist = 1.4;
  const minDistSq = minDist * minDist;

  for (let i = 0; i < dogsArray.length; i++) {
    const a = dogsArray[i];
    if (!a || a.isPickedUp || a.isSliding) continue;
    const posA = a.group.position;

    for (let j = i + 1; j < dogsArray.length; j++) {
      const b = dogsArray[j];
      if (!b || b.isPickedUp || b.isSliding) continue;
      const posB = b.group.position;

      if (Math.abs(posA.y - posB.y) >= 1.2) continue;

      const dx = posA.x - posB.x;
      const dz = posA.z - posB.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < minDistSq && distSq > 0.000001) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;

        posA.x += nx * overlap;
        posA.z += nz * overlap;
        posB.x -= nx * overlap;
        posB.z -= nz * overlap;
      }
    }

    if (world && world.resolveObstacleCollisions) {
      world.resolveObstacleCollisions(posA, ROBOT_RADIUS);
    }
    clampRadialWorld(posA, WORLD_RADIUS);
  }
}
