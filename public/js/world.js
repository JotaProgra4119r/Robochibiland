// Highly Detailed 3D Environment with Procedural Textures, Fixed 3D Architecture & Full OBB/Volumetric Collisions
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

    // 3D Spatial Partitioning Grid for fast O(1) physics
    this.spatialGrid = new Map();
    this.gridCellSize = 20;

    // Walkable elevated structures (Bridge, Pier, Ramp)
    this.elevatedSurfaces = [];

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

    // High-Tech Attractions
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

  // Registers an obstacle across ALL overlapping spatial grid cells (supports Cylinder & Rotated OBB Box)
  registerObstacle(obs) {
    if (!obs) return;
    obs.shape = obs.shape || 'cylinder';
    obs.rotY = obs.rotY || 0;
    const baseTerrainY = this.getTerrainHeightOnly(obs.x || 0, obs.z || 0);

    if (obs.yMin === undefined) {
      obs.yMin = baseTerrainY - 1.5;
    }
    if (obs.yMax === undefined) {
      obs.yMax = obs.yMin + (obs.height || 4.0) + 1.5;
    }
    this.solidObstacles.push(obs);

    // Compute bounding extent to insert into all touched grid cells
    let extentX = obs.radius || 1.0;
    let extentZ = obs.radius || 1.0;
    if (obs.shape === 'box') {
      const cos = Math.abs(Math.cos(obs.rotY));
      const sin = Math.abs(Math.sin(obs.rotY));
      const hw = obs.halfW || 1.0;
      const hd = obs.halfD || 1.0;
      extentX = hw * cos + hd * sin;
      extentZ = hw * sin + hd * cos;
    }

    const minCX = Math.floor(((obs.x || 0) - extentX) / this.gridCellSize);
    const maxCX = Math.floor(((obs.x || 0) + extentX) / this.gridCellSize);
    const minCZ = Math.floor(((obs.z || 0) - extentZ) / this.gridCellSize);
    const maxCZ = Math.floor(((obs.z || 0) + extentZ) / this.gridCellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const cellKey = `${cx}_${cz}`;
        if (!this.spatialGrid.has(cellKey)) {
          this.spatialGrid.set(cellKey, []);
        }
        this.spatialGrid.get(cellKey).push(obs);
      }
    }
  }

  getNearObstacles(x, z) {
    const cx = Math.floor(x / this.gridCellSize);
    const cz = Math.floor(z / this.gridCellSize);
    const seen = new Set();
    const result = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx}_${cz + dz}`;
        const cell = this.spatialGrid.get(key);
        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            const obs = cell[i];
            if (!seen.has(obs)) {
              seen.add(obs);
              result.push(obs);
            }
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

    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#388e3c');
    grad.addColorStop(0.5, '#43a047');
    grad.addColorStop(1, '#2e7d32');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

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

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.stroke();
    });

    return new THREE.CanvasTexture(canvas);
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
      ctx.bezierCurveTo(
        80, y + (Math.random() - 0.5) * 8,
        180, y + (Math.random() - 0.5) * 8,
        256, y + (Math.random() - 0.5) * 4
      );
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
      pos.setY(i, this.getTerrainHeightOnly(x, z));
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
    const baseH = this.getTerrainHeightOnly(0, 0);
    const plazaGeo = new THREE.CylinderGeometry(18, 18.2, 0.14, 32);
    const plazaMat = new THREE.MeshStandardMaterial({
      map: this.textures.cobblestone,
      roughness: 0.72,
      metalness: 0.08
    });
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.set(0, baseH + 0.07, 0);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    const borderMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
    const border = new THREE.Mesh(new THREE.TorusGeometry(18.2, 0.25, 12, 32), borderMat);
    border.rotation.x = Math.PI / 2;
    border.position.set(0, baseH + 0.12, 0);
    this.scene.add(border);

    const starMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.85 });
    const star = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.18, 8), starMat);
    star.position.set(0, baseH + 0.1, 0);
    this.scene.add(star);

    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(30, 0, 26), 4.2);
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-36, 0, -68), 4.0);
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(56, 0, 44), 3.8);
    this.createPathRibbon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-44, 0, -46), 3.6);
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
      const curveDev = Math.sin(t * Math.PI) * 1.8;
      center.x += -dir.z * curveDev;
      center.z += dir.x * curveDev;

      const pL = new THREE.Vector3().addVectors(center, normal);
      const pR = new THREE.Vector3().subVectors(center, normal);

      pL.y = this.getTerrainHeightOnly(pL.x, pL.z) + 0.08;
      pR.y = this.getTerrainHeightOnly(pR.x, pR.z) + 0.08;

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

  // FIXED: Arched Wooden Bridge with curved handrails, side colliders & walkable surface height
  buildWoodenBridge(pos, rotY = 0, span = 18, width = 4.4) {
    const bridgeGroup = new THREE.Group();
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    bridgeGroup.position.set(pos.x, baseY, pos.z);
    bridgeGroup.rotation.y = rotY;

    const archSegments = 18;
    const archPeak = 2.6;
    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, roughness: 0.75 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 });
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffea00, emissiveIntensity: 1.2 });

    const postHeights = [];

    for (let i = 0; i < archSegments; i++) {
      const t = i / (archSegments - 1);
      const z = (t - 0.5) * span;
      const archHeight = Math.sin(t * Math.PI) * archPeak;
      const slopeAngle = -Math.cos(t * Math.PI) * (archPeak * Math.PI / span);

      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(width, 0.22, (span / archSegments) * 1.05),
        woodMat
      );
      plank.position.set(0, archHeight + 0.11, z);
      plank.rotation.x = slopeAngle;
      plank.castShadow = true;
      plank.receiveShadow = true;
      bridgeGroup.add(plank);

      postHeights.push({ z, archHeight });

      // Side railings posts
      if (i % 2 === 0 || i === archSegments - 1) {
        [-width * 0.5 + 0.18, width * 0.5 - 0.18].forEach(x => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 1.35, 8), railMat);
          post.position.set(x, archHeight + 0.75, z);
          post.castShadow = true;
          bridgeGroup.add(post);
        });
      }
    }

    // Curved Handrails following the exact arch segments (instead of cutting flat through the middle)
    [-width * 0.5 + 0.18, width * 0.5 - 0.18].forEach(x => {
      for (let i = 0; i < postHeights.length - 1; i++) {
        const p1 = postHeights[i];
        const p2 = postHeights[i + 1];
        const dz = p2.z - p1.z;
        const dy = p2.archHeight - p1.archHeight;
        const segLen = Math.hypot(dz, dy);
        const angle = -Math.atan2(dy, dz);

        // Top rail bar
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, segLen + 0.08), railMat);
        topRail.position.set(x, (p1.archHeight + p2.archHeight) * 0.5 + 1.38, (p1.z + p2.z) * 0.5);
        topRail.rotation.x = angle;
        topRail.castShadow = true;
        bridgeGroup.add(topRail);

        // Mid safety rail bar
        const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, segLen + 0.05), railMat);
        midRail.position.set(x, (p1.archHeight + p2.archHeight) * 0.5 + 0.75, (p1.z + p2.z) * 0.5);
        midRail.rotation.x = angle;
        bridgeGroup.add(midRail);
      }

      // Corner lanterns
      [-span * 0.48, span * 0.48].forEach(z => {
        const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.34), lanternMat);
        lantern.position.set(x, 1.65, z);
        bridgeGroup.add(lantern);
      });

      // Register continuous OBB side-rail colliders so the dog stays on the bridge deck
      const railWorld = new THREE.Vector3(x, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(pos);
      this.registerObstacle({
        type: 'bridge_rail',
        shape: 'box',
        x: railWorld.x,
        z: railWorld.z,
        halfW: 0.22,
        halfD: span * 0.48,
        rotY,
        yMin: baseY - 0.5,
        yMax: baseY + archPeak + 2.0
      });
    });

    this.scene.add(bridgeGroup);
    this.woodenBridge = { position: pos, baseY, rotY, span, width, archPeak };

    // Register walkable arch surface
    this.elevatedSurfaces.push({
      type: 'bridge',
      x: pos.x,
      z: pos.z,
      rotY,
      halfW: width * 0.5,
      halfD: span * 0.5,
      getHeight: (localX, localZ) => {
        const t = (localZ / span) + 0.5;
        if (t < 0 || t > 1) return null;
        return baseY + Math.sin(t * Math.PI) * archPeak + 0.22;
      }
    });
  }

  buildWaterFountain(pos) {
    const fGroup = new THREE.Group();
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    fGroup.position.set(pos.x, baseY, pos.z);

    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.2
    });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.3, 0.55, 32), bowlMat);
    bowl.position.y = 0.28;
    bowl.castShadow = true;
    fGroup.add(bowl);

    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.95
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.1, 16, 32), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.56;
    fGroup.add(rim);

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

    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, metalness: 0.7, roughness: 0.2 });
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 16), nozzleMat);
    nozzle.position.y = 0.65;
    fGroup.add(nozzle);

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

    // Pedestal support for holographic bone sign so it isn't floating
    const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), bowlMat);
    signPost.position.set(0, 0.72, 1.52);
    fGroup.add(signPost);

    const signMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.0 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.26, 0.1), signMat);
    sign.position.set(0, 0.96, 1.52);
    fGroup.add(sign);

    this.scene.add(fGroup);
    this.waterFountain = { position: pos, radius: 1.6 };

    this.registerObstacle({ type: 'water_fountain', x: pos.x, z: pos.z, radius: 1.65, height: 2.0 });
  }

  buildCyberSeesaw(pos) {
    const seeGroup = new THREE.Group();
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    seeGroup.position.set(pos.x, baseY, pos.z);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.3 });
    // Dual A-frame support brackets
    [-0.75, 0.75].forEach(zOff => {
      const stand = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.55, 4), baseMat);
      stand.rotation.y = Math.PI / 4;
      stand.position.set(0, 0.77, zOff);
      stand.castShadow = true;
      seeGroup.add(stand);
    });

    const axleMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 });
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.0, 16), axleMat);
    axle.rotation.x = Math.PI / 2;
    axle.position.y = 1.5;
    seeGroup.add(axle);

    const plankPivot = new THREE.Group();
    plankPivot.position.y = 1.5;
    seeGroup.add(plankPivot);

    const plankMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.3
    });
    const plank = new THREE.Mesh(new THREE.BoxGeometry(10.0, 0.18, 1.45), plankMat);
    plank.castShadow = true;
    plank.receiveShadow = true;
    plankPivot.add(plank);

    [-4.3, 4.3].forEach((hx, idx) => {
      const handleColor = idx === 0 ? 0x00e5ff : 0xff4081;
      const hMat = new THREE.MeshStandardMaterial({ color: handleColor, emissive: handleColor, emissiveIntensity: 0.85 });
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 12, 24), hMat);
      handle.rotation.y = Math.PI / 2;
      handle.position.set(hx * 0.88, 0.38, 0);
      plankPivot.add(handle);

      const seatPad = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 1.25), hMat);
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

    const rimGeo = new THREE.RingGeometry(lakeRadius - 1.5, lakeRadius + 7, 64);
    rimGeo.rotateX(-Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.85 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(-80, 0.06, -80);
    this.scene.add(rim);

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 });
    for (let i = 0; i < 35; i++) {
      const angle = (i / 35) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
      // Leave gap near the pier entrance
      if (Math.abs(angle - 0.0) < 0.25) continue;
      const rad = lakeRadius + (Math.random() - 0.5) * 5;
      const rx = -80 + Math.cos(angle) * rad;
      const rz = -80 + Math.sin(angle) * rad;
      const rockGeo = new THREE.DodecahedronGeometry(0.7 + Math.random() * 0.8, 1);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(rx, this.getTerrainHeightOnly(rx, rz) + 0.3, rz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      this.scene.add(rock);
      this.registerObstacle({ type: 'rock', x: rx, z: rz, radius: 1.35, height: 1.8 });
    }

    // Wooden Pier with Posts, Glowing Lanterns & Walkable Surface
    const pierPos = new THREE.Vector3(-44, 0.35, -80);
    const pierRotY = 0.28;
    const pierGroup = new THREE.Group();
    pierGroup.position.copy(pierPos);
    pierGroup.rotation.y = pierRotY;

    const deckGeo = new THREE.BoxGeometry(6, 0.35, 24);
    const deckMat = new THREE.MeshStandardMaterial({ map: this.textures.wood, roughness: 0.7 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.castShadow = true;
    deck.receiveShadow = true;
    pierGroup.add(deck);

    const postMat = new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 });
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b, emissive: 0xffeb3b, emissiveIntensity: 1.0 });

    [-2.8, 2.8].forEach(x => {
      [-10, -3.3, 3.3, 10].forEach(z => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.2, 8), postMat);
        post.position.set(x, -0.3, z);
        post.castShadow = true;
        pierGroup.add(post);

        const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), lanternMat);
        lantern.position.set(x, 1.95, z);
        pierGroup.add(lantern);

        const worldPost = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), pierRotY).add(pierPos);
        this.registerObstacle({
          type: 'pier_post',
          x: worldPost.x,
          z: worldPost.z,
          radius: 0.32,
          yMin: -2.0,
          yMax: 2.5
        });
      });
    });

    this.scene.add(pierGroup);

    // Register Pier as walkable elevated deck
    this.elevatedSurfaces.push({
      type: 'pier',
      x: pierPos.x,
      z: pierPos.z,
      rotY: pierRotY,
      halfW: 3.1,
      halfD: 12.1,
      getHeight: () => pierPos.y + 0.18
    });

    this.buildToyBoat(new THREE.Vector3(-80, 0, -65));
  }

  // IMPROVED: Detailed Cyber Speedboat with Bow, Cabin, Windshield & Motor
  buildToyBoat(pos) {
    const boatGroup = new THREE.Group();
    boatGroup.position.copy(pos);

    const hullMat = new THREE.MeshStandardMaterial({ color: 0xff1744, roughness: 0.25, metalness: 0.3 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b0ff,
      emissiveIntensity: 0.35,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.78
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });

    // Main hull body
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.75, 3.6), hullMat);
    hull.position.set(0, 0.22, -0.3);
    hull.castShadow = true;
    boatGroup.add(hull);

    // Pointed Bow (Proa en punta)
    const bowGeo = new THREE.ConeGeometry(1.77, 1.8, 4);
    bowGeo.rotateX(Math.PI / 2);
    bowGeo.rotateZ(Math.PI / 4);
    const bow = new THREE.Mesh(bowGeo, hullMat);
    bow.scale.set(1.0, 0.42, 1.0);
    bow.position.set(0, 0.22, 2.4);
    bow.castShadow = true;
    boatGroup.add(bow);

    // White upper deck trim
    const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 3.4), deckMat);
    upperDeck.position.set(0, 0.62, -0.3);
    boatGroup.add(upperDeck);

    // Cabin & Angled Windshield
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.75, 1.8), deckMat);
    cabin.position.set(0, 1.0, -0.4);
    cabin.castShadow = true;
    boatGroup.add(cabin);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.55, 0.85), glassMat);
    windshield.position.set(0, 0.98, 0.6);
    windshield.rotation.x = -0.45;
    boatGroup.add(windshield);

    // Outboard engine at stern
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.6), darkMat);
    motor.position.set(0, 0.45, -2.25);
    boatGroup.add(motor);

    // Glowing Cyber Antenna
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.9 })
    );
    antenna.position.set(0, 1.9, -0.6);
    boatGroup.add(antenna);

    this.scene.add(boatGroup);
    this.toyBoat = boatGroup;
    this.registerObstacle({
      type: 'toy_boat',
      x: pos.x,
      z: pos.z,
      radius: 2.3,
      yMin: -1.5,
      yMax: 2.2
    });
  }

  buildDetailedPlayground() {
    const playCenter = new THREE.Vector3(50, 0, 40);

    const floorGeo = new THREE.CylinderGeometry(42, 42, 0.12, 48);
    const floorMat = new THREE.MeshStandardMaterial({ map: this.textures.tartan, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.copy(playCenter);
    floor.position.y = this.getTerrainHeightOnly(50, 40) + 0.06;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.buildCyberDoghouse(new THREE.Vector3(72, 0, 52));
    this.buildTrampoline(new THREE.Vector3(38, 0, 22));
    this.buildCarousel(new THREE.Vector3(62, 0, 26));
    this.buildSoccerGoal(new THREE.Vector3(25, 0, 40));
    this.buildDiscoPad(new THREE.Vector3(52, 0, 56));

    // FIXED: Agility A-Frame / Grounded Ramp with Support Pillars & Side Curbs
    const rampCenter = new THREE.Vector3(45, 0, 45);
    const rampBaseY = this.getTerrainHeightOnly(rampCenter.x, rampCenter.z);
    const rampLen = 12.0;
    const rampWidth = 4.6;
    const rampAngle = 0.22; // ~12.6 deg climb
    const rampMidY = Math.sin(rampAngle) * (rampLen * 0.5);
    const rampTopY = Math.sin(rampAngle) * rampLen;

    const rampGroup = new THREE.Group();
    rampGroup.position.set(rampCenter.x, rampBaseY, rampCenter.z);

    const rampSlope = new THREE.Group();
    rampSlope.position.set(0, rampMidY, 0);
    rampSlope.rotation.x = -rampAngle; // Low at +Z, climbs toward -Z

    const rampMat = new THREE.MeshStandardMaterial({ color: 0xff9800, roughness: 0.45 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.6 });
    const supportMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });

    const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(rampWidth, 0.28, rampLen), rampMat);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    rampSlope.add(rampMesh);

    // Side safety curbs
    [-rampWidth * 0.5 + 0.12, rampWidth * 0.5 - 0.12].forEach(cx => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, rampLen), curbMat);
      curb.position.set(cx, 0.2, 0);
      rampSlope.add(curb);
    });

    // Non-slip grip strips
    for (let s = -5.2; s <= 5.2; s += 1.4) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(rampWidth - 0.5, 0.08, 0.24), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      strip.position.set(0, 0.16, s);
      rampSlope.add(strip);
    }
    rampGroup.add(rampSlope);

    // Support pillars under the raised (-Z) and middle sections of the ramp so it never floats
    [-rampWidth * 0.42, rampWidth * 0.42].forEach(px => {
      [-rampLen * 0.42, 0].forEach(pz => {
        const t = 0.5 - (pz / rampLen);
        const h = Math.max(0.3, t * rampTopY);
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, h, 10), supportMat);
        pillar.position.set(px, h * 0.5, pz);
        pillar.castShadow = true;
        rampGroup.add(pillar);
      });
    });

    this.scene.add(rampGroup);

    // Register Ramp as walkable inclined surface
    this.elevatedSurfaces.push({
      type: 'ramp',
      x: rampCenter.x,
      z: rampCenter.z,
      rotY: 0,
      halfW: rampWidth * 0.5,
      halfD: rampLen * 0.5,
      getHeight: (localX, localZ) => {
        const t = 0.5 - (localZ / rampLen);
        if (t < 0 || t > 1) return null;
        return rampBaseY + t * rampTopY + 0.18;
      }
    });

    // FIXED: Pulsing Agility Hoops with proper dual side-base stands (no pole piercing center)
    this.agilityHoops = [];
    const ringColors = [0x00e5ff, 0xff4081, 0x76ff03];
    const standMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.7, roughness: 0.3 });

    [-10, 0, 10].forEach((offset, idx) => {
      const hx = 36;
      const hz = 26 + offset;
      const groundY = this.getTerrainHeightOnly(hx, hz);

      const hoopGroup = new THREE.Group();
      hoopGroup.position.set(hx, groundY, hz);
      hoopGroup.rotation.y = 0.3;

      const color = ringColors[idx % ringColors.length];
      const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.95 });
      const hoopMesh = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.14, 16, 32), ringMat);
      hoopMesh.position.y = 2.1;
      hoopGroup.add(hoopMesh);

      // Left & Right side support legs holding the hoop
      [-1.75, 1.75].forEach(lx => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.1, 10), standMat);
        leg.position.set(lx, 1.05, 0);
        leg.castShadow = true;
        hoopGroup.add(leg);
      });

      const baseBar = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.45), standMat);
      baseBar.position.y = 0.06;
      hoopGroup.add(baseBar);

      this.scene.add(hoopGroup);
      this.agilityHoops.push({ mesh: hoopMesh, baseColor: color });
    });

    // FIXED: Crawl Agility Tunnel properly arched over the ground (U-arch facing downward) + Side Colliders
    const tunnelPos = new THREE.Vector3(56, this.getTerrainHeightOnly(56, 24), 24);
    const tunnelRotY = -0.55;
    const tunnelGroup = new THREE.Group();
    tunnelGroup.position.copy(tunnelPos);
    tunnelGroup.rotation.y = tunnelRotY;

    const tunnelGeo = new THREE.CylinderGeometry(2.2, 2.2, 10, 24, 1, true, 0, Math.PI);
    tunnelGeo.rotateZ(Math.PI / 2); // Aligns cylinder axis along X, arch facing +Y (upward)
    tunnelGeo.rotateY(Math.PI / 2); // Aligns tunnel axis along local Z

    const tunnelMat = new THREE.MeshStandardMaterial({
      color: 0x7c4dff,
      roughness: 0.4,
      metalness: 0.2,
      side: THREE.DoubleSide
    });
    const tunnelMesh = new THREE.Mesh(tunnelGeo, tunnelMat);
    tunnelMesh.castShadow = true;
    tunnelMesh.receiveShadow = true;
    tunnelGroup.add(tunnelMesh);

    // Neon entry & exit arch ribs
    const archRibMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.85 });
    [-4.9, 0, 4.9].forEach(tz => {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(2.22, 0.1, 12, 24, Math.PI), archRibMat);
      rib.position.set(0, 0, tz);
      tunnelGroup.add(rib);
    });

    this.scene.add(tunnelGroup);

    // Left & Right wall colliders for the playground crawl tunnel
    [-2.15, 2.15].forEach(wallX => {
      const worldWall = new THREE.Vector3(wallX, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), tunnelRotY).add(tunnelPos);
      this.registerObstacle({
        type: 'playground_tunnel_wall',
        shape: 'box',
        x: worldWall.x,
        z: worldWall.z,
        halfW: 0.25,
        halfD: 5.0,
        rotY: tunnelRotY,
        height: 2.2
      });
    });

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
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    trampGroup.position.set(pos.x, baseY, pos.z);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.8, roughness: 0.3 });
    const frame = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.24, 16, 32), frameMat);
    frame.rotation.x = Math.PI / 2;
    frame.position.y = 1.0;
    frame.castShadow = true;
    trampGroup.add(frame);

    const matGeo = new THREE.CylinderGeometry(3.4, 3.4, 0.12, 32);
    const canvasMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.55,
      roughness: 0.4
    });
    const bouncer = new THREE.Mesh(matGeo, canvasMat);
    bouncer.position.y = 0.96;
    bouncer.receiveShadow = true;
    trampGroup.add(bouncer);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.0, 10), frameMat);
      leg.position.set(Math.cos(a) * 3.4, 0.5, Math.sin(a) * 3.4);
      leg.castShadow = true;
      trampGroup.add(leg);
    }

    this.scene.add(trampGroup);
    this.trampoline = { group: trampGroup, position: pos, radius: 3.5 };
  }

  buildCarousel(pos) {
    const carGroup = new THREE.Group();
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    carGroup.position.set(pos.x, baseY, pos.z);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 32), baseMat);
    base.position.y = 0.12;
    base.receiveShadow = true;
    carGroup.add(base);

    const rotorGroup = new THREE.Group();
    rotorGroup.position.y = 0.32;
    carGroup.add(rotorGroup);

    const platformMat = new THREE.MeshStandardMaterial({
      color: 0xff4081,
      roughness: 0.35,
      metalness: 0.2
    });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.16, 32), platformMat);
    platform.receiveShadow = true;
    rotorGroup.add(platform);

    const centerPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 2.8, 16),
      new THREE.MeshStandardMaterial({ color: 0xffeb3b, metalness: 0.5, roughness: 0.3 })
    );
    centerPole.position.y = 1.4;
    centerPole.castShadow = true;
    rotorGroup.add(centerPole);

    const topCap = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 0.7, 16),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.6 })
    );
    topCap.position.y = 3.0;
    rotorGroup.add(topCap);

    // 4 Grab handles with vertical support struts connecting them to the carousel deck
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.7 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const hx = Math.cos(a) * 2.5;
      const hz = Math.sin(a) * 2.5;

      const bar = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 12, 24), handleMat);
      bar.position.set(hx, 0.95, hz);
      bar.rotation.y = -a;
      rotorGroup.add(bar);

      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), baseMat);
      strut.position.set(hx, 0.45, hz);
      rotorGroup.add(strut);
    }

    this.scene.add(carGroup);
    this.carousel = { rotor: rotorGroup, position: pos, radius: 4.0 };
    this.registerObstacle({ type: 'carousel_mast', x: pos.x, z: pos.z, radius: 0.55, height: 3.2 });
  }

  // FIXED: Open-Front Soccer Goal with 4-sided Net & True 3-Wall Box Colliders
  buildSoccerGoal(pos) {
    const goalGroup = new THREE.Group();
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    goalGroup.position.set(pos.x, baseY, pos.z);
    // Opens toward +X (toward playground center at x=50)
    goalGroup.rotation.y = Math.PI / 2;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.3 });
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      wireframe: true,
      transparent: true,
      opacity: 0.55
    });

    const width = 7.0;
    const height = 3.4;
    const depth = 3.0;
    const hw = width * 0.5;

    // Front posts & crossbar
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, height, 12), frameMat);
    postL.position.set(-hw, height * 0.5, 0);
    postL.castShadow = true;

    const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, height, 12), frameMat);
    postR.position.set(hw, height * 0.5, 0);
    postR.castShadow = true;

    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, width + 0.24, 12), frameMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, height, 0);
    crossbar.castShadow = true;

    // Back support frame
    const backPostL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, height, 10), frameMat);
    backPostL.position.set(-hw, height * 0.5, -depth);
    const backPostR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, height, 10), frameMat);
    backPostR.position.set(hw, height * 0.5, -depth);
    const backTopBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, width, 10), frameMat);
    backTopBar.rotation.z = Math.PI / 2;
    backTopBar.position.set(0, height, -depth);

    [-hw, hw].forEach(sx => {
      const topSideBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, depth, 10), frameMat);
      topSideBar.rotation.x = Math.PI / 2;
      topSideBar.position.set(sx, height, -depth * 0.5);

      const bottomSideBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, depth, 10), frameMat);
      bottomSideBar.rotation.x = Math.PI / 2;
      bottomSideBar.position.set(sx, 0.08, -depth * 0.5);
      goalGroup.add(topSideBar, bottomSideBar);
    });

    // 4 Open-Front Net Panels (Back, Top, Left, Right - NO front blocking face!)
    const netBack = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 14, 7), netMat);
    netBack.position.set(0, height * 0.5, -depth);

    const netTop = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 14, 6), netMat);
    netTop.rotation.x = Math.PI / 2;
    netTop.position.set(0, height, -depth * 0.5);

    const netLeft = new THREE.Mesh(new THREE.PlaneGeometry(depth, height, 6, 7), netMat);
    netLeft.rotation.y = Math.PI / 2;
    netLeft.position.set(-hw, height * 0.5, -depth * 0.5);

    const netRight = new THREE.Mesh(new THREE.PlaneGeometry(depth, height, 6, 7), netMat);
    netRight.rotation.y = -Math.PI / 2;
    netRight.position.set(hw, height * 0.5, -depth * 0.5);

    goalGroup.add(postL, postR, crossbar, backPostL, backPostR, backTopBar, netBack, netTop, netLeft, netRight);
    this.scene.add(goalGroup);

    this.soccerGoal = {
      position: pos,
      width,
      depth,
      height
    };

    // Accurate Colliders: Front posts + Left/Right/Back net walls
    this.registerObstacle({ type: 'goal_post_l', x: pos.x, z: pos.z - hw, radius: 0.25, height });
    this.registerObstacle({ type: 'goal_post_r', x: pos.x, z: pos.z + hw, radius: 0.25, height });
    this.registerObstacle({ type: 'goal_net_back', shape: 'box', x: pos.x - depth, z: pos.z, halfW: 0.2, halfD: hw, height });
    this.registerObstacle({ type: 'goal_net_side_n', shape: 'box', x: pos.x - depth * 0.5, z: pos.z - hw, halfW: depth * 0.5, halfD: 0.2, height });
    this.registerObstacle({ type: 'goal_net_side_s', shape: 'box', x: pos.x - depth * 0.5, z: pos.z + hw, halfW: depth * 0.5, halfD: 0.2, height });
  }

  // FIXED: Disco Pad with Cyber Truss Arch holding the Mirror Ball (no longer floating in mid-air)
  buildDiscoPad(pos) {
    const padGroup = new THREE.Group();
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    padGroup.position.set(pos.x, baseY, pos.z);

    this.discoTiles = [];
    const tileColors = [0xff1744, 0x00e5ff, 0x76ff03, 0xffea00, 0xd500f9, 0xff9100];

    // Dark base frame
    const frameBase = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.1, 6.6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8, roughness: 0.3 })
    );
    frameBase.position.y = 0.05;
    padGroup.add(frameBase);

    for (let x = -2; x <= 1; x++) {
      for (let z = -2; z <= 1; z++) {
        const col = tileColors[Math.floor(Math.random() * tileColors.length)];
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.25,
          roughness: 0.2
        });
        const tile = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 1.4), mat);
        tile.position.set(x * 1.5 + 0.75, 0.1, z * 1.5 + 0.75);
        padGroup.add(tile);
        this.discoTiles.push(tile);
      }
    }

    // 4 Corner Truss Pillars + Overhead Crossbeams holding the Disco Mirror Ball
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.2 });
    const cornerOffset = 3.15;
    const trussHeight = 5.0;

    [[-cornerOffset, -cornerOffset], [cornerOffset, -cornerOffset], [-cornerOffset, cornerOffset], [cornerOffset, cornerOffset]].forEach(([cx, cz]) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, trussHeight, 10), trussMat);
      pillar.position.set(cx, trussHeight * 0.5, cz);
      pillar.castShadow = true;
      padGroup.add(pillar);

      this.registerObstacle({
        type: 'disco_pillar',
        x: pos.x + cx,
        z: pos.z + cz,
        radius: 0.25,
        height: trussHeight
      });
    });

    // Overhead diagonal roof beams & hanging cable
    const diagLen = cornerOffset * 2 * Math.SQRT2;
    [Math.PI / 4, -Math.PI / 4].forEach(rot => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(diagLen, 0.14, 0.14), trussMat);
      beam.position.set(0, trussHeight, 0);
      beam.rotation.y = rot;
      padGroup.add(beam);
    });

    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), trussMat);
    cable.position.set(0, trussHeight - 0.4, 0);
    padGroup.add(cable);

    const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.95, roughness: 0.08 });
    const discoBall = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 20), ballMat);
    discoBall.position.set(0, trussHeight - 0.95, 0);
    padGroup.add(discoBall);
    this.discoBall = discoBall;

    this.scene.add(padGroup);
    this.discoPad = { position: pos, radius: 3.5 };
  }

  // FIXED: Hollow Cyber Doghouse with real walls, open doorway, and visible interior pad
  buildCyberDoghouse(pos) {
    const houseGroup = new THREE.Group();
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    houseGroup.position.set(pos.x, baseY, pos.z);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.45 });
    const interiorFloorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.3 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.6 });
    const neonTrimMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.85 });

    const w = 6.4;
    const h = 4.6;
    const d = 6.4;
    const wallT = 0.4;

    // Base floor slab
    const floorSlab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), interiorFloorMat);
    floorSlab.position.y = 0.08;
    floorSlab.receiveShadow = true;
    houseGroup.add(floorSlab);

    // Back wall (-Z)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), wallMat);
    backWall.position.set(0, h * 0.5, -d * 0.5 + wallT * 0.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    houseGroup.add(backWall);

    // Left wall (-X) & Right wall (+X)
    [-w * 0.5 + wallT * 0.5, w * 0.5 - wallT * 0.5].forEach(wx => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d), wallMat);
      sideWall.position.set(wx, h * 0.5, 0);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      houseGroup.add(sideWall);
    });

    // Front wall left & right pillars (+Z) leaving a real 3.0m wide open doorway in the center
    const doorWidth = 3.0;
    const doorHeight = 3.4;
    const pillarWidth = (w - doorWidth) * 0.5;
    [-w * 0.5 + pillarWidth * 0.5, w * 0.5 - pillarWidth * 0.5].forEach(px => {
      const frontPillar = new THREE.Mesh(new THREE.BoxGeometry(pillarWidth, h, wallT), wallMat);
      frontPillar.position.set(px, h * 0.5, d * 0.5 - wallT * 0.5);
      frontPillar.castShadow = true;
      houseGroup.add(frontPillar);
    });

    // Front top lintel above doorway
    const lintelH = h - doorHeight;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, lintelH, wallT), wallMat);
    lintel.position.set(0, doorHeight + lintelH * 0.5, d * 0.5 - wallT * 0.5);
    lintel.castShadow = true;
    houseGroup.add(lintel);

    // Neon doorway frame strips
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.2, 0.12, wallT + 0.08), neonTrimMat);
    frameTop.position.set(0, doorHeight, d * 0.5 - wallT * 0.5);
    houseGroup.add(frameTop);

    [-doorWidth * 0.5, doorWidth * 0.5].forEach(dx => {
      const frameSide = new THREE.Mesh(new THREE.BoxGeometry(0.12, doorHeight, wallT + 0.08), neonTrimMat);
      frameSide.position.set(dx, doorHeight * 0.5, d * 0.5 - wallT * 0.5);
      houseGroup.add(frameSide);
    });

    // Glowing Recharge Pad clearly visible inside the hollow house
    const padMat = new THREE.MeshStandardMaterial({ color: 0x22ff88, emissive: 0x22ff88, emissiveIntensity: 0.9 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.95, 0.14, 28), padMat);
    pad.position.set(0, 0.2, 0);
    houseGroup.add(pad);

    // Pyramidal Roof properly seated on top of the walls (y = 4.6)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.4, 4), roofMat);
    roof.rotateY(Math.PI / 4);
    roof.position.y = h + 1.2;
    roof.castShadow = true;
    houseGroup.add(roof);

    // Glowing Sign on Front Lintel
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 0.18), neonTrimMat);
    sign.position.set(0, h - 0.55, d * 0.5 + 0.05);
    houseGroup.add(sign);

    this.scene.add(houseGroup);

    // Colliders for Back, Left, Right walls and Front doorway pillars
    this.registerObstacle({ type: 'doghouse_wall_back', shape: 'box', x: pos.x, z: pos.z - d * 0.5 + wallT * 0.5, halfW: w * 0.5, halfD: wallT * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_wall_left', shape: 'box', x: pos.x - w * 0.5 + wallT * 0.5, z: pos.z, halfW: wallT * 0.5, halfD: d * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_wall_right', shape: 'box', x: pos.x + w * 0.5 - wallT * 0.5, z: pos.z, halfW: wallT * 0.5, halfD: d * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_pillar_l', shape: 'box', x: pos.x - w * 0.5 + pillarWidth * 0.5, z: pos.z + d * 0.5 - wallT * 0.5, halfW: pillarWidth * 0.5, halfD: wallT * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_pillar_r', shape: 'box', x: pos.x + w * 0.5 - pillarWidth * 0.5, z: pos.z + d * 0.5 - wallT * 0.5, halfW: pillarWidth * 0.5, halfD: wallT * 0.5, height: h });
  }

  // --- HIGH-TECH ATTRACTIONS ---
  buildCyberBallPit(pos) {
    const pitGroup = new THREE.Group();
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    pitGroup.position.set(pos.x, groundY, pos.z);

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

    const floor = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.2, 7.2), padMat);
    floor.position.y = 0.1;
    floor.receiveShadow = true;
    pitGroup.add(floor);

    const wallGeoX = new THREE.BoxGeometry(7.4, 0.65, 0.35);
    const wallGeoZ = new THREE.BoxGeometry(0.35, 0.65, 7.4);

    const wallN = new THREE.Mesh(wallGeoX, rimMat); wallN.position.set(0, 0.35, -3.5);
    const wallS = new THREE.Mesh(wallGeoX, rimMat); wallS.position.set(0, 0.35, 3.5);
    const wallW = new THREE.Mesh(wallGeoZ, rimMat); wallW.position.set(-3.5, 0.35, 0);
    const wallE = new THREE.Mesh(wallGeoZ, rimMat); wallE.position.set(3.5, 0.35, 0);
    pitGroup.add(wallN, wallS, wallW, wallE);

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
      const ry = 0.28 + Math.random() * 0.28;
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

    // Low step-over rim walls (yMax allows jumping in/out smoothly)
    this.registerObstacle({ type: 'ballpit_wall_n', shape: 'box', x: pos.x, z: pos.z - 3.5, halfW: 3.6, halfD: 0.25, yMin: groundY, yMax: groundY + 0.55 });
    this.registerObstacle({ type: 'ballpit_wall_s', shape: 'box', x: pos.x, z: pos.z + 3.5, halfW: 3.6, halfD: 0.25, yMin: groundY, yMax: groundY + 0.55 });
    this.registerObstacle({ type: 'ballpit_wall_w', shape: 'box', x: pos.x - 3.5, z: pos.z, halfW: 0.25, halfD: 3.6, yMin: groundY, yMax: groundY + 0.55 });
    this.registerObstacle({ type: 'ballpit_wall_e', shape: 'box', x: pos.x + 3.5, z: pos.z, halfW: 0.25, halfD: 3.6, yMin: groundY, yMax: groundY + 0.55 });
  }

  // FIXED: Agility Slide with accurate downward slope (+0.52 rad), ladder rails & safety handrails
  buildAgilitySlide(pos) {
    const slideGroup = new THREE.Group();
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    slideGroup.position.set(pos.x, groundY, pos.z);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.2 });
    const neonCyan = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.75 });
    const chuteMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.15, metalness: 0.4 });

    const platformH = 4.0;

    // 4 Support Pillars
    [-1.2, 1.2].forEach(px => {
      [-1.2, 1.2].forEach(pz => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, platformH + 0.8, 12), metalMat);
        pillar.position.set(px, (platformH + 0.8) * 0.5, pz);
        pillar.castShadow = true;
        slideGroup.add(pillar);
      });
    });

    // Top Platform Deck
    const topFloor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.6), metalMat);
    topFloor.position.set(0, platformH, 0);
    topFloor.castShadow = true;
    slideGroup.add(topFloor);

    // Top Safety Railings (Left & Right)
    [-1.2, 1.2].forEach(rx => {
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 2.5), neonCyan);
      topRail.position.set(rx, platformH + 0.8, 0);
      slideGroup.add(topRail);
    });

    // Back Ladder with side stringers (largueros) & rungs
    [-0.85, 0.85].forEach(lx => {
      const stringer = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, platformH + 0.4, 10), metalMat);
      stringer.position.set(lx, (platformH + 0.4) * 0.5, -1.25);
      slideGroup.add(stringer);
    });

    for (let s = 0.45; s < platformH; s += 0.52) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 10), neonCyan);
      step.rotation.z = Math.PI / 2;
      step.position.set(0, s, -1.25);
      slideGroup.add(step);
    }

    // FIXED: Chute Ramp sloping DOWNWARD from (0, 4.0, 1.25) to (0, 0.22, 7.8)
    const startY = platformH;
    const endY = 0.22;
    const startZ = 1.2;
    const endZ = 7.8;
    const dy = startY - endY;
    const dz = endZ - startZ;
    const chuteLength = Math.hypot(dy, dz);
    const chuteAngle = Math.atan2(dy, dz); // Positive X rotation slopes downward toward +Z!

    const chutePivot = new THREE.Group();
    chutePivot.position.set(0, (startY + endY) * 0.5, (startZ + endZ) * 0.5);
    chutePivot.rotation.x = chuteAngle;

    const chuteBed = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, chuteLength), chuteMat);
    chuteBed.castShadow = true;
    chutePivot.add(chuteBed);

    // U-shaped Chute Side Walls & Glowing Top Rails
    [-0.82, 0.82].forEach(rx => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, chuteLength), chuteMat);
      sideWall.position.set(rx, 0.18, 0);
      chutePivot.add(sideWall);

      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, chuteLength, 10), neonCyan);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(rx, 0.38, 0);
      chutePivot.add(rail);
    });

    slideGroup.add(chutePivot);

    // Landing Foam Cushion at bottom end
    const cushion = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.24, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xffea00, roughness: 0.6 })
    );
    cushion.position.set(0, 0.12, 8.2);
    cushion.receiveShadow = true;
    slideGroup.add(cushion);

    this.scene.add(slideGroup);

    this.slide = {
      position: pos,
      topPos: new THREE.Vector3(pos.x, groundY + platformH + 0.2, pos.z),
      endPos: new THREE.Vector3(pos.x, groundY + 0.25, pos.z + 8.2),
      platformH
    };

    this.registerObstacle({ type: 'slide_tower', shape: 'box', x: pos.x, z: pos.z, halfW: 1.35, halfD: 1.35, height: platformH });
    this.registerObstacle({ type: 'slide_chute', shape: 'box', x: pos.x, z: pos.z + 4.5, halfW: 0.95, halfD: 3.2, height: 2.2 });
  }

  buildAgilityObstacleCourse(pos) {
    const courseGroup = new THREE.Group();
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    courseGroup.position.set(pos.x, groundY, pos.z);

    const neonYellow = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffea00, emissiveIntensity: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 });

    // 1. Agility Tunnel
    const tunnelGroup = new THREE.Group();
    tunnelGroup.position.set(0, 1.05, 0);

    const ribGeo = new THREE.TorusGeometry(1.08, 0.07, 12, 24);
    for (let tz = -3.0; tz <= 3.0; tz += 1.0) {
      const rib = new THREE.Mesh(ribGeo, neonYellow);
      rib.position.set(0, 0, tz);
      tunnelGroup.add(rib);
    }

    const tubeGeo = new THREE.CylinderGeometry(1.04, 1.04, 6.2, 24, 1, true);
    tubeGeo.rotateX(Math.PI / 2);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tunnelGroup.add(tube);
    courseGroup.add(tunnelGroup);

    // Side wall colliders so the dog goes through the tunnel opening
    [-1.1, 1.1].forEach(wx => {
      this.registerObstacle({
        type: 'agility_tunnel_side',
        shape: 'box',
        x: pos.x + wx,
        z: pos.z,
        halfW: 0.18,
        halfD: 3.1,
        height: 2.1
      });
    });

    // 2. Three Jump Hurdles (with vertical clearance so jumping dogs pass over them)
    this.hurdles = [];
    [6.0, 10.0, 14.0].forEach((hz) => {
      const hurdleGroup = new THREE.Group();
      hurdleGroup.position.set(0, 0, hz);

      [-1.3, 1.3].forEach(hx => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.1, 10), metalMat);
        post.position.set(hx, 0.55, 0);
        post.castShadow = true;
        hurdleGroup.add(post);

        this.registerObstacle({
          type: 'hurdle_post',
          x: pos.x + hx,
          z: pos.z + hz,
          radius: 0.18,
          height: 1.1
        });
      });

      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 12), neonYellow);
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

  // FIXED: Cyber Target Toss with stepped ring thicknesses (zero Z-fighting) & full frame up to Scoreboard
  buildCyberTargetToss(pos) {
    const targetGroup = new THREE.Group();
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    targetGroup.position.set(pos.x, groundY, pos.z);

    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });
    const neonFrameMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.8 });

    // Stand Legs extending all the way up to the overhead scoreboard (y = 5.8)
    [-2.2, 2.2].forEach(sx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 5.9, 12), chromeMat);
      leg.position.set(sx, 2.95, 0);
      leg.castShadow = true;
      targetGroup.add(leg);
    });

    // Horizontal crossbar at target axle & top scoreboard mount
    const midBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5, 12), chromeMat);
    midBar.rotation.z = Math.PI / 2;
    midBar.position.set(0, 3.2, 0);
    targetGroup.add(midBar);

    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 12), chromeMat);
    topBar.rotation.z = Math.PI / 2;
    topBar.position.set(0, 5.8, 0);
    targetGroup.add(topBar);

    const targetRotor = new THREE.Group();
    targetRotor.position.set(0, 3.2, 0);

    // Stepped thicknesses (0.12, 0.18, 0.24) completely eliminate Z-fighting!
    const ringConfigs = [
      { r: 2.1, thickness: 0.12, col: 0x00e5ff, pts: 10 },
      { r: 1.35, thickness: 0.18, col: 0xffea00, pts: 25 },
      { r: 0.65, thickness: 0.24, col: 0xff1744, pts: 50 }
    ];

    ringConfigs.forEach(rc => {
      const ringMat = new THREE.MeshStandardMaterial({
        color: rc.col,
        emissive: rc.col,
        emissiveIntensity: 0.75,
        roughness: 0.2
      });
      const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(rc.r, rc.r, rc.thickness, 32), ringMat);
      ringMesh.rotateX(Math.PI / 2);
      targetRotor.add(ringMesh);
    });

    targetGroup.add(targetRotor);

    // Overhead Digital Score Billboard mounted on topBar
    const boardMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.85, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.3 })
    );
    boardMesh.position.set(0, 5.8, 0);
    targetGroup.add(boardMesh);

    const boardRim = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.95, 0.18), neonFrameMat);
    boardRim.position.set(0, 5.8, 0);
    targetGroup.add(boardRim);

    this.scene.add(targetGroup);

    this.targetBoard = {
      position: new THREE.Vector3(pos.x, groundY + 3.2, pos.z),
      rotor: targetRotor,
      radius: 2.1
    };

    this.registerObstacle({ type: 'target_post_l', x: pos.x - 2.2, z: pos.z, radius: 0.28, height: 5.9 });
    this.registerObstacle({ type: 'target_post_r', x: pos.x + 2.2, z: pos.z, radius: 0.28, height: 5.9 });
  }

  buildCyberPinata(pos) {
    const pinGroup = new THREE.Group();
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    pinGroup.position.set(pos.x, groundY, pos.z);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });

    const archTop = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 12), metalMat);
    archTop.rotation.z = Math.PI / 2;
    archTop.position.set(0, 4.2, 0);

    [-1.7, 1.7].forEach(ax => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 12), metalMat);
      post.position.set(ax, 2.1, 0);
      post.castShadow = true;
      pinGroup.add(post);
    });
    pinGroup.add(archTop);

    const pinataPivot = new THREE.Group();
    pinataPivot.position.set(0, 4.2, 0);

    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8), metalMat);
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
      { x: -3, z: -4, col: 0xffea00, rotY: -0.15 },
      { x: 3, z: 3, col: 0xff007f, rotY: 0.3 },
      { x: -2, z: 10, col: 0x22ff88, rotY: -0.2 },
      { x: 6, z: 16, col: 0xff9100, rotY: 0.25 }
    ];

    offsets.forEach((cfg, idx) => {
      const arch = new THREE.Group();
      const wx = pos.x + cfg.x;
      const wz = pos.z + cfg.z;
      const groundY = this.getTerrainHeightOnly(wx, wz);
      arch.position.set(cfg.x, groundY, cfg.z);
      arch.rotation.y = cfg.rotY;

      const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.2 });
      [-1.3, 1.3].forEach(px => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.8, 12), postMat);
        p.position.set(px, 0.9, 0);
        p.castShadow = true;
        arch.add(p);

        const worldPost = new THREE.Vector3(px, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), cfg.rotY).add(new THREE.Vector3(wx, groundY, wz));
        this.registerObstacle({
          type: 'slalom_post',
          x: worldPost.x,
          z: worldPost.z,
          radius: 0.2,
          height: 1.8
        });
      });

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

      const worldPos = new THREE.Vector3(wx, groundY + 1.6, wz);
      this.slalomRings.push({
        index: idx,
        position: worldPos,
        entryPos: new THREE.Vector3(wx - Math.sin(cfg.rotY) * 2.5, groundY, wz - Math.cos(cfg.rotY) * 2.5),
        centerPos: worldPos,
        exitPos: new THREE.Vector3(wx + Math.sin(cfg.rotY) * 2.5, groundY, wz + Math.cos(cfg.rotY) * 2.5),
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
      const gy = this.getTerrainHeightOnly(spot.x, spot.z);
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

  spawnCyberSnack(pos) {
    const snackGroup = new THREE.Group();
    snackGroup.position.copy(pos);
    snackGroup.position.y = this.getHeightAt(pos.x, pos.z) + 0.4;

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
    this.discoTimer = 12.0;
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
      const dist = 32 + Math.random() * 210;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Avoid Lake, Playground, Plaza, and Attraction footprints
      if (Math.hypot(x - (-80), z - (-80)) < 70) continue;
      if (Math.hypot(x - 50, z - 40) < 46) continue;
      if (Math.hypot(x - (-46), z - (-48)) < 14) continue;
      if (Math.hypot(x - (-32), z - 48) < 10) continue;
      if (Math.hypot(x - (-18), z - (-32)) < 12) continue;
      if (Math.hypot(x - 22, z - (-50)) < 16) continue;

      const treeGroup = new THREE.Group();
      treeGroup.position.set(x, this.getTerrainHeightOnly(x, z), z);

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

    // Wildflowers via InstancedMesh
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

      const y = this.getTerrainHeightOnly(x, z) + 0.16;
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
      const by = this.getTerrainHeightOnly(bx, bz) + 1.5 + Math.random() * 2.5;
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

  // Raw terrain height without elevated structures
  getTerrainHeightOnly(x, z) {
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

  // Unified height query including walkable Bridge, Pier, and Ramp surfaces!
  getHeightAt(x, z) {
    let y = this.getTerrainHeightOnly(x, z);

    for (let i = 0; i < this.elevatedSurfaces.length; i++) {
      const surf = this.elevatedSurfaces[i];
      const dx = x - surf.x;
      const dz = z - surf.z;
      const cos = Math.cos(-surf.rotY);
      const sin = Math.sin(-surf.rotY);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      if (Math.abs(localX) <= surf.halfW && Math.abs(localZ) <= surf.halfD) {
        const surfY = surf.getHeight(localX, localZ);
        if (surfY !== null && surfY > y) {
          y = surfY;
        }
      }
    }

    return y;
  }

  // Full 3D Volumetric Collision Resolution (Supports Cylinder + Rotated OBB Box + Surface Normals)
  resolveObstacleCollisions(pos, radius = 0.75, height = 1.0, outNormal = null) {
    let collided = false;
    const obstacles = this.getNearObstacles(pos.x, pos.z);
    const posY = pos.y;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];

      // Vertical 3D clearance: if the entity jumps over or passes below, skip horizontal pushout
      if (obs.yMin !== undefined && obs.yMax !== undefined) {
        if (posY + height < obs.yMin || posY > obs.yMax) {
          continue;
        }
      }

      if (obs.shape === 'box') {
        const dx = pos.x - obs.x;
        const dz = pos.z - obs.z;
        const rotY = obs.rotY || 0;
        const cos = Math.cos(-rotY);
        const sin = Math.sin(-rotY);

        // Transform position into Box Local Space
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;

        // Closest point on box to circle center in local space
        const clampedX = THREE.MathUtils.clamp(localX, -obs.halfW, obs.halfW);
        const clampedZ = THREE.MathUtils.clamp(localZ, -obs.halfD, obs.halfD);

        const diffX = localX - clampedX;
        const diffZ = localZ - clampedZ;
        const distSq = diffX * diffX + diffZ * diffZ;

        if (distSq < radius * radius) {
          collided = true;
          let pushLocalX = 0;
          let pushLocalZ = 0;
          let nxLocal = 0;
          let nzLocal = 0;

          if (distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const overlap = radius - dist;
            nxLocal = diffX / dist;
            nzLocal = diffZ / dist;
            pushLocalX = nxLocal * overlap;
            pushLocalZ = nzLocal * overlap;
          } else {
            // Center is inside the box: push out along shortest axis
            const penX = obs.halfW - Math.abs(localX) + radius;
            const penZ = obs.halfD - Math.abs(localZ) + radius;
            if (penX < penZ) {
              nxLocal = localX >= 0 ? 1 : -1;
              pushLocalX = nxLocal * penX;
            } else {
              nzLocal = localZ >= 0 ? 1 : -1;
              pushLocalZ = nzLocal * penZ;
            }
          }

          // Transform push vector back to World Space
          const cosW = Math.cos(rotY);
          const sinW = Math.sin(rotY);
          pos.x += pushLocalX * cosW - pushLocalZ * sinW;
          pos.z += pushLocalX * sinW + pushLocalZ * cosW;

          if (outNormal) {
            outNormal.set(
              nxLocal * cosW - nzLocal * sinW,
              0,
              nxLocal * sinW + nzLocal * cosW
            ).normalize();
          }
        }
      } else {
        const dx = pos.x - obs.x;
        const dz = pos.z - obs.z;
        const dist = Math.hypot(dx, dz);
        const minDist = (obs.radius || 0.8) + radius;

        if (dist < minDist && dist > 0.0001) {
          collided = true;
          const overlap = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          pos.x += nx * overlap;
          pos.z += nz * overlap;
          if (outNormal) outNormal.set(nx, 0, nz);
        }
      }
    }

    // World Boundary Clamping (238m radius circle around 0, 0)
    const distFromOrigin = Math.hypot(pos.x, pos.z);
    const maxWorldRadius = 238;
    if (distFromOrigin > maxWorldRadius) {
      collided = true;
      const factor = maxWorldRadius / distFromOrigin;
      pos.x *= factor;
      pos.z *= factor;
      if (outNormal) {
        outNormal.set(-pos.x / distFromOrigin, 0, -pos.z / distFromOrigin);
      }
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

    ball.velocity.x *= -1.1;
    ball.velocity.z *= -1.1;
    ball.velocity.y = 4.5;
  }

  update(delta) {
    this.waterTime += delta;
    if (this.waterMesh) {
      this.waterMesh.material.opacity = 0.86 + Math.sin(this.waterTime * 2.2) * 0.04;
    }

    this.clouds.forEach(c => {
      c.group.rotation.y += delta * 0.012 * c.speed;
    });

    if (this.ambientParticles) {
      this.ambientParticles.rotation.y += delta * 0.02;
    }

    if (this.targetBoard && this.targetBoard.rotor) {
      this.targetBoard.rotor.rotation.z += delta * 0.85;
    }

    if (this.pinata) {
      this.pinata.swingVel += (-this.pinata.swingAngle * 14) * delta;
      this.pinata.swingVel *= Math.exp(-2.2 * delta);
      this.pinata.swingAngle += this.pinata.swingVel * delta;
      this.pinata.pivot.rotation.z = this.pinata.swingAngle;
    }

    this.ballPitBalls.forEach(b => {
      b.mesh.position.y = b.localOrigin.y + Math.sin(this.waterTime * 3.0 + b.localOrigin.x) * 0.035;
      b.mesh.position.x = THREE.MathUtils.lerp(b.mesh.position.x, b.localOrigin.x, delta * 1.5);
      b.mesh.position.z = THREE.MathUtils.lerp(b.mesh.position.z, b.localOrigin.z, delta * 1.5);
    });

    if (this.toyBoat) {
      this.toyBoat.position.y = Math.sin(this.waterTime * 1.8) * 0.12;
      this.toyBoat.rotation.z = Math.sin(this.waterTime * 1.4) * 0.06;
      this.toyBoat.rotation.y += delta * 0.15;
    }

    if (this.carousel) {
      this.carouselAngle += delta * 1.2;
      this.carousel.rotor.rotation.y = this.carouselAngle;
    }

    if (this.discoPartyActive) {
      this.discoTimer -= delta;
      if (this.discoBall) this.discoBall.rotation.y += delta * 4;

      if (Math.floor(this.waterTime * 6) % 2 === 0) {
        roboAudio.playDanceBeat();
      }

      if (this.discoTiles) {
        this.discoTiles.forEach((tile, idx) => {
          tile.material.emissiveIntensity = 0.4 + Math.sin(this.waterTime * 10 + idx) * 0.6;
        });
      }

      if (this.discoTimer <= 0) {
        this.discoPartyActive = false;
        if (this.discoTiles) {
          this.discoTiles.forEach(tile => tile.material.emissiveIntensity = 0.25);
        }
      }
    }

    this.interactiveObjects.forEach(item => {
      if (item.type === 'bone') {
        item.object.rotation.y += delta * 1.2;
      }
    });

    this.butterflies.forEach(b => {
      b.phase += delta * b.speed;
      b.sprite.position.x = b.basePos.x + Math.sin(b.phase) * 3;
      b.sprite.position.z = b.basePos.z + Math.cos(b.phase * 0.7) * 3;
      b.sprite.position.y = b.basePos.y + Math.sin(b.phase * 2.5) * 0.6;
    });

    if (this.fountainWater) {
      this.fountainWater.rotation.z += delta * 0.75;
    }
    if (this.fountainJet) {
      this.fountainJet.scale.y = 1.0 + Math.sin(this.waterTime * 6.0) * 0.22;
    }

    if (this.seesaw) {
      this.seesaw.pivot.rotation.z = THREE.MathUtils.lerp(
        this.seesaw.pivot.rotation.z,
        this.seesaw.targetTilt,
        delta * 3.5
      );
    }

    // Update physical balls (Obstacle CCD + Ball-to-Ball Elastic Collisions + Goal & Target Checks)
    const hitNormal = new THREE.Vector3();
    this.balls.forEach(ball => {
      if (ball.carriedBy) return;

      const subSteps = 2;
      const subDelta = delta / subSteps;

      for (let step = 0; step < subSteps; step++) {
        ball.velocity.y -= 9.8 * subDelta;
        ball.mesh.position.addScaledVector(ball.velocity, subDelta);

        // Reflect velocity along obstacle surface normal
        const hitObstacle = this.resolveObstacleCollisions(ball.mesh.position, ball.radius, ball.radius * 2, hitNormal);
        if (hitObstacle) {
          const velDot = ball.velocity.x * hitNormal.x + ball.velocity.z * hitNormal.z;
          if (velDot < 0) {
            ball.velocity.x -= (1 + ball.bounciness) * velDot * hitNormal.x;
            ball.velocity.z -= (1 + ball.bounciness) * velDot * hitNormal.z;
          } else {
            ball.velocity.x *= -0.75;
            ball.velocity.z *= -0.75;
          }
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

      // Check Soccer Goal Collision
      if (ball.type === 'soccer' && this.soccerGoal) {
        const gx = this.soccerGoal.position.x;
        const gz = this.soccerGoal.position.z;
        const bx = ball.mesh.position.x;
        const bz = ball.mesh.position.z;

        if (bx < gx + 0.3 && bx > gx - this.soccerGoal.depth && Math.abs(bz - gz) < this.soccerGoal.width * 0.46 && ball.mesh.position.y < this.soccerGoal.height) {
          this.handleGoalScored(ball);
        }
      }

      // Check Cyber Target Toss Collision
      if (this.targetBoard) {
        const tx = this.targetBoard.position.x;
        const tz = this.targetBoard.position.z;
        const ty = this.targetBoard.position.y;
        const distXZ = Math.hypot(ball.mesh.position.x - tx, ball.mesh.position.z - tz);
        const distY = Math.abs(ball.mesh.position.y - ty);

        if (distXZ < this.targetBoard.radius && distY < 2.2) {
          const hitRadius = Math.hypot(ball.mesh.position.x - tx, ball.mesh.position.y - ty);
          let pts = 10;
          if (hitRadius < 0.65) pts = 50;
          else if (hitRadius < 1.35) pts = 25;
          this.handleTargetHit(pts, ball);
        }
      }
    });

    // Ball-to-Ball Elastic Collisions
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const b1 = this.balls[i];
        const b2 = this.balls[j];
        if (b1.carriedBy || b2.carriedBy) continue;

        const diff = new THREE.Vector3().subVectors(b2.mesh.position, b1.mesh.position);
        const dist = diff.length();
        const minDist = b1.radius + b2.radius;

        if (dist < minDist && dist > 0.001) {
          const normal = diff.divideScalar(dist);
          const overlap = minDist - dist;
          b1.mesh.position.addScaledVector(normal, -overlap * 0.5);
          b2.mesh.position.addScaledVector(normal, overlap * 0.5);

          const relVel = new THREE.Vector3().subVectors(b2.velocity, b1.velocity);
          const sepVel = relVel.dot(normal);
          if (sepVel < 0) {
            const impulse = -(1 + 0.8) * sepVel / (1 / b1.mass + 1 / b2.mass);
            b1.velocity.addScaledVector(normal, -impulse / b1.mass);
            b2.velocity.addScaledVector(normal, impulse / b2.mass);
          }
        }
      }
    }

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

    // Lake Swimming & Drying Shake-Off (Respects elevated Pier & Bridge!)
    const lakeDx = rPos.x - (-80);
    const lakeDz = rPos.z - (-80);
    const distToLake = Math.hypot(lakeDx, lakeDz);
    const surfaceY = this.getHeightAt(rPos.x, rPos.z);

    if (distToLake < 58.0 && surfaceY < -0.1) {
      robot.isInWater = true;
      rPos.y = -0.52;

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
      } else {
        this.seesaw.targetTilt = THREE.MathUtils.lerp(this.seesaw.targetTilt, 0, 0.05);
      }
    }

    // 3. Trampoline Bounce
    if (this.trampoline) {
      const dist = Math.hypot(rPos.x - this.trampoline.position.x, rPos.z - this.trampoline.position.z);
      if (dist < 2.8 && (!robot.lastTrampTime || Date.now() - robot.lastTrampTime > 1200)) {
        robot.lastTrampTime = Date.now();
        robot.trampConsecutiveHits = ((robot.trampConsecutiveHits || 0) % 4) + 1;
        const bounceForce = 2.0 + robot.trampConsecutiveHits * 0.7;
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
      if (dist < 3.6 && dist > 0.6) {
        const a = Math.atan2(rPos.z - this.carousel.position.z, rPos.x - this.carousel.position.x);
        const newA = a + 0.02;
        rPos.x = this.carousel.position.x + Math.cos(newA) * dist;
        rPos.z = this.carousel.position.z + Math.sin(newA) * dist;
        robot.group.rotation.y += 0.02;
      }
    }

    // 5. Cyber Ball Pit Splash Interaction
    if (this.ballPit) {
      const bDist = Math.hypot(rPos.x - this.ballPit.position.x, rPos.z - this.ballPit.position.z);
      if (bDist < 3.2) {
        const relX = rPos.x - this.ballPit.position.x;
        const relZ = rPos.z - this.ballPit.position.z;
        this.ballPitBalls.forEach(b => {
          const dx = b.mesh.position.x - relX;
          const dz = b.mesh.position.z - relZ;
          const d = Math.hypot(dx, dz);
          if (d < 1.4 && d > 0.01) {
            b.mesh.position.x = THREE.MathUtils.clamp(b.mesh.position.x + (dx / d) * 0.18, -3.1, 3.1);
            b.mesh.position.z = THREE.MathUtils.clamp(b.mesh.position.z + (dz / d) * 0.18, -3.1, 3.1);
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

    // 6. Agility Slide Sliding
    if (this.slide) {
      const distToTop = Math.hypot(rPos.x - this.slide.topPos.x, rPos.z - this.slide.topPos.z);
      if (distToTop < 2.0 && !robot.isSliding) {
        robot.isSliding = true;
        this.logActivity(`🎢 ¡${robot.name} se subió al tobogán y se desliza a toda velocidad!`);
        roboAudio.playYip(1.3);
        if (robot.animController) robot.animController.play('roll', 2.0);

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

    // 7. Agility Tunnel & Hurdles
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

    // 8. Cyber Piñata Strike
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

    // 11. Robot-to-Ball Kick Collisions
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