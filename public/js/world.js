// Optimized 3D World Manager (<24 World Draw Calls via Static Batching + InstancedMesh, Fixed Winding/UVs, SRGBColorSpace & Zero-Alloc Loop)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetCache as defaultAssetCache } from './core/AssetCache.js';
import { TMP, TimerRegistry, damp } from './core/Scratch.js';
import { roboAudio } from './audio.js';

const WORLD_RADIUS = 195;
const LAKE_CENTER_X = -80;
const LAKE_CENTER_Z = -80;
const LAKE_RADIUS = 60;

// Helper to normalize & bake world transforms + linear vertex colors into static geometry buckets
class StaticBatchBuilder {
  constructor() {
    this._parts = [];
    this._matrix = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'XYZ');
    this._pos = new THREE.Vector3();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._color = new THREE.Color();
  }

  add(geo, colorHex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, uvScaleU = 1, uvScaleV = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();

    // Strip non-standard attributes so mergeGeometries never mismatches
    const keepAttrs = Object.keys(g.attributes);
    for (let i = 0; i < keepAttrs.length; i++) {
      const attrName = keepAttrs[i];
      if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv') {
        g.deleteAttribute(attrName);
      }
    }

    const count = g.attributes.position.count;
    if (!g.attributes.normal) {
      g.computeVertexNormals();
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    } else if (uvScaleU !== 1 || uvScaleV !== 1) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) * uvScaleU, uv.getY(i) * uvScaleV);
      }
    }

    // Bake vertex color in linear space (THREE.Color converts hex sRGB -> linear)
    this._color.setHex(colorHex);
    const colors = new Float32Array(count * 3);
    const cr = this._color.r;
    const cg = this._color.g;
    const cb = this._color.b;
    for (let i = 0; i < count; i++) {
      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this._pos.set(x, y, z);
    this._euler.set(rx, ry, rz, 'XYZ');
    this._quat.setFromEuler(this._euler);
    this._scale.set(sx, sy, sz);
    this._matrix.compose(this._pos, this._quat, this._scale);
    g.applyMatrix4(this._matrix);

    this._parts.push(g);
  }

  build(material, assetCache, cacheKey) {
    if (this._parts.length === 0) return null;
    const merged = mergeGeometries(this._parts, false);
    for (let i = 0; i < this._parts.length; i++) {
      this._parts[i].dispose();
    }
    this._parts.length = 0;

    if (!merged) return null;
    const trackedGeo = assetCache.getGeometry(cacheKey, () => merged);
    if (trackedGeo !== merged) merged.dispose();
    return new THREE.Mesh(trackedGeo, material);
  }
}

export class WorldManager {
  constructor(scene, assetCache = defaultAssetCache, eventBus = null) {
    this.scene = scene;
    this.assetCache = assetCache || defaultAssetCache;
    this.eventBus = eventBus;
    this.timers = new TimerRegistry();

    // Contract properties
    this.camColliders = [];
    this.balls = [];
    this.trampolinePos = new THREE.Vector3(38, 0, 22);
    this.carouselGroup = null;
    this.goalScore = 0;
    this.targetScore = 0;
    this.discoPartyActive = false;
    this.lakeCenter = new THREE.Vector3(LAKE_CENTER_X, 0, LAKE_CENTER_Z);
    this.lakeRadius = LAKE_RADIUS;

    // Gameplay & compatibility collections
    this.interactiveObjects = [];
    this.snacks = [];
    this.pointsOfInterest = [];
    this.solidObstacles = [];
    this.elevatedSurfaces = [];
    this.spatialGrid = new Map();
    this.gridCellSize = 20;
    this._queryStamp = 1;
    this._nearCache = [];

    this.waterTime = 0;
    this.carouselAngle = 0;
    this.discoTimer = 0;
    this._discoBeatAccum = 0;
    this.onTargetHit = null;

    // Instanced dynamic data
    this.ballPitBalls = [];
    this.ballPitInst = null;
    this.ballPitOrigin = new THREE.Vector3(-32, 0, 48);
    this._ballPitDirty = false;

    this.discoTilesInst = null;
    this.discoTileColors = [];
    this.discoTileBaseColors = [0xff1744, 0x00e5ff, 0x76ff03, 0xffea00, 0xd500f9, 0xff9100];

    this.butterflies = [];
    this.butterfliesInst = null;
    this.clouds = [];
    this.cloudsInst = null;
    this.boneToys = [];
    this.boneInst = null;
    this.treasureSparkleInst = null;
    this.ambientParticles = null;

    // Pre-allocated minimap snapshot structure
    this._minimapSnapshot = {
      lakeCenter: this.lakeCenter,
      lakeRadius: this.lakeRadius,
      goalScore: 0,
      targetScore: 0,
      soccerBallPos: null,
      ballPositions: [],
      snackPositions: [],
      trampolinePos: this.trampolinePos,
      carouselPos: new THREE.Vector3(62, 0, 26),
      discoPos: new THREE.Vector3(52, 0, 56),
      doghousePos: new THREE.Vector3(72, 0, 52),
      fountainPos: new THREE.Vector3(12, 0, 10),
      bridgePos: new THREE.Vector3(-46, 0, -48),
      ballPitPos: new THREE.Vector3(-32, 0, 48),
      slidePos: new THREE.Vector3(-18, 0, -32),
      coursePos: new THREE.Vector3(22, 0, -50),
      targetPos: new THREE.Vector3(76, 0, 18),
      pinataPos: new THREE.Vector3(-42, 0, 14),
      goalPos: new THREE.Vector3(25, 0, 40),
      pierPos: new THREE.Vector3(-44, 0, -80),
      boatPos: new THREE.Vector3(-80, 0, -65)
    };

    // Build calibrated textures (SRGBColorSpace for albedo, NoColorSpace for data)
    this.textures = {
      grass: this.assetCache.getTexture('world_tex_grass', () => this.generateGrassTexture()),
      soccer: this.assetCache.getTexture('world_tex_soccer', () => this.generateSoccerTexture()),
      wood: this.assetCache.getTexture('world_tex_wood', () => this.generateWoodTexture()),
      tartan: this.assetCache.getTexture('world_tex_tartan', () => this.generateTartanTexture()),
      water: this.assetCache.getTexture('world_tex_water', () => this.generateWaterTexture()),
      cobblestone: this.assetCache.getTexture('world_tex_cobble', () => this.generateCobblestoneTexture()),
      butterfly: this.assetCache.getTexture('world_tex_bfly', () => this.generateButterflyTexture()),
      detailRoughness: this.assetCache.getTexture('world_tex_rough_data', () => this.generateRoughnessNoiseTexture())
    };

    // Shared batch builders for static world architecture (collapsed into 3 draw calls!)
    this._opaqueBatch = new StaticBatchBuilder();
    this._woodBatch = new StaticBatchBuilder();
    this._neonBatch = new StaticBatchBuilder();

    this.buildDetailedTerrain();
    this.buildCobblestonePaths();
    this.buildDetailedLake();
    this.buildWoodenBridge(new THREE.Vector3(-46, 0, -48), 0.65);
    this.buildDetailedPlayground();
    this.buildWaterFountain(new THREE.Vector3(12, 0, 10));
    this.buildCyberSeesaw(new THREE.Vector3(48, 0, 32));

    this.buildCyberBallPit(new THREE.Vector3(-32, 0, 48));
    this.buildAgilitySlide(new THREE.Vector3(-18, 0, -32));
    this.buildAgilityObstacleCourse(new THREE.Vector3(22, 0, -50));
    this.buildCyberTargetToss(new THREE.Vector3(76, 0, 18));
    this.buildCyberPinata(new THREE.Vector3(-42, 0, 14));
    this.buildSlalomRings(new THREE.Vector3(-6, 0, -18));
    this.buildTreasureSpots();

    this.buildLowPolyClouds();
    this.buildAmbientParticles();
    this.buildDetailedNature();

    // Finalize merged static meshes into scene
    this._flushStaticBatches();
    this.buildPointsOfInterest();
  }

  _flushStaticBatches() {
    const opaqueMat = this.assetCache.getMaterial('world_static_opaque_mat', () => new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.52,
      metalness: 0.24,
      roughnessMap: this.textures.detailRoughness
    }));
    const opaqueMesh = this._opaqueBatch.build(opaqueMat, this.assetCache, 'world_static_opaque_geo');
    if (opaqueMesh) {
      opaqueMesh.castShadow = true;
      opaqueMesh.receiveShadow = true;
      this.scene.add(opaqueMesh);
      this.camColliders.push(opaqueMesh);
      this.staticOpaqueMesh = opaqueMesh;
    }

    const woodMat = this.assetCache.getMaterial('world_static_wood_mat', () => new THREE.MeshStandardMaterial({
      map: this.textures.wood,
      vertexColors: true,
      roughness: 0.78,
      metalness: 0.04
    }));
    const woodMesh = this._woodBatch.build(woodMat, this.assetCache, 'world_static_wood_geo');
    if (woodMesh) {
      woodMesh.castShadow = true;
      woodMesh.receiveShadow = true;
      this.scene.add(woodMesh);
      this.camColliders.push(woodMesh);
      this.staticWoodMesh = woodMesh;
    }

    const neonMat = this.assetCache.getMaterial('world_static_neon_mat', () => new THREE.MeshBasicMaterial({
      vertexColors: true
    }));
    const neonMesh = this._neonBatch.build(neonMat, this.assetCache, 'world_static_neon_geo');
    if (neonMesh) {
      this.scene.add(neonMesh);
      this.staticNeonMesh = neonMesh;
    }
  }

  registerObstacle(obs) {
    if (!obs) return;
    obs.shape = obs.shape || 'cylinder';
    obs.rotY = obs.rotY || 0;
    obs._stamp = 0;
    const baseTerrainY = this.getTerrainHeightOnly(obs.x || 0, obs.z || 0);

    if (obs.yMin === undefined) {
      obs.yMin = baseTerrainY - 1.5;
    }
    if (obs.yMax === undefined) {
      obs.yMax = obs.yMin + (obs.height || 4.0) + 1.5;
    }
    this.solidObstacles.push(obs);

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
        let bucket = this.spatialGrid.get(cellKey);
        if (!bucket) {
          bucket = [];
          this.spatialGrid.set(cellKey, bucket);
        }
        bucket.push(obs);
      }
    }
  }

  // Zero-alloc spatial grid lookup using integer stamp deduplication
  getNearObstacles(x, z, outArray = this._nearCache) {
    outArray.length = 0;
    const stamp = ++this._queryStamp;
    const cx = Math.floor(x / this.gridCellSize);
    const cz = Math.floor(z / this.gridCellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx}_${cz + dz}`;
        const cell = this.spatialGrid.get(key);
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const obs = cell[i];
          if (obs._stamp !== stamp) {
            obs._stamp = stamp;
            outArray.push(obs);
          }
        }
      }
    }
    return outArray;
  }

  logActivity(msg, level = 'info') {
    if (this.eventBus) {
      this.eventBus.emit('world:activity', { text: msg, level });
    }
  }

  // --- PROCEDURAL TEXTURES (SRGBColorSpace for color, NoColorSpace for data) ---
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

    ctx.fillStyle = 'rgba(102, 187, 106, 0.42)';
    for (let i = 0; i < 3600; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 3 + Math.random() * 7);
    }
    ctx.fillStyle = 'rgba(27, 94, 32, 0.36)';
    for (let i = 0; i < 2200; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(42, 42);
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

    for (let p = 0; p < pentagons.length; p++) {
      const [cx, cy] = pentagons[p];
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
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  generateWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#5d4037';
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
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
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
    tex.colorSpace = THREE.SRGBColorSpace;
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
    tex.colorSpace = THREE.SRGBColorSpace;
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
    const rows = 12;
    const cols = 12;
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
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1); // UVs are scaled per geometry in world meters!
    return tex;
  }

  generateButterflyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.ellipse(20, 32, 14, 22, -0.3, 0, Math.PI * 2);
    ctx.ellipse(44, 32, 14, 22, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(20, 26, 5, 0, Math.PI * 2);
    ctx.arc(44, 26, 5, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  generateRoughnessNoiseTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 180 + Math.floor(Math.random() * 65);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace; // Non-color roughness data!
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  // --- ENVIRONMENT BUILDING ---
  buildDetailedTerrain() {
    const terrainGeo = this.assetCache.getGeometry('world_terrain_geo', () => {
      const geo = new THREE.PlaneGeometry(600, 600, 128, 128);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, this.getTerrainHeightOnly(pos.getX(i), pos.getZ(i)));
      }
      geo.computeVertexNormals();
      return geo;
    });

    const grassMat = this.assetCache.getMaterial('world_grass_mat', () => new THREE.MeshStandardMaterial({
      map: this.textures.grass,
      roughness: 0.78,
      metalness: 0.04,
      roughnessMap: this.textures.detailRoughness
    }));

    const terrain = new THREE.Mesh(terrainGeo, grassMat);
    terrain.receiveShadow = true;
    this.scene.add(terrain);
    this.terrainMesh = terrain;
    this.camColliders.push(terrain);

    // Distant mountain ring baked into staticOpaqueMesh (inward-facing FrontSide -> 0 extra DCs)
    const mtnGeo = new THREE.CylinderGeometry(335, 360, 52, 40, 2, true);
    const mPos = mtnGeo.attributes.position;
    for (let i = 0; i < mPos.count; i++) {
      if (mPos.getY(i) > 5) {
        const angle = Math.atan2(mPos.getZ(i), mPos.getX(i));
        mPos.setY(i, mPos.getY(i) + Math.sin(angle * 7) * 12 + Math.cos(angle * 13) * 7);
      }
    }
    if (mtnGeo.index) {
      const idx = mtnGeo.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const tmp = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = tmp;
      }
      mtnGeo.index.needsUpdate = true;
    }
    mtnGeo.computeVertexNormals();
    this._opaqueBatch.add(mtnGeo, 0x1b5e20, 0, 18, 0);
  }

  buildCobblestonePaths() {
    const baseH = this.getTerrainHeightOnly(0, 0);
    const pathParts = [];

    const plazaGeo = new THREE.CylinderGeometry(18, 18.2, 0.16, 32).toNonIndexed();
    plazaGeo.translate(0, baseH + 0.08, 0);
    const pUv = plazaGeo.attributes.uv;
    for (let i = 0; i < pUv.count; i++) {
      pUv.setXY(i, pUv.getX(i) * 8.0, pUv.getY(i) * 8.0);
    }
    pathParts.push(plazaGeo);

    this._opaqueBatch.add(new THREE.TorusGeometry(18.2, 0.25, 10, 32), 0x475569, 0, baseH + 0.12, 0, Math.PI / 2, 0, 0);
    this._neonBatch.add(new THREE.CylinderGeometry(2.4, 2.4, 0.18, 8), 0x00e5ff, 0, baseH + 0.11, 0);

    const ribbons = [
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(30, 0, 26), 4.2],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-36, 0, -68), 4.0],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(56, 0, 44), 3.8],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-44, 0, -46), 3.6],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(12, 0, 10), 3.8]
    ];

    for (let i = 0; i < ribbons.length; i++) {
      const rGeo = this._buildPathRibbonGeo(ribbons[i][0], ribbons[i][1], ribbons[i][2], 28);
      if (rGeo) pathParts.push(rGeo.toNonIndexed());
      if (rGeo) rGeo.dispose();
    }

    const mergedPathGeo = this.assetCache.getGeometry('world_cobble_paths_geo', () => {
      const m = mergeGeometries(pathParts, false);
      for (let i = 0; i < pathParts.length; i++) pathParts[i].dispose();
      return m;
    });

    const cobbleMat = this.assetCache.getMaterial('world_cobble_mat', () => new THREE.MeshStandardMaterial({
      map: this.textures.cobblestone,
      roughness: 0.74,
      metalness: 0.08,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }));

    const pathsMesh = new THREE.Mesh(mergedPathGeo, cobbleMat);
    pathsMesh.receiveShadow = true;
    this.scene.add(pathsMesh);
  }

  // FIXED: Upward (+Y) triangle winding & world-meter UVs
  _buildPathRibbonGeo(start, end, width = 3.8, segments = 28) {
    const dir = new THREE.Vector3().subVectors(end, start);
    dir.y = 0;
    const len = dir.length();
    if (len < 0.1) return null;
    dir.normalize();

    const normal = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width * 0.5);
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const cx = start.x + (end.x - start.x) * t;
      const cz = start.z + (end.z - start.z) * t;
      const curveDev = Math.sin(t * Math.PI) * 1.8;
      const mx = cx - dir.z * curveDev;
      const mz = cz + dir.x * curveDev;

      const lx = mx + normal.x;
      const lz = mz + normal.z;
      const rx = mx - normal.x;
      const rz = mz - normal.z;

      const ly = this.getTerrainHeightOnly(lx, lz) + 0.14;
      const ry = this.getTerrainHeightOnly(rx, rz) + 0.14;

      positions.push(lx, ly, lz);
      positions.push(rx, ry, rz);

      const vCoord = t * (len / 2.8);
      uvs.push(0, vCoord);
      uvs.push(1.4, vCoord);

      if (i < segments) {
        const base = i * 2;
        // CCW winding from +Y -> upward normals (+Y)
        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  buildWoodenBridge(pos, rotY = 0, span = 18, width = 4.4) {
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    const archSegments = 18;
    const archPeak = 2.6;
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);

    const addBridgePart = (batch, geo, color, lx, ly, lz, rx = 0, ry = 0, rz = 0, uvU = 1, uvV = 1) => {
      const wx = pos.x + lx * cosY + lz * sinY;
      const wz = pos.z - lx * sinY + lz * cosY;
      const wy = baseY + ly;
      // Rotate local X slope with bridge yaw
      const m = new THREE.Matrix4();
      const qYaw = new THREE.Quaternion().setFromAxisAngle(TMP.v6.set(0, 1, 0), rotY);
      const qLocal = new THREE.Quaternion().setFromEuler(TMP.e1.set(rx, ry, rz, 'XYZ'));
      qYaw.multiply(qLocal);
      TMP.e1.setFromQuaternion(qYaw, 'XYZ');
      batch.add(geo, color, wx, wy, wz, TMP.e1.x, TMP.e1.y, TMP.e1.z, 1, 1, 1, uvU, uvV);
    };

    const postHeights = [];
    for (let i = 0; i < archSegments; i++) {
      const t = i / (archSegments - 1);
      const z = (t - 0.5) * span;
      const archHeight = Math.sin(t * Math.PI) * archPeak;
      const slopeAngle = -Math.cos(t * Math.PI) * (archPeak * Math.PI / span);

      addBridgePart(
        this._woodBatch,
        new THREE.BoxGeometry(width, 0.22, (span / archSegments) * 1.05),
        0xffffff,
        0, archHeight + 0.11, z,
        slopeAngle, 0, 0,
        2.0, 0.5
      );
      postHeights.push({ z, archHeight });

      if (i % 2 === 0 || i === archSegments - 1) {
        [-width * 0.5 + 0.18, width * 0.5 - 0.18].forEach(x => {
          addBridgePart(
            this._woodBatch,
            new THREE.CylinderGeometry(0.11, 0.12, 1.35, 8),
            0x7b5e57,
            x, archHeight + 0.75, z,
            0, 0, 0,
            0.5, 1.0
          );
        });
      }
    }

    [-width * 0.5 + 0.18, width * 0.5 - 0.18].forEach(x => {
      for (let i = 0; i < postHeights.length - 1; i++) {
        const p1 = postHeights[i];
        const p2 = postHeights[i + 1];
        const dz = p2.z - p1.z;
        const dy = p2.archHeight - p1.archHeight;
        const segLen = Math.hypot(dz, dy);
        const angle = -Math.atan2(dy, dz);

        addBridgePart(
          this._woodBatch,
          new THREE.BoxGeometry(0.16, 0.14, segLen + 0.08),
          0x7b5e57,
          x, (p1.archHeight + p2.archHeight) * 0.5 + 1.38, (p1.z + p2.z) * 0.5,
          angle, 0, 0,
          0.3, 0.8
        );

        addBridgePart(
          this._woodBatch,
          new THREE.BoxGeometry(0.12, 0.1, segLen + 0.05),
          0x7b5e57,
          x, (p1.archHeight + p2.archHeight) * 0.5 + 0.75, (p1.z + p2.z) * 0.5,
          angle, 0, 0,
          0.3, 0.8
        );
      }

      [-span * 0.48, span * 0.48].forEach(z => {
        addBridgePart(
          this._neonBatch,
          new THREE.BoxGeometry(0.34, 0.44, 0.34),
          0xffea00,
          x, 1.65, z
        );
      });

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

    this.woodenBridge = { position: pos, baseY, rotY, span, width, archPeak };
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
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    this._opaqueBatch.add(new THREE.CylinderGeometry(1.6, 1.3, 0.55, 24), 0x94a3b8, pos.x, baseY + 0.28, pos.z);
    this._opaqueBatch.add(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 14), 0x00e5ff, pos.x, baseY + 0.65, pos.z);
    this._opaqueBatch.add(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), 0x94a3b8, pos.x, baseY + 0.72, pos.z + 1.52);

    this._neonBatch.add(new THREE.TorusGeometry(1.62, 0.1, 12, 28), 0x00e5ff, pos.x, baseY + 0.56, pos.z, Math.PI / 2, 0, 0);
    this._neonBatch.add(new THREE.BoxGeometry(0.85, 0.26, 0.1), 0x00e5ff, pos.x, baseY + 0.96, pos.z + 1.52);

    // Single animated fountain water + jet mesh
    const fWaterGeo = this.assetCache.getGeometry('world_fountain_water_geo', () => {
      const disc = new THREE.CircleGeometry(1.5, 24).rotateX(-Math.PI / 2).toNonIndexed();
      const jet = new THREE.ConeGeometry(0.4, 1.2, 14).translate(0, 0.8, 0).toNonIndexed();
      const merged = mergeGeometries([disc, jet], false);
      disc.dispose();
      jet.dispose();
      return merged;
    });
    const fWaterMat = this.assetCache.getMaterial('world_fountain_water_mat', () => new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.08,
      metalness: 0.85,
      transparent: true,
      opacity: 0.86
    }));
    const fWater = new THREE.Mesh(fWaterGeo, fWaterMat);
    fWater.position.set(pos.x, baseY + 0.5, pos.z);
    this.scene.add(fWater);
    this.fountainJet = fWater;

    this.waterFountain = { position: pos, radius: 1.6 };
    this.registerObstacle({ type: 'water_fountain', x: pos.x, z: pos.z, radius: 1.65, height: 2.0 });
  }

  buildCyberSeesaw(pos) {
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    [-0.75, 0.75].forEach(zOff => {
      this._opaqueBatch.add(new THREE.ConeGeometry(0.85, 1.55, 4), 0x1e293b, pos.x, baseY + 0.77, pos.z + zOff, 0, Math.PI / 4, 0);
    });
    this._opaqueBatch.add(new THREE.CylinderGeometry(0.14, 0.14, 2.0, 14), 0x94a3b8, pos.x, baseY + 1.5, pos.z, Math.PI / 2, 0, 0);

    // Single merged seesaw pivot mesh
    const plankBuilder = new StaticBatchBuilder();
    plankBuilder.add(new THREE.BoxGeometry(10.0, 0.18, 1.45), 0x334155, 0, 0, 0);
    [-4.3, 4.3].forEach((hx, idx) => {
      const col = idx === 0 ? 0x00e5ff : 0xff4081;
      plankBuilder.add(new THREE.TorusGeometry(0.35, 0.06, 10, 20), col, hx * 0.88, 0.38, 0, 0, Math.PI / 2, 0);
      plankBuilder.add(new THREE.BoxGeometry(1.25, 0.08, 1.25), col, hx, 0.12, 0);
    });
    const plankMat = this.assetCache.getMaterial('world_dynamic_vertex_mat', () => new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.35
    }));
    const plankMesh = plankBuilder.build(plankMat, this.assetCache, 'world_seesaw_plank_geo');
    plankMesh.position.set(pos.x, baseY + 1.5, pos.z);
    plankMesh.castShadow = false;
    plankMesh.receiveShadow = true;
    this.scene.add(plankMesh);

    this.seesaw = {
      group: plankMesh,
      pivot: plankMesh,
      position: pos,
      currentTilt: 0,
      targetTilt: 0
    };
    this.registerObstacle({ type: 'seesaw_fulcrum', x: pos.x, z: pos.z, radius: 1.0, height: 1.8 });
  }

  buildDetailedLake() {
    const waterGeo = this.assetCache.getGeometry('world_lake_water_geo', () => {
      const g = new THREE.CircleGeometry(LAKE_RADIUS, 48);
      g.rotateX(-Math.PI / 2);
      return g;
    });
    const waterMat = this.assetCache.getMaterial('world_lake_water_mat', () => new THREE.MeshStandardMaterial({
      map: this.textures.water,
      color: 0x0284c7,
      roughness: 0.08,
      metalness: 0.86,
      transparent: true,
      opacity: 0.86
    }));
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(LAKE_CENTER_X, -0.15, LAKE_CENTER_Z);
    this.scene.add(water);
    this.waterMesh = water;

    this._opaqueBatch.add(
      new THREE.RingGeometry(LAKE_RADIUS - 1.5, LAKE_RADIUS + 7, 48),
      0xd7ccc8,
      LAKE_CENTER_X, 0.06, LAKE_CENTER_Z,
      -Math.PI / 2, 0, 0
    );

    // Lake Rocks baked into staticOpaqueMesh (35 -> 0 extra DCs)
    for (let i = 0; i < 35; i++) {
      const angle = (i / 35) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
      if (Math.abs(angle) < 0.25) continue;
      const rad = LAKE_RADIUS + (Math.random() - 0.5) * 5;
      const rx = LAKE_CENTER_X + Math.cos(angle) * rad;
      const rz = LAKE_CENTER_Z + Math.sin(angle) * rad;
      const s = 0.7 + Math.random() * 0.8;
      this._opaqueBatch.add(
        new THREE.DodecahedronGeometry(s, 1),
        0x64748b,
        rx, this.getTerrainHeightOnly(rx, rz) + 0.3, rz,
        Math.random() * 3, Math.random() * 3, Math.random() * 3
      );
      this.registerObstacle({ type: 'rock', x: rx, z: rz, radius: 1.35, height: 1.8 });
    }

    // Wooden Pier merged into woodBatch & neonBatch
    const pierPos = new THREE.Vector3(-44, 0.35, -80);
    const pierRotY = 0.28;
    const cosY = Math.cos(pierRotY);
    const sinY = Math.sin(pierRotY);

    this._woodBatch.add(
      new THREE.BoxGeometry(6, 0.35, 24),
      0xffffff,
      pierPos.x, pierPos.y, pierPos.z,
      0, pierRotY, 0,
      1, 1, 1,
      2.5, 9.0
    );

    [-2.8, 2.8].forEach(lx => {
      [-10, -3.3, 3.3, 10].forEach(lz => {
        const wx = pierPos.x + lx * cosY + lz * sinY;
        const wz = pierPos.z - lx * sinY + lz * cosY;
        this._woodBatch.add(new THREE.CylinderGeometry(0.18, 0.18, 4.2, 8), 0x795548, wx, pierPos.y - 0.3, wz, 0, pierRotY, 0);
        this._neonBatch.add(new THREE.BoxGeometry(0.3, 0.35, 0.3), 0xffeb3b, wx, pierPos.y + 1.95, wz, 0, pierRotY, 0);

        this.registerObstacle({
          type: 'pier_post',
          x: wx,
          z: wz,
          radius: 0.32,
          yMin: -2.0,
          yMax: 2.5
        });
      });
    });

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

  buildToyBoat(pos) {
    const boatBuilder = new StaticBatchBuilder();
    boatBuilder.add(new THREE.BoxGeometry(2.5, 0.75, 3.6), 0xff1744, 0, 0.22, -0.3);
    const bowGeo = new THREE.ConeGeometry(1.77, 1.8, 4);
    bowGeo.rotateX(Math.PI / 2);
    bowGeo.rotateZ(Math.PI / 4);
    boatBuilder.add(bowGeo, 0xff1744, 0, 0.22, 2.4, 0, 0, 0, 1.0, 0.42, 1.0);
    boatBuilder.add(new THREE.BoxGeometry(2.3, 0.15, 3.4), 0xf8fafc, 0, 0.62, -0.3);
    boatBuilder.add(new THREE.BoxGeometry(1.75, 0.75, 1.8), 0xf8fafc, 0, 1.0, -0.4);
    boatBuilder.add(new THREE.BoxGeometry(1.68, 0.55, 0.85), 0x00e5ff, 0, 0.98, 0.6, -0.45, 0, 0);
    boatBuilder.add(new THREE.BoxGeometry(0.55, 0.75, 0.6), 0x1e293b, 0, 0.45, -2.25);
    boatBuilder.add(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 8), 0x00e5ff, 0, 1.9, -0.6);

    const boatMat = this.assetCache.getMaterial('world_dynamic_vertex_mat', () => new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.35
    }));
    const boatMesh = boatBuilder.build(boatMat, this.assetCache, 'world_toy_boat_geo');
    boatMesh.position.copy(pos);
    boatMesh.castShadow = false;
    this.scene.add(boatMesh);
    this.toyBoat = boatMesh;

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
    const floorGeo = this.assetCache.getGeometry('world_tartan_geo', () => new THREE.CylinderGeometry(42, 42, 0.12, 48));
    const floorMat = this.assetCache.getMaterial('world_tartan_mat', () => new THREE.MeshStandardMaterial({
      map: this.textures.tartan,
      roughness: 0.82
    }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(playCenter.x, this.getTerrainHeightOnly(50, 40) + 0.06, playCenter.z);
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.buildCyberDoghouse(new THREE.Vector3(72, 0, 52));
    this.buildTrampoline(this.trampolinePos);
    this.buildCarousel(new THREE.Vector3(62, 0, 26));
    this.buildSoccerGoal(new THREE.Vector3(25, 0, 40));
    this.buildDiscoPad(new THREE.Vector3(52, 0, 56));

    // Agility Ramp
    const rampCenter = new THREE.Vector3(45, 0, 45);
    const rampBaseY = this.getTerrainHeightOnly(rampCenter.x, rampCenter.z);
    const rampLen = 12.0;
    const rampWidth = 4.6;
    const rampAngle = 0.22;
    const rampMidY = Math.sin(rampAngle) * (rampLen * 0.5);
    const rampTopY = Math.sin(rampAngle) * rampLen;

    this._opaqueBatch.add(
      new THREE.BoxGeometry(rampWidth, 0.28, rampLen),
      0xff9800,
      rampCenter.x, rampBaseY + rampMidY, rampCenter.z,
      -rampAngle, 0, 0
    );

    [-rampWidth * 0.5 + 0.12, rampWidth * 0.5 - 0.12].forEach(cx => {
      const cy = Math.cos(rampAngle) * 0.2;
      const cz = Math.sin(rampAngle) * 0.2;
      this._neonBatch.add(
        new THREE.BoxGeometry(0.2, 0.28, rampLen),
        0x00e5ff,
        rampCenter.x + cx, rampBaseY + rampMidY + cy, rampCenter.z + cz,
        -rampAngle, 0, 0
      );
    });

    for (let s = -5.2; s <= 5.2; s += 1.4) {
      const sy = Math.sin(rampAngle) * (-s) + Math.cos(rampAngle) * 0.16;
      const sz = Math.cos(rampAngle) * s + Math.sin(rampAngle) * 0.16;
      this._opaqueBatch.add(
        new THREE.BoxGeometry(rampWidth - 0.5, 0.08, 0.24),
        0x1e293b,
        rampCenter.x, rampBaseY + rampMidY + sy, rampCenter.z + sz,
        -rampAngle, 0, 0
      );
    }

    [-rampWidth * 0.42, rampWidth * 0.42].forEach(px => {
      [-rampLen * 0.42, 0].forEach(pz => {
        const t = 0.5 - (pz / rampLen);
        const h = Math.max(0.3, t * rampTopY);
        this._opaqueBatch.add(
          new THREE.CylinderGeometry(0.14, 0.16, h, 10),
          0x334155,
          rampCenter.x + px, rampBaseY + h * 0.5, rampCenter.z + pz
        );
      });
    });

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

    // Agility Hoops
    const ringColors = [0x00e5ff, 0xff4081, 0x76ff03];
    [-10, 0, 10].forEach((offset, idx) => {
      const hx = 36;
      const hz = 26 + offset;
      const groundY = this.getTerrainHeightOnly(hx, hz);
      const rotY = 0.3;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      this._neonBatch.add(new THREE.TorusGeometry(1.75, 0.14, 12, 28), ringColors[idx % 3], hx, groundY + 2.1, hz, 0, rotY, 0);
      [-1.75, 1.75].forEach(lx => {
        this._opaqueBatch.add(
          new THREE.CylinderGeometry(0.09, 0.11, 2.1, 10),
          0x37474f,
          hx + lx * cosY, groundY + 1.05, hz - lx * sinY
        );
      });
      this._opaqueBatch.add(new THREE.BoxGeometry(3.8, 0.12, 0.45), 0x37474f, hx, groundY + 0.06, hz, 0, rotY, 0);
    });

    // Crawl Agility Tunnel (solid arch with outer + inner shell so FrontSide works cleanly)
    const tunnelPos = new THREE.Vector3(56, this.getTerrainHeightOnly(56, 24), 24);
    const tunnelRotY = -0.55;
    const tCos = Math.cos(tunnelRotY);
    const tSin = Math.sin(tunnelRotY);

    const outerArch = new THREE.CylinderGeometry(2.22, 2.22, 10, 20, 1, true, 0, Math.PI);
    outerArch.rotateZ(Math.PI / 2);
    outerArch.rotateY(Math.PI / 2);
    this._opaqueBatch.add(outerArch, 0x7c4dff, tunnelPos.x, tunnelPos.y, tunnelPos.z, 0, tunnelRotY, 0);

    const innerArch = new THREE.CylinderGeometry(2.14, 2.14, 10, 20, 1, true, 0, Math.PI);
    innerArch.rotateZ(Math.PI / 2);
    innerArch.rotateY(Math.PI / 2);
    innerArch.scale(-1, 1, 1); // Flip faces inward for interior visibility without DoubleSide
    innerArch.computeVertexNormals();
    this._opaqueBatch.add(innerArch, 0x5e35b1, tunnelPos.x, tunnelPos.y, tunnelPos.z, 0, tunnelRotY, 0);

    [-4.9, 0, 4.9].forEach(tz => {
      const wx = tunnelPos.x + tz * tSin;
      const wz = tunnelPos.z + tz * tCos;
      this._neonBatch.add(new THREE.TorusGeometry(2.22, 0.1, 10, 22, Math.PI), 0x00e5ff, wx, tunnelPos.y, wz, 0, tunnelRotY, 0);
    });

    [-2.15, 2.15].forEach(wallX => {
      const wx = tunnelPos.x + wallX * tCos;
      const wz = tunnelPos.z - wallX * tSin;
      this.registerObstacle({
        type: 'playground_tunnel_wall',
        shape: 'box',
        x: wx,
        z: wz,
        halfW: 0.25,
        halfD: 5.0,
        rotY: tunnelRotY,
        height: 2.2
      });
    });

    // Balls & Bones
    this.soccerBall = this.spawnSoccerBall(new THREE.Vector3(42, 1.2, 38), 1.2);
    this.spawnBall(new THREE.Vector3(52, 1.0, 42), 0.95, 0xffeb3b, 'neon');
    this.spawnBall(new THREE.Vector3(58, 0.8, 38), 0.75, 0xff4081, 'bouncy');
    this.spawnBall(new THREE.Vector3(40, 0.8, 48), 0.75, 0x00e5ff, 'bouncy');

    this.spawnBoneToy(new THREE.Vector3(48, 0.45, 46));
    this.spawnBoneToy(new THREE.Vector3(63, 0.45, 34));
    this.spawnBoneToy(new THREE.Vector3(34, 0.45, 38));
  }

  buildTrampoline(pos) {
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    this._opaqueBatch.add(new THREE.TorusGeometry(3.6, 0.24, 12, 28), 0x37474f, pos.x, baseY + 1.0, pos.z, Math.PI / 2, 0, 0);
    this._neonBatch.add(new THREE.CylinderGeometry(3.4, 3.4, 0.12, 28), 0x00e5ff, pos.x, baseY + 0.96, pos.z);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this._opaqueBatch.add(
        new THREE.CylinderGeometry(0.12, 0.14, 1.0, 8),
        0x37474f,
        pos.x + Math.cos(a) * 3.4, baseY + 0.5, pos.z + Math.sin(a) * 3.4
      );
    }

    this.trampolinePos.copy(pos);
    this.trampoline = { position: this.trampolinePos, radius: 3.5 };
  }

  buildCarousel(pos) {
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    this._opaqueBatch.add(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 28), 0x263238, pos.x, baseY + 0.12, pos.z);

    // Single merged rotating carousel mesh
    const rotorBuilder = new StaticBatchBuilder();
    rotorBuilder.add(new THREE.CylinderGeometry(3.8, 3.8, 0.16, 28), 0xff4081, 0, 0, 0);
    rotorBuilder.add(new THREE.CylinderGeometry(0.22, 0.26, 2.8, 12), 0xffeb3b, 0, 1.4, 0);
    rotorBuilder.add(new THREE.ConeGeometry(1.2, 0.7, 14), 0x00e5ff, 0, 3.0, 0);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const hx = Math.cos(a) * 2.5;
      const hz = Math.sin(a) * 2.5;
      rotorBuilder.add(new THREE.TorusGeometry(0.55, 0.07, 10, 20), 0x00e5ff, hx, 0.95, hz, 0, -a, 0);
      rotorBuilder.add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), 0x263238, hx, 0.45, hz);
    }

    const rotorMat = this.assetCache.getMaterial('world_dynamic_vertex_mat', () => new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.35
    }));
    const rotorMesh = rotorBuilder.build(rotorMat, this.assetCache, 'world_carousel_rotor_geo');
    rotorMesh.position.set(pos.x, baseY + 0.32, pos.z);
    rotorMesh.castShadow = true;
    rotorMesh.receiveShadow = true;
    this.scene.add(rotorMesh);

    this.carouselGroup = rotorMesh;
    this.carousel = { rotor: rotorMesh, position: pos, radius: 4.0 };
    this.registerObstacle({ type: 'carousel_mast', x: pos.x, z: pos.z, radius: 0.55, height: 3.2 });
  }

  buildSoccerGoal(pos) {
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    const width = 7.0;
    const height = 3.4;
    const depth = 3.0;
    const hw = width * 0.5;
    // Goal opens toward +X (rotated PI/2 around Y, so local -Z maps to world -X)
    const rotY = Math.PI / 2;

    const addGoal = (geo, col, lx, ly, lz, rx = 0, ry = 0, rz = 0) => {
      // rotY = PI/2: worldX = pos.x + lz, worldZ = pos.z - lx
      const wx = pos.x + lz;
      const wz = pos.z - lx;
      const wy = baseY + ly;
      this._opaqueBatch.add(geo, col, wx, wy, wz, rx, rotY + ry, rz);
    };

    addGoal(new THREE.CylinderGeometry(0.12, 0.12, height, 10), 0xffffff, -hw, height * 0.5, 0);
    addGoal(new THREE.CylinderGeometry(0.12, 0.12, height, 10), 0xffffff, hw, height * 0.5, 0);
    addGoal(new THREE.CylinderGeometry(0.12, 0.12, width + 0.24, 10), 0xffffff, 0, height, 0, 0, 0, Math.PI / 2);

    addGoal(new THREE.CylinderGeometry(0.08, 0.08, height, 8), 0xffffff, -hw, height * 0.5, -depth);
    addGoal(new THREE.CylinderGeometry(0.08, 0.08, height, 8), 0xffffff, hw, height * 0.5, -depth);
    addGoal(new THREE.CylinderGeometry(0.08, 0.08, width, 8), 0xffffff, 0, height, -depth, 0, 0, Math.PI / 2);

    [-hw, hw].forEach(sx => {
      addGoal(new THREE.CylinderGeometry(0.08, 0.08, depth, 8), 0xffffff, sx, height, -depth * 0.5, Math.PI / 2, 0, 0);
      addGoal(new THREE.CylinderGeometry(0.08, 0.08, depth, 8), 0xffffff, sx, 0.08, -depth * 0.5, Math.PI / 2, 0, 0);
    });

    // Lightweight physical net cords baked into opaque batch (zero extra draw calls, zero wireframe overhead)
    for (let x = -hw + 0.7; x < hw; x += 0.7) {
      addGoal(new THREE.BoxGeometry(0.025, height, 0.025), 0xcbd5e1, x, height * 0.5, -depth);
      addGoal(new THREE.BoxGeometry(0.025, 0.025, depth), 0xcbd5e1, x, height, -depth * 0.5);
    }
    for (let y = 0.55; y < height; y += 0.55) {
      addGoal(new THREE.BoxGeometry(width, 0.025, 0.025), 0xcbd5e1, 0, y, -depth);
      addGoal(new THREE.BoxGeometry(0.025, 0.025, depth), 0xcbd5e1, -hw, y, -depth * 0.5);
      addGoal(new THREE.BoxGeometry(0.025, 0.025, depth), 0xcbd5e1, hw, y, -depth * 0.5);
    }
    for (let z = -0.6; z > -depth; z -= 0.6) {
      addGoal(new THREE.BoxGeometry(0.025, height, 0.025), 0xcbd5e1, -hw, height * 0.5, z);
      addGoal(new THREE.BoxGeometry(0.025, height, 0.025), 0xcbd5e1, hw, height * 0.5, z);
      addGoal(new THREE.BoxGeometry(width, 0.025, 0.025), 0xcbd5e1, 0, height, z);
    }

    this.soccerGoal = { position: pos, width, depth, height };
    this.registerObstacle({ type: 'goal_post_l', x: pos.x, z: pos.z - hw, radius: 0.25, height });
    this.registerObstacle({ type: 'goal_post_r', x: pos.x, z: pos.z + hw, radius: 0.25, height });
    this.registerObstacle({ type: 'goal_net_back', shape: 'box', x: pos.x - depth, z: pos.z, halfW: 0.2, halfD: hw, height });
    this.registerObstacle({ type: 'goal_net_side_n', shape: 'box', x: pos.x - depth * 0.5, z: pos.z - hw, halfW: depth * 0.5, halfD: 0.2, height });
    this.registerObstacle({ type: 'goal_net_side_s', shape: 'box', x: pos.x - depth * 0.5, z: pos.z + hw, halfW: depth * 0.5, halfD: 0.2, height });
  }

  buildDiscoPad(pos) {
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    this._opaqueBatch.add(new THREE.BoxGeometry(6.6, 0.1, 6.6), 0x0f172a, pos.x, baseY + 0.05, pos.z);

    // Instanced Disco Tiles (16 tiles -> 1 draw call!)
    const tileGeo = this.assetCache.getGeometry('world_disco_tile_geo', () => new THREE.BoxGeometry(1.4, 0.14, 1.4));
    const tileMat = this.assetCache.getMaterial('world_disco_tile_mat', () => new THREE.MeshBasicMaterial({
      color: 0xffffff
    }));
    const tilesInst = new THREE.InstancedMesh(tileGeo, tileMat, 16);

    let idx = 0;
    for (let x = -2; x <= 1; x++) {
      for (let z = -2; z <= 1; z++) {
        const col = this.discoTileBaseColors[(idx * 7 + 3) % this.discoTileBaseColors.length];
        TMP.obj.position.set(pos.x + x * 1.5 + 0.75, baseY + 0.1, pos.z + z * 1.5 + 0.75);
        TMP.obj.rotation.set(0, 0, 0);
        TMP.obj.scale.set(1, 1, 1);
        TMP.obj.updateMatrix();
        tilesInst.setMatrixAt(idx, TMP.obj.matrix);

        TMP.color.setHex(col).multiplyScalar(0.55);
        tilesInst.setColorAt(idx, TMP.color);
        this.discoTileColors.push(col);
        idx++;
      }
    }
    tilesInst.instanceMatrix.needsUpdate = true;
    if (tilesInst.instanceColor) tilesInst.instanceColor.needsUpdate = true;
    this.scene.add(tilesInst);
    this.assetCache.track(tilesInst);
    this.discoTilesInst = tilesInst;

    const cornerOffset = 3.15;
    const trussHeight = 5.0;
    [[-cornerOffset, -cornerOffset], [cornerOffset, -cornerOffset], [-cornerOffset, cornerOffset], [cornerOffset, cornerOffset]].forEach(([cx, cz]) => {
      this._opaqueBatch.add(new THREE.CylinderGeometry(0.12, 0.14, trussHeight, 10), 0x334155, pos.x + cx, baseY + trussHeight * 0.5, pos.z + cz);
      this.registerObstacle({
        type: 'disco_pillar',
        x: pos.x + cx,
        z: pos.z + cz,
        radius: 0.25,
        height: trussHeight
      });
    });

    const diagLen = cornerOffset * 2 * Math.SQRT2;
    [Math.PI / 4, -Math.PI / 4].forEach(rot => {
      this._opaqueBatch.add(new THREE.BoxGeometry(diagLen, 0.14, 0.14), 0x334155, pos.x, baseY + trussHeight, pos.z, 0, rot, 0);
    });
    this._opaqueBatch.add(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), 0x334155, pos.x, baseY + trussHeight - 0.4, pos.z);
    this._opaqueBatch.add(new THREE.SphereGeometry(0.8, 14, 14), 0xf8fafc, pos.x, baseY + trussHeight - 0.95, pos.z);
    this.discoBall = null;

    this.discoPad = { position: pos, radius: 3.5 };
  }

  buildCyberDoghouse(pos) {
    const baseY = this.getTerrainHeightOnly(pos.x, pos.z);
    const w = 6.4;
    const h = 4.6;
    const d = 6.4;
    const wallT = 0.4;

    this._opaqueBatch.add(new THREE.BoxGeometry(w, 0.16, d), 0x0f172a, pos.x, baseY + 0.08, pos.z);
    this._opaqueBatch.add(new THREE.BoxGeometry(w, h, wallT), 0x334155, pos.x, baseY + h * 0.5, pos.z - d * 0.5 + wallT * 0.5);
    [-w * 0.5 + wallT * 0.5, w * 0.5 - wallT * 0.5].forEach(wx => {
      this._opaqueBatch.add(new THREE.BoxGeometry(wallT, h, d), 0x334155, pos.x + wx, baseY + h * 0.5, pos.z);
    });

    const doorWidth = 3.0;
    const doorHeight = 3.4;
    const pillarWidth = (w - doorWidth) * 0.5;
    [-w * 0.5 + pillarWidth * 0.5, w * 0.5 - pillarWidth * 0.5].forEach(px => {
      this._opaqueBatch.add(new THREE.BoxGeometry(pillarWidth, h, wallT), 0x334155, pos.x + px, baseY + h * 0.5, pos.z + d * 0.5 - wallT * 0.5);
    });

    const lintelH = h - doorHeight;
    this._opaqueBatch.add(new THREE.BoxGeometry(doorWidth, lintelH, wallT), 0x334155, pos.x, baseY + doorHeight + lintelH * 0.5, pos.z + d * 0.5 - wallT * 0.5);
    this._neonBatch.add(new THREE.BoxGeometry(doorWidth + 0.2, 0.12, wallT + 0.08), 0x00e5ff, pos.x, baseY + doorHeight, pos.z + d * 0.5 - wallT * 0.5);
    [-doorWidth * 0.5, doorWidth * 0.5].forEach(dx => {
      this._neonBatch.add(new THREE.BoxGeometry(0.12, doorHeight, wallT + 0.08), 0x00e5ff, pos.x + dx, baseY + doorHeight * 0.5, pos.z + d * 0.5 - wallT * 0.5);
    });
    this._neonBatch.add(new THREE.CylinderGeometry(1.85, 1.95, 0.14, 24), 0x22ff88, pos.x, baseY + 0.2, pos.z);
    this._opaqueBatch.add(new THREE.ConeGeometry(5.4, 2.4, 4), 0x0284c7, pos.x, baseY + h + 1.2, pos.z, 0, Math.PI / 4, 0);
    this._neonBatch.add(new THREE.BoxGeometry(3.4, 0.7, 0.18), 0x00e5ff, pos.x, baseY + h - 0.55, pos.z + d * 0.5 + 0.05);

    this.registerObstacle({ type: 'doghouse_wall_back', shape: 'box', x: pos.x, z: pos.z - d * 0.5 + wallT * 0.5, halfW: w * 0.5, halfD: wallT * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_wall_left', shape: 'box', x: pos.x - w * 0.5 + wallT * 0.5, z: pos.z, halfW: wallT * 0.5, halfD: d * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_wall_right', shape: 'box', x: pos.x + w * 0.5 - wallT * 0.5, z: pos.z, halfW: wallT * 0.5, halfD: d * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_pillar_l', shape: 'box', x: pos.x - w * 0.5 + pillarWidth * 0.5, z: pos.z + d * 0.5 - wallT * 0.5, halfW: pillarWidth * 0.5, halfD: wallT * 0.5, height: h });
    this.registerObstacle({ type: 'doghouse_pillar_r', shape: 'box', x: pos.x + w * 0.5 - pillarWidth * 0.5, z: pos.z + d * 0.5 - wallT * 0.5, halfW: pillarWidth * 0.5, halfD: wallT * 0.5, height: h });
  }

  buildCyberBallPit(pos) {
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    this._opaqueBatch.add(new THREE.BoxGeometry(7.2, 0.2, 7.2), 0x0f172a, pos.x, groundY + 0.1, pos.z);

    this._neonBatch.add(new THREE.BoxGeometry(7.4, 0.65, 0.35), 0x00e5ff, pos.x, groundY + 0.35, pos.z - 3.5);
    this._neonBatch.add(new THREE.BoxGeometry(7.4, 0.65, 0.35), 0x00e5ff, pos.x, groundY + 0.35, pos.z + 3.5);
    this._neonBatch.add(new THREE.BoxGeometry(0.35, 0.65, 7.4), 0x00e5ff, pos.x - 3.5, groundY + 0.35, pos.z);
    this._neonBatch.add(new THREE.BoxGeometry(0.35, 0.65, 7.4), 0x00e5ff, pos.x + 3.5, groundY + 0.35, pos.z);

    // 45 Ball-pit balls -> 1 InstancedMesh!
    const ballColors = [0x00e5ff, 0xff3399, 0xffea00, 0x22ff88, 0xa855f7, 0xff9100];
    const miniBallGeo = this.assetCache.getGeometry('world_ballpit_sphere_geo', () => new THREE.SphereGeometry(0.24, 10, 10));
    const miniBallMat = this.assetCache.getMaterial('world_ballpit_sphere_mat', () => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.28,
      metalness: 0.1
    }));
    const inst = new THREE.InstancedMesh(miniBallGeo, miniBallMat, 45);
    this.ballPitOrigin.set(pos.x, groundY, pos.z);

    for (let i = 0; i < 45; i++) {
      const rx = (Math.random() - 0.5) * 6.0;
      const rz = (Math.random() - 0.5) * 6.0;
      const ry = 0.28 + Math.random() * 0.28;

      TMP.obj.position.set(pos.x + rx, groundY + ry, pos.z + rz);
      TMP.obj.rotation.set(0, 0, 0);
      TMP.obj.scale.set(1, 1, 1);
      TMP.obj.updateMatrix();
      inst.setMatrixAt(i, TMP.obj.matrix);

      TMP.color.setHex(ballColors[i % ballColors.length]);
      inst.setColorAt(i, TMP.color);

      this.ballPitBalls.push({
        index: i,
        localX: rx,
        localY: ry,
        localZ: rz,
        originX: rx,
        originY: ry,
        originZ: rz
      });
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.scene.add(inst);
    this.assetCache.track(inst);
    this.ballPitInst = inst;

    this.ballPit = { position: pos, radius: 3.6 };
    this.registerObstacle({ type: 'ballpit_wall_n', shape: 'box', x: pos.x, z: pos.z - 3.5, halfW: 3.6, halfD: 0.25, yMin: groundY, yMax: groundY + 0.55 });
    this.registerObstacle({ type: 'ballpit_wall_s', shape: 'box', x: pos.x, z: pos.z + 3.5, halfW: 3.6, halfD: 0.25, yMin: groundY, yMax: groundY + 0.55 });
    this.registerObstacle({ type: 'ballpit_wall_w', shape: 'box', x: pos.x - 3.5, z: pos.z, halfW: 0.25, halfD: 3.6, yMin: groundY, yMax: groundY + 0.55 });
    this.registerObstacle({ type: 'ballpit_wall_e', shape: 'box', x: pos.x + 3.5, z: pos.z, halfW: 0.25, halfD: 3.6, yMin: groundY, yMax: groundY + 0.55 });
  }

  buildAgilitySlide(pos) {
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    const platformH = 4.0;

    [-1.2, 1.2].forEach(px => {
      [-1.2, 1.2].forEach(pz => {
        this._opaqueBatch.add(new THREE.CylinderGeometry(0.1, 0.12, platformH + 0.8, 10), 0x334155, pos.x + px, groundY + (platformH + 0.8) * 0.5, pos.z + pz);
      });
    });

    this._opaqueBatch.add(new THREE.BoxGeometry(2.6, 0.2, 2.6), 0x334155, pos.x, groundY + platformH, pos.z);
    [-1.2, 1.2].forEach(rx => {
      this._neonBatch.add(new THREE.BoxGeometry(0.1, 0.1, 2.5), 0x00e5ff, pos.x + rx, groundY + platformH + 0.8, pos.z);
    });

    [-0.85, 0.85].forEach(lx => {
      this._opaqueBatch.add(new THREE.CylinderGeometry(0.055, 0.055, platformH + 0.4, 8), 0x334155, pos.x + lx, groundY + (platformH + 0.4) * 0.5, pos.z - 1.25);
    });
    for (let s = 0.45; s < platformH; s += 0.52) {
      this._neonBatch.add(new THREE.CylinderGeometry(0.04, 0.04, 1.7, 8), 0x00e5ff, pos.x, groundY + s, pos.z - 1.25, 0, 0, Math.PI / 2);
    }

    const startY = platformH;
    const endY = 0.22;
    const startZ = 1.2;
    const endZ = 7.8;
    const dy = startY - endY;
    const dz = endZ - startZ;
    const chuteLength = Math.hypot(dy, dz);
    const chuteAngle = Math.atan2(dy, dz);
    const pivotY = groundY + (startY + endY) * 0.5;
    const pivotZ = pos.z + (startZ + endZ) * 0.5;

    this._opaqueBatch.add(new THREE.BoxGeometry(1.6, 0.14, chuteLength), 0x0284c7, pos.x, pivotY, pivotZ, chuteAngle, 0, 0);
    [-0.82, 0.82].forEach(rx => {
      const wy = Math.cos(chuteAngle) * 0.18;
      const wz = Math.sin(chuteAngle) * 0.18;
      this._opaqueBatch.add(new THREE.BoxGeometry(0.12, 0.36, chuteLength), 0x0284c7, pos.x + rx, pivotY + wy, pivotZ + wz, chuteAngle, 0, 0);

      const ry = Math.cos(chuteAngle) * 0.38;
      const rz = Math.sin(chuteAngle) * 0.38;
      this._neonBatch.add(new THREE.CylinderGeometry(0.05, 0.05, chuteLength, 8), 0x00e5ff, pos.x + rx, pivotY + ry, pivotZ + rz, chuteAngle + Math.PI / 2, 0, 0);
    });

    this._opaqueBatch.add(new THREE.BoxGeometry(2.4, 0.24, 2.6), 0xffea00, pos.x, groundY + 0.12, pos.z + 8.2);

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
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);

    for (let tz = -3.0; tz <= 3.0; tz += 1.0) {
      this._neonBatch.add(new THREE.TorusGeometry(1.08, 0.07, 10, 22), 0xffea00, pos.x, groundY + 1.05, pos.z + tz);
    }

    const tubeGeo = this.assetCache.getGeometry('world_course_tube_geo', () => {
      const g = new THREE.CylinderGeometry(1.04, 1.04, 6.2, 22, 1, true);
      g.rotateX(Math.PI / 2);
      return g;
    });
    const tubeMat = this.assetCache.getMaterial('world_course_tube_mat', () => new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide
    }));
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.set(pos.x, groundY + 1.05, pos.z);
    this.scene.add(tube);

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

    this.hurdles = [];
    [6.0, 10.0, 14.0].forEach((hz) => {
      [-1.3, 1.3].forEach(hx => {
        this._opaqueBatch.add(new THREE.CylinderGeometry(0.07, 0.08, 1.1, 8), 0x475569, pos.x + hx, groundY + 0.55, pos.z + hz);
        this.registerObstacle({ type: 'hurdle_post', x: pos.x + hx, z: pos.z + hz, radius: 0.18, height: 1.1 });
      });
      this._neonBatch.add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 10), 0xffea00, pos.x, groundY + 0.65, pos.z + hz, 0, 0, Math.PI / 2);
      this.hurdles.push({ position: new THREE.Vector3(pos.x, groundY, pos.z + hz), cleared: false });
    });

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
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    [-2.2, 2.2].forEach(sx => {
      this._opaqueBatch.add(new THREE.CylinderGeometry(0.11, 0.13, 5.9, 10), 0xe2e8f0, pos.x + sx, groundY + 2.95, pos.z);
    });
    this._opaqueBatch.add(new THREE.CylinderGeometry(0.08, 0.08, 4.5, 10), 0xe2e8f0, pos.x, groundY + 3.2, pos.z, 0, 0, Math.PI / 2);
    this._opaqueBatch.add(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 10), 0xe2e8f0, pos.x, groundY + 5.8, pos.z, 0, 0, Math.PI / 2);

    // Non-overlapping scoreboard housing & rim
    this._opaqueBatch.add(new THREE.BoxGeometry(2.8, 0.85, 0.26), 0x090d16, pos.x, groundY + 5.8, pos.z);
    this._neonBatch.add(new THREE.BoxGeometry(2.94, 0.96, 0.18), 0x00e5ff, pos.x, groundY + 5.8, pos.z);

    // Single merged rotating target disc
    const rotorBuilder = new StaticBatchBuilder();
    const ringConfigs = [
      { r: 2.1, thickness: 0.12, col: 0x00e5ff },
      { r: 1.35, thickness: 0.18, col: 0xffea00 },
      { r: 0.65, thickness: 0.24, col: 0xff1744 }
    ];
    ringConfigs.forEach(rc => {
      rotorBuilder.add(new THREE.CylinderGeometry(rc.r, rc.r, rc.thickness, 28), rc.col, 0, 0, 0, Math.PI / 2, 0, 0);
    });
    const rotorMat = this.assetCache.getMaterial('world_target_rotor_mat', () => new THREE.MeshBasicMaterial({
      vertexColors: true
    }));
    const targetRotor = rotorBuilder.build(rotorMat, this.assetCache, 'world_target_rotor_geo');
    targetRotor.position.set(pos.x, groundY + 3.2, pos.z);
    this.scene.add(targetRotor);

    this.targetBoard = {
      position: new THREE.Vector3(pos.x, groundY + 3.2, pos.z),
      rotor: targetRotor,
      radius: 2.1
    };
    this.registerObstacle({ type: 'target_post_l', x: pos.x - 2.2, z: pos.z, radius: 0.28, height: 5.9 });
    this.registerObstacle({ type: 'target_post_r', x: pos.x + 2.2, z: pos.z, radius: 0.28, height: 5.9 });
  }

  buildCyberPinata(pos) {
    const groundY = this.getTerrainHeightOnly(pos.x, pos.z);
    this._opaqueBatch.add(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 10), 0x475569, pos.x, groundY + 4.2, pos.z, 0, 0, Math.PI / 2);
    [-1.7, 1.7].forEach(ax => {
      this._opaqueBatch.add(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 10), 0x475569, pos.x + ax, groundY + 2.1, pos.z);
    });

    const pinBuilder = new StaticBatchBuilder();
    pinBuilder.add(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8), 0x475569, 0, -0.9, 0);
    pinBuilder.add(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10), 0xff3399, 0, -1.8, 0, 0, 0, Math.PI / 2);
    [-0.55, 0.55].forEach(bx => {
      [-0.18, 0.18].forEach(by => {
        pinBuilder.add(new THREE.SphereGeometry(0.22, 10, 10), 0xff3399, bx, -1.8 + by, 0);
      });
    });

    const pinMat = this.assetCache.getMaterial('world_dynamic_vertex_mat', () => new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.35
    }));
    const pinPivot = pinBuilder.build(pinMat, this.assetCache, 'world_pinata_geo');
    pinPivot.position.set(pos.x, groundY + 4.2, pos.z);
    pinPivot.castShadow = false;
    this.scene.add(pinPivot);

    this.pinata = {
      position: new THREE.Vector3(pos.x, groundY + 2.4, pos.z),
      pivot: pinPivot,
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
    const offsets = [
      { x: -8, z: -10, col: 0x00e5ff, rotY: 0.2 },
      { x: -3, z: -4, col: 0xffea00, rotY: -0.15 },
      { x: 3, z: 3, col: 0xff007f, rotY: 0.3 },
      { x: -2, z: 10, col: 0x22ff88, rotY: -0.2 },
      { x: 6, z: 16, col: 0xff9100, rotY: 0.25 }
    ];

    offsets.forEach((cfg, idx) => {
      const wx = pos.x + cfg.x;
      const wz = pos.z + cfg.z;
      const groundY = this.getTerrainHeightOnly(wx, wz);
      const cosY = Math.cos(cfg.rotY);
      const sinY = Math.sin(cfg.rotY);

      [-1.3, 1.3].forEach(px => {
        const postX = wx + px * cosY;
        const postZ = wz - px * sinY;
        this._opaqueBatch.add(new THREE.CylinderGeometry(0.08, 0.09, 1.8, 10), 0x334155, postX, groundY + 0.9, postZ);
        this.registerObstacle({ type: 'slalom_post', x: postX, z: postZ, radius: 0.2, height: 1.8 });
      });

      this._neonBatch.add(new THREE.TorusGeometry(1.3, 0.1, 12, 28), cfg.col, wx, groundY + 1.6, wz, 0, cfg.rotY, 0);

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
  }

  buildTreasureSpots() {
    this.treasureSpots = [
      { x: -28, z: 12, dug: false, type: 'bone', name: 'Hueso Dorado Ancestral' },
      { x: 18, z: -24, dug: false, type: 'gear', name: 'Micro-Engranaje de Titanio' },
      { x: 68, z: 28, dug: false, type: 'gem', name: 'Cristal Cuántico Resplandeciente' },
      { x: -16, z: -46, dug: false, type: 'ball', name: 'Mini-Pelota Neón Secreta' }
    ];

    const sparkleGeo = this.assetCache.getGeometry('world_sparkle_geo', () => new THREE.OctahedronGeometry(0.16, 0));
    const sparkleMat = this.assetCache.getMaterial('world_sparkle_mat', () => new THREE.MeshBasicMaterial({ color: 0xffea00 }));
    const sparkleInst = new THREE.InstancedMesh(sparkleGeo, sparkleMat, this.treasureSpots.length);

    this.treasureSpots.forEach((spot, idx) => {
      const gy = this.getTerrainHeightOnly(spot.x, spot.z);
      this._opaqueBatch.add(new THREE.CylinderGeometry(1.2, 1.4, 0.12, 14), 0x5d4037, spot.x, gy + 0.06, spot.z);

      TMP.obj.position.set(spot.x, gy + 0.35, spot.z);
      TMP.obj.rotation.set(0, 0, 0);
      TMP.obj.scale.set(1, 1, 1);
      TMP.obj.updateMatrix();
      sparkleInst.setMatrixAt(idx, TMP.obj.matrix);
      spot.index = idx;
      spot.y = gy;
    });

    sparkleInst.instanceMatrix.needsUpdate = true;
    this.scene.add(sparkleInst);
    this.assetCache.track(sparkleInst);
    this.treasureSparkleInst = sparkleInst;
  }

  revealDugTreasure(robot, spot) {
    if (!spot || spot.dug) return null;
    spot.dug = true;
    if (this.treasureSparkleInst && spot.index !== undefined) {
      TMP.obj.position.set(spot.x, -50, spot.z);
      TMP.obj.scale.set(0.0001, 0.0001, 0.0001);
      TMP.obj.updateMatrix();
      this.treasureSparkleInst.setMatrixAt(spot.index, TMP.obj.matrix);
      this.treasureSparkleInst.instanceMatrix.needsUpdate = true;
    }

    const gy = this.getHeightAt(spot.x, spot.z);
    const key = `treasure_${spot.type}`;
    const geo = this.assetCache.getGeometry(`${key}_geo`, () => {
      if (spot.type === 'bone') return new THREE.CylinderGeometry(0.08, 0.08, 0.9, 10).rotateZ(Math.PI / 2);
      if (spot.type === 'gear') return new THREE.TorusGeometry(0.28, 0.08, 10, 20);
      return new THREE.OctahedronGeometry(0.32, 0);
    });
    const mat = this.assetCache.getMaterial(`${key}_mat`, () => {
      if (spot.type === 'bone') return new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2, emissive: 0xffb700, emissiveIntensity: 0.5 });
      if (spot.type === 'gear') return new THREE.MeshStandardMaterial({ color: 0x00e5ff, metalness: 0.95, roughness: 0.1, emissive: 0x00e5ff, emissiveIntensity: 0.6 });
      return new THREE.MeshStandardMaterial({ color: 0xf43f5e, metalness: 0.3, roughness: 0.1, emissive: 0xf43f5e, emissiveIntensity: 0.8 });
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(spot.x, gy + 0.6, spot.z);
    this.scene.add(mesh);

    if (roboAudio.playSuccess) roboAudio.playSuccess();
    this.logActivity(`💎 ¡${robot.name} desenterró un tesoro oculto: ${spot.name}!`);
    return spot.name;
  }

  buildLowPolyClouds() {
    const cloudGeo = this.assetCache.getGeometry('world_cloud_puff_geo', () => new THREE.DodecahedronGeometry(1, 1));
    const cloudMat = this.assetCache.getMaterial('world_cloud_mat', () => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.02,
      transparent: true,
      opacity: 0.88
    }));

    const puffs = [];
    for (let c = 0; c < 12; c++) {
      const puffCount = 4 + Math.floor(Math.random() * 4);
      const orbitAngle = (c / 12) * Math.PI * 2;
      const dist = 60 + Math.random() * 120;
      const cy = 52 + Math.random() * 18;
      const speed = (0.35 + Math.random() * 0.45) * 0.012;

      for (let p = 0; p < puffCount; p++) {
        puffs.push({
          orbitAngle,
          dist,
          cy: cy + (Math.random() - 0.5) * 1.5,
          ox: (p - puffCount / 2) * 4.5 + (Math.random() - 0.5) * 2,
          oz: (Math.random() - 0.5) * 3,
          rad: 3.5 + Math.random() * 4.2,
          speed
        });
      }
    }

    const inst = new THREE.InstancedMesh(cloudGeo, cloudMat, puffs.length);
    inst.frustumCulled = false;
    for (let i = 0; i < puffs.length; i++) {
      const pf = puffs[i];
      const cx = Math.cos(pf.orbitAngle) * pf.dist + pf.ox;
      const cz = Math.sin(pf.orbitAngle) * pf.dist + pf.oz;
      TMP.obj.position.set(cx, pf.cy, cz);
      TMP.obj.rotation.set(0, 0, 0);
      TMP.obj.scale.setScalar(pf.rad);
      TMP.obj.updateMatrix();
      inst.setMatrixAt(i, TMP.obj.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);
    this.assetCache.track(inst);
    this.cloudsInst = inst;
    this.clouds = puffs;
  }

  buildAmbientParticles() {
    const count = 120;
    const geom = this.assetCache.getGeometry('world_ambient_pts_geo', () => {
      const g = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 240;
        positions[i * 3 + 1] = 1.0 + Math.random() * 12;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 240;
      }
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      return g;
    });

    const pMat = this.assetCache.getMaterial('world_ambient_pts_mat', () => new THREE.PointsMaterial({
      color: 0x22ff88,
      size: 0.45,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));

    const pSystem = new THREE.Points(geom, pMat);
    this.scene.add(pSystem);
    this.ambientParticles = pSystem;
  }

  spawnSoccerBall(pos, radius) {
    const ballGeo = this.assetCache.getGeometry(`world_soccer_geo_${radius}`, () => new THREE.SphereGeometry(radius, 24, 24));
    const ballMat = this.assetCache.getMaterial('world_soccer_mat', () => new THREE.MeshStandardMaterial({
      map: this.textures.soccer,
      roughness: 0.35,
      metalness: 0.1
    }));
    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.copy(pos);
    mesh.castShadow = false;
    this.scene.add(mesh);

    const ball = {
      mesh,
      radius,
      type: 'soccer',
      velocity: new THREE.Vector3(),
      mass: radius * 1.8,
      bounciness: 0.8,
      drag: 1.45
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
      ball.carriedBy.dropObject?.();
      ball.carriedBy = null;
    }

    TMP.v1.copy(direction);
    TMP.v1.y = 0;
    if (TMP.v1.lengthSq() > 1e-6) TMP.v1.normalize();
    else TMP.v1.set(0, 0, 1);

    ball.mesh.position.set(
      originPos.x + TMP.v1.x * 2.2,
      originPos.y + 1.2,
      originPos.z + TMP.v1.z * 2.2
    );
    ball.velocity.set(TMP.v1.x * force, 8.5, TMP.v1.z * force);

    if (roboAudio.playBark) roboAudio.playBark(1.25);
    this.logActivity(`🎾 ¡Lanzaste la pelota de fútbol! ¡A buscarla!`);
    return ball;
  }

  kickBall(ball, dir, power = 12) {
    const targetBall = ball || this.soccerBall;
    if (!targetBall) return;
    if (targetBall.carriedBy) {
      targetBall.carriedBy.dropObject?.();
      targetBall.carriedBy = null;
    }
    TMP.v1.copy(dir);
    TMP.v1.y = 0;
    if (TMP.v1.lengthSq() > 1e-6) TMP.v1.normalize();
    else TMP.v1.set(0, 0, 1);

    targetBall.velocity.x += TMP.v1.x * power;
    targetBall.velocity.z += TMP.v1.z * power;
    targetBall.velocity.y += Math.max(2.0, power * 0.25);
    if (roboAudio.playFootstep) roboAudio.playFootstep(1.2);
  }

  spawnBall(pos, radius, colorHex, type = 'ball') {
    const ballGeo = this.assetCache.getGeometry(`world_ball_geo_${radius}`, () => new THREE.SphereGeometry(radius, 20, 20));
    const ballMat = this.assetCache.getMaterial(`world_ball_mat_${colorHex}_${type}`, () => new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: type === 'neon' ? colorHex : 0x000000,
      emissiveIntensity: type === 'neon' ? 0.65 : 0,
      roughness: 0.35
    }));

    const mesh = new THREE.Mesh(ballGeo, ballMat);
    mesh.position.copy(pos);
    mesh.castShadow = false;
    this.scene.add(mesh);

    const ball = {
      mesh,
      radius,
      type,
      velocity: new THREE.Vector3(),
      mass: radius * 1.4,
      bounciness: 0.82,
      drag: 1.65
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
    if (!this.boneInst) {
      const boneGeo = this.assetCache.getGeometry('world_bone_toy_geo', () => {
        const b = new StaticBatchBuilder();
        b.add(new THREE.CylinderGeometry(0.12, 0.12, 1.25, 10), 0x00e5ff, 0, 0, 0, 0, 0, Math.PI / 2);
        [-0.65, 0.65].forEach(x => {
          [-0.15, 0.15].forEach(y => {
            b.add(new THREE.SphereGeometry(0.22, 10, 10), 0x00e5ff, x, y, 0);
          });
        });
        const m = mergeGeometries(b._parts, false);
        for (let i = 0; i < b._parts.length; i++) b._parts[i].dispose();
        b._parts.length = 0;
        return m;
      });
      const boneMat = this.assetCache.getMaterial('world_bone_toy_mat', () => new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.8,
        roughness: 0.2
      }));
      this.boneInst = new THREE.InstancedMesh(boneGeo, boneMat, 3);
      this.boneInst.frustumCulled = false;
      this.scene.add(this.boneInst);
      this.assetCache.track(this.boneInst);
    }

    const idx = this.boneToys.length;
    const proxy = new THREE.Object3D();
    proxy.position.copy(pos);
    this.scene.add(proxy);

    if (idx < 3) {
      TMP.obj.position.copy(pos);
      TMP.obj.rotation.set(0, 0, 0);
      TMP.obj.scale.set(1, 1, 1);
      TMP.obj.updateMatrix();
      this.boneInst.setMatrixAt(idx, TMP.obj.matrix);
      this.boneInst.instanceMatrix.needsUpdate = true;
    }

    this.boneToys.push({ index: idx, proxy });
    this.interactiveObjects.push({
      type: 'bone',
      object: proxy,
      name: 'Hueso de Energía',
      radius: 1.1
    });
  }

  spawnCyberSnack(pos) {
    const biscuitGeo = this.assetCache.getGeometry('world_snack_geo', () => new THREE.CylinderGeometry(0.25, 0.25, 0.08, 14));
    const biscuitMat = this.assetCache.getMaterial('world_snack_mat', () => new THREE.MeshStandardMaterial({
      color: 0xffea00,
      emissive: 0xffea00,
      emissiveIntensity: 0.7,
      roughness: 0.3
    }));
    const biscuit = new THREE.Mesh(biscuitGeo, biscuitMat);
    biscuit.position.copy(pos);
    biscuit.position.y = this.getHeightAt(pos.x, pos.z) + 0.4;

    this.scene.add(biscuit);
    this.snacks.push({ group: biscuit, age: 0 });
    this.logActivity(`🍪 ¡Apareció una galleta energética en el parque!`);
    if (roboAudio.playSuccess) roboAudio.playSuccess();
  }

  triggerDiscoParty() {
    this.discoPartyActive = true;
    this.discoTimer = 12.0;
    this._discoBeatAccum = 0;
    this.logActivity(`🪩 ¡FIESTA DISCO ACTIVADA! ¡A bailar todos!`);
    if (roboAudio.playSuccess) roboAudio.playSuccess();
  }

  triggerTargetHit(pts, ball = null) {
    if (ball && ball.lastTargetHit && performance.now() - ball.lastTargetHit < 800) return;
    if (ball) ball.lastTargetHit = performance.now();

    this.targetScore += pts;
    this.logActivity(`🎯 ¡DIANA ACERTADA! +${pts} PUNTOS | Total: ${this.targetScore}`);
    if (roboAudio.playSuccess) roboAudio.playSuccess();

    if (this.eventBus) {
      this.eventBus.emit('world:scoreTarget', { score: this.targetScore, points: pts });
      this.eventBus.emit('camera:trauma', { amount: 0.35 });
      this.eventBus.emit('haptic:pulse', { pattern: 20 });
    }
    if (this.onTargetHit) this.onTargetHit(this.targetScore);

    if (ball) {
      ball.velocity.x *= -1.1;
      ball.velocity.z *= -1.1;
      ball.velocity.y = 4.5;
    }
  }

  buildDetailedNature() {
    const trunkSpecs = [];
    const foliageSpecs = [];

    const innerLeafColors = [0x388e3c, 0x2e7d32, 0x4caf50];
    const outerLeafColors = [0x1b5e20, 0x2e7d32, 0x1e4620, 0x276749];

    // Inner playable valley trees
    for (let i = 0; i < 95; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 32 + Math.random() * 155;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (Math.hypot(x - LAKE_CENTER_X, z - LAKE_CENTER_Z) < 70) continue;
      if (Math.hypot(x - 50, z - 40) < 46) continue;
      if (Math.hypot(x - (-46), z - (-48)) < 14) continue;
      if (Math.hypot(x - (-32), z - 48) < 10) continue;
      if (Math.hypot(x - (-18), z - (-32)) < 12) continue;
      if (Math.hypot(x - 22, z - (-50)) < 16) continue;

      const ty = this.getTerrainHeightOnly(x, z);
      const height = 4.2 + Math.random() * 3.5;
      const leafCol = innerLeafColors[i % innerLeafColors.length];

      trunkSpecs.push({ x, y: ty + height * 0.5, z, r: 0.48, h: height });
      for (let l = 0; l < 3; l++) {
        foliageSpecs.push({
          x,
          y: ty + height + l * 1.9,
          z,
          r: 3.4 - l * 0.8,
          h: 3.2,
          col: leafCol
        });
      }
      this.registerObstacle({ type: 'tree', x, z, radius: 0.85, height: 7.0 });
    }

    // Outer perimeter forest (no shadow-casting overhead on distant trees, merged into same 2 InstancedMeshes + neonBatch!)
    for (let i = 0; i < 185; i++) {
      const angle = (i / 185) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
      const dist = 102 + Math.random() * 145;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      const ty = this.getTerrainHeightOnly(x, z);
      const height = 6.5 + Math.random() * 7.5;
      const leafCol = outerLeafColors[i % outerLeafColors.length];

      trunkSpecs.push({ x, y: ty + height * 0.5, z, r: 0.72, h: height });

      if (i % 5 === 0) {
        this._neonBatch.add(
          new THREE.TorusGeometry(0.7, 0.08, 8, 14),
          0x00f2fe,
          x, ty + height * 0.42, z,
          Math.PI / 2, 0, 0
        );
      }

      const numTiers = 3 + (i % 2);
      for (let l = 0; l < numTiers; l++) {
        foliageSpecs.push({
          x,
          y: ty + height + l * 2.1,
          z,
          r: 4.6 - l * 0.75,
          h: 3.8,
          col: leafCol
        });
      }
    }

    // 1 InstancedMesh for ALL ~250 tree trunks
    const trunkGeo = this.assetCache.getGeometry('world_tree_trunk_geo', () => new THREE.CylinderGeometry(0.8, 1.15, 1, 7));
    const trunkMat = this.assetCache.getMaterial('world_tree_trunk_mat', () => new THREE.MeshStandardMaterial({
      map: this.textures.wood,
      roughness: 0.86
    }));
    const trunksInst = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkSpecs.length);
    trunksInst.castShadow = false;
    for (let i = 0; i < trunkSpecs.length; i++) {
      const t = trunkSpecs[i];
      TMP.obj.position.set(t.x, t.y, t.z);
      TMP.obj.rotation.set(0, 0, 0);
      TMP.obj.scale.set(t.r, t.h, t.r);
      TMP.obj.updateMatrix();
      trunksInst.setMatrixAt(i, TMP.obj.matrix);
    }
    trunksInst.instanceMatrix.needsUpdate = true;
    this.scene.add(trunksInst);
    this.assetCache.track(trunksInst);

    // 1 InstancedMesh for ALL ~850 foliage cones
    const foliageGeo = this.assetCache.getGeometry('world_tree_foliage_geo', () => new THREE.ConeGeometry(1, 1, 7));
    const foliageMat = this.assetCache.getMaterial('world_tree_foliage_mat', () => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65
    }));
    const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, foliageSpecs.length);
    foliageInst.castShadow = true;
    for (let i = 0; i < foliageSpecs.length; i++) {
      const f = foliageSpecs[i];
      TMP.obj.position.set(f.x, f.y, f.z);
      TMP.obj.rotation.set(0, (i * 0.7) % (Math.PI * 2), 0);
      TMP.obj.scale.set(f.r, f.h, f.r);
      TMP.obj.updateMatrix();
      foliageInst.setMatrixAt(i, TMP.obj.matrix);

      TMP.color.setHex(f.col);
      foliageInst.setColorAt(i, TMP.color);
    }
    foliageInst.instanceMatrix.needsUpdate = true;
    if (foliageInst.instanceColor) foliageInst.instanceColor.needsUpdate = true;
    this.scene.add(foliageInst);
    this.assetCache.track(foliageInst);

    // Wildflowers via InstancedMesh (1 draw call)
    const flowerGeo = this.assetCache.getGeometry('world_flower_geo', () => new THREE.SphereGeometry(0.2, 6, 6));
    const flwMat = this.assetCache.getMaterial('world_flower_mat', () => new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      emissive: 0x333333,
      emissiveIntensity: 0.35
    }));
    const flowerInst = new THREE.InstancedMesh(flowerGeo, flwMat, 240);
    const flowerColors = [0xffeb3b, 0xff4081, 0x00e5ff, 0xab47bc, 0xff7043, 0x76ff03];

    for (let i = 0; i < 240; i++) {
      const x = (Math.random() - 0.5) * 350;
      const z = (Math.random() - 0.5) * 350;
      if (Math.hypot(x - LAKE_CENTER_X, z - LAKE_CENTER_Z) < 65) {
        TMP.obj.position.set(0, -50, 0);
        TMP.obj.scale.setScalar(0.0001);
      } else {
        const y = this.getTerrainHeightOnly(x, z) + 0.16;
        TMP.obj.position.set(x, y, z);
        TMP.obj.scale.setScalar(0.7 + Math.random() * 0.6);
      }
      TMP.obj.rotation.set(0, 0, 0);
      TMP.obj.updateMatrix();
      flowerInst.setMatrixAt(i, TMP.obj.matrix);

      TMP.color.setHex(flowerColors[i % flowerColors.length]);
      flowerInst.setColorAt(i, TMP.color);
    }
    flowerInst.instanceMatrix.needsUpdate = true;
    if (flowerInst.instanceColor) flowerInst.instanceColor.needsUpdate = true;
    this.scene.add(flowerInst);
    this.assetCache.track(flowerInst);

    // Cyber-Butterflies via InstancedMesh (24 Sprites -> 1 draw call!)
    const bflyGeo = this.assetCache.getGeometry('world_bfly_geo', () => new THREE.PlaneGeometry(0.7, 0.7));
    const bflyMat = this.assetCache.getMaterial('world_bfly_mat', () => new THREE.MeshBasicMaterial({
      map: this.textures.butterfly,
      alphaTest: 0.25,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    }));
    const bflyInst = new THREE.InstancedMesh(bflyGeo, bflyMat, 24);
    this.butterflies = [];

    for (let i = 0; i < 24; i++) {
      const bx = (Math.random() - 0.5) * 210;
      const bz = (Math.random() - 0.5) * 210;
      const by = this.getTerrainHeightOnly(bx, bz) + 1.5 + Math.random() * 2.5;
      this.butterflies.push({
        index: i,
        baseX: bx,
        baseY: by,
        baseZ: bz,
        position: new THREE.Vector3(bx, by, bz),
        phase: Math.random() * Math.PI * 2,
        speed: 1.6 + Math.random()
      });

      TMP.obj.position.set(bx, by, bz);
      TMP.obj.rotation.set(-Math.PI * 0.35, 0, 0);
      TMP.obj.scale.setScalar(1);
      TMP.obj.updateMatrix();
      bflyInst.setMatrixAt(i, TMP.obj.matrix);
    }
    bflyInst.instanceMatrix.needsUpdate = true;
    this.scene.add(bflyInst);
    this.assetCache.track(bflyInst);
    this.butterfliesInst = bflyInst;
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

  getTerrainHeightOnly(x, z) {
    const distToLake = Math.hypot(x - LAKE_CENTER_X, z - LAKE_CENTER_Z);
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

  clampToWorld(pos, margin = 0) {
    const maxR = Math.max(10, WORLD_RADIUS - margin);
    const dist = Math.hypot(pos.x, pos.z);
    if (dist > maxR && dist > 0.0001) {
      const f = maxR / dist;
      pos.x *= f;
      pos.z *= f;
      return true;
    }
    return false;
  }

  resolveObstacleCollisions(pos, radius = 0.75, height = 1.0, outNormal = null) {
    let collided = false;
    const obstacles = this.getNearObstacles(pos.x, pos.z, this._nearCache);
    const posY = pos.y;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
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

        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;

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

    if (this.clampToWorld(pos, 0)) {
      collided = true;
      if (outNormal) {
        const d = Math.hypot(pos.x, pos.z) || 1;
        outNormal.set(-pos.x / d, 0, -pos.z / d);
      }
    }
    return collided;
  }

  update(dt, elapsedTime = 0) {
    const delta = Math.min(dt || 0.016, 0.05);
    this.waterTime += delta;

    if (this.waterMesh) {
      this.waterMesh.material.opacity = 0.85 + Math.sin(this.waterTime * 2.2) * 0.04;
      this.textures.water.offset.x = (this.waterTime * 0.025) % 1;
      this.textures.water.offset.y = (this.waterTime * 0.018) % 1;
    }

    // Clouds InstancedMesh update
    if (this.cloudsInst && this.clouds.length > 0) {
      for (let i = 0; i < this.clouds.length; i++) {
        const pf = this.clouds[i];
        pf.orbitAngle += delta * pf.speed;
        const cx = Math.cos(pf.orbitAngle) * pf.dist + pf.ox;
        const cz = Math.sin(pf.orbitAngle) * pf.dist + pf.oz;
        TMP.obj.position.set(cx, pf.cy, cz);
        TMP.obj.rotation.set(0, pf.orbitAngle, 0);
        TMP.obj.scale.setScalar(pf.rad);
        TMP.obj.updateMatrix();
        this.cloudsInst.setMatrixAt(i, TMP.obj.matrix);
      }
      this.cloudsInst.instanceMatrix.needsUpdate = true;
    }

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

    // Ball-pit InstancedMesh spring return (zero-alloc)
    if (this.ballPitInst && this.ballPitBalls.length > 0) {
      const ox = this.ballPitOrigin.x;
      const oy = this.ballPitOrigin.y;
      const oz = this.ballPitOrigin.z;
      for (let i = 0; i < this.ballPitBalls.length; i++) {
        const b = this.ballPitBalls[i];
        b.localX = damp(b.localX, b.originX, 2.5, delta);
        b.localZ = damp(b.localZ, b.originZ, 2.5, delta);
        b.localY = b.originY + Math.sin(this.waterTime * 3.0 + b.originX) * 0.035;

        TMP.obj.position.set(ox + b.localX, oy + b.localY, oz + b.localZ);
        TMP.obj.rotation.set(0, 0, 0);
        TMP.obj.scale.set(1, 1, 1);
        TMP.obj.updateMatrix();
        this.ballPitInst.setMatrixAt(b.index, TMP.obj.matrix);
      }
      this.ballPitInst.instanceMatrix.needsUpdate = true;
    }

    if (this.toyBoat) {
      this.toyBoat.position.y = Math.sin(this.waterTime * 1.8) * 0.12;
      this.toyBoat.rotation.z = Math.sin(this.waterTime * 1.4) * 0.06;
      this.toyBoat.rotation.y += delta * 0.15;
    }

    if (this.carouselGroup) {
      this.carouselAngle += delta * 1.2;
      this.carouselGroup.rotation.y = this.carouselAngle;
    }

    if (this.discoPartyActive) {
      this.discoTimer -= delta;
      if (this.discoBall) this.discoBall.rotation.y += delta * 4.0;

      this._discoBeatAccum += delta;
      if (this._discoBeatAccum >= 0.36) {
        this._discoBeatAccum -= 0.36;
        if (roboAudio.playDanceBeat) roboAudio.playDanceBeat();
      }

      if (this.discoTilesInst) {
        for (let i = 0; i < 16; i++) {
          const pulse = 0.55 + Math.sin(this.waterTime * 10 + i) * 0.45;
          TMP.color.setHex(this.discoTileColors[i]).multiplyScalar(pulse);
          this.discoTilesInst.setColorAt(i, TMP.color);
        }
        if (this.discoTilesInst.instanceColor) this.discoTilesInst.instanceColor.needsUpdate = true;
      }

      if (this.discoTimer <= 0) {
        this.discoPartyActive = false;
        if (this.discoTilesInst) {
          for (let i = 0; i < 16; i++) {
            TMP.color.setHex(this.discoTileColors[i]).multiplyScalar(0.55);
            this.discoTilesInst.setColorAt(i, TMP.color);
          }
          if (this.discoTilesInst.instanceColor) this.discoTilesInst.instanceColor.needsUpdate = true;
        }
      }
    }

    if (this.boneInst && this.boneToys.length > 0) {
      for (let i = 0; i < this.boneToys.length; i++) {
        const b = this.boneToys[i];
        b.proxy.rotation.y += delta * 1.2;
        b.proxy.updateMatrix();
        this.boneInst.setMatrixAt(b.index, b.proxy.matrix);
      }
      this.boneInst.instanceMatrix.needsUpdate = true;
    }

    // Instanced butterflies (zero-alloc)
    if (this.butterfliesInst && this.butterflies.length > 0) {
      for (let i = 0; i < this.butterflies.length; i++) {
        const b = this.butterflies[i];
        b.phase += delta * b.speed;
        const bx = b.baseX + Math.sin(b.phase) * 3.0;
        const bz = b.baseZ + Math.cos(b.phase * 0.7) * 3.0;
        const by = b.baseY + Math.sin(b.phase * 2.5) * 0.6;
        b.position.set(bx, by, bz);

        const flap = 0.55 + Math.abs(Math.sin(b.phase * 8.0)) * 0.6;
        TMP.obj.position.set(bx, by, bz);
        TMP.obj.rotation.set(-Math.PI * 0.35, b.phase, 0);
        TMP.obj.scale.set(flap, 1, 1);
        TMP.obj.updateMatrix();
        this.butterfliesInst.setMatrixAt(b.index, TMP.obj.matrix);
      }
      this.butterfliesInst.instanceMatrix.needsUpdate = true;
    }

    if (this.fountainJet) {
      this.fountainJet.rotation.y += delta * 0.75;
      this.fountainJet.scale.y = 1.0 + Math.sin(this.waterTime * 6.0) * 0.16;
    }

    if (this.seesaw) {
      this.seesaw.pivot.rotation.z = damp(this.seesaw.pivot.rotation.z, this.seesaw.targetTilt, 5.0, delta);
      this.seesaw.targetTilt = damp(this.seesaw.targetTilt, 0, 2.5, delta);
    }

    // Physical balls update (zero-alloc)
    const hitNormal = TMP.v1;
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];
      if (ball.carriedBy) continue;

      const subSteps = 2;
      const subDelta = delta / subSteps;

      for (let step = 0; step < subSteps; step++) {
        ball.velocity.y -= 9.8 * subDelta;
        ball.mesh.position.addScaledVector(ball.velocity, subDelta);

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

      const dragFactor = Math.exp(-ball.drag * delta);
      ball.velocity.x *= dragFactor;
      ball.velocity.z *= dragFactor;

      const rollSpeed = Math.hypot(ball.velocity.x, ball.velocity.z);
      if (rollSpeed > 0.05) {
        ball.mesh.rotation.x += ball.velocity.z * delta / ball.radius;
        ball.mesh.rotation.z -= ball.velocity.x * delta / ball.radius;
      }

      if (ball.type === 'soccer' && this.soccerGoal) {
        const gx = this.soccerGoal.position.x;
        const gz = this.soccerGoal.position.z;
        const bx = ball.mesh.position.x;
        const bz = ball.mesh.position.z;
        if (bx < gx + 0.3 && bx > gx - this.soccerGoal.depth && Math.abs(bz - gz) < this.soccerGoal.width * 0.46 && ball.mesh.position.y < this.soccerGoal.height) {
          this.handleGoalScored(ball);
        }
      }

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
          this.triggerTargetHit(pts, ball);
        }
      }
    }

    // Ball-to-Ball Elastic Collisions (zero-alloc)
    const diff = TMP.v2;
    const relVel = TMP.v3;
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const b1 = this.balls[i];
        const b2 = this.balls[j];
        if (b1.carriedBy || b2.carriedBy) continue;

        diff.subVectors(b2.mesh.position, b1.mesh.position);
        const dist = diff.length();
        const minDist = b1.radius + b2.radius;

        if (dist < minDist && dist > 0.001) {
          diff.divideScalar(dist); // normal
          const overlap = minDist - dist;
          b1.mesh.position.addScaledVector(diff, -overlap * 0.5);
          b2.mesh.position.addScaledVector(diff, overlap * 0.5);

          relVel.subVectors(b2.velocity, b1.velocity);
          const sepVel = relVel.dot(diff);
          if (sepVel < 0) {
            const impulse = -(1 + 0.8) * sepVel / (1 / b1.mass + 1 / b2.mass);
            b1.velocity.addScaledVector(diff, -impulse / b1.mass);
            b2.velocity.addScaledVector(diff, impulse / b2.mass);
          }
        }
      }
    }

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
    if (roboAudio.playSuccess) roboAudio.playSuccess();

    if (this.eventBus) {
      this.eventBus.emit('world:scoreGoal', { score: this.goalScore });
      this.eventBus.emit('camera:trauma', { amount: 0.45 });
      this.eventBus.emit('haptic:pulse', { pattern: [25, 40, 25] });
    }

    ball.mesh.position.set(45, 1.5, 40);
    ball.velocity.set(0, 2, 0);
  }

  launchTrampoline(robot) {
    if (!robot) return;
    const rPos = robot.group.position;
    rPos.x = this.trampolinePos.x;
    rPos.z = this.trampolinePos.z;
    if (roboAudio.playTrampoline) roboAudio.playTrampoline();
    const anim = robot.animController;
    if (anim) anim.play('backflip', 1.8);

    if (robot.physics) {
      robot.physics.velocityY = 14.5;
      robot.physics.isGrounded = false;
    } else {
      robot.velocityY = 14.5;
    }
    robot.energy = Math.min(100, (robot.energy || 100) + 20);
    if (robot.isPlayer && this.eventBus) {
      this.eventBus.emit('camera:trauma', { amount: 0.35 });
      this.eventBus.emit('haptic:pulse', { pattern: 20 });
    }
    this.logActivity(`🤸 ¡${robot.name} ejecutó una gran pirueta aérea en el trampolín!`);
  }

  handleRobotInteractions(robot, animController = null, dt = 0.016) {
    if (!robot || !robot.group) return;
    const rPos = robot.group.position;
    const anim = animController || robot.animController;
    const delta = Math.min(dt || 0.016, 0.05);
    const now = performance.now();

    // 0. Solid Obstacle Collisions Pushout
    this.resolveObstacleCollisions(rPos, 0.75, 1.2);

    // Lake Swimming & Drying Shake-Off (Respects elevated Pier & Bridge!)
    const distToLake = Math.hypot(rPos.x - LAKE_CENTER_X, rPos.z - LAKE_CENTER_Z);
    const surfaceY = this.getHeightAt(rPos.x, rPos.z);

    if (distToLake < 58.0 && surfaceY < -0.1) {
      robot.isInWater = true;
      rPos.y = -0.52;

      if (!robot.wasInWater) {
        robot.wasInWater = true;
        if (roboAudio.playJump) roboAudio.playJump(0.75);
        this.logActivity(`🏊 ¡${robot.name} se zambulló en el Lago de Cristal y está nadando!`);
        if (anim && anim.currentAnim !== 'swimming') {
          anim.play('swimming');
        }
      }
    } else if (robot.wasInWater) {
      robot.wasInWater = false;
      robot.isInWater = false;
      if (roboAudio.playFootstep) roboAudio.playFootstep(0.8);
      this.logActivity(`🐕 ¡${robot.name} salió del lago a tierra firme y se sacude para secarse!`);
      if (anim) anim.play('shakeOff', 2.0);
    }

    // Slalom Rings Check
    if (this.slalomRings) {
      for (let i = 0; i < this.slalomRings.length; i++) {
        const ring = this.slalomRings[i];
        const d = rPos.distanceTo(ring.position);
        if (d < ring.radius + 0.4 && (!ring.lastCleared || now - ring.lastCleared > 3000)) {
          ring.lastCleared = now;
          if (roboAudio.playSuccess) roboAudio.playSuccess();
          this.logActivity(`⭕ ¡${robot.name} atravesó con precisión el aro #${ring.index + 1}!`);
        }
      }
    }

    // 1. Water Fountain Hydration
    if (this.waterFountain) {
      const fDist = Math.hypot(rPos.x - this.waterFountain.position.x, rPos.z - this.waterFountain.position.z);
      if (fDist < 2.9 && (!robot.lastDrinkTime || now - robot.lastDrinkTime > 7000)) {
        robot.lastDrinkTime = now;
        if (robot.quenchThirst) robot.quenchThirst(35);
        else robot.hydration = 100;
        this.logActivity(`💧 ¡${robot.name} tomó agua fresca en la cibercuenca y calmó su sed!`);
      }
    }

    // 2. Seesaw Interaction (frame-rate independent)
    if (this.seesaw) {
      const sDist = Math.hypot(rPos.x - this.seesaw.position.x, rPos.z - this.seesaw.position.z);
      if (sDist < 5.4) {
        const relX = rPos.x - this.seesaw.position.x;
        this.seesaw.targetTilt = THREE.MathUtils.clamp(-relX * 0.055, -0.25, 0.25);
      }
    }

    // 3. Trampoline Bounce (velocityY impulse, zero teleport)
    const trampDist = Math.hypot(rPos.x - this.trampolinePos.x, rPos.z - this.trampolinePos.z);
    if (trampDist < 2.8 && (!robot.lastTrampTime || now - robot.lastTrampTime > 1200)) {
      robot.lastTrampTime = now;
      robot.trampConsecutiveHits = ((robot.trampConsecutiveHits || 0) % 4) + 1;
      const bounceVel = 9.5 + robot.trampConsecutiveHits * 2.2;
      if (roboAudio.playTrampoline) roboAudio.playTrampoline();
      if (anim) anim.play('backflip', 1.8);

      if (robot.physics) {
        robot.physics.velocityY = bounceVel;
        robot.physics.isGrounded = false;
      } else {
        robot.velocityY = bounceVel;
      }
      robot.energy = Math.min(100, (robot.energy || 100) + 10);
      if (robot.isPlayer && this.eventBus) {
        this.eventBus.emit('camera:trauma', { amount: 0.32 });
        this.eventBus.emit('haptic:pulse', { pattern: 20 });
      }
      this.logActivity(`🤸 ¡${robot.name} dio su rebote #${robot.trampConsecutiveHits} en el trampolín!`);
    }

    // 4. Carousel Ride (synchronized with delta * 1.2)
    if (this.carousel) {
      const dist = Math.hypot(rPos.x - this.carousel.position.x, rPos.z - this.carousel.position.z);
      if (dist < 3.6 && dist > 0.6) {
        const a = Math.atan2(rPos.z - this.carousel.position.z, rPos.x - this.carousel.position.x);
        const stepA = 1.2 * delta;
        const newA = a + stepA;
        rPos.x = this.carousel.position.x + Math.cos(newA) * dist;
        rPos.z = this.carousel.position.z + Math.sin(newA) * dist;
        robot.group.rotation.y += stepA;
      }
    }

    // 5. Cyber Ball Pit Splash Interaction (InstancedMesh + dt-scaled)
    if (this.ballPit && this.ballPitInst) {
      const bDist = Math.hypot(rPos.x - this.ballPit.position.x, rPos.z - this.ballPit.position.z);
      if (bDist < 3.2) {
        const relX = rPos.x - this.ballPit.position.x;
        const relZ = rPos.z - this.ballPit.position.z;
        const pushScale = Math.min(1, delta * 14) * 0.25;

        for (let i = 0; i < this.ballPitBalls.length; i++) {
          const b = this.ballPitBalls[i];
          const dx = b.localX - relX;
          const dz = b.localZ - relZ;
          const d = Math.hypot(dx, dz);
          if (d < 1.4 && d > 0.01) {
            b.localX = THREE.MathUtils.clamp(b.localX + (dx / d) * pushScale, -3.1, 3.1);
            b.localZ = THREE.MathUtils.clamp(b.localZ + (dz / d) * pushScale, -3.1, 3.1);
          }
        }

        if (!robot.lastBallPitTime || now - robot.lastBallPitTime > 3500) {
          robot.lastBallPitTime = now;
          if (roboAudio.playFootstep) roboAudio.playFootstep(1.3);
          this.logActivity(`🏊 ¡${robot.name} se zambulló en la piscina de pelotas de colores!`);
          robot.playfulness = 100;
          robot.energy = Math.min(100, (robot.energy || 100) + 8);
        }
      }
    }

    // 6. Agility Slide (dt-driven, zero setInterval)
    if (this.slide) {
      if (robot.isSliding) {
        robot._slideProgress = Math.min(1.0, (robot._slideProgress || 0) + delta * 1.4);
        rPos.lerpVectors(this.slide.topPos, this.slide.endPos, robot._slideProgress);
        if (robot._slideProgress >= 1.0) {
          robot.isSliding = false;
          robot._slideProgress = 0;
          rPos.copy(this.slide.endPos);
          if (anim) anim.play('backflip', 1.5);
          if (roboAudio.playSuccess) roboAudio.playSuccess();
          this.logActivity(`🤸 ¡${robot.name} aterrizó en la colchoneta del tobogán con estilo!`);
        }
      } else {
        const distToTop = Math.hypot(rPos.x - this.slide.topPos.x, rPos.z - this.slide.topPos.z);
        if (distToTop < 2.0) {
          robot.isSliding = true;
          robot._slideProgress = 0;
          this.logActivity(`🎢 ¡${robot.name} se subió al tobogán y se desliza a toda velocidad!`);
          if (roboAudio.playJump) roboAudio.playJump(1.2);
          if (anim) anim.play('roll', 1.2);
        }
      }
    }

    // 7. Agility Tunnel (dt-driven timer, zero setTimeout)
    if (this.obstacleCourse && this.obstacleCourse.tunnel) {
      if (robot.inTunnel) {
        robot._tunnelTimer = (robot._tunnelTimer || 0) - delta;
        if (robot._tunnelTimer <= 0) {
          robot.inTunnel = false;
          if (anim) anim.play('howl', 1.5);
        }
      } else {
        const tStart = this.obstacleCourse.tunnel.start;
        const tDist = Math.hypot(rPos.x - tStart.x, rPos.z - tStart.z);
        if (tDist < 1.5) {
          robot.inTunnel = true;
          robot._tunnelTimer = 1.6;
          this.logActivity(`🌀 ¡${robot.name} se agachó y pasó velozmente por el túnel de agilidad!`);
          if (anim) anim.play('sneak', 1.6);
          if (roboAudio.playFootstep) roboAudio.playFootstep(1.1);
        }
      }
    }

    // 8. Cyber Piñata Strike
    if (this.pinata) {
      const pDist = Math.hypot(rPos.x - this.pinata.position.x, rPos.z - this.pinata.position.z);
      const groundY = this.getHeightAt(rPos.x, rPos.z);
      if (pDist < 2.0 && rPos.y > groundY + 0.3 && (!this.pinata.lastHit || now - this.pinata.lastHit > 1000)) {
        this.pinata.lastHit = now;
        this.pinata.hits++;
        this.pinata.swingVel = 4.2;
        if (roboAudio.playBark) roboAudio.playBark(1.3);
        if (this.eventBus) this.eventBus.emit('camera:trauma', { amount: 0.25 });
        this.logActivity(`🪅 ¡${robot.name} golpeó la piñata! (Golpe ${this.pinata.hits}/${this.pinata.maxHits})`);

        if (this.pinata.hits >= this.pinata.maxHits) {
          this.pinata.hits = 0;
          this.logActivity(`🎊 ¡¡¡LA PIÑATA EXPLOTÓ EN GALLETAS PARA TODA LA MANADA!!! 🍪`);
          if (roboAudio.playSuccess) roboAudio.playSuccess();
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            TMP.v4.set(
              this.pinata.position.x + Math.cos(a) * (2.0 + Math.random() * 2),
              0,
              this.pinata.position.z + Math.sin(a) * (2.0 + Math.random() * 2)
            );
            this.spawnCyberSnack(TMP.v4);
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

    // 10. Eat Snacks (shared cached geometry/material — zero leak!)
    for (let i = this.snacks.length - 1; i >= 0; i--) {
      const snack = this.snacks[i];
      const dist = Math.hypot(rPos.x - snack.group.position.x, rPos.z - snack.group.position.z);
      if (dist < 1.4) {
        this.scene.remove(snack.group);
        this.snacks.splice(i, 1);
        robot.energy = 100;
        if (roboAudio.playSuccess) roboAudio.playSuccess();
        this.logActivity(`😋 ¡${robot.name} se comió una galleta y recuperó 100% de energía!`);
      }
    }

    // 11. Robot-to-Ball Kick Collisions (zero-alloc using TMP.v5)
    for (let i = 0; i < this.balls.length; i++) {
      const ball = this.balls[i];
      if (ball.carriedBy) continue;
      const dist = Math.hypot(rPos.x - ball.mesh.position.x, rPos.z - ball.mesh.position.z);
      const minDist = 0.95 + ball.radius;

      if (dist < minDist) {
        const overlap = minDist - dist;
        TMP.v5.set(ball.mesh.position.x - rPos.x, 0, ball.mesh.position.z - rPos.z);
        if (TMP.v5.lengthSq() > 1e-6) TMP.v5.normalize();
        else TMP.v5.set(0, 0, 1);

        ball.mesh.position.x += TMP.v5.x * overlap;
        ball.mesh.position.z += TMP.v5.z * overlap;

        const kickStrength = 6.2;
        ball.velocity.x += TMP.v5.x * kickStrength;
        ball.velocity.z += TMP.v5.z * kickStrength;
        ball.velocity.y += 2.2;

        if (roboAudio.playFootstep) roboAudio.playFootstep(robot.profile ? robot.profile.voicePitch : 1.0);
        if (robot.isPlayer && this.eventBus) {
          this.eventBus.emit('camera:trauma', { amount: 0.14 });
          this.eventBus.emit('haptic:pulse', { pattern: 12 });
        }
      }
    }
  }

  getMinimapSnapshot(outObj = this._minimapSnapshot) {
    outObj.lakeCenter = this.lakeCenter;
    outObj.lakeRadius = this.lakeRadius;
    outObj.goalScore = this.goalScore;
    outObj.targetScore = this.targetScore;
    outObj.soccerBallPos = this.soccerBall ? this.soccerBall.mesh.position : null;

    outObj.ballPositions.length = 0;
    for (let i = 0; i < this.balls.length; i++) {
      if (this.balls[i] !== this.soccerBall) {
        outObj.ballPositions.push(this.balls[i].mesh.position);
      }
    }

    outObj.snackPositions.length = 0;
    for (let i = 0; i < this.snacks.length; i++) {
      outObj.snackPositions.push(this.snacks[i].group.position);
    }
    return outObj;
  }

  dispose() {
    this.timers.clearAll();
    this.camColliders.length = 0;
    this.balls.length = 0;
    this.interactiveObjects.length = 0;
    this.snacks.length = 0;
    this.pointsOfInterest.length = 0;
    this.solidObstacles.length = 0;
    this.elevatedSurfaces.length = 0;
    this.spatialGrid.clear();
    this.ballPitBalls.length = 0;
    this.butterflies.length = 0;
    this.clouds.length = 0;
    this.boneToys.length = 0;
  }
}
