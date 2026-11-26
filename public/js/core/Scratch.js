// Zero-Allocation Scratch Pool, Frame-Rate Independent Damping & Managed Timer Registry
import * as THREE from 'three';

/**
 * Pre-allocated reusable Three.js math objects for hot loops (animate / update / render).
 * Convention: leaf-scoped only — never hold references across frames or across calls that reuse the same slot.
 */
export const TMP = {
  v1: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  v3: new THREE.Vector3(),
  v4: new THREE.Vector3(),
  v5: new THREE.Vector3(),
  v6: new THREE.Vector3(),
  v2_1: new THREE.Vector2(),
  v2_2: new THREE.Vector2(),
  q1: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  e1: new THREE.Euler(0, 0, 0, 'YXZ'),
  m1: new THREE.Matrix4(),
  m2: new THREE.Matrix4(),
  ray: new THREE.Ray(),
  plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  color: new THREE.Color(),
  obj: new THREE.Object3D()
};

/**
 * Frame-rate independent exponential damping.
 */
export function damp(a, b, lambda, dt) {
  return a + (b - a) * (1 - Math.exp(-lambda * dt));
}

/**
 * Frame-rate independent shortest-arc angular damping (radians).
 */
export function dampAngle(current, target, lambda, dt) {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * (1 - Math.exp(-lambda * dt));
}

/**
 * Normalize angle in radians to [-PI, PI).
 */
export function wrapAngle(rad) {
  let a = (rad + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Managed setTimeout / setInterval registry to prevent orphan timers on reset or dispose().
 */
export class TimerRegistry {
  constructor() {
    this._timeouts = new Set();
    this._intervals = new Set();
  }

  setTimeout(fn, ms) {
    const id = globalThis.setTimeout(() => {
      this._timeouts.delete(id);
      fn();
    }, ms);
    this._timeouts.add(id);
    return id;
  }

  setInterval(fn, ms) {
    const id = globalThis.setInterval(fn, ms);
    this._intervals.add(id);
    return id;
  }

  clear(id) {
    if (id === undefined || id === null) return;
    if (this._timeouts.has(id)) {
      globalThis.clearTimeout(id);
      this._timeouts.delete(id);
    }
    if (this._intervals.has(id)) {
      globalThis.clearInterval(id);
      this._intervals.delete(id);
    }
  }

  clearAll() {
    for (const id of this._timeouts) {
      globalThis.clearTimeout(id);
    }
    this._timeouts.clear();

    for (const id of this._intervals) {
      globalThis.clearInterval(id);
    }
    this._intervals.clear();
  }
}
