// Robot Camera, Vision System & Body Proprioception (Optimized for ultra-low token usage)
import * as THREE from 'three';

export class RobotVisionSystem {
  constructor(robot, scene, world) {
    this.robot = robot;
    this.scene = scene;
    this.world = world;

    // 1. Physical 3D Eye Camera
    this.eyeCamera = new THREE.PerspectiveCamera(75, 230 / 130, 0.05, 300);
    // Orient forward (+Z) so it looks ahead in direction of dog's sight!
    this.eyeCamera.rotation.y = Math.PI;
    // Position ahead of head box and above snout for a completely unobstructed view
    this.eyeCamera.position.set(0, 0.58, 0.96);
    if (this.robot && this.robot.nodes && this.robot.nodes.head) {
      this.robot.nodes.head.add(this.eyeCamera);
    }

    // Secondary PIP renderer for HUD
    this.pipCanvas = null;
    this.pipRenderer = null;

    // FOV cone configuration for semantic vision
    this.visionAngle = Math.PI * 0.55; // ~100 degrees cone of sight
    this.visionRange = 40; // 40 units view distance
  }

  initPIP(canvasElement) {
    this.pipCanvas = canvasElement;
    if (!canvasElement) return;

    try {
      this.pipRenderer = new THREE.WebGLRenderer({
        canvas: canvasElement,
        antialias: true,
        alpha: false,
        powerPreference: 'default'
      });
      this.pipRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const w = canvasElement.clientWidth || 230;
      const h = canvasElement.clientHeight || 130;
      this.pipRenderer.setSize(w, h, false);
      this.pipRenderer.setClearColor(0x0a101d, 1);
    } catch (e) {
      console.warn("PIP canvas WebGL fallback:", e);
    }
  }

  renderPIP() {
    if (!this.pipRenderer || !this.pipCanvas) return;

    // Dynamically adjust to canvas bounding dimensions when visible
    const w = this.pipCanvas.clientWidth || this.pipCanvas.width || 230;
    const h = this.pipCanvas.clientHeight || this.pipCanvas.height || 130;

    if (w > 10 && h > 10) {
      const curSize = this.pipRenderer.getSize(new THREE.Vector2());
      if (Math.abs(curSize.x - w) > 2 || Math.abs(curSize.y - h) > 2) {
        this.pipRenderer.setSize(w, h, false);
        this.eyeCamera.aspect = w / h;
        this.eyeCamera.updateProjectionMatrix();
      }
    }

    try {
      this.pipRenderer.render(this.scene, this.eyeCamera);
    } catch (e) {
      // transient render catch
    }
  }

  // Noción del Cuerpo (Proprioception)
  getBodyState() {
    const pos = this.robot.group.position;
    const currentLoc = this.getCurrentLocationName(pos);

    return {
      name: this.robot.name,
      position: {
        x: Number(pos.x.toFixed(1)),
        y: Number(pos.y.toFixed(1)),
        z: Number(pos.z.toFixed(1))
      },
      current_area: currentLoc,
      current_emotion: this.robot.currentEmotion ? this.robot.currentEmotion.name : 'Feliz',
      current_action: this.robot.animController ? this.robot.animController.currentAnim : 'idle',
      energy_level: Math.round(this.robot.energy || 100),
      curiosity_level: Math.round(this.robot.curiosity || 80),
      sociability_level: Math.round(this.robot.sociability || 85)
    };
  }

  getCurrentLocationName(pos) {
    if (!this.world || !this.world.pointsOfInterest) return 'Gran Prado Verde';
    for (const poi of this.world.pointsOfInterest) {
      const d = Math.hypot(pos.x - poi.position.x, pos.z - poi.position.z);
      if (d <= poi.radius) {
        return poi.name;
      }
    }
    return 'Gran Prado Verde';
  }

  // Semantic Vision Snapshot: Finds what is in front of the robot dog
  // Token cost: ~40 to 80 tokens max!
  getVisualSnapshot(otherRobots = []) {
    const robotPos = this.robot.group.position;
    const robotDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.robot.group.rotation.y);

    const visibleItems = [];

    // 1. Scan interactive toys (balls, bones, playground ramps)
    if (this.world && this.world.interactiveObjects) {
      this.world.interactiveObjects.forEach(item => {
        const itemPos = item.object.position;
        const toItem = new THREE.Vector3().subVectors(itemPos, robotPos);
        const dist = toItem.length();

        if (dist <= this.visionRange) {
          toItem.normalize();
          const dot = robotDir.dot(toItem);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));

          if (angle <= this.visionAngle / 2) {
            const relativeAngle = this.getRelativeDirection(robotDir, toItem);
            visibleItems.push({
              type: item.name,
              distance: `${dist.toFixed(1)}m`,
              direction: relativeAngle
            });
          }
        }
      });
    }

    // 2. Scan other chibi robot dogs
    if (Array.isArray(otherRobots)) {
      otherRobots.forEach(bot => {
        if (bot === this.robot) return;
        const botPos = bot.group.position;
        const toBot = new THREE.Vector3().subVectors(botPos, robotPos);
        const dist = toBot.length();

        if (dist <= this.visionRange) {
          toBot.normalize();
          const dot = robotDir.dot(toBot);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));

          if (angle <= this.visionAngle / 2) {
            const relativeAngle = this.getRelativeDirection(robotDir, toBot);
            visibleItems.push({
              type: `Amigo robot ${bot.name}`,
              emotion: bot.currentEmotion ? bot.currentEmotion.name : 'Feliz',
              action: bot.animController ? bot.animController.currentAnim : 'idle',
              distance: `${dist.toFixed(1)}m`,
              direction: relativeAngle
            });
          }
        }
      });
    }

    // 3. Scan main landmark points of interest
    if (this.world && this.world.pointsOfInterest) {
      this.world.pointsOfInterest.forEach(poi => {
        const toPoi = new THREE.Vector3().subVectors(poi.position, robotPos);
        const dist = toPoi.length();
        if (dist <= this.visionRange * 1.5) {
          toPoi.normalize();
          const dot = robotDir.dot(toPoi);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
          if (angle <= this.visionAngle / 2) {
            visibleItems.push({
              landmark: poi.name,
              distance: `${dist.toFixed(1)}m`,
              direction: this.getRelativeDirection(robotDir, toPoi)
            });
          }
        }
      });
    }

    // Sort closest first, keep top 4 to save tokens!
    visibleItems.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    return visibleItems.slice(0, 4);
  }

  getRelativeDirection(forward, toTarget) {
    const cross = new THREE.Vector3().crossVectors(forward, toTarget);
    if (Math.abs(forward.dot(toTarget)) > 0.85) {
      return forward.dot(toTarget) > 0 ? 'Al frente' : 'Atrás';
    }
    return cross.y > 0 ? 'A la izquierda' : 'A la derecha';
  }
}
