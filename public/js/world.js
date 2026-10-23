// Highly Detailed 3D Environment with Procedural Textures, Interactive Trampoline, Carousel, Soccer Goal, Disco Pad & Lake Boat
import * as THREE from 'three';
import { roboAudio } from './audio.js';

export class WorldManager {
  constructor(scene, onGoalCallback = null, onActivityCallback = null) {
    this.scene = scene;
    this.onGoal = onGoalCallback;
    this.onActivity = onActivityCallback;

    this.colliders = [];
    this.interactiveObjects = [];
    this.balls = [];
    this.snacks = [];
    this.pointsOfInterest = [];

    this.waterTime = 0;
    this.carouselAngle = 0;
    this.discoPartyActive = false;
    this.discoTimer = 0;
    this.goalScore = 0;
    this.targetScore = 0;
    this.onTargetHit = null;
    this.solidObstacles = [];

    // 3D Spatial Partitioning Grid for O(1) physics
    this.spatialGrid = new Map();
    this.gridCellSize = 20;

    // Mini-game attraction state
    this.ballPit = null;
    this.ballPitBalls = [];
    this.slide = null;
    this.obstacleCourse = null;
    this.targetBoard = null;
    this.pinata = null;
    this.clouds = [];
    this.ambientParticles = null;

    // Build procedural textures
    this.textures = {
      grass: this.generateGrassTexture(),
      soccer: this.generateSoccerTexture(),
      wood: this.generateWoodTexture(),
      tartan: this.generateTartanTexture(),
      water: this.generateWaterTexture(),
      cobblestone: this.generateCobblestoneTexture()
    };

    this.buildDetailedTerrain();
    this.buildCobblestonePaths();
    this.buildDetailedLake();
    this.buildWoodenBridge(new THREE.Vector3(-46, 0, -48), 0.65);
    this.buildDetailedPlayground();
    this.buildWaterFountain(new THREE.Vector3(12, 0, 10));
    this.buildCyberSeesaw(new THREE.Vector3(48, 0, 32));

    // New High-Tech Attractions
    this.buildCyberBallPit(new THREE.Vector3(-32, 0, 48));
    this.buildAgilitySlide(new THREE.Vector3(-18, 0, -32));
    this.buildAgilityObstacleCourse(new THREE.Vector3(22, 0, -50));
    this.buildCyberTargetToss(new THREE.Vector3(76, 0, 18));
    this.buildCyberPinata(new THREE.Vector3(-42, 0, 14));
    this.buildSlalomRings(new THREE.Vector3(-6, 0, -18));
    this.buildTreasureSpots();

    // Atmosphere & Environment Upgrades
    this.buildLowPolyClouds();
    this.buildAmbientParticles();

    this.buildDetailedNature();
    this.buildPointsOfInterest();
  }

  getGridKey(x, z) {
    const cx = Math.floor(x / this.gridCellSize);
    const cz = Math.floor(z / this.gridCellSize);
    return `${cx}_${cz}`;
  }

  registerObstacle(obs) {
    if (!obs) return;
    obs.shape = obs.shape || 'cylinder';
    if (obs.yMin === undefined) {
      obs.yMin = this.getHeightAt(obs.x || 0, obs.z || 0) - 1.5;
    }
    if (obs.yMax === undefined) {
      obs.yMax = obs.yMin + (obs.height || 4.0);
    }
    this.solidObstacles.push(obs);

    const cellKey = this.getGridKey(obs.x || 0, obs.z || 0);
    if (!this.spatialGrid.has(cellKey)) {
      this.spatialGrid.set(cellKey, []);
    }
    this.spatialGrid.get(cellKey).push(obs);
  }

  getNearObstacles(x, z) {
    const cx = Math.floor(x / this.gridCellSize);
    const cz = Math.floor(z / this.gridCellSize);
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx}_${cz + dz}`;
        const cell = this.spatialGrid.get(key);
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            result.push(cell[i]);
          }
        }
      }
    }
    return result.length > 0 ? result : this.solidObstacles;
  }

  logActivity(msg) {
    if (this.onActivity) this.onActivity(msg);
  }

  // --- PROCEDURAL TEXTURES GENERATORS ---
  generateGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base emerald gradient
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#388e3c');
    grad.addColorStop(0.5, '#43a047');
    grad.addColorStop(1, '#2e7d32');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle grass blade flecks
    ctx.fillStyle = 'rgba(102, 187, 106, 0.45)';
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const len = 3 + Math.random() * 8;
      ctx.fillRect(x, y, 1.5, len);
    }

    ctx.fillStyle = 'rgba(27, 94, 32, 0.4)';
    for (let i = 0; i < 2500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillRect(x, y, 2, 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    return tex;
  }

  generateSoccerTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = '#0f172a';
    // Draw classic black pentagons
    const pentagons = [
      [256, 256], [128, 128], [384, 128], [128, 384], [384, 384],
      [256, 60], [256, 452], [60, 256], [452, 256]
    ];

    pentagons.forEach(([cx, cy]) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * 44;
        const y = cy + Math.sin(a) * 44;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      // Stitch seams
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  generateWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#4e342e';
    ctx.lineWidth = 2;
    for (let y = 0; y < 256; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y + (Math.random() - 0.5) * 4);
      ctx.bezierCurveTo(80, y + (Math.random() - 0.5) * 8, 180, y + (Math.random() - 0.5) * 8, 256, y + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 6);
    return tex;
  }

  generateTartanTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#0f172a';
    for (let x = 0; x < 256; x += 32) {
      for (let y = 0; y < 256; y += 32) {
        if ((x + y) % 64 === 0) {
          ctx.fillRect(x, y, 32, 32);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    return tex;
  }

  generateWaterTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0284c7';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 256, Math.random() * 256, 15 + Math.random() * 35, 0, Math.PI * 2);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  generateCobblestoneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base dark mortar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);

    const stoneColors = ['#64748b', '#475569', '#57534e', '#78716c', '#6b7280', '#94a3b8', '#3f3f46'];
    const rows = 14;
    const cols = 14;
    const stepX = 512 / cols;
    const stepY = 512 / rows;

    for (let r = 0; r < rows; r++) {
      const offsetX = (r % 2) * (stepX * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * stepX + offsetX + (Math.random() - 0.5) * 4;
        const y = r * stepY + (Math.random() - 0.5) * 4;
        const w = stepX - 5 + (Math.random() - 0.5) * 3;
        const h = stepY - 5 + (Math.random() - 0.5) * 3;

        ctx.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6);
        else ctx.rect(x, y, w, h);
        ctx.fill();

        // 3D Bevel: top highlight & bottom shadow
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(x + 2, y + 2, w - 4, 3);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
        ctx.fillRect(x + 2, y + h - 5, w - 4, 3);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    return tex;
  }

  // --- ENVIRONMENT BUILDING ---
  buildDetailedTerrain() {
    const terrainGeo = new THREE.PlaneGeometry(600, 600, 140, 140);
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const distToLake = Math.hypot(x - (-80), z - (-80));
      let y = 0;

      if (distToLake < 65) {
        const lakeFactor = Math.cos((distToLake / 65) * (Math.PI / 2));
        y = -4.5 * lakeFactor;
      } else {
        y = Math.sin(x * 0.02) * 2.2 + Math.cos(z * 0.025) * 1.8 + Math.sin((x + z) * 0.015) * 1.5;
        const distToPlayground = Math.hypot(x - 50, z - 40);
        if (distToPlayground < 55) {
          const blend = distToPlayground / 55;
          y *= blend * blend;
        }
      }
      pos.setY(i, y);
    }
    terrainGeo.computeVertexNormals();

    const grassMat = new THREE.MeshStandardMaterial({
      map: this.textures.grass,
      roughness: 0.75,
      metalness: 0.05
    });

    const terrain = new THREE.Mesh(terrainGeo, grassMat);
    terrain.receiveShadow = true;
    this.scene.add(terrain);
    this.terrainMesh = terrain;

    // Distant mountain ring
    const mtnGeo = new THREE.CylinderGeometry(340, 360, 48, 32, 1, true);
    const mtnMat = new THREE.MeshStandardMaterial({
      color: 0x1b5e20,
      roughness: 0.9,
      side: THREE.BackSide
    });
    const mountains = new THREE.Mesh(mtnGeo, mtnMat);
    mountains.position.y = 18;
    this.scene.add(mountains);
  }

  buildCobblestonePaths() {
    // 1. Central Plaza circular stone terrace at (0, 0)
    const plazaGeo = new THREE.CylinderGeometry(18, 18.2, 0.14, 32);
    const plazaMat = new THREE.MeshStandardMaterial({
      map: this.textures.cobblestone,
      roughness: 0.72,
      metalness: 0.08
    });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.set(0, this.getHeightAt(0, 0) + 0.07, 0);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Decorative Plaza Border Ring
    const borderMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
    const border = new THREE.Mesh(new THREE.TorusGeometry(18.2, 0.25, 12, 32), borderMat);
    border.rotation.x = Math.PI / 2;
    border.position.set(0, this.getHeightAt(0, 0) + 0.12, 0);
    this.scene.add(border);

    // Glowing Neon Center Compass Rose
    const starMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.85 });
    const star = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.18, 8), starMat);
    star.position.set(0, this.getHeightAt(0, 0) + 0.1, 0);
    this.scene.add(star);

    // 2. Cobblestone Path Network Ribbons:
    // Path A: Plaza (0, 0) -> Playground Entrance (30, 26)
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(30, 0, 26), 4.2);
    // Path B: Plaza (0, 0) -> Lake Pier Entrance (-36, -68)
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-36, 0, -68), 4.0);
    // Path C: Plaza (0, 0) -> Cyber Doghouse Station (56, 44)
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(56, 0, 44), 3.8);
    // Path D: Plaza (0, 0) -> Wooden Bridge (-44, -46)
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-44, 0, -46), 3.6);
    // Path E: Plaza (0, 0) -> Cyber Water Fountain (12, 10)
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(12, 0, 10), 3.8);
  }

  createPathRibbon(start, end, width = 3.8, segments = 28) {
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    const dir = new THREE.Vector3().subVectors(end, start);
    dir.y = 0;
    const len = dir.length();
    if (len < 0.1) return;
    dir.normalize();
    const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width * 0.5);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const center = new THREE.Vector3().lerpVectors(start, end, t);
      // Subtle natural curve
      const curveDev = Math.sin(t * Math.PI) * 1.8;
      center.x += -dir.z * curveDev;
      center.z += dir.x * curveDev;

      const pL = new THREE.Vector3().addVectors(center, normal);
      const pR = new THREE.Vector3().subVectors(center, normal);

      pL.y = this.getHeightAt(pL.x, pL.z) + 0.08;
      pR.y = this.getHeightAt(pR.x, pR.z) + 0.08;

      positions.push(pL.x, pL.y, pL.z);
      positions.push(pR.x, pR.y, pR.z);

      const vCoord = t * (len / 3.0);
      uvs.push(0, vCoord);
      uvs.push(1, vCoord);

      if (i < segments) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: this.textures.cobblestone,
      roughness: 0.75,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  buildWoodenBridge(pos, rotY = 0, span = 18, width = 4.2) {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.copy(pos);
    bridgeGroup.position.y = this.getHeightAt(pos.x, pos.z);
    bridgeGroup.rotation.y = rotY;

    const archSegments = 16;
    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, roughness: 0.75 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 });
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffea00, emissiveIntensity: 1.2 });

    // Wooden planks forming the arched bridge deck
    for (let i = 0; i < archSegments; i++) {
      const t = i / (archSegments - 1);
      const z = (t - 0.5) * span;
      const archHeight = Math.sin(t * Math.PI) * 2.8;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.22, span / archSegments * 0.92), woodMat);
      plank.position.set(0, archHeight + 0.1, z);
      plank.rotation.x = Math.cos(t * Math.PI) * 0.28;
      plank.castShadow = true;
      plank.receiveShadow = true;
      bridgeGroup.add(plank);

      // Side railings posts
      if (i % 2 === 0) {
        [-width * 0.5 + 0.15, width * 0.5 - 0.15].forEach(x => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8), railMat);
          post.position.set(x, archHeight + 0.7, z);
          post.castShadow = true;
          bridgeGroup.add(post);
        });
      }
    }

    // Handrail top beams
    [-width * 0.5 + 0.15, width * 0.5 - 0.15].forEach(x => {
      const railGeo = new THREE.BoxGeometry(0.18, 0.15, span);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(x, 2.1, 0);
      rail.castShadow = true;
      bridgeGroup.add(rail);

      // Glowing corner lanterns
      [-span * 0.48, span * 0.48].forEach(z => {
        const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.35), lanternMat);
        lantern.position.set(x, 1.8, z);
        bridgeGroup.add(lantern);

        // Register bridge entrance pillars as solid obstacles
        const worldP = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos);
        this.registerObstacle({ type: 'bridge_post', x: worldP.x, z: worldP.z, radius: 0.55, height: 2.5 });
      });
    });

    this.scene.add(bridgeGroup);
    this.woodenBridge = { position: pos, span, width };
  }

  buildWaterFountain(pos) {
    const fGroup = new THREE.Group();
    fGroup.position.copy(pos);
    fGroup.position.y = this.getHeightAt(pos.x, pos.z);

    // Chrome outer bowl
    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.2
    });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.3, 0.55, 32), bowlMat);
    bowl.position.y = 0.28;
    bowl.castShadow = true;
    fGroup.add(bowl);

    // Cyan LED glow rim
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.95
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.1, 16, 32), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.56;
    fGroup.add(rim);

    // Swirling water surface inside bowl
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x00b0ff,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      roughness: 0.05,
      metalness: 0.9,
      transparent: true,
      opacity: 0.88
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.5;
    fGroup.add(water);
    this.fountainWater = water;

    // Center fountain nozzle & bubbling jet
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff });
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.45, 16), nozzleMat);
    nozzle.position.y = 0.65;
    fGroup.add(nozzle);

    // Center water jet spray
    const jetGeo = new THREE.ConeGeometry(0.4, 1.2, 16);
    const jetMat = new THREE.MeshStandardMaterial({
      color: 0xe0f7fa,
      emissive: 0x80deea,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.75
    });
    const jet = new THREE.Mesh(jetGeo, jetMat);
    jet.position.y = 1.3;
    fGroup.add(jet);
    this.fountainJet = jet;

    // Holographic Bone Sign
    const signMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.0 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.1), signMat);
    sign.position.set(0, 0.9, 1.55);
    fGroup.add(sign);

    this.scene.add(fGroup);
    this.waterFountain = { position: pos, radius: 1.6 };

    // Register into solid obstacles
    this.registerObstacle({ type: 'water_fountain', x: pos.x, z: pos.z, radius: 1.65, height: 2.0 });
  }

  buildCyberSeesaw(pos) {
    const seeGroup = new THREE.Group();
    seeGroup.position.copy(pos);
    seeGroup.position.y = this.getHeightAt(pos.x, pos.z);

    // Triangular pivot base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.3 });
    const fulcrum = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.6, 4), baseMat);
    fulcrum.rotation.y = Math.PI / 4;
    fulcrum.position.y = 0.8;
    fulcrum.castShadow = true;
    seeGroup.add(fulcrum);

    // Pivot axle
    const axleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 });
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 16), axleMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.y = 1.55;
    seeGroup.add(axle);

    // Tilting Plank
    const plankPivot = new THREE.Group();
    plankPivot.position.y = 1.55;
    seeGroup.add(plankPivot);

    const plankMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.3
    });
    const plank = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.18, 1.4), plankMat);
    plank.castShadow = true;
    plank.receiveShadow = true;
    plankPivot.add(plank);

    // Neon handle grips on both ends
    [-4.5, 4.5].forEach((hx, idx) => {
      const handleColor = idx === 0 ? 0x00e5ff : 0xff4081;
      const hMat = new THREE.MeshStandardMaterial({ color: handleColor, emissive: handleColor, emissiveIntensity: 0.85 });
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 12, 24), hMat);
      handle.position.set(hx, 0.45, 0);
      plankPivot.add(handle);

      const seatPad = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.2), hMat);
      seatPad.position.set(hx, 0.12, 0);
      plankPivot.add(seatPad);
    });

    this.scene.add(seeGroup);
    this.seesaw = {
      group: seeGroup,
      pivot: plankPivot,
      position: pos,
      currentTilt: 0,
      targetTilt: 0
    };

    // Register fulcrum base into solid obstacles
    this.registerObstacle({ type: 'seesaw_fulcrum', x: pos.x, z: pos.z, radius: 1.0, height: 1.8 });
  }

  buildDetailedLake() {
    const lakeRadius = 60;
    const waterGeo = new THREE.CircleGeometry(lakeRadius, 64);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      map: this.textures.water,
      color: 0x0284c7,
      roughness: 0.08,
      metalness: 0.85,
      transparent: true,
      opacity: 0.86
    });

    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(-80, -0.15, -80);
    this.scene.add(water);
    this.waterMesh = water;

    // Shore rim with river stones
    const rimGeo = new THREE.RingGeometry(lakeRadius - 1.5, lakeRadius + 7, 64);
    rimGeo.rotateX(-Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.85 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(-80, 0.06, -80);
    this.scene.add(rim);

    // River rocks
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 });
    for (let i = 0; i < 35; i++) {
      const angle = (i / 35) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
      const rad = lakeRadius + (Math.random() - 0.5) * 5;
      const rx = -80 + Math.cos(angle) * rad;
      const rz = -80 + Math.sin(angle) * rad;
      const rockGeo = new THREE.DodecahedronGeometry(0.7 + Math.random() * 0.8, 1);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(rx, this.getHeightAt(rx, rz) + 0.3, rz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      this.scene.add(rock);
      this.registerObstacle({ type: 'rock', x: rx, z: rz, radius: 1.35, height: 1.8 });
    }

    // Wooden Pier with Posts and Glowing Lanterns
    const pierGroup = new THREE.Group();
    pierGroup.position.set(-80 + 36, 0.25, -80);
    pierGroup.rotation.y = 0.28;

    const deckGeo = new THREE.BoxGeometry(6, 0.35, 24);
    const deckMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, roughness: 0.7 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.castShadow = true;
    deck.receiveShadow = true;
    pierGroup.add(deck);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 });
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffeb3b, emissiveIntensity: 1.0 });

    [-2.8, 2.8].forEach(x => {
      [-10, 0, 10].forEach(z => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.8, 8), postMat);
        post.position.set(x, 0.6, z);
        post.castShadow = true;
        pierGroup.add(post);

        const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), lanternMat);
        lantern.position.set(x, 2.1, z);
        pierGroup.add(lantern);
      });
    });

    this.scene.add(pierGroup);

    // Floating Toy Motorboat on the Lake
    this.buildToyBoat(new THREE.Vector3(-80, 0, -65));
  }

  buildToyBoat(pos) {
    const boatGroup = new THREE.Group();
    boatGroup.position.copy(pos);

    const hullMat = new THREE.MeshStandardMaterial({ color: 0xff1744, roughness: 0.3 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 4.2), hullMat);
    hull.position.y = 0.2;
    boatGroup.add(hull);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 2.2), cabinMat);
    cabin.position.set(0, 0.9, -0.4);
    boatGroup.add(cabin);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.8 })
    );
    antenna.position.set(0, 1.8, -0.4);
    boatGroup.add(antenna);

    this.scene.add(boatGroup);
    this.toyBoat = boatGroup;
  }

  buildDetailedPlayground() {
    const playCenter = new THREE.Vector3(50, 0, 40);

    // Checkered Tartan Play Floor
    const floorGeo = new THREE.CylinderGeometry(42, 42, 0.12, 40);
    const floorMat = new THREE.MeshStandardMaterial({ map: this.textures.tartan, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.copy(playCenter);
    floor.position.y = 0.06;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Cyber Doghouse
    this.buildCyberDoghouse(new THREE.Vector3(72, 0, 52));

    // 1. TRAMPOLÍN ELÁSTICO DE SALTO ALTO (Interactive Trampoline)
    this.buildTrampoline(new THREE.Vector3(38, 0, 22));

    // 2. CARRUSEL GIRATORIO (Interactive Carousel)
    this.buildCarousel(new THREE.Vector3(62, 0, 26));

    // 3. PORTERÍA DE FÚTBOL CON DETECTOR DE GOLES (Soccer Goal)
    this.buildSoccerGoal(new THREE.Vector3(25, 0, 40));

    // 4. PLATAFORMA DE BAILE DISCO (Interactive Dance Pad)
    this.buildDiscoPad(new THREE.Vector3(52, 0, 56));

    // Agility Ramp with Grip Strips
    const rampGroup = new THREE.Group();
    rampGroup.position.set(45, 1.4, 45);
    rampGroup.rotation.x = 0.24;

    const ramp = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.35, 14), new THREE.MeshStandardMaterial({ color: 0xff9800, roughness: 0.45 }));
    ramp.castShadow = true;
    rampGroup.add(ramp);

    for (let s = -6; s <= 6; s += 1.8) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 0.25), new THREE.MeshStandardMaterial({ color: 0x212121 }));
      strip.position.set(0, 0.2, s);
      rampGroup.add(strip);
    }
    this.scene.add(rampGroup);

    // Pulsing Agility Hoops
    this.agilityHoops = [];
    const ringColors = [0x00e5ff, 0xff4081, 0x76ff03];
    [-10, 0, 10].forEach((offset, idx) => {
      const hoopGroup = new THREE.Group();
      hoopGroup.position.set(36, 2.6, 26 + offset);

      const color = ringColors[idx % ringColors.length];
      const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.95 });
      const hoopMesh = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.16, 16, 32), ringMat);
      hoopMesh.rotation.y = 0.3;
      hoopGroup.add(hoopMesh);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10), new THREE.MeshStandardMaterial({ color: 0x37474f }));
      pole.position.set(0, -1.3, 0);
      hoopGroup.add(pole);

      this.scene.add(hoopGroup);
      this.agilityHoops.push({ mesh: hoopMesh, baseColor: color });
    });

    // Crawl Agility Tunnel
    const tunnel = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 12, 24, 1, true, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x7c4dff, roughness: 0.45, side: THREE.DoubleSide })
    );
    tunnel.position.set(56, 0, 24);
    tunnel.rotation.z = Math.PI / 2;
    tunnel.rotation.y = -0.55;
    tunnel.castShadow = true;
    this.scene.add(tunnel);

    // Balls with Real Physics
    this.soccerBall = this.spawnSoccerBall(new THREE.Vector3(42, 1.2, 38), 1.2);
    this.spawnBall(new THREE.Vector3(52, 1.0, 42), 0.95, 0xffeb3b, 'neon');
    this.spawnBall(new THREE.Vector3(58, 0.8, 38), 0.75, 0xff4081, 'bouncy');
    this.spawnBall(new THREE.Vector3(40, 0.8, 48), 0.75, 0x00e5ff, 'bouncy');

    // Holographic Energy Bones
    this.spawnBoneToy(new THREE.Vector3(48, 0.45, 46));
    this.spawnBoneToy(new THREE.Vector3(63, 0.45, 34));
    this.spawnBoneToy(new THREE.Vector3(34, 0.45, 38));
  }

  buildTrampoline(pos) {
    const trampGroup = new THREE.Group();
    trampGroup.position.copy(pos);

    // Frame ring
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, roughness: 0.3 });
    const frame = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.22, 16, 32), frameMat);
    frame.rotation.x = Math.PI / 2;
    frame.position.y = 1.0;
    trampGroup.add(frame);

    // Bouncy canvas mat
    const matGeo = new THREE.CylinderGeometry(3.4, 3.4, 0.1, 32);
    const canvasMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.6,
      roughness: 0.4
    });
    const bouncer = new THREE.Mesh(matGeo, canvasMat);
    bouncer.position.y = 0.95;
    trampGroup.add(bouncer);

    // 6 Support legs
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 8), frameMat);
      leg.position.set(Math.cos(a) * 3.4, 0.5, Math.sin(a) * 3.4);
      trampGroup.add(leg);
    }

    this.scene.add(trampGroup);
    this.trampoline = { group: trampGroup, position: pos, radius: 3.5 };
  }

  buildCarousel(pos) {
    const carGroup = new THREE.Group();
    carGroup.position.copy(pos);

    // Fixed base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 32), baseMat);
    base.position.y = 0.12;
    carGroup.add(base);

    // Rotating platform
    const rotorGroup = new THREE.Group();
    rotorGroup.position.y = 0.35;
    carGroup.add(rotorGroup);

    const platformMat = new THREE.MeshStandardMaterial({
      color: 0xff4081,
      roughness: 0.35
    });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.15, 32), platformMat);
    rotorGroup.add(platform);

    // Center pole with cyber cone
    const centerPole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.8, 12), new THREE.MeshStandardMaterial({ color: 0xffeb3b }));
    centerPole.position.y = 1.4;
    rotorGroup.add(centerPole);

    // 4 Grab handles around carousel
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.7 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 12, 24), handleMat);
      bar.position.set(Math.cos(a) * 2.4, 1.1, Math.sin(a) * 2.4);
      rotorGroup.add(bar);
    }

    this.scene.add(carGroup);
    this.carousel = { rotor: rotorGroup, position: pos, radius: 4.0 };
    this.registerObstacle({ type: 'carousel_mast', x: pos.x, z: pos.z, radius: 0.65, height: 3.2 });
  }

  buildSoccerGoal(pos) {
    const goalGroup = new THREE.Group();
    goalGroup.position.copy(pos);
    goalGroup.rotation.y = Math.PI / 2;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const netMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, wireframe: true });

    // Crossbar and posts
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 12), frameMat);
    postL.position.set(-3.5, 1.7, 0);
    const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 12), frameMat);
    postR.position.set(3.5, 1.7, 0);

    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.2, 12), frameMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, 3.4, 0);

    // Net box
    const netGeo = new THREE.BoxGeometry(7.0, 3.2, 3.0);
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, 1.6, -1.5);

    goalGroup.add(postL, postR, crossbar, net);
    this.scene.add(goalGroup);

    this.soccerGoal = {
      position: pos,
      width: 7.0,
      depth: 3.0
    };

    // Solid obstacle boundaries for posts and back net
    this.registerObstacle({ type: 'goal_post', x: pos.x, z: pos.z - 3.5, radius: 0.35, height: 3.5 });
    this.registerObstacle({ type: 'goal_post', x: pos.x, z: pos.z + 3.5, radius: 0.35, height: 3.5 });
    this.registerObstacle({ type: 'goal_net', x: pos.x - 1.5, z: pos.z, radius: 1.8, height: 3.2 });
  }

  buildDiscoPad(pos) {
    const padGroup = new THREE.Group();
    padGroup.position.copy(pos);

    // 16 Illuminated Disco Floor Tiles
    this.discoTiles = [];
    const tileColors = [0xff1744, 0x00e5ff, 0x76ff03, 0xffea00, 0xd500f9, 0xff9100];

    for (let x = -2; x <= 1; x++) {
      for (let z = -2; z <= 1; z++) {
        const mat = new THREE.MeshStandardMaterial({
          color: tileColors[Math.floor(Math.random() * tileColors.length)],
          emissive: 0x000000,
          emissiveIntensity: 0.5,
          roughness: 0.2
        });
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4), mat);
        tile.position.set(x * 1.5 + 0.75, 0.08, z * 1.5 + 0.75);
        padGroup.add(tile);
        this.discoTiles.push(tile);
      }
    }

    // Overhead Hanging Disco Mirror Ball
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.1 });
    const discoBall = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 16), ballMat);
    discoBall.position.set(0, 4.2, 0);
    padGroup.add(discoBall);
    this.discoBall = discoBall;

    this.scene.add(padGroup);
    this.discoPad = { position: pos, radius: 3.5 };
  }

  buildCyberDoghouse(pos) {
    const houseGroup = new THREE.Group();
    houseGroup.position.copy(pos);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.4 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.6 });

    const booth = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.8, 6.4), wallMat);
    booth.position.y = 2.4;
    booth.castShadow = true;
    houseGroup.add(booth);

    const door = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.4, 0.8), new THREE.MeshBasicMaterial({ color: 0x090d16 }));
    door.position.set(0, 1.7, 2.9);
    houseGroup.add(door);

    const padMat = new THREE.MeshStandardMaterial({ color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 0.9 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.16, 24), padMat);
    pad.position.set(0, 0.12, 0.9);
    houseGroup.add(pad);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.6, 4), roofMat);
    roof.rotateY(Math.PI / 4);
    roof.position.y = 5.8;
    houseGroup.add(roof);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.85, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.8 })
    );
    sign.position.set(0, 4.4, 3.3);
    houseGroup.add(sign);

    this.scene.add(houseGroup);
    // Left, Right and Back Wall Colliders (Allows front door entrance for recharge!)
    this.registerObstacle({ type: 'doghouse_wall_back', shape: 'box', x: pos.x, z: pos.z - 3.0, halfW: 3.2, halfD: 0.4, height: 4.8 });
    this.registerObstacle({ type: 'doghouse_wall_left', shape: 'box', x: pos.x - 3.0, z: pos.z, halfW: 0.4, halfD: 3.2, height: 4.8 });
    this.registerObstacle({ type: 'doghouse_wall_right', shape: 'box', x: pos.x + 3.0, z: pos.z, halfW: 0.4, halfD: 3.2, height: 4.8 });
  }

  // --- NEW HIGH-TECH ATTRACTIONS ---
  buildCyberBallPit(pos) {
    const pitGroup = new THREE.Group();
    pitGroup.position.copy(pos);
    const groundY = this.getHeightAt(pos.x, pos.z);
    pitGroup.position.y = groundY;

    const padMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.5,
      metalness: 0.2
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.6,
      roughness: 0.2
    });

    // Padded bottom mattress
    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.2, 7.2), padMat);
    floor.position.y = 0.1;
    pitGroup.add(floor);

    // 4 Padded Rim Walls
    const wallGeoX = new THREE.BoxGeometry(7.2, 0.7, 0.35);
    const wallGeoZ = new THREE.BoxGeometry(0.35, 0.7, 7.2);

    const wallN = new THREE.Mesh(wallGeoX, rimMat); wallN.position.set(0, 0.35, -3.5);
    const wallS = new THREE.Mesh(wallGeoX, rimMat); wallS.position.set(0, 0.35, 3.5);
    const wallW = new THREE.Mesh(wallGeoZ, rimMat); wallW.position.set(-3.5, 0.35, 0);
    const wallE = new THREE.Mesh(wallGeoZ, rimMat); wallE.position.set(3.5, 0.35, 0);
    pitGroup.add(wallN, wallS, wallW, wallE);

    // Fill with 45 colorful bouncy mini-balls!
    const ballColors = [0x00e5ff, 0xff3399, 0xffea00, 0x22ff88, 0xa855f7, 0xff9100];
    const miniBallGeo = new THREE.SphereGeometry(0.24, 12, 12);

    for (let i = 0; i < 45; i++) {
      const col = ballColors[i % ballColors.length];
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.35,
        roughness: 0.3
      });
      const bMesh = new THREE.Mesh(miniBallGeo, mat);
      const rx = (Math.random() - 0.5) * 6.0;
      const rz = (Math.random() - 0.5) * 6.0;
      const ry = 0.25 + Math.random() * 0.35;
      bMesh.position.set(rx, ry, rz);
      pitGroup.add(bMesh);

      this.ballPitBalls.push({
        mesh: bMesh,
        localOrigin: new THREE.Vector3(rx, ry, rz),
        velocity: new THREE.Vector3(),
        springVel: 0
      });
    }

    this.scene.add(pitGroup);
    this.ballPit = { position: pos, radius: 3.6 };

    // Register outer rim colliders
    this.registerObstacle({ type: 'ballpit_wall_n', shape: 'box', x: pos.x, z: pos.z - 3.5, halfW: 3.6, halfD: 0.25, height: 0.8 });
    this.registerObstacle({ type: 'ballpit_wall_s', shape: 'box', x: pos.x, z: pos.z + 3.5, halfW: 3.6, halfD: 0.25, height: 0.8 });
    this.registerObstacle({ type: 'ballpit_wall_w', shape: 'box', x: pos.x - 3.5, z: pos.z, halfW: 0.25, halfD: 3.6, height: 0.8 });
    this.registerObstacle({ type: 'ballpit_wall_e', shape: 'box', x: pos.x + 3.5, z: pos.z, halfW: 0.25, halfD: 3.6, height: 0.8 });
  }

  buildAgilitySlide(pos) {
    const slideGroup = new THREE.Group();
    slideGroup.position.copy(pos);
    const groundY = this.getHeightAt(pos.x, pos.z);
    slideGroup.position.y = groundY;

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.2 });
    const neonCyan = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.7 });
    const chuteMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.15, metalness: 0.4 });

    // 4 Support Pillars
    const platformH = 4.0;
    [-1.2, 1.2].forEach(px => {
      [-1.2, 1.2].forEach(pz => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, platformH, 12), metalMat);
        pillar.position.set(px, platformH / 2, pz);
        slideGroup.add(pillar);
      });
    });

    // Top Platform
    const topFloor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 2.6), metalMat);
    topFloor.position.set(0, platformH, 0);
    slideGroup.add(topFloor);

    // Ladder steps on back side
    for (let s = 0.5; s < platformH; s += 0.55) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), neonCyan);
      step.rotation.z = Math.PI / 2;
      step.position.set(0, s, -1.2);
      slideGroup.add(step);
    }

    // Curved Chute Ramp (from [0, 4.0, 1.2] down to [0, 0.15, 8.5])
    const chuteLength = 7.5;
    const chuteGeo = new THREE.BoxGeometry(1.6, 0.16, chuteLength);
    chuteGeo.rotateX(-0.5);
    const chute = new THREE.Mesh(chuteGeo, chuteMat);
    chute.position.set(0, platformH * 0.48, 4.6);
    slideGroup.add(chute);

    // Glowing rails on chute sides
    [-0.85, 0.85].forEach(rx => {
      const railGeo = new THREE.CylinderGeometry(0.045, 0.045, chuteLength, 12);
      railGeo.rotateX(-0.5);
      const rail = new THREE.Mesh(railGeo, neonCyan);
      rail.position.set(rx, platformH * 0.48 + 0.18, 4.6);
      slideGroup.add(rail);
    });

    // Landing Foam Cushion at end
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.22, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xffea00, roughness: 0.6 })
    );
    cushion.position.set(0, 0.11, 8.2);
    slideGroup.add(cushion);

    this.scene.add(slideGroup);

    this.slide = {
      position: pos,
      topPos: new THREE.Vector3(pos.x, groundY + platformH, pos.z),
      endPos: new THREE.Vector3(pos.x, groundY, pos.z + 8.5),
      platformH
    };

    this.registerObstacle({ type: 'slide_tower', x: pos.x, z: pos.z, radius: 1.5, height: platformH });
  }

  buildAgilityObstacleCourse(pos) {
    const courseGroup = new THREE.Group();
    courseGroup.position.copy(pos);
    const groundY = this.getHeightAt(pos.x, pos.z);
    courseGroup.position.y = groundY;

    const neonYellow = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffea00, emissiveIntensity: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 });

    // 1. Agility Tunnel (Ribbed glowing cylinder open at both ends)
    const tunnelGroup = new THREE.Group();
    tunnelGroup.position.set(0, 0.95, 0);

    const ribGeo = new THREE.TorusGeometry(1.05, 0.06, 12, 24);
    for (let tz = -3.0; tz <= 3.0; tz += 1.0) {
      const rib = new THREE.Mesh(ribGeo, neonYellow);
      rib.position.set(0, 0, tz);
      tunnelGroup.add(rib);
    }

    const tubeGeo = new THREE.CylinderGeometry(1.02, 1.02, 6.2, 24, 1, true);
    tubeGeo.rotateX(Math.PI / 2);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tunnelGroup.add(tube);
    courseGroup.add(tunnelGroup);

    // 2. Three Jump Hurdles (spaced at Z = 6, 10, 14)
    this.hurdles = [];
    [6.0, 10.0, 14.0].forEach((hz) => {
      const hurdleGroup = new THREE.Group();
      hurdleGroup.position.set(0, 0, hz);

      [-1.2, 1.2].forEach(hx => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), metalMat);
        post.position.set(hx, 0.55, 0);
        hurdleGroup.add(post);
      });

      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.4, 12), neonYellow);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0.65, 0);
      hurdleGroup.add(bar);
      courseGroup.add(hurdleGroup);

      this.hurdles.push({
        position: new THREE.Vector3(pos.x, groundY, pos.z + hz),
        cleared: false
      });
    });

    this.scene.add(courseGroup);
    this.obstacleCourse = {
      position: pos,
      tunnel: {
        start: new THREE.Vector3(pos.x, groundY, pos.z - 3.2),
        end: new THREE.Vector3(pos.x, groundY, pos.z + 3.2),
        radius: 1.1
      }
    };
  }

  buildCyberTargetToss(pos) {
    const targetGroup = new THREE.Group();
    targetGroup.position.copy(pos);
    const groundY = this.getHeightAt(pos.x, pos.z);
    targetGroup.position.y = groundY;

    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.15 });

    // Stand Legs
    [-1.8, 1.8].forEach(sx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.6, 12), chromeMat);
      leg.position.set(sx, 2.3, 0);
      targetGroup.add(leg);
    });

    const targetRotor = new THREE.Group();
    targetRotor.position.set(0, 3.2, 0);

    // Target Rings
    const ringConfigs = [
      { r: 2.2, col: 0x00e5ff, pts: 10 },
      { r: 1.4, col: 0xffea00, pts: 25 },
      { r: 0.7, col: 0xff1744, pts: 50 } // Bullseye
    ];

    ringConfigs.forEach(rc => {
      const ringMat = new THREE.MeshStandardMaterial({
        color: rc.col,
        emissive: rc.col,
        emissiveIntensity: 0.75,
        roughness: 0.2
      });
      const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(rc.r, rc.r, 0.12, 32), ringMat);
      ringMesh.rotateX(Math.PI / 2);
      targetRotor.add(ringMesh);
    });

    targetGroup.add(targetRotor);

    // Overhead Digital Score Billboard
    const boardMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.75, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.3 })
    );
    boardMesh.position.set(0, 5.8, 0);
    targetGroup.add(boardMesh);

    this.scene.add(targetGroup);

    this.targetBoard = {
      position: new THREE.Vector3(pos.x, groundY + 3.2, pos.z),
      rotor: targetRotor,
      radius: 2.2
    };

    this.registerObstacle({ type: 'target_post_l', x: pos.x - 1.8, z: pos.z, radius: 0.25, height: 4.8 });
    this.registerObstacle({ type: 'target_post_r', x: pos.x + 1.8, z: pos.z, radius: 0.25, height: 4.8 });
  }

  buildCyberPinata(pos) {
    const pinGroup = new THREE.Group();
    pinGroup.position.copy(pos);
    const groundY = this.getHeightAt(pos.x, pos.z);
    pinGroup.position.y = groundY;

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });

    // Hanging Arch
    const archTop = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 12), metalMat);
    archTop.rotation.z = Math.PI / 2;
    archTop.position.set(0, 4.2, 0);

    [-1.7, 1.7].forEach(ax => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 12), metalMat);
      post.position.set(ax, 2.1, 0);
      pinGroup.add(post);
    });
    pinGroup.add(archTop);

    // Hanging Rope & Bone-shaped Piñata
    const pinataPivot = new THREE.Group();
    pinataPivot.position.set(0, 4.2, 0);

    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 8), metalMat);
    rope.position.set(0, -0.9, 0);
    pinataPivot.add(rope);

    const pinataBody = new THREE.Group();
    pinataBody.position.set(0, -1.8, 0);

    const pinataMat = new THREE.MeshStandardMaterial({
      color: 0xff3399,
      emissive: 0xff3399,
      emissiveIntensity: 0.85,
      roughness: 0.25
    });

    // Bone shape
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 12), pinataMat);
    shaft.rotation.z = Math.PI / 2;
    pinataBody.add(shaft);

    [-0.55, 0.55].forEach(bx => {
      [-0.18, 0.18].forEach(by => {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), pinataMat);
        knob.position.set(bx, by, 0);
        pinataBody.add(knob);
      });
    });

    pinataPivot.add(pinataBody);
    pinGroup.add(pinataPivot);

    this.scene.add(pinGroup);
    this.pinata = {
      position: new THREE.Vector3(pos.x, groundY + 2.4, pos.z),
      pivot: pinataPivot,
      hits: 0,
      maxHits: 4,
      swingAngle: 0,
      swingVel: 0
    };

    this.registerObstacle({ type: 'pinata_post_l', x: pos.x - 1.7, z: pos.z, radius: 0.25, height: 4.2 });
    this.registerObstacle({ type: 'pinata_post_r', x: pos.x + 1.7, z: pos.z, radius: 0.25, height: 4.2 });
  }

  buildSlalomRings(pos = new THREE.Vector3(-6, 0, -18)) {
    this.slalomRings = [];
    const ringGroup = new THREE.Group();
    ringGroup.position.copy(pos);

    const offsets = [
      { x: -8, z: -10, col: 0x00e5ff, rotY: 0.2 },
      { x: -3, z: -4,  col: 0xffea00, rotY: -0.15 },
      { x: 3,  z: 3,   col: 0xff007f, rotY: 0.3 },
      { x: -2, z: 10,  col: 0x22ff88, rotY: -0.2 },
      { x: 6,  z: 16,  col: 0xff9100, rotY: 0.25 }
    ];

    offsets.forEach((cfg, idx) => {
      const arch = new THREE.Group();
      const groundY = this.getHeightAt(pos.x + cfg.x, pos.z + cfg.z);
      arch.position.set(cfg.x, groundY, cfg.z);
      arch.rotation.y = cfg.rotY;

      // Base chrome support posts
      const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.2 });
      [-1.3, 1.3].forEach(px => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 12), postMat);
        p.position.set(px, 0.9, 0);
        p.castShadow = true;
        arch.add(p);
      });

      // Vibrant Neon Torus Ring
      const ringMat = new THREE.MeshStandardMaterial({
        color: cfg.col,
        emissive: cfg.col,
        emissiveIntensity: 0.85,
        roughness: 0.2
      });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 16, 32), ringMat);
      torus.position.set(0, 1.6, 0);
      torus.castShadow = true;
      arch.add(torus);

      ringGroup.add(arch);

      const worldPos = new THREE.Vector3(pos.x + cfg.x, groundY + 1.6, pos.z + cfg.z);
      this.slalomRings.push({
        index: idx,
        position: worldPos,
        entryPos: new THREE.Vector3(pos.x + cfg.x - Math.sin(cfg.rotY) * 2.5, groundY, pos.z + cfg.z - Math.cos(cfg.rotY) * 2.5),
        centerPos: worldPos,
        exitPos: new THREE.Vector3(pos.x + cfg.x + Math.sin(cfg.rotY) * 2.5, groundY, pos.z + cfg.z + Math.cos(cfg.rotY) * 2.5),
        radius: 1.3
      });
    });

    this.scene.add(ringGroup);
  }

  buildTreasureSpots() {
    this.treasureSpots = [
      { x: -28, z: 12, dug: false, type: 'bone', name: 'Hueso Dorado Ancestral' },
      { x: 18, z: -24, dug: false, type: 'gear', name: 'Micro-Engranaje de Titanio' },
      { x: 68, z: 28, dug: false, type: 'gem', name: 'Cristal Cuántico Resplandeciente' },
      { x: -16, z: -46, dug: false, type: 'ball', name: 'Mini-Pelota Neón Secreta' }
    ];

    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    const sparkleMat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffea00, emissiveIntensity: 0.8 });

    this.treasureSpots.forEach((spot) => {
      const g = new THREE.Group();
      const gy = this.getHeightAt(spot.x, spot.z);
      g.position.set(spot.x, gy + 0.04, spot.z);

      const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.12, 16), dirtMat);
      g.add(mound);

      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), sparkleMat);
      sparkle.position.set(0, 0.25, 0);
      g.add(sparkle);

      this.scene.add(g);
      spot.group = g;
      spot.sparkle = sparkle;
    });
  }

  revealDugTreasure(robot, spot) {
    if (!spot || spot.dug) return null;
    spot.dug = true;
    if (spot.sparkle) spot.sparkle.visible = false;

    const gy = this.getHeightAt(spot.x, spot.z);
    const itemGroup = new THREE.Group();
    itemGroup.position.set(spot.x, gy + 0.6, spot.z);

    if (spot.type === 'bone') {
      const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2, emissive: 0xffb700, emissiveIntensity: 0.5 });
      const bShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 12), goldMat);
      bShaft.rotation.z = Math.PI / 2;
      itemGroup.add(bShaft);
    } else if (spot.type === 'gear') {
      const gearMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, metalness: 0.95, roughness: 0.1, emissive: 0x00e5ff, emissiveIntensity: 0.6 });
      const gear = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 12, 24), gearMat);
      itemGroup.add(gear);
    } else {
      const gemMat = new THREE.MeshStandardMaterial({ color: 0xf43f5e, metalness: 0.3, roughness: 0.1, emissive: 0xf43f5e, emissiveIntensity: 0.8 });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), gemMat);
      itemGroup.add(gem);
    }

    this.scene.add(itemGroup);
    roboAudio.playTrickSuccess();
    this.logActivity(`💎 ¡${robot.name} desenterró un tesoro oculto: ${spot.name}!`);

    return spot.name;
  }

  buildLowPolyClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.02,
      transparent: true,
      opacity: 0.88
    });

    for (let c = 0; c < 12; c++) {
      const cloudGroup = new THREE.Group();
      const puffCount = 4 + Math.floor(Math.random() * 4);

      for (let p = 0; p < puffCount; p++) {
        const rad = 3.5 + Math.random() * 4.2;
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), cloudMat);
        puff.position.set(
          (p - puffCount / 2) * 4.5 + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 3
        );
        cloudGroup.add(puff);
      }

      const angle = (c / 12) * Math.PI * 2;
      const dist = 60 + Math.random() * 120;
      cloudGroup.position.set(
        Math.cos(angle) * dist,
        52 + Math.random() * 18,
        Math.sin(angle) * dist
      );
      this.scene.add(cloudGroup);
      this.clouds.push({
        group: cloudGroup,
        speed: 0.35 + Math.random() * 0.45
      });
    }
  }

  buildAmbientParticles() {
    const count = 120;
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 240;
      positions[i * 3 + 1] = 1.0 + Math.random() * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 240;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const pMat = new THREE.PointsMaterial({
      color: 0x22ff88,
      size: 0.45,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });

    const pSystem = new THREE.Points(geom, pMat);
    this.scene.add(pSystem);
    this.ambientParticles = pSystem;
  }

  spawnSoccerBall(pos, radius) {
    const ballGeo = new THREE.SphereGeometry(radius, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      map: this.textures.soccer,
      roughness: 0.35,
      metalness: 0.1
    });
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const ball = {
      mesh,
      radius,
      type: 'soccer',
      velocity: new THREE.Vector3(),
      mass: radius * 1.8,
      bounciness: 0.8,
      friction: 0.975
    };

    this.balls.push(ball);
    this.interactiveObjects.push({
      type: 'ball',
      object: mesh,
      ballData: ball,
      name: 'Pelota de Fútbol',
      radius
    });
    return ball;
  }

  // Interactive Fetch Throw Mechanism
  throwBall(originPos, direction, force = 24) {
    if (!this.soccerBall) return null;
    const ball = this.soccerBall;

    if (ball.carriedBy) {
      ball.carriedBy.dropObject();
      ball.carriedBy = null;
    }

    const throwDir = direction.clone();
    throwDir.y = 0;
    throwDir.normalize();

    ball.mesh.position.set(
      originPos.x + throwDir.x * 2.2,
      originPos.y + 1.2,
      originPos.z + throwDir.z * 2.2
    );

    ball.velocity.set(
      throwDir.x * force,
      8.5,
      throwDir.z * force
    );

    roboAudio.playWhine(1.2);
    this.logActivity(`🎾 ¡Lanzaste la pelota de fútbol! ¡A buscarla!`);
    return ball;
  }

  spawnBall(pos, radius, colorHex, type = 'ball') {
    const ballGeo = new THREE.SphereGeometry(radius, 24, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: type === 'neon' ? colorHex : 0x000000,
      emissiveIntensity: type === 'neon' ? 0.7 : 0,
      roughness: 0.35
    });

    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.copy(pos);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const ball = {
      mesh,
      radius,
      type,
      velocity: new THREE.Vector3(),
      mass: radius * 1.4,
      bounciness: 0.82,
      friction: 0.97
    };

    this.balls.push(ball);
    this.interactiveObjects.push({
      type: 'ball',
      object: mesh,
      ballData: ball,
      name: `Pelota ${type === 'neon' ? 'Neón' : 'Saltarina'}`,
      radius
    });
    return ball;
  }

  spawnBoneToy(pos) {
    const boneGroup = new THREE.Group();
    boneGroup.position.copy(pos);

    const boneMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.25, 12), boneMat);
    shaft.rotation.z = Math.PI / 2;
    boneGroup.add(shaft);

    [-0.65, 0.65].forEach(x => {
      [-0.15, 0.15].forEach(y => {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), boneMat);
        knob.position.set(x, y, 0);
        boneGroup.add(knob);
      });
    });

    this.scene.add(boneGroup);

    this.interactiveObjects.push({
      type: 'bone',
      object: boneGroup,
      name: 'Hueso de Energía',
      radius: 1.1
    });
  }

  // Spawn tasty Cyber Biscuit Treat
  spawnCyberSnack(pos) {
    const snackGroup = new THREE.Group();
    snackGroup.position.copy(pos);
    snackGroup.position.y += 0.4;

    const biscuitMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      emissive: 0xffea00,
      emissiveIntensity: 0.7,
      roughness: 0.3
    });
    const biscuit = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16), biscuitMat);
    snackGroup.add(biscuit);

    this.scene.add(snackGroup);
    this.snacks.push({
      group: snackGroup,
      age: 0
    });
    this.logActivity(`🍪 ¡Apareció una galleta energética en el parque!`);
    roboAudio.playBoop(1.4);
  }

  triggerDiscoParty() {
    this.discoPartyActive = true;
    this.discoTimer = 12.0; // 12 seconds dance party!
    this.logActivity(`🪩 ¡FIESTA DISCO ACTIVADA! ¡A bailar todos!`);
    roboAudio.playTrickSuccess();
  }

  buildDetailedNature() {
    const trunkMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, roughness: 0.85 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.6 })
    ];

    for (let i = 0; i < 95; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 220;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (Math.hypot(x - (-80), z - (-80)) < 68) continue;
      if (Math.hypot(x - 50, z - 40) < 38) continue;

      const treeGroup = new THREE.Group();
      treeGroup.position.set(x, this.getHeightAt(x, z), z);

      const height = 4.2 + Math.random() * 3.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, height, 8), trunkMat);
      trunk.position.y = height / 2;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const leafMat = leafMats[Math.floor(Math.random() * leafMats.length)];
      for (let l = 0; l < 3; l++) {
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(3.4 - l * 0.8, 3.2, 8), leafMat);
        foliage.position.y = height + l * 1.9;
        foliage.castShadow = true;
        treeGroup.add(foliage);
      }

      this.scene.add(treeGroup);
      this.registerObstacle({ type: 'tree', x, z, radius: 0.85, height: 7.0 });
    }

    // Wildflowers via InstancedMesh (Massive Draw-Call Optimization!)
    const flowerGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const flwMat = new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.25 });
    const flowerInst = new THREE.InstancedMesh(flowerGeo, flwMat, 240);
    const dummy = new THREE.Object3D();
    const colorObj = new THREE.Color();
    const flowerColors = [0xffeb3b, 0xff4081, 0x00e5ff, 0xab47bc, 0xff7043, 0x76ff03];

    for (let i = 0; i < 240; i++) {
      const x = (Math.random() - 0.5) * 360;
      const z = (Math.random() - 0.5) * 360;
      if (Math.hypot(x - (-80), z - (-80)) < 65) continue;

      const y = this.getHeightAt(x, z) + 0.16;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.7 + Math.random() * 0.6);
      dummy.updateMatrix();
      flowerInst.setMatrixAt(i, dummy.matrix);

      colorObj.setHex(flowerColors[i % flowerColors.length]);
      flowerInst.setColorAt(i, colorObj);
    }
    flowerInst.instanceMatrix.needsUpdate = true;
    if (flowerInst.instanceColor) flowerInst.instanceColor.needsUpdate = true;
    this.scene.add(flowerInst);

    // Cyber-Butterflies
    this.butterflies = [];
    const bflyCanvas = document.createElement('canvas');
    bflyCanvas.width = 32;
    bflyCanvas.height = 32;
    const bctx = bflyCanvas.getContext('2d');
    bctx.fillStyle = '#00e5ff';
    bctx.beginPath();
    bctx.arc(10, 16, 8, 0, Math.PI * 2);
    bctx.arc(22, 16, 8, 0, Math.PI * 2);
    bctx.fill();
    const bflyTex = new THREE.CanvasTexture(bflyCanvas);

    for (let i = 0; i < 24; i++) {
      const mat = new THREE.SpriteMaterial({ map: bflyTex, transparent: true, opacity: 0.88 });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(0.65, 0.65, 0.65);
      const bx = (Math.random() - 0.5) * 220;
      const bz = (Math.random() - 0.5) * 220;
      const by = this.getHeightAt(bx, bz) + 1.5 + Math.random() * 2.5;
      sp.position.set(bx, by, bz);
      this.scene.add(sp);
      this.butterflies.push({
        sprite: sp,
        basePos: sp.position.clone(),
        phase: Math.random() * Math.PI * 2,
        speed: 1.6 + Math.random()
      });
    }
  }

  buildPointsOfInterest() {
    this.pointsOfInterest = [
      { name: 'Lago de Cristal', position: new THREE.Vector3(-80, 0, -80), radius: 65, type: 'lake' },
      { name: 'Parque de Juegos', position: new THREE.Vector3(50, 0, 40), radius: 36, type: 'playground' },
      { name: 'Trampolín de Salto', position: new THREE.Vector3(38, 0, 22), radius: 5, type: 'trampoline' },
      { name: 'Carrusel Giratorio', position: new THREE.Vector3(62, 0, 26), radius: 6, type: 'carousel' },
      { name: 'Pista de Baile Disco', position: new THREE.Vector3(52, 0, 56), radius: 5, type: 'disco' },
      { name: 'Estación de Recarga', position: new THREE.Vector3(72, 0, 52), radius: 9, type: 'recharge' },
      { name: 'Muelle de Madera', position: new THREE.Vector3(-44, 0, -80), radius: 14, type: 'pier' },
      { name: 'Prado Esmeralda', position: new THREE.Vector3(0, 0, 0), radius: 28, type: 'meadow' },
      { name: 'Fuente de Agua Canina', position: new THREE.Vector3(12, 0, 10), radius: 6, type: 'fountain' },
      { name: 'Puente de Madera', position: new THREE.Vector3(-46, 0, -48), radius: 8, type: 'bridge' },
      { name: 'Balancín Cibernético', position: new THREE.Vector3(48, 0, 32), radius: 6, type: 'seesaw' },
      { name: 'Piscina de Pelotas', position: new THREE.Vector3(-32, 0, 48), radius: 6, type: 'ballpit' },
      { name: 'Tobogán de Agilidad', position: new THREE.Vector3(-18, 0, -32), radius: 8, type: 'slide' },
      { name: 'Túnel de Agilidad', position: new THREE.Vector3(22, 0, -50), radius: 7, type: 'tunnel' },
      { name: 'Diana de Tiro', position: new THREE.Vector3(76, 0, 18), radius: 6, type: 'target' },
      { name: 'Piñata Canina', position: new THREE.Vector3(-42, 0, 14), radius: 6, type: 'pinata' }
    ];
  }

  getHeightAt(x, z) {
    const distToLake = Math.hypot(x - (-80), z - (-80));
    if (distToLake < 65) {
      const lakeFactor = Math.cos((distToLake / 65) * (Math.PI / 2));
      return -4.5 * lakeFactor;
    }
    const distToPlayground = Math.hypot(x - 50, z - 40);
    let y = Math.sin(x * 0.02) * 2.2 + Math.cos(z * 0.025) * 1.8 + Math.sin((x + z) * 0.015) * 1.5;
    if (distToPlayground < 55) {
      const blend = distToPlayground / 55;
      y *= blend * blend;
    }
    return y;
  }

  resolveObstacleCollisions(pos, radius = 0.75, height = 1.0) {
    let collided = false;
    const obstacles = this.getNearObstacles(pos.x, pos.z);
    const posY = pos.y;

    // 1. True 3D Obstacle Volumetric Clearance (Cylinders and Oriented AABBs)
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];

      // Vertical 3D clearance: if the dog jumps over or passes below, no horizontal collision!
      if (obs.yMin !== undefined && obs.yMax !== undefined) {
        if (posY + height < obs.yMin || posY > obs.yMax) {
          continue;
        }
      }

      if (obs.shape === 'box') {
        const minX = obs.x - obs.halfW - radius;
        const maxX = obs.x + obs.halfW + radius;
        const minZ = obs.z - obs.halfD - radius;
        const maxZ = obs.z + obs.halfD + radius;

        if (pos.x > minX && pos.x < maxX && pos.z > minZ && pos.z < maxZ) {
          collided = true;
          const dLeft = Math.abs(pos.x - minX);
          const dRight = Math.abs(maxX - pos.x);
          const dBack = Math.abs(pos.z - minZ);
          const dFront = Math.abs(maxZ - pos.z);

          const minPush = Math.min(dLeft, dRight, dBack, dFront);
          if (minPush === dLeft) pos.x = minX;
          else if (minPush === dRight) pos.x = maxX;
          else if (minPush === dBack) pos.z = minZ;
          else pos.z = maxZ;
        }
      } else {
        const dx = pos.x - obs.x;
        const dz = pos.z - obs.z;
        const dist = Math.hypot(dx, dz);
        const minDist = (obs.radius || 0.8) + radius;

        if (dist < minDist && dist > 0.0001) {
          collided = true;
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }

    // 2. Lake Water Area: Dogs and player are allowed to swim freely in the lake!
    // No artificial barrier blocking entry into the water.
    // (Deep underwater height is smoothly handled in getHeightAt)

    // 3. World Boundary Clamping (238m radius circle around 0, 0)
    const distFromOrigin = Math.hypot(pos.x, pos.z);
    const maxWorldRadius = 238;
    if (distFromOrigin > maxWorldRadius) {
      collided = true;
      const factor = maxWorldRadius / distFromOrigin;
      pos.x *= factor;
      pos.z *= factor;
    }

    return collided;
  }

  handleTargetHit(pts, ball) {
    if (ball.lastTargetHit && Date.now() - ball.lastTargetHit < 800) return;
    ball.lastTargetHit = Date.now();
    this.targetScore += pts;
    this.logActivity(`🎯 ¡DIANA ACERTADA! +${pts} PUNTOS | Total: ${this.targetScore}`);
    roboAudio.playTrickSuccess();
    if (this.onTargetHit) this.onTargetHit(this.targetScore);

    // Bounce ball backward with high energetic rebound
    ball.velocity.x *= -1.1;
    ball.velocity.z *= -1.1;
    ball.velocity.y = 4.5;
  }

  update(delta) {
    this.waterTime += delta;
    if (this.waterMesh) {
      this.waterMesh.material.opacity = 0.86 + Math.sin(this.waterTime * 2.2) * 0.04;
    }

    // Low-poly 3D clouds drifting smoothly
    this.clouds.forEach(c => {
      c.group.rotation.y += delta * 0.012 * c.speed;
    });

    // Ambient floating fireflies / pollen
    if (this.ambientParticles) {
      this.ambientParticles.rotation.y += delta * 0.02;
    }

    // Rotating Target Toss Board
    if (this.targetBoard && this.targetBoard.rotor) {
      this.targetBoard.rotor.rotation.z += delta * 0.85;
    }

    // Swinging Cyber Piñata physics
    if (this.pinata) {
      this.pinata.swingVel += (-this.pinata.swingAngle * 14) * delta;
      this.pinata.swingVel *= Math.exp(-2.2 * delta);
      this.pinata.swingAngle += this.pinata.swingVel * delta;
      this.pinata.pivot.rotation.z = this.pinata.swingAngle;
    }

    // Ball Pit mini-balls gentle floating oscillation
    this.ballPitBalls.forEach(b => {
      b.mesh.position.y = b.localOrigin.y + Math.sin(this.waterTime * 3.0 + b.localOrigin.x) * 0.035;
    });

    // Toy boat bobbing in lake water
    if (this.toyBoat) {
      this.toyBoat.position.y = Math.sin(this.waterTime * 1.8) * 0.12;
      this.toyBoat.rotation.z = Math.sin(this.waterTime * 1.4) * 0.08;
      this.toyBoat.rotation.y += delta * 0.15;
    }

    // Rotating carousel
    if (this.carousel) {
      this.carouselAngle += delta * 1.2;
      this.carousel.rotor.rotation.y = this.carouselAngle;
    }

    // Disco Party Mode
    if (this.discoPartyActive) {
      this.discoTimer -= delta;
      if (this.discoBall) this.discoBall.rotation.y += delta * 4;

      if (Math.floor(this.waterTime * 6) % 2 === 0) {
        roboAudio.playDanceBeat();
      }

      // Flash disco floor tiles
      if (this.discoTiles) {
        this.discoTiles.forEach((tile, idx) => {
          tile.material.emissiveIntensity = 0.4 + Math.sin(this.waterTime * 10 + idx) * 0.6;
        });
      }

      if (this.discoTimer <= 0) {
        this.discoPartyActive = false;
        if (this.discoTiles) {
          this.discoTiles.forEach(tile => tile.material.emissiveIntensity = 0.2);
        }
      }
    }

    // Rotate holographic bones
    this.interactiveObjects.forEach(item => {
      if (item.type === 'bone') {
        item.object.rotation.y += delta * 1.2;
      }
    });

    // Butterflies flutter
    this.butterflies.forEach(b => {
      b.phase += delta * b.speed;
      b.sprite.position.x = b.basePos.x + Math.sin(b.phase) * 3;
      b.sprite.position.z = b.basePos.z + Math.cos(b.phase * 0.7) * 3;
      b.sprite.position.y = b.basePos.y + Math.sin(b.phase * 2.5) * 0.6;
    });

    // Animated water fountain ripples & jet
    if (this.fountainWater) {
      this.fountainWater.rotation.z += delta * 0.75;
    }
    if (this.fountainJet) {
      this.fountainJet.scale.y = 1.0 + Math.sin(this.waterTime * 6.0) * 0.22;
    }

    // Interactive Seesaw dynamic tilt
    if (this.seesaw) {
      this.seesaw.pivot.rotation.z = THREE.MathUtils.lerp(
        this.seesaw.pivot.rotation.z,
        this.seesaw.targetTilt,
        delta * 3.5
      );
    }

    // Update physical balls & check Soccer Goal and Target Toss!
    this.balls.forEach(ball => {
      if (ball.carriedBy) return; // Carried in robot's mouth!

      // Sub-stepping for continuous collision detection (CCD)
      const subSteps = 2;
      const subDelta = delta / subSteps;

      for (let step = 0; step < subSteps; step++) {
        ball.velocity.y -= 9.8 * subDelta;
        ball.mesh.position.addScaledVector(ball.velocity, subDelta);

        // Bounce off solid obstacles
        const hitObstacle = this.resolveObstacleCollisions(ball.mesh.position, ball.radius, ball.radius * 2);
        if (hitObstacle) {
          ball.velocity.x *= -0.72;
          ball.velocity.z *= -0.72;
        }

        const groundY = this.getHeightAt(ball.mesh.position.x, ball.mesh.position.z) + ball.radius;
        if (ball.mesh.position.y <= groundY) {
          ball.mesh.position.y = groundY;
          if (Math.abs(ball.velocity.y) > 0.5) {
            ball.velocity.y = -ball.velocity.y * ball.bounciness;
          } else {
            ball.velocity.y = 0;
          }
        }
      }

      ball.velocity.x *= ball.friction;
      ball.velocity.z *= ball.friction;

      const rollSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
      if (rollSpeed > 0.05) {
        ball.mesh.rotation.x += ball.velocity.z * delta * (1 / ball.radius);
        ball.mesh.rotation.z -= ball.velocity.x * delta * (1 / ball.radius);
      }

      // Check Soccer Goal Collision!
      if (ball.type === 'soccer' && this.soccerGoal) {
        const gx = this.soccerGoal.position.x;
        const gz = this.soccerGoal.position.z;
        const bx = ball.mesh.position.x;
        const bz = ball.mesh.position.z;

        if (Math.abs(bx - gx) < 2.0 && Math.abs(bz - gz) < 3.2 && ball.mesh.position.y < 3.2) {
          this.handleGoalScored(ball);
        }
      }

      // Check Cyber Target Toss Collision!
      if (this.targetBoard) {
        const tx = this.targetBoard.position.x;
        const tz = this.targetBoard.position.z;
        const ty = this.targetBoard.position.y;
        const distXZ = Math.hypot(ball.mesh.position.x - tx, ball.mesh.position.z - tz);
        const distY = Math.abs(ball.mesh.position.y - ty);

        if (distXZ < this.targetBoard.radius && distY < 2.4) {
          const hitRadius = Math.hypot(ball.mesh.position.x - tx, ball.mesh.position.y - ty);
          let pts = 10;
          if (hitRadius < 0.7) pts = 50;
          else if (hitRadius < 1.4) pts = 25;
          this.handleTargetHit(pts, ball);
        }
      }
    });

    // Update floating snacks
    for (let i = this.snacks.length - 1; i >= 0; i--) {
      const snack = this.snacks[i];
      snack.age += delta;
      snack.group.rotation.y += delta * 2.0;
      snack.group.position.y = this.getHeightAt(snack.group.position.x, snack.group.position.z) + 0.35 + Math.sin(snack.age * 3) * 0.1;
    }
  }

  handleGoalScored(ball) {
    this.goalScore++;
    this.logActivity(`⚽ ¡¡¡GOOOOOOLAZO!!! Marcador: ${this.goalScore}`);
    roboAudio.playGoalFanfare();

    if (this.onGoal) {
      this.onGoal(this.goalScore);
    }

    // Reset soccer ball to center of playground
    ball.mesh.position.set(45, 1.5, 40);
    ball.velocity.set(0, 2, 0);
  }

  launchTrampoline(robot) {
    if (!robot) return;
    const rPos = robot.group.position;
    if (this.trampoline) {
      rPos.x = this.trampoline.position.x;
      rPos.z = this.trampoline.position.z;
    }
    roboAudio.playTrampoline();
    if (robot.animController) robot.animController.play('backflip', 1.8);
    rPos.y += 2.5;
    robot.energy = Math.min(100, robot.energy + 20);
    this.logActivity(`🤸 ¡${robot.name} ejecutó una gran pirueta aérea en el trampolín!`);
  }

  handleRobotInteractions(robot) {
    const rPos = robot.group.position;

    // 0. Solid Obstacle Collisions Pushout
    this.resolveObstacleCollisions(rPos, 0.75, 1.2);

    // Lake Swimming & Drying Shake-Off
    const lakeDx = rPos.x - (-80);
    const lakeDz = rPos.z - (-80);
    const distToLake = Math.hypot(lakeDx, lakeDz);
    const isOnPier = Math.abs(rPos.x - (-44)) < 4.2 && Math.abs(rPos.z - (-80)) < 13.0;
    const isOnBridge = this.woodenBridge && Math.abs(rPos.x - this.woodenBridge.position.x) < 3.2 && Math.abs(rPos.z - this.woodenBridge.position.z) < 9.5;

    if (distToLake < 58.0 && !isOnPier && !isOnBridge) {
      robot.isInWater = true;
      rPos.y = -0.52; // Partially submerged to collar

      if (!robot.wasInWater) {
        robot.wasInWater = true;
        roboAudio.playSplash();
        this.logActivity(`🏊 ¡${robot.name} se zambulló en el Lago de Cristal y está nadando!`);
        if (robot.animController && robot.animController.currentAnim !== 'swimming') {
          robot.animController.play('swimming');
        }
      }
    } else {
      if (robot.wasInWater) {
        robot.wasInWater = false;
        robot.isInWater = false;
        roboAudio.playSplash();
        this.logActivity(`🐕 ¡${robot.name} salió del lago a tierra firme y se sacude para secarse!`);
        if (robot.animController) {
          robot.animController.play('shakeOff', 2.0);
        }
      }
    }

    // Slalom Rings Check
    if (this.slalomRings) {
      this.slalomRings.forEach(ring => {
        const d = rPos.distanceTo(ring.position);
        if (d < ring.radius + 0.4 && (!ring.lastCleared || Date.now() - ring.lastCleared > 3000)) {
          ring.lastCleared = Date.now();
          roboAudio.playBoop(1.4 + ring.index * 0.12);
          this.logActivity(`⭕ ¡${robot.name} atravesó con precisión el aro #${ring.index + 1}!`);
        }
      });
    }

    // 1. Water Fountain Hydration Quench
    if (this.waterFountain) {
      const fDist = Math.hypot(rPos.x - this.waterFountain.position.x, rPos.z - this.waterFountain.position.z);
      if (fDist < 2.9) {
        if (!robot.lastDrinkTime || Date.now() - robot.lastDrinkTime > 7000) {
          robot.lastDrinkTime = Date.now();
          if (robot.quenchThirst) robot.quenchThirst(35);
          roboAudio.playSplash();
          this.logActivity(`💧 ¡${robot.name} tomó agua fresca en la cibercuenca y calmó su sed!`);
        }
      }
    }

    // 2. Seesaw Interaction
    if (this.seesaw) {
      const sDist = Math.hypot(rPos.x - this.seesaw.position.x, rPos.z - this.seesaw.position.z);
      if (sDist < 5.4) {
        const relX = rPos.x - this.seesaw.position.x;
        this.seesaw.targetTilt = THREE.MathUtils.clamp(-relX * 0.055, -0.25, 0.25);
      }
    }

    // 3. Trampoline Bounce (Consecutive higher bounces + 360° backflip!)
    if (this.trampoline) {
      const dist = Math.hypot(rPos.x - this.trampoline.position.x, rPos.z - this.trampoline.position.z);
      if (dist < 2.8 && (!robot.lastTrampTime || Date.now() - robot.lastTrampTime > 1200)) {
        robot.lastTrampTime = Date.now();
        robot.trampConsecutiveHits = ((robot.trampConsecutiveHits || 0) % 4) + 1;
        const bounceForce = 2.0 + robot.trampConsecutiveHits * 0.7; // +20% each consecutive hit
        roboAudio.playTrampoline();
        if (robot.animController) robot.animController.play('backflip', 1.8);
        rPos.y += bounceForce;
        robot.energy = Math.min(100, robot.energy + 10);
        this.logActivity(`🤸 ¡${robot.name} dio su rebote #${robot.trampConsecutiveHits} en el trampolín (+${Math.round(bounceForce * 10)}% de impulso)!`);
      }
    }

    // 4. Carousel Ride
    if (this.carousel) {
      const dist = Math.hypot(rPos.x - this.carousel.position.x, rPos.z - this.carousel.position.z);
      if (dist < 3.2) {
        const a = Math.atan2(rPos.z - this.carousel.position.z, rPos.x - this.carousel.position.x);
        const newA = a + 0.02;
        rPos.x = this.carousel.position.x + Math.cos(newA) * dist;
        rPos.z = this.carousel.position.z + Math.sin(newA) * dist;
        robot.group.rotation.y += 0.02;
      }
    }

    // 5. NEW: Cyber Ball Pit Splash Interaction!
    if (this.ballPit) {
      const bDist = Math.hypot(rPos.x - this.ballPit.position.x, rPos.z - this.ballPit.position.z);
      if (bDist < 3.2) {
        // Disperse mini-balls around robot
        const relX = rPos.x - this.ballPit.position.x;
        const relZ = rPos.z - this.ballPit.position.z;
        this.ballPitBalls.forEach(b => {
          const dx = b.mesh.position.x - relX;
          const dz = b.mesh.position.z - relZ;
          const d = Math.hypot(dx, dz);
          if (d < 1.4 && d > 0.01) {
            b.mesh.position.x += (dx / d) * 0.15;
            b.mesh.position.z += (dz / d) * 0.15;
          }
        });

        if (!robot.lastBallPitTime || Date.now() - robot.lastBallPitTime > 3500) {
          robot.lastBallPitTime = Date.now();
          roboAudio.playBoop(1.4);
          this.logActivity(`🏊 ¡${robot.name} se zambulló en la piscina de pelotas de colores!`);
          robot.playfulness = 100;
          robot.energy = Math.min(100, robot.energy + 8);
        }
      }
    }

    // 6. NEW: Agility Slide Sliding!
    if (this.slide) {
      const distToTop = Math.hypot(rPos.x - this.slide.topPos.x, rPos.z - this.slide.topPos.z);
      if (distToTop < 1.8 && !robot.isSliding) {
        robot.isSliding = true;
        this.logActivity(`🎢 ¡${robot.name} se subió al tobogán y se desliza a toda velocidad!`);
        roboAudio.playYip(1.3);
        if (robot.animController) robot.animController.play('roll', 2.0);

        // Smooth slide down animation
        let progress = 0;
        const slideInterval = setInterval(() => {
          progress += 0.08;
          rPos.lerpVectors(this.slide.topPos, this.slide.endPos, progress);
          rPos.y = THREE.MathUtils.lerp(this.slide.topPos.y, this.slide.endPos.y, progress);
          if (progress >= 1.0) {
            clearInterval(slideInterval);
            robot.isSliding = false;
            rPos.copy(this.slide.endPos);
            if (robot.animController) robot.animController.play('backflip', 1.5);
            roboAudio.playBoop(1.6);
            this.logActivity(`🤸 ¡${robot.name} aterrizó en la colchoneta del tobogán con estilo!`);
          }
        }, 40);
      }
    }

    // 7. NEW: Agility Tunnel & Hurdles
    if (this.obstacleCourse && this.obstacleCourse.tunnel) {
      const tStart = this.obstacleCourse.tunnel.start;
      const tDist = Math.hypot(rPos.x - tStart.x, rPos.z - tStart.z);
      if (tDist < 1.5 && !robot.inTunnel) {
        robot.inTunnel = true;
        this.logActivity(`🌀 ¡${robot.name} se agachó y pasó velozmente por el túnel de agilidad!`);
        if (robot.animController) robot.animController.play('sneak', 2.0);
        roboAudio.playBoop(1.2);
        setTimeout(() => {
          robot.inTunnel = false;
          if (robot.animController) robot.animController.play('howl', 1.5);
        }, 1600);
      }
    }

    // 8. NEW: Cyber Piñata Strike!
    if (this.pinata) {
      const pDist = Math.hypot(rPos.x - this.pinata.position.x, rPos.z - this.pinata.position.z);
      const groundY = this.getHeightAt(rPos.x, rPos.z);
      if (pDist < 2.0 && rPos.y > groundY + 0.3) {
        if (!this.pinata.lastHit || Date.now() - this.pinata.lastHit > 1000) {
          this.pinata.lastHit = Date.now();
          this.pinata.hits++;
          this.pinata.swingVel = 4.2;
          roboAudio.playBoop(1.4);
          this.logActivity(`🪅 ¡${robot.name} golpeó la piñata! (Golpe ${this.pinata.hits}/${this.pinata.maxHits})`);

          if (this.pinata.hits >= this.pinata.maxHits) {
            this.pinata.hits = 0;
            this.logActivity(`🎊 ¡¡¡LA PIÑATA EXPLOTÓ EN GALLETAS PARA TODA LA MANADA!!! 🍪`);
            roboAudio.playTrickSuccess();
            // Drop 5 cyber snacks around
            for (let k = 0; k < 5; k++) {
              const a = (k / 5) * Math.PI * 2;
              const sp = new THREE.Vector3(
                this.pinata.position.x + Math.cos(a) * (2.0 + Math.random() * 2),
                0,
                this.pinata.position.z + Math.sin(a) * (2.0 + Math.random() * 2)
              );
              this.spawnCyberSnack(sp);
            }
          }
        }
      }
    }

    // 9. Disco Pad trigger
    if (this.discoPad && !this.discoPartyActive) {
      const dist = Math.hypot(rPos.x - this.discoPad.position.x, rPos.z - this.discoPad.position.z);
      if (dist < 2.8) {
        this.triggerDiscoParty();
      }
    }

    // 10. Eat Snacks
    for (let i = this.snacks.length - 1; i >= 0; i--) {
      const snack = this.snacks[i];
      const dist = Math.hypot(rPos.x - snack.group.position.x, rPos.z - snack.group.position.z);
      if (dist < 1.4) {
        this.scene.remove(snack.group);
        this.snacks.splice(i, 1);
        robot.energy = 100;
        roboAudio.playSnackMunch();
        this.logActivity(`😋 ¡${robot.name} se comió una galleta y recuperó 100% de energía!`);
      }
    }

    // 11. Ball collisions
    this.balls.forEach(ball => {
      const dist = Math.hypot(rPos.x - ball.mesh.position.x, rPos.z - ball.mesh.position.z);
      const minDist = 0.95 + ball.radius;

      if (dist < minDist) {
        const overlap = minDist - dist;
        const pushDir = new THREE.Vector3(
          ball.mesh.position.x - rPos.x,
          0,
          ball.mesh.position.z - rPos.z
        ).normalize();

        ball.mesh.position.x += pushDir.x * overlap;
        ball.mesh.position.z += pushDir.z * overlap;

        const kickStrength = 6.2;
        ball.velocity.x += pushDir.x * kickStrength;
        ball.velocity.z += pushDir.z * kickStrength;
        ball.velocity.y += 2.2;

        roboAudio.playBoop(robot.profile ? robot.profile.voicePitch : 1.0);
      }
    });
  }
}
