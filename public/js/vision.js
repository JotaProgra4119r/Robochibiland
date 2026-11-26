// Robot Camera, Vision System & Body Proprioception (Zero-Alloc, Single-Renderer PIP)
import * as THREE from 'three';
import { TMP } from './core/Scratch.js';

export class RobotVisionSystem {
  constructor(worldOrRobot, eventBusOrScene = null, maybeWorld = null) {
    // Support both Fase 2 contract (world, eventBus) and legacy (robot, scene, world)
    if (maybeWorld) {
      this.robot = worldOrRobot;
      this.world = maybeWorld;
      this.eventBus = null;
    } else {
      this.robot = null;
      this.world = worldOrRobot;
      this.eventBus = eventBusOrScene;
    }

    // Physical 3D Eye Camera (shared single-renderer PIP — NO second WebGLRenderer!)
    this.eyeCamera = new THREE.PerspectiveCamera(75, 230 / 130, 0.08, 280);
    if (this.robot) {
      this.attachToRobot(this.robot);
    }

    this.visionAngle = Math.PI * 0.58; // ~105° cone of sight
    this.visionRange = 42;
    this.pipAccum = 0;
    this.pipInterval = 1 / 12; // 12 FPS throttled PIP blit for mobile performance

    // Pre-allocated top-5 candidate slots for zero-GC snapshot sorting
    this._snapCandidates = [];
    for (let i = 0; i < 64; i++) {
      this._snapCandidates.push({
        distSq: 0,
        dist: 0,
        kind: 0, // 0=item, 1=snack, 2=treasure, 3=bot, 4=landmark
        label: '',
        emotion: '',
        action: '',
        dir: ''
      });
    }
    this.disposed = false;
  }

  attachToRobot(newRobot) {
    if (this.disposed || !newRobot) return;
    this.robot = newRobot;
    if (this.robot.nodes && this.robot.nodes.head) {
      this.robot.nodes.head.add(this.eyeCamera);
      this.eyeCamera.position.set(0, 0.58, 1.02);
      this.eyeCamera.rotation.set(0, Math.PI, 0);
    }
  }

  update(dt, dog = null) {
    if (this.disposed) return;
    if (dog && dog !== this.robot) {
      this.attachToRobot(dog);
    }
    this.pipAccum += dt;
  }

  renderPIP(gfxPipeline, targetCanvas) {
    if (this.disposed || !gfxPipeline || !targetCanvas) return;
    if (this.pipAccum < this.pipInterval) return;
    this.pipAccum = 0;

    const w = targetCanvas.clientWidth || targetCanvas.width || 230;
    const h = targetCanvas.clientHeight || targetCanvas.height || 130;
    if (w > 10 && h > 10) {
      const targetAspect = w / h;
      if (Math.abs(this.eyeCamera.aspect - targetAspect) > 0.02) {
        this.eyeCamera.aspect = targetAspect;
        this.eyeCamera.updateProjectionMatrix();
      }
    }

    this.eyeCamera.updateWorldMatrix(true, false);
    if (typeof gfxPipeline.renderEyePip === 'function') {
      gfxPipeline.renderEyePip(this.eyeCamera, targetCanvas);
    }
  }

  getCurrentLocationName(pos) {
    if (!pos || !this.world || !this.world.pointsOfInterest) return 'Gran Prado Verde';
    let bestPoi = null;
    let smallestRadius = Infinity;
    const pois = this.world.pointsOfInterest;

    for (let i = 0; i < pois.length; i++) {
      const poi = pois[i];
      const d = Math.hypot(pos.x - poi.position.x, pos.z - poi.position.z);
      if (d <= poi.radius && poi.radius < smallestRadius) {
        smallestRadius = poi.radius;
        bestPoi = poi;
      }
    }
    return bestPoi ? bestPoi.name : 'Gran Prado Verde';
  }

  getBodyState(dog = null) {
    const bot = dog || this.robot;
    if (!bot) return null;
    const pos = bot.group.position;
    return {
      name: bot.name,
      position: {
        x: Number(pos.x.toFixed(1)),
        y: Number(pos.y.toFixed(1)),
        z: Number(pos.z.toFixed(1))
      },
      current_area: this.getCurrentLocationName(pos),
      current_emotion: bot.currentEmotion ? bot.currentEmotion.name : 'Feliz',
      current_action: bot.animController ? bot.animController.currentAnim : 'idle',
      energy_level: Math.round(bot.energy || 100),
      curiosity_level: Math.round(bot.curiosity || 80),
      sociability_level: Math.round(bot.sociability || 85)
    };
  }

  _getRelativeDirection(forward, toTarget) {
    TMP.v4.crossVectors(forward, toTarget);
    const dot = forward.dot(toTarget);
    if (Math.abs(dot) > 0.85) {
      return dot > 0 ? 'Al frente' : 'Atrás';
    }
    return TMP.v4.y > 0 ? 'A la izquierda' : 'A la derecha';
  }

  // Supports both getVisualSnapshot(dog, otherRobots) and getVisualSnapshot(otherRobots)
  getVisualSnapshot(dogOrRobots = null, maybeOtherRobots = null) {
    let bot = this.robot;
    let otherRobots = [];
    if (Array.isArray(dogOrRobots)) {
      otherRobots = dogOrRobots;
    } else if (dogOrRobots && dogOrRobots.group) {
      bot = dogOrRobots;
      otherRobots = Array.isArray(maybeOtherRobots) ? maybeOtherRobots : [];
    }
    if (!bot) return [];

    const robotPos = bot.group.position;
    const yaw = bot.group.rotation.y;
    TMP.v2.set(Math.sin(yaw), 0, Math.cos(yaw)).normalize();

    const maxRangeSq = this.visionRange * this.visionRange;
    const poiMaxRangeSq = (this.visionRange * 1.5) * (this.visionRange * 1.5);
    const cosHalfFov = Math.cos(this.visionAngle * 0.5);

    let count = 0;
    const addCandidate = (distSq, dist, kind, label, emotion, action) => {
      if (count >= this._snapCandidates.length) return;
      const slot = this._snapCandidates[count++];
      slot.distSq = distSq;
      slot.dist = dist;
      slot.kind = kind;
      slot.label = label;
      slot.emotion = emotion;
      slot.action = action;
      slot.dir = this._getRelativeDirection(TMP.v2, TMP.v3);
    };

    // 1. Interactive toys
    if (this.world && this.world.interactiveObjects) {
      const items = this.world.interactiveObjects;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.object) continue;
        item.object.getWorldPosition(TMP.v1);
        TMP.v3.subVectors(TMP.v1, robotPos);
        const distSq = TMP.v3.lengthSq();
        if (distSq <= maxRangeSq && distSq > 0.16) {
          const dist = Math.sqrt(distSq);
          TMP.v3.multiplyScalar(1 / dist);
          if (TMP.v2.dot(TMP.v3) >= cosHalfFov) {
            addCandidate(distSq, dist, 0, item.name, '', '');
          }
        }
      }
    }

    // 2. Dropped Cyber Snacks
    if (this.world && this.world.snacks) {
      const snacks = this.world.snacks;
      for (let i = 0; i < snacks.length; i++) {
        const snack = snacks[i];
        if (!snack.group) continue;
        snack.group.getWorldPosition(TMP.v1);
        TMP.v3.subVectors(TMP.v1, robotPos);
        const distSq = TMP.v3.lengthSq();
        if (distSq <= maxRangeSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          TMP.v3.multiplyScalar(1 / dist);
          if (TMP.v2.dot(TMP.v3) >= cosHalfFov) {
            addCandidate(distSq, dist, 1, 'Galleta Energética', '', '');
          }
        }
      }
    }

    // 3. Un-dug Treasure Spots
    if (this.world && this.world.treasureSpots) {
      const spots = this.world.treasureSpots;
      const tRangeSq = (this.visionRange * 0.8) * (this.visionRange * 0.8);
      for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        if (spot.dug) continue;
        TMP.v1.set(spot.x, robotPos.y, spot.z);
        TMP.v3.subVectors(TMP.v1, robotPos);
        const distSq = TMP.v3.lengthSq();
        if (distSq <= tRangeSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          TMP.v3.multiplyScalar(1 / dist);
          if (TMP.v2.dot(TMP.v3) >= cosHalfFov) {
            addCandidate(distSq, dist, 2, `Montículo de Tesoro (${spot.name})`, '', '');
          }
        }
      }
    }

    // 4. Other Chibi Robot Dogs
    for (let i = 0; i < otherRobots.length; i++) {
      const other = otherRobots[i];
      if (!other || other === bot) continue;
      TMP.v3.subVectors(other.group.position, robotPos);
      const distSq = TMP.v3.lengthSq();
      if (distSq <= maxRangeSq && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        TMP.v3.multiplyScalar(1 / dist);
        if (TMP.v2.dot(TMP.v3) >= cosHalfFov) {
          addCandidate(
            distSq,
            dist,
            3,
            `Amigo robot ${other.name}`,
            other.currentEmotion ? other.currentEmotion.name : 'Feliz',
            other.animController ? other.animController.currentAnim : 'idle'
          );
        }
      }
    }

    // 5. Landmarks
    if (this.world && this.world.pointsOfInterest) {
      const pois = this.world.pointsOfInterest;
      for (let i = 0; i < pois.length; i++) {
        const poi = pois[i];
        TMP.v3.subVectors(poi.position, robotPos);
        const distSq = TMP.v3.lengthSq();
        if (distSq <= poiMaxRangeSq && distSq > 4.0) {
          const dist = Math.sqrt(distSq);
          TMP.v3.multiplyScalar(1 / dist);
          if (TMP.v2.dot(TMP.v3) >= cosHalfFov) {
            addCandidate(distSq, dist, 4, poi.name, '', '');
          }
        }
      }
    }

    // Partial selection sort for top 5 (numeric distSq, zero string parsing)
    const out = [];
    const topK = Math.min(5, count);
    for (let k = 0; k < topK; k++) {
      let bestIdx = k;
      for (let j = k + 1; j < count; j++) {
        if (this._snapCandidates[j].distSq < this._snapCandidates[bestIdx].distSq) {
          bestIdx = j;
        }
      }
      if (bestIdx !== k) {
        const tmp = this._snapCandidates[k];
        this._snapCandidates[k] = this._snapCandidates[bestIdx];
        this._snapCandidates[bestIdx] = tmp;
      }
      const c = this._snapCandidates[k];
      if (c.kind === 3) {
        out.push({
          type: c.label,
          emotion: c.emotion,
          action: c.action,
          distance: `${c.dist.toFixed(1)}m`,
          direction: c.dir
        });
      } else if (c.kind === 4) {
        out.push({
          landmark: c.label,
          distance: `${c.dist.toFixed(1)}m`,
          direction: c.dir
        });
      } else {
        out.push({
          type: c.label,
          distance: `${c.dist.toFixed(1)}m`,
          direction: c.dir
        });
      }
    }
    return out;
  }

  dispose() {
    this.disposed = true;
    if (this.eyeCamera && this.eyeCamera.parent) {
      this.eyeCamera.parent.remove(this.eyeCamera);
    }
    this.robot = null;
    this.world = null;
    this.eventBus = null;
  }
}
