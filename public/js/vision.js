// Robot Camera, Vision System & Body Proprioception (World-Space Accurate & Specific POI Priority)
import * as THREE from 'three';

export class RobotVisionSystem {
  constructor(robot, scene, world) {
    this.robot = robot;
    this.scene = scene;
    this.world = world;

    // 1. Physical 3D Eye Camera
    this.eyeCamera = new THREE.PerspectiveCamera(75, 230 / 130, 0.08, 300);
    this.attachToRobot(this.robot);

    // Secondary PIP renderer for HUD
    this.pipCanvas = null;
    this.pipRenderer = null;

    // FOV cone configuration for semantic vision
    this.visionAngle = Math.PI * 0.58; // ~105 degrees cone of sight
    this.visionRange = 42;

    // Reusable vector cache to avoid GC pressure
    this._tempWorldPos = new THREE.Vector3();
    this._tempRobotDir = new THREE.Vector3();
    this._tempToItem = new THREE.Vector3();
    this._tempCross = new THREE.Vector3();
  }

  attachToRobot(newRobot) {
    if (!newRobot) return;
    this.robot = newRobot;
    if (this.robot.nodes && this.robot.nodes.head) {
      this.robot.nodes.head.add(this.eyeCamera);
      // Positioned slightly forward of snout & sunglasses so robot never clips its own camera
      this.eyeCamera.position.set(0, 0.58, 1.02);
      this.eyeCamera.rotation.set(0, Math.PI, 0);
    }
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
      this.eyeCamera.updateWorldMatrix(true, false);
      this.pipRenderer.render(this.scene, this.eyeCamera);
    } catch (e) { }
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

  // FIXED: Selects the most specific (smallest radius) matching Point of Interest
  // so sub-attractions inside the Playground (Trampoline, Carousel, Disco, Seesaw) are properly reported!
  getCurrentLocationName(pos) {
    if (!this.world || !this.world.pointsOfInterest) return 'Gran Prado Verde';
    let bestPoi = null;
    let smallestRadius = Infinity;

    for (const poi of this.world.pointsOfInterest) {
      const d = Math.hypot(pos.x - poi.position.x, pos.z - poi.position.z);
      if (d <= poi.radius && poi.radius < smallestRadius) {
        smallestRadius = poi.radius;
        bestPoi = poi;
      }
    }
    return bestPoi ? bestPoi.name : 'Gran Prado Verde';
  }

  // Semantic Vision Snapshot: Uses true World Positions and scans Toys, Snacks, Treasures, Robots & POIs
  getVisualSnapshot(otherRobots = []) {
    const robotPos = this.robot.group.position;
    this._tempRobotDir.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.robot.group.rotation.y);

    const visibleItems = [];

    // 1. Scan interactive toys (balls, bones) using true World Position
    if (this.world && this.world.interactiveObjects) {
      this.world.interactiveObjects.forEach(item => {
        if (!item.object) return;
        item.object.getWorldPosition(this._tempWorldPos);
        this._tempToItem.subVectors(this._tempWorldPos, robotPos);
        const dist = this._tempToItem.length();

        if (dist <= this.visionRange && dist > 0.4) {
          this._tempToItem.normalize();
          const dot = this._tempRobotDir.dot(this._tempToItem);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));

          if (angle <= this.visionAngle / 2) {
            visibleItems.push({
              type: item.name,
              distance: `${dist.toFixed(1)}m`,
              direction: this.getRelativeDirection(this._tempRobotDir, this._tempToItem)
            });
          }
        }
      });
    }

    // 2. Scan dropped Cyber Snacks
    if (this.world && this.world.snacks) {
      this.world.snacks.forEach(snack => {
        if (!snack.group) return;
        snack.group.getWorldPosition(this._tempWorldPos);
        this._tempToItem.subVectors(this._tempWorldPos, robotPos);
        const dist = this._tempToItem.length();

        if (dist <= this.visionRange) {
          this._tempToItem.normalize();
          const dot = this._tempRobotDir.dot(this._tempToItem);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
          if (angle <= this.visionAngle / 2) {
            visibleItems.push({
              type: 'Galleta Energética',
              distance: `${dist.toFixed(1)}m`,
              direction: this.getRelativeDirection(this._tempRobotDir, this._tempToItem)
            });
          }
        }
      });
    }

    // 3. Scan un-dug Treasure Spots
    if (this.world && this.world.treasureSpots) {
      this.world.treasureSpots.forEach(spot => {
        if (spot.dug) return;
        this._tempWorldPos.set(spot.x, robotPos.y, spot.z);
        this._tempToItem.subVectors(this._tempWorldPos, robotPos);
        const dist = this._tempToItem.length();

        if (dist <= this.visionRange * 0.8) {
          this._tempToItem.normalize();
          const dot = this._tempRobotDir.dot(this._tempToItem);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
          if (angle <= this.visionAngle / 2) {
            visibleItems.push({
              type: `Montículo de Tesoro (${spot.name})`,
              distance: `${dist.toFixed(1)}m`,
              direction: this.getRelativeDirection(this._tempRobotDir, this._tempToItem)
            });
          }
        }
      });
    }

    // 4. Scan other chibi robot dogs
    if (Array.isArray(otherRobots)) {
      otherRobots.forEach(bot => {
        if (bot === this.robot) return;
        const botPos = bot.group.position;
        this._tempToItem.subVectors(botPos, robotPos);
        const dist = this._tempToItem.length();

        if (dist <= this.visionRange) {
          this._tempToItem.normalize();
          const dot = this._tempRobotDir.dot(this._tempToItem);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));

          if (angle <= this.visionAngle / 2) {
            visibleItems.push({
              type: `Amigo robot ${bot.name}`,
              emotion: bot.currentEmotion ? bot.currentEmotion.name : 'Feliz',
              action: bot.animController ? bot.animController.currentAnim : 'idle',
              distance: `${dist.toFixed(1)}m`,
              direction: this.getRelativeDirection(this._tempRobotDir, this._tempToItem)
            });
          }
        }
      });
    }

    // 5. Scan main landmark points of interest
    if (this.world && this.world.pointsOfInterest) {
      this.world.pointsOfInterest.forEach(poi => {
        this._tempToItem.subVectors(poi.position, robotPos);
        const dist = this._tempToItem.length();
        if (dist <= this.visionRange * 1.5 && dist > 2.0) {
          this._tempToItem.normalize();
          const dot = this._tempRobotDir.dot(this._tempToItem);
          const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
          if (angle <= this.visionAngle / 2) {
            visibleItems.push({
              landmark: poi.name,
              distance: `${dist.toFixed(1)}m`,
              direction: this.getRelativeDirection(this._tempRobotDir, this._tempToItem)
            });
          }
        }
      });
    }

    visibleItems.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    return visibleItems.slice(0, 5);
  }

  getRelativeDirection(forward, toTarget) {
    this._tempCross.crossVectors(forward, toTarget);
    if (Math.abs(forward.dot(toTarget)) > 0.85) {
      return forward.dot(toTarget) > 0 ? 'Al frente' : 'Atrás';
    }
    return this._tempCross.y > 0 ? 'A la izquierda' : 'A la derecha';
  }
}