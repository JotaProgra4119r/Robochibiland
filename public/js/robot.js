// Detailed Cyber-Chibi Robot Dog with SkinnedMesh Bones (<=4 DC/dog), AssetCache Reuse & Secondary Springs
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EMOTIONS, FaceTextureGenerator } from './emotions.js';
import { roboAudio } from './audio.js';
import { TMP, damp } from './core/Scratch.js';

export const CHARACTER_PROFILES = {
  Sparky: {
    name: 'Sparky',
    title: 'El Explorador Curioso',
    description: 'Equilibrado, cariñoso y fascinado por descubrir cada rincón del prado y el lago.',
    primaryColor: 0xf8fafc,
    secondaryColor: 0x1e293b,
    glowColor: 0x22ff88,
    speedMultiplier: 1.0,
    voicePitch: 1.0,
    avatarIcon: '🐾',
    favoritePlace: 'Prado Esmeralda',
    thoughts: [
      '¡El prado verde huele a flores y aire fresco digital!',
      '¿Qué habrá al otro lado de esa colina?',
      '¡Me encanta pasear con mi manada de amigos!',
      'Siento una gran energía en mis sensores hoy.',
      'El agua del lago refleja el cielo como un espejo cristalino.'
    ]
  },
  Bolt: {
    name: 'Bolt',
    title: 'El Relámpago Veloz',
    description: 'Hiperactivo y supersónico. Vive por y para perseguir pelotas a toda velocidad.',
    primaryColor: 0x1e293b,
    secondaryColor: 0xfacc15,
    glowColor: 0xffea00,
    speedMultiplier: 1.35,
    voicePitch: 1.25,
    avatarIcon: '⚡',
    favoritePlace: 'Parque de Juegos',
    thoughts: [
      '¡Zuuuum! ¡Nadie me gana en una carrera hacia la pelota!',
      '¡Pásamela, pásamela, goléala fuerte!',
      '¡Mis propulsores jet están que arden de emoción!',
      '¡Mira qué rápido puedo dar la vuelta al parque!',
      '¡Una pelota en movimiento! ¡Allá vooooy!'
    ]
  },
  Pixel: {
    name: 'Pixel',
    title: 'El Hacker del Lago',
    description: 'Analítico y curioso. Adora escanear el agua, las rocas y calcular trayectorias.',
    primaryColor: 0x0f172a,
    secondaryColor: 0x00e5ff,
    glowColor: 0x00e5ff,
    speedMultiplier: 1.05,
    voicePitch: 1.12,
    avatarIcon: '🔍',
    favoritePlace: 'Lago de Cristal',
    thoughts: [
      'Analizando refracción de luz en las ondas del lago...',
      'Detecto 99.8% de serenidad en el muelle de madera.',
      'Escaneando objetos interactivos en el cuadrante norte.',
      '¡Qué estructura tan interesante tienen estos nenúfares!',
      'Calibrando compás digital con la orilla.'
    ]
  },
  Luna: {
    name: 'Luna',
    title: 'La Soñadora Celestial',
    description: 'Dulce, tranquila y afectuosa. Le fascina mirar las nubes y tomar siestas acogedoras.',
    primaryColor: 0x334155,
    secondaryColor: 0xf472b6,
    glowColor: 0xff4081,
    speedMultiplier: 0.95,
    voicePitch: 1.35,
    avatarIcon: '💖',
    favoritePlace: 'Estación de Recarga',
    thoughts: [
      'El cielo está tan bonito hoy... parece un cuadro suave.',
      'Descansar en la estación de recarga me llena de paz.',
      '¡Te mando un saludo lleno de chispas de amor y mimos!',
      'Las flores silvestres huelen delicioso.',
      'A veces es lindo sentarse y simplemente escuchar el viento.'
    ]
  },
  Rusty: {
    name: 'Rusty',
    title: 'El Acróbata Ágil',
    description: 'Gimnasta intrépido y juguetón. Siempre está inventando saltos, giros y volteretas.',
    primaryColor: 0x1e293b,
    secondaryColor: 0xf97316,
    glowColor: 0xff9100,
    speedMultiplier: 1.15,
    voicePitch: 0.88,
    avatarIcon: '🤸',
    favoritePlace: 'Parque de Juegos',
    thoughts: [
      '¿Viste mi voltereta triple sobre el trampolín?',
      '¡Acrobacia completada con un 10 perfecto!',
      '¡Voy a subirme al carrusel a dar vueltas!',
      '¡Hagamos un truco nuevo juntos, mira cómo giro!',
      '¡El suelo es lava cibernética! ¡A saltar alto!'
    ]
  }
};

function createBeveledBox(width, height, depth, radius = 0.08, smoothness = 2) {
  const shape = new THREE.Shape();
  const eps = 0.00001;
  const r = Math.min(radius, width * 0.45, height * 0.45, depth * 0.45) - eps;
  const w = width - r * 2;
  const h = height - r * 2;

  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, h, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(w, h, eps, Math.PI / 2, 0, true);
  shape.absarc(w, eps, eps, 0, -Math.PI / 2, true);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth - r * 2,
    bevelEnabled: true,
    bevelSegments: smoothness,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
    curveSegments: smoothness
  });
  geo.center();
  return geo;
}

// Bake static part into bind-pose SkinnedMesh buffer with vertexColors, skinIndex & skinWeight
function bakeSkinnedPart(geo, hexColor, boneIndex, boneWorldMatrix, tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (rx !== 0) g.rotateX(rx);
  if (ry !== 0) g.rotateY(ry);
  if (rz !== 0) g.rotateZ(rz);
  if (tx !== 0 || ty !== 0 || tz !== 0) g.translate(tx, ty, tz);
  g.applyMatrix4(boneWorldMatrix);

  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const skinIndices = new Uint16Array(count * 4);
  const skinWeights = new Float32Array(count * 4);

  const c = TMP.color.setHex(hexColor);
  for (let i = 0; i < count; i++) {
    const o3 = i * 3;
    colors[o3] = c.r;
    colors[o3 + 1] = c.g;
    colors[o3 + 2] = c.b;

    const o4 = i * 4;
    skinIndices[o4] = boneIndex;
    skinWeights[o4] = 1.0;
  }

  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  return g;
}

function safeMerge(parts) {
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.0, 0), 2.8);
  return merged;
}

export class ChibiRobotDog {
  constructor(name = 'Sparky', optionsOrIsPlayer = false, assetCache = null) {
    const isObjOpts = typeof optionsOrIsPlayer === 'object' && optionsOrIsPlayer !== null;
    const isPlayer = isObjOpts ? Boolean(optionsOrIsPlayer.isPlayer) : Boolean(optionsOrIsPlayer);
    const opts = isObjOpts ? optionsOrIsPlayer : {};

    this.name = name;
    this.assetCache = assetCache;
    this.profile = CHARACTER_PROFILES[name] || {
      name,
      title: 'RoboPup',
      description: 'Un tierno perrito robot chibi.',
      primaryColor: opts.primaryColor || 0xf8fafc,
      secondaryColor: opts.secondaryColor || 0x1e293b,
      glowColor: opts.glowColor || 0x00e5ff,
      speedMultiplier: 1.0,
      voicePitch: 1.0,
      avatarIcon: '🐾',
      favoritePlace: 'Prado',
      thoughts: ['Explorando felizmente el entorno virtual.']
    };

    this.isPlayer = isPlayer;
    this.primaryColor = opts.primaryColor || this.profile.primaryColor;
    this.secondaryColor = opts.secondaryColor || this.profile.secondaryColor;
    this.accentMetalColor = opts.accentColor || 0x64748b;
    this.defaultGlowColor = opts.glowColor || this.profile.glowColor;

    this.currentEmotion = EMOTIONS.HAPPY;
    this.faceGen = new FaceTextureGenerator();

    this.group = new THREE.Group();
    this.group.name = `ChibiRobot_${name}`;

    this.nodes = {};
    this.materials = {};
    this.skeleton = null;
    this._ownedDisposables = [];

    this.buildDetailedModel();
    this.setEmotion(this.currentEmotion, true);

    // Unified deterministic physics state
    this.physics = {
      velocity: new THREE.Vector3(),
      velocityY: 0,
      isGrounded: true,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      groundY: 0,
      speedScalar: 0
    };

    this.bankAngle = 0;
    this.pitchLean = 0;
    this.energy = 100;
    this.curiosity = 85;
    this.sociability = 90;
    this.affection = 88;
    this.hydration = 90;
    this.playfulness = 80;
    this.carriedObject = null;
    this.tailHelicopterTimer = 0;

    // Secondary procedural spring physics
    this.earSpringVelL = 0;
    this.earSpringVelR = 0;
    this.earSpringX = 0;
    this.earSpringVelX = 0;
    this.tailSpringAngle = 0;
    this.tailSpringVel = 0;
    this.antennaSpringX = 0;
    this.antennaSpringVelX = 0;
    this.antennaSpringZ = 0;
    this.antennaSpringVelZ = 0;
    this.medalSwing = 0;
    this.medalVel = 0;

    this.lastPosition = this.group.position.clone();
    this.lastVelocityY = 0;

    // Head look target
    this.lookTarget = new THREE.Vector3();
    this.hasTarget = false;
    this.lookTimeout = 0;

    // Dialogue & Mission State
    this.dialogueHistory = [];
    this.activeMission = null;
    this.isPickedUp = false;
    this.isSliding = false;
    this.isInWater = false;
    this.wasInWater = false;
    this.hasDugTreasure = false;
    this.disposed = false;
  }

  get velocityY() { return this.physics.velocityY; }
  set velocityY(v) { this.physics.velocityY = v; }
  get speedScalar() { return this.physics.speedScalar; }
  set speedScalar(v) { this.physics.speedScalar = v; }

  _getGeo(key, factory) {
    if (this.assetCache) {
      return this.assetCache.getGeometry(key, factory);
    }
    const geo = factory();
    this._ownedDisposables.push(geo);
    return geo;
  }

  _getMat(key, factory) {
    if (this.assetCache) {
      return this.assetCache.getMaterial(key, factory);
    }
    const mat = factory();
    this._ownedDisposables.push(mat);
    return mat;
  }

  addDialogue(role, author, text) {
    this.dialogueHistory.push({
      role,
      author,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    if (this.dialogueHistory.length > 60) {
      this.dialogueHistory.shift();
    }
  }

  getDialogueHistory() {
    return this.dialogueHistory;
  }

  startMission(name, action, targetPos, maxDuration = 18.0, onComplete = null, onTimeout = null) {
    this.activeMission = {
      name,
      action,
      targetPos: targetPos ? targetPos.clone() : null,
      timer: 0,
      maxDuration,
      onComplete,
      onTimeout
    };
  }

  clearMission() {
    this.activeMission = null;
  }

  setAsPlayer(isPlayer) {
    this.isPlayer = isPlayer;
    if (this.nodes.haloRing) {
      this.nodes.haloRing.visible = isPlayer;
    }
  }

  getRandomPersonalThought() {
    const arr = this.profile.thoughts || [];
    return arr[Math.floor(Math.random() * arr.length)] || 'Explorando con alegría.';
  }

  buildDetailedModel() {
    const pKey = this.name;

    const shellMat = this._getMat(`robot_shell_skin_${pKey}`, () => new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.22,
      metalness: 0.38,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12
    }));

    const neonMat = new THREE.MeshStandardMaterial({
      color: this.defaultGlowColor,
      emissive: this.defaultGlowColor,
      emissiveIntensity: 1.35,
      roughness: 0.15
    });
    this._ownedDisposables.push(neonMat);

    const faceMat = new THREE.MeshBasicMaterial({
      map: this.faceGen.texture,
      transparent: false
    });
    this._ownedDisposables.push(faceMat);

    this.materials = {
      shell: shellMat,
      neon: neonMat,
      face: faceMat
    };

    // 1. SKELETON BONE HIERARCHY (25 bones)
    const bones = [];
    const addBone = (parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const b = new THREE.Bone();
      b.position.set(x, y, z);
      b.rotation.set(rx, ry, rz);
      if (parent) parent.add(b);
      const idx = bones.length;
      bones.push(b);
      return { bone: b, idx };
    };

    const root = addBone(null, 0, 0, 0);               // 0
    const body = addBone(root.bone, 0, 0.95, 0);       // 1
    const neck = addBone(body.bone, 0, 0.38, 0.65);    // 2
    const head = addBone(neck.bone, 0, 0, 0);          // 3
    const earL = addBone(head.bone, -0.56, 0.9, 0.18, 0, 0, -0.25); // 4
    const earR = addBone(head.bone, 0.56, 0.9, 0.18, 0, 0, 0.25);   // 5
    const antenna = addBone(head.bone, 0, 0.98, 0.05); // 6
    const tail = addBone(body.bone, 0, 0.24, -0.68, 0.55, 0, 0); // 7
    const medal = addBone(body.bone, 0, 0.29, 0.74);   // 8
    const battery = addBone(body.bone, 0, 0.62, -0.08); // 9
    const propeller = addBone(tail.bone, 0, 0.48, 0.06); // 10

    const legSpecs = [
      { id: 'FL', x: -0.46, z: 0.46 },
      { id: 'FR', x: 0.46, z: 0.46 },
      { id: 'BL', x: -0.46, z: -0.46 },
      { id: 'BR', x: 0.46, z: -0.46 }
    ];
    const legBones = {};
    for (let i = 0; i < legSpecs.length; i++) {
      const s = legSpecs[i];
      const hip = addBone(body.bone, s.x, -0.18, s.z);
      const knee = addBone(hip.bone, 0, -0.44, 0);
      const paw = addBone(knee.bone, 0, -0.4, 0.08);
      legBones[s.id] = { hip, knee, paw, isLeft: s.x < 0 };
    }

    const wingL = addBone(body.bone, -0.52, 0.24, 0); // 23
    const wingR = addBone(body.bone, 0.52, 0.24, 0);  // 24

    // Compute bind-pose world matrices relative to rootBone
    root.bone.updateMatrixWorld(true);
    this.group.add(root.bone);

    this.nodes.body = body.bone;
    this.nodes.neck = neck.bone;
    this.nodes.head = head.bone;
    this.nodes.earL = earL.bone;
    this.nodes.earR = earR.bone;
    this.nodes.antenna = antenna.bone;
    this.nodes.tail = tail.bone;
    this.nodes.medalPivot = medal.bone;
    this.nodes.batteryBar = battery.bone;
    this.nodes.legs = {
      FL: { hip: legBones.FL.hip.bone, knee: legBones.FL.knee.bone, paw: legBones.FL.paw.bone },
      FR: { hip: legBones.FR.hip.bone, knee: legBones.FR.knee.bone, paw: legBones.FR.paw.bone },
      BL: { hip: legBones.BL.hip.bone, knee: legBones.BL.knee.bone, paw: legBones.BL.paw.bone },
      BR: { hip: legBones.BR.hip.bone, knee: legBones.BR.knee.bone, paw: legBones.BR.paw.bone }
    };

    const pri = this.primaryColor;
    const sec = this.secondaryColor;
    const jnt = this.accentMetalColor;
    const chr = 0xf1f5f9;

    // 2. SINGLE SKINNED SHELL MESH (1 draw call + 1 shadow draw call)
    const shellGeo = this._getGeo(`robot_skinned_shell_${pKey}`, () => {
      const parts = [];
      const bBody = body.bone.matrixWorld;
      const bNeck = neck.bone.matrixWorld;
      const bHead = head.bone.matrixWorld;
      const bAnt = antenna.bone.matrixWorld;
      const bTail = tail.bone.matrixWorld;

      // Body
      const torso = createBeveledBox(0.92, 0.72, 1.35, 0.14, 2);
      const belly = createBeveledBox(0.76, 0.24, 1.12, 0.08, 2);
      const panel = createBeveledBox(0.98, 0.46, 1.06, 0.08, 2);
      const rim = new THREE.CylinderGeometry(0.2, 0.22, 0.07, 16);
      const collar = new THREE.TorusGeometry(0.38, 0.065, 10, 20);
      const pack = createBeveledBox(0.64, 0.32, 0.78, 0.08, 2);
      const thruster = new THREE.CylinderGeometry(0.09, 0.13, 0.26, 10);

      parts.push(
        bakeSkinnedPart(torso, pri, body.idx, bBody),
        bakeSkinnedPart(belly, sec, body.idx, bBody, 0, -0.28, 0),
        bakeSkinnedPart(panel, sec, body.idx, bBody, 0, 0.04, 0),
        bakeSkinnedPart(rim, chr, body.idx, bBody, 0, 0.05, 0.67, Math.PI / 2, 0, 0),
        bakeSkinnedPart(collar, sec, body.idx, bBody, 0, 0.36, 0.56, Math.PI / 2 + 0.35, 0, 0),
        bakeSkinnedPart(pack, sec, body.idx, bBody, 0, 0.45, -0.08),
        bakeSkinnedPart(thruster, chr, body.idx, bBody, -0.22, 0.47, -0.52, -Math.PI / 3, 0, 0),
        bakeSkinnedPart(thruster, chr, body.idx, bBody, 0.22, 0.47, -0.52, -Math.PI / 3, 0, 0)
      );
      if (this.name === 'Sparky') {
        const compass = new THREE.CylinderGeometry(0.095, 0.095, 0.035, 14);
        parts.push(bakeSkinnedPart(compass, chr, body.idx, bBody, 0, 0.19, 0.71, Math.PI / 2, 0, 0));
        compass.dispose();
      }
      torso.dispose(); belly.dispose(); panel.dispose(); rim.dispose();
      collar.dispose(); pack.dispose(); thruster.dispose();

      // Neck
      const neckJoint = new THREE.CylinderGeometry(0.18, 0.22, 0.22, 12);
      const collarMesh = new THREE.TorusGeometry(0.28, 0.045, 8, 18);
      parts.push(
        bakeSkinnedPart(neckJoint, jnt, neck.idx, bNeck, 0, 0.08, 0.05),
        bakeSkinnedPart(collarMesh, sec, neck.idx, bNeck, 0, 0.14, 0.08, Math.PI / 2, 0, 0)
      );
      neckJoint.dispose(); collarMesh.dispose();

      // Head
      const headBox = createBeveledBox(1.14, 0.96, 1.04, 0.18, 2);
      const bezel = createBeveledBox(0.98, 0.64, 0.08, 0.04, 1);
      const brow = createBeveledBox(1.12, 0.13, 0.46, 0.04, 1);
      const snout = createBeveledBox(0.48, 0.25, 0.34, 0.07, 1);
      const disc = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14);
      parts.push(
        bakeSkinnedPart(headBox, pri, head.idx, bHead, 0, 0.48, 0.22),
        bakeSkinnedPart(bezel, sec, head.idx, bHead, 0, 0.48, 0.71),
        bakeSkinnedPart(brow, sec, head.idx, bHead, 0, 0.91, 0.49),
        bakeSkinnedPart(snout, sec, head.idx, bHead, 0, 0.25, 0.76),
        bakeSkinnedPart(disc, sec, head.idx, bHead, -0.58, 0.46, 0.22, 0, 0, Math.PI / 2),
        bakeSkinnedPart(disc, sec, head.idx, bHead, 0.58, 0.46, 0.22, 0, 0, Math.PI / 2)
      );
      if (this.name === 'Sparky') {
        const strap = createBeveledBox(1.18, 0.09, 0.98, 0.02, 1);
        const rimG = new THREE.CylinderGeometry(0.19, 0.19, 0.09, 14);
        parts.push(
          bakeSkinnedPart(strap, sec, head.idx, bHead, 0, 0.88, 0.42),
          bakeSkinnedPart(rimG, chr, head.idx, bHead, -0.26, 0.94, 0.64, Math.PI / 2, 0, 0),
          bakeSkinnedPart(rimG, chr, head.idx, bHead, 0.26, 0.94, 0.64, Math.PI / 2, 0, 0)
        );
        strap.dispose(); rimG.dispose();
      } else if (this.name === 'Pixel') {
        const satDish = new THREE.CylinderGeometry(0.09, 0.02, 0.045, 10);
        parts.push(
          bakeSkinnedPart(satDish, chr, head.idx, bHead, -0.32, 1.25, -0.05, 0.5, 0, 0),
          bakeSkinnedPart(satDish, chr, head.idx, bHead, 0.32, 1.25, -0.05, 0.5, 0, 0)
        );
        satDish.dispose();
      }
      headBox.dispose(); bezel.dispose(); brow.dispose(); snout.dispose(); disc.dispose();

      // Ears
      const earOuter = createBeveledBox(0.24, 0.58, 0.14, 0.05, 1);
      const earHinge = new THREE.CylinderGeometry(0.095, 0.095, 0.18, 10);
      const earInner = new THREE.BoxGeometry(0.14, 0.42, 0.025);
      const earPair = [earL, earR];
      for (let e = 0; e < earPair.length; e++) {
        const eb = earPair[e];
        parts.push(
          bakeSkinnedPart(earOuter, sec, eb.idx, eb.bone.matrixWorld, 0, -0.28, 0),
          bakeSkinnedPart(earHinge, chr, eb.idx, eb.bone.matrixWorld, 0, 0, 0, Math.PI / 2, 0, 0),
          bakeSkinnedPart(earInner, this.defaultGlowColor, eb.idx, eb.bone.matrixWorld, 0, -0.28, 0.075)
        );
      }
      earOuter.dispose(); earHinge.dispose(); earInner.dispose();

      // Antenna
      const antBase = new THREE.ConeGeometry(0.09, 0.1, 10);
      const antStem = new THREE.CylinderGeometry(0.02, 0.03, 0.34, 8);
      parts.push(
        bakeSkinnedPart(antBase, 0x1e293b, antenna.idx, bAnt),
        bakeSkinnedPart(antStem, chr, antenna.idx, bAnt, 0, 0.17, 0)
      );
      antBase.dispose(); antStem.dispose();

      // Tail
      const tailHinge = new THREE.SphereGeometry(0.115, 10, 10);
      const tailSeg = new THREE.CylinderGeometry(0.045, 0.068, 0.38, 8);
      parts.push(
        bakeSkinnedPart(tailHinge, jnt, tail.idx, bTail),
        bakeSkinnedPart(tailSeg, sec, tail.idx, bTail, 0, 0.19, 0)
      );
      tailHinge.dispose(); tailSeg.dispose();

      // 4 Legs (Upper, Lower, Paw)
      const servo = new THREE.SphereGeometry(0.155, 10, 10);
      const upper = new THREE.CylinderGeometry(0.115, 0.095, 0.44, 10);
      const piston = new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8);
      const hipRing = new THREE.TorusGeometry(0.145, 0.016, 8, 14);
      const kneeRing = new THREE.CylinderGeometry(0.105, 0.105, 0.17, 10);
      const lower = new THREE.CylinderGeometry(0.095, 0.115, 0.4, 10);
      const foot = createBeveledBox(0.28, 0.16, 0.38, 0.05, 1);
      const pad = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 8);
      const toe = new THREE.SphereGeometry(0.045, 8, 8);
      const toePad = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8);

      const legIds = ['FL', 'FR', 'BL', 'BR'];
      for (let i = 0; i < legIds.length; i++) {
        const l = legBones[legIds[i]];
        const bHip = l.hip.bone.matrixWorld;
        const bKnee = l.knee.bone.matrixWorld;
        const bPaw = l.paw.bone.matrixWorld;

        parts.push(
          bakeSkinnedPart(servo, jnt, l.hip.idx, bHip),
          bakeSkinnedPart(upper, sec, l.hip.idx, bHip, 0, -0.22, 0),
          bakeSkinnedPart(piston, chr, l.hip.idx, bHip, 0, -0.22, -0.09),
          bakeSkinnedPart(hipRing, this.defaultGlowColor, l.hip.idx, bHip, l.isLeft ? -0.05 : 0.05, 0, 0, 0, Math.PI / 2, 0),
          bakeSkinnedPart(kneeRing, chr, l.knee.idx, bKnee, 0, 0, 0, 0, 0, Math.PI / 2),
          bakeSkinnedPart(lower, pri, l.knee.idx, bKnee, 0, -0.2, 0),
          bakeSkinnedPart(foot, sec, l.paw.idx, bPaw),
          bakeSkinnedPart(pad, this.defaultGlowColor, l.paw.idx, bPaw, 0, -0.075, -0.02, Math.PI / 2, 0, 0)
        );
        for (let t = -1; t <= 1; t++) {
          parts.push(
            bakeSkinnedPart(toe, pri, l.paw.idx, bPaw, t * 0.085, -0.02, 0.17),
            bakeSkinnedPart(toePad, this.defaultGlowColor, l.paw.idx, bPaw, t * 0.085, -0.075, 0.14, Math.PI / 2, 0, 0)
          );
        }
      }

      servo.dispose(); upper.dispose(); piston.dispose(); hipRing.dispose();
      kneeRing.dispose(); lower.dispose(); foot.dispose(); pad.dispose(); toe.dispose(); toePad.dispose();

      return safeMerge(parts);
    });

    this.skeleton = new THREE.Skeleton(bones);

    const shellMesh = new THREE.SkinnedMesh(shellGeo, shellMat);
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    shellMesh.bind(this.skeleton);
    this.group.add(shellMesh);

    // 3. SINGLE SKINNED NEON MESH (1 draw call, castShadow = false)
    const neonGeo = this._getGeo(`robot_skinned_neon_${pKey}`, () => {
      const parts = [];
      const bBody = body.bone.matrixWorld;
      const bHead = head.bone.matrixWorld;
      const bAnt = antenna.bone.matrixWorld;
      const bTail = tail.bone.matrixWorld;
      const bMedal = medal.bone.matrixWorld;
      const bBatt = battery.bone.matrixWorld;

      const stripe = createBeveledBox(1.01, 0.08, 0.92, 0.02, 1);
      const coreInner = new THREE.CylinderGeometry(0.14, 0.14, 0.09, 14);
      const collarGlow = new THREE.TorusGeometry(0.39, 0.02, 8, 20);
      const nozzle = new THREE.CylinderGeometry(0.065, 0.08, 0.08, 10);
      const batBar = new THREE.BoxGeometry(0.42, 0.035, 0.34);
      const medalDisk = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 12);

      parts.push(
        bakeSkinnedPart(stripe, 0xffffff, body.idx, bBody, 0, 0.04, 0),
        bakeSkinnedPart(coreInner, 0xffffff, body.idx, bBody, 0, 0.05, 0.68, Math.PI / 2, 0, 0),
        bakeSkinnedPart(collarGlow, 0xffffff, body.idx, bBody, 0, 0.36, 0.56, Math.PI / 2 + 0.35, 0, 0),
        bakeSkinnedPart(nozzle, 0xffffff, body.idx, bBody, -0.22, 0.40, -0.60, -Math.PI / 3, 0, 0),
        bakeSkinnedPart(nozzle, 0xffffff, body.idx, bBody, 0.22, 0.40, -0.60, -Math.PI / 3, 0, 0),
        bakeSkinnedPart(batBar, 0xffffff, battery.idx, bBatt),
        bakeSkinnedPart(medalDisk, 0xffffff, medal.idx, bMedal, 0, -0.04, 0.02, Math.PI / 2, 0, 0)
      );
      if (this.name === 'Bolt') {
        const fin = createBeveledBox(0.07, 0.46, 0.68, 0.02, 1);
        parts.push(bakeSkinnedPart(fin, 0xffffff, body.idx, bBody, 0, 0.72, -0.2, -0.38, 0, 0));
        fin.dispose();
      }
      stripe.dispose(); coreInner.dispose(); collarGlow.dispose();
      nozzle.dispose(); batBar.dispose(); medalDisk.dispose();

      // Head neon
      const nose = new THREE.SphereGeometry(0.095, 12, 12);
      nose.scale(1.15, 0.85, 0.95);
      const cheekRing = new THREE.TorusGeometry(0.16, 0.02, 8, 14);
      parts.push(
        bakeSkinnedPart(nose, 0xffffff, head.idx, bHead, 0, 0.33, 0.94),
        bakeSkinnedPart(cheekRing, 0xffffff, head.idx, bHead, -0.61, 0.46, 0.22, 0, Math.PI / 2, 0),
        bakeSkinnedPart(cheekRing, 0xffffff, head.idx, bHead, 0.61, 0.46, 0.22, 0, Math.PI / 2, 0)
      );
      if (this.name === 'Rusty') {
        const headband = createBeveledBox(1.18, 0.13, 1.08, 0.03, 1);
        parts.push(bakeSkinnedPart(headband, 0xffffff, head.idx, bHead, 0, 0.79, 0.22));
        headband.dispose();
      }
      nose.dispose(); cheekRing.dispose();

      // Antenna neon
      const antRing = new THREE.TorusGeometry(0.09, 0.02, 8, 14);
      const antBall = new THREE.SphereGeometry(0.085, 10, 10);
      parts.push(
        bakeSkinnedPart(antRing, 0xffffff, antenna.idx, bAnt, 0, 0.28, 0, Math.PI / 2, 0, 0),
        bakeSkinnedPart(antBall, 0xffffff, antenna.idx, bAnt, 0, 0.38, 0)
      );
      antRing.dispose(); antBall.dispose();

      // Tail neon
      const tRing = new THREE.TorusGeometry(0.062, 0.015, 8, 12);
      const tTip = new THREE.SphereGeometry(0.125, 10, 10);
      parts.push(
        bakeSkinnedPart(tRing, 0xffffff, tail.idx, bTail, 0, 0.14, 0, Math.PI / 2, 0, 0),
        bakeSkinnedPart(tRing, 0xffffff, tail.idx, bTail, 0, 0.28, 0, Math.PI / 2, 0, 0),
        bakeSkinnedPart(tTip, 0xffffff, tail.idx, bTail, 0, 0.48, 0)
      );
      tRing.dispose(); tTip.dispose();

      // Rusty tail propeller baked into neon SkinnedMesh
      if (this.name === 'Rusty') {
        const b1 = new THREE.BoxGeometry(0.42, 0.045, 0.02);
        const b2 = new THREE.BoxGeometry(0.045, 0.42, 0.02);
        parts.push(
          bakeSkinnedPart(b1, 0xffffff, propeller.idx, propeller.bone.matrixWorld),
          bakeSkinnedPart(b2, 0xffffff, propeller.idx, propeller.bone.matrixWorld)
        );
        b1.dispose(); b2.dispose();
      }

      return safeMerge(parts);
    });

    const neonMesh = new THREE.SkinnedMesh(neonGeo, neonMat);
    neonMesh.castShadow = false;
    neonMesh.receiveShadow = false;
    neonMesh.bind(this.skeleton);
    this.group.add(neonMesh);
    this.nodes.powerCore = neonMesh;

    if (this.name === 'Rusty') {
      this.nodes.tailPropeller = propeller.bone;
    }

    // 4. OLED FACE SCREEN (1 draw call, castShadow = false, attached to headBone)
    const faceGeo = this._getGeo('robot_face_plane', () => new THREE.PlaneGeometry(0.92, 0.58));
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.position.set(0, 0.48, 0.756);
    faceMesh.castShadow = false;
    faceMesh.receiveShadow = false;
    head.bone.add(faceMesh);
    this.nodes.faceMesh = faceMesh;

    // Mouth Pickup Anchor
    const mouthAnchor = new THREE.Group();
    mouthAnchor.position.set(0, 0.17, 0.98);
    head.bone.add(mouthAnchor);
    this.nodes.mouthAnchor = mouthAnchor;

    // Player Selection Halo Ring (visible only on active player robot)
    const haloGeo = this._getGeo('robot_halo_ring', () => {
      const g = new THREE.TorusGeometry(0.85, 0.038, 10, 28);
      g.rotateX(Math.PI / 2);
      return g;
    });
    const halo = new THREE.Mesh(haloGeo, neonMat);
    halo.position.set(0, 2.3, 0);
    halo.visible = this.isPlayer;
    halo.castShadow = false;
    this.group.add(halo);
    this.nodes.haloRing = halo;

    // Overhead UI Anchor
    const overheadAnchor = new THREE.Group();
    overheadAnchor.position.set(0, 2.5, 0);
    this.group.add(overheadAnchor);
    this.nodes.overheadAnchor = overheadAnchor;

    this.buildCharacterAccessories(head.bone, body.bone, wingL, wingR);
  }

  buildCharacterAccessories(headBone, bodyBone, wingL, wingR) {
    if (this.name === 'Sparky') {
      const lensMat = this._getMat('sparky_goggle_lens_mat', () => new THREE.MeshPhysicalMaterial({
        color: 0x22ff88,
        emissive: 0x22ff88,
        emissiveIntensity: 0.75,
        roughness: 0.05,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.88
      }));
      const lensGeo = this._getGeo('sparky_goggle_lenses', () => {
        const c = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 14);
        const g1 = c.clone(); g1.rotateX(Math.PI / 2); g1.translate(-0.26, 0.94, 0.65);
        const g2 = c.clone(); g2.rotateX(Math.PI / 2); g2.translate(0.26, 0.94, 0.65);
        c.dispose();
        const merged = mergeGeometries([g1, g2], false);
        g1.dispose(); g2.dispose();
        return merged;
      });
      const m = new THREE.Mesh(lensGeo, lensMat);
      m.castShadow = false;
      headBone.add(m);
    } else if (this.name === 'Bolt') {
      const flameGeo = this._getGeo('bolt_turbo_flame', () => {
        const g = new THREE.ConeGeometry(0.075, 0.32, 10);
        g.rotateX(-Math.PI / 2);
        return g;
      });
      const flameMat = this._getMat('bolt_turbo_flame_mat', () => new THREE.MeshBasicMaterial({
        color: 0xffea00,
        transparent: true,
        opacity: 0.88
      }));
      this.nodes.turboFlames = [];
      const offsets = [-0.22, 0.22];
      for (let i = 0; i < offsets.length; i++) {
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(offsets[i], 0.4, -0.69);
        flame.visible = false;
        flame.castShadow = false;
        bodyBone.add(flame);
        this.nodes.turboFlames.push(flame);
      }
    } else if (this.name === 'Pixel') {
      const visorMat = this._getMat('pixel_scouter_mat', () => new THREE.MeshPhysicalMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 1.15,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.78
      }));
      const pixelVisorGeo = this._getGeo('pixel_scouter', () => createBeveledBox(0.5, 0.28, 0.06, 0.02, 1));
      const pixelVisor = new THREE.Mesh(pixelVisorGeo, visorMat);
      pixelVisor.position.set(-0.24, 0.56, 0.79);
      pixelVisor.castShadow = false;
      headBone.add(pixelVisor);
    } else if (this.name === 'Luna') {
      const wingMat = this._getMat('luna_wing_mat', () => new THREE.MeshPhysicalMaterial({
        color: 0xff80ab,
        emissive: 0xff4081,
        emissiveIntensity: 0.85,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.88
      }));

      // Single SkinnedMesh for both wings (1 draw call!)
      const wingsGeo = this._getGeo('luna_skinned_wings', () => {
        const parts = [];
        const pair = [
          { b: wingL, sign: -1 },
          { b: wingR, sign: 1 }
        ];
        for (let p = 0; p < pair.length; p++) {
          const { b, sign } = pair[p];
          for (let f = 0; f < 3; f++) {
            const feather = createBeveledBox(0.04, 0.14 - f * 0.02, 0.62 - f * 0.12, 0.015, 1);
            parts.push(bakeSkinnedPart(feather, 0xffffff, b.idx, b.bone.matrixWorld, 0, 0.1 - f * 0.11, -f * 0.06, 0.15, sign * 0.26, 0));
            feather.dispose();
          }
        }
        return safeMerge(parts);
      });
      const wingsMesh = new THREE.SkinnedMesh(wingsGeo, wingMat);
      wingsMesh.castShadow = false;
      wingsMesh.bind(this.skeleton);
      this.group.add(wingsMesh);
      this.nodes.wingL = wingL.bone;
      this.nodes.wingR = wingR.bone;
    }
  }

  setEmotion(emotion, silent = false) {
    if (!emotion || this.disposed) return;
    this.currentEmotion = emotion;

    const hex = emotion.colorHex;
    this.materials.neon.color.setHex(hex);
    this.materials.neon.emissive.setHex(hex);

    this.faceGen.drawFace(emotion.faceExpression, emotion.glowColor, false);

    if (!silent && this.isPlayer) {
      const pitch = this.profile.voicePitch || 1.0;
      if (emotion.id === 'HAPPY') roboAudio.playHappyJingle();
      else if (emotion.id === 'CURIOUS') roboAudio.playCurious();
      else if (emotion.id === 'EXCITED') roboAudio.playBark(1.3 * pitch);
      else if (emotion.id === 'LOVING') roboAudio.playBoop(1.1 * pitch);
      else if (emotion.id === 'ALERT') roboAudio.playBark(0.9 * pitch);
      else if (emotion.id === 'SLEEPY') roboAudio.playBoop(0.8 * pitch);
      else if (emotion.id === 'MISCHIEVOUS') roboAudio.playBark(1.4 * pitch);
      else if (emotion.id === 'PROUD') roboAudio.playTrickSuccess();
      else if (emotion.id === 'SCARED') roboAudio.playBark(0.7 * pitch);
      else if (emotion.id === 'HUNGRY') roboAudio.playCurious();
      else if (emotion.id === 'PARTY') roboAudio.playDiscoBeat();
      else if (emotion.id === 'CONFUSED') roboAudio.playConfused();
    }
  }

  bark() {
    const pitch = this.profile.voicePitch || 1.0;
    roboAudio.playBark(pitch);
    if (this.animController) {
      this.animController.play('bark', 1.0);
    }
  }

  petRobot() {
    this.setEmotion(EMOTIONS.LOVING);
    this.curiosity = Math.min(100, this.curiosity + 15);
    this.energy = Math.min(100, this.energy + 25);
    this.affection = Math.min(100, (this.affection || 85) + 15);
    roboAudio.playBoop(1.2 * (this.profile.voicePitch || 1.0));
  }

  praise() {
    this.setEmotion(EMOTIONS.LOVING);
    this.affection = Math.min(100, (this.affection || 85) + 25);
    this.curiosity = Math.min(100, this.curiosity + 10);
    this.energy = Math.min(100, this.energy + 15);
    this.tailHelicopterTimer = 4.0;
    roboAudio.playHappyJingle();
    if (this.animController) {
      this.animController.play('wagTail', 3.0);
    }
  }

  grabObject(objectMesh) {
    if (!objectMesh || this.carriedObject) return false;
    this.carriedObject = objectMesh;
    if (objectMesh.parent) objectMesh.parent.remove(objectMesh);
    if (this.nodes.mouthAnchor) {
      this.nodes.mouthAnchor.add(objectMesh);
      objectMesh.position.set(0, 0, 0);
      objectMesh.scale.set(0.65, 0.65, 0.65);
    }
    return true;
  }

  dropObject() {
    if (!this.carriedObject) return null;
    const obj = this.carriedObject;
    if (this.nodes.mouthAnchor) {
      this.nodes.mouthAnchor.remove(obj);
    }
    this.carriedObject = null;
    obj.scale.set(1.0, 1.0, 1.0);
    return obj;
  }

  quenchThirst() {
    this.hydration = 100;
    this.energy = Math.min(100, this.energy + 20);
    this.setEmotion(EMOTIONS.CURIOUS);
    roboAudio.playSplash();
  }

  lookAt(targetPos, duration = 2.5) {
    if (!targetPos) return;
    this.lookTarget.copy(targetPos);
    this.hasTarget = true;
    this.lookTimeout = duration;
  }

  clearLookTarget() {
    this.hasTarget = false;
    this.lookTimeout = 0;
  }

  update(delta) {
    if (this.disposed) return;
    const dt = Math.min(delta, 0.05);

    this.faceGen.update(dt, this.currentEmotion.faceExpression, this.currentEmotion.glowColor);

    TMP.v1.subVectors(this.group.position, this.lastPosition);
    TMP.v1.y = 0;
    const instantSpeed = TMP.v1.length() / Math.max(dt, 0.001);
    this.physics.speedScalar = damp(this.physics.speedScalar, instantSpeed, 10, dt);
    this.lastPosition.copy(this.group.position);

    const speed = this.physics.speedScalar;
    const t = this.faceGen.animTime;

    if (this.nodes.haloRing && this.nodes.haloRing.visible) {
      this.nodes.haloRing.rotation.z = (this.nodes.haloRing.rotation.z + dt * 1.5) % (Math.PI * 2);
      this.nodes.haloRing.position.y = 2.3 + Math.sin(t * 4) * 0.08;
    }
    if (this.materials.neon) {
      this.materials.neon.emissiveIntensity = 1.2 + Math.sin(t * 3.5) * 0.25;
    }

    if (this.nodes.batteryBar) {
      const energyScale = THREE.MathUtils.clamp(this.energy / 100, 0.08, 1.0);
      this.nodes.batteryBar.scale.x = damp(this.nodes.batteryBar.scale.x, energyScale, 6, dt);
    }

    const isRollControlled = this.animController && this.animController.isBodyRollControlled();
    if (this.nodes.body && !isRollControlled) {
      this.nodes.body.rotation.z = damp(this.nodes.body.rotation.z, this.bankAngle || 0, 9, dt);
      const targetLean = THREE.MathUtils.clamp(speed * 0.014, 0, 0.12);
      this.pitchLean = damp(this.pitchLean, targetLean, 8, dt);
    }

    if (this.nodes.earL && this.nodes.earR) {
      const anim = this.animController ? this.animController.currentAnim : 'idle';
      const earPoseControlled = (anim === 'wagTail' || anim === 'headTilt' || anim === 'shakeOff');
      if (!earPoseControlled) {
        const earRestL = 0.25;
        const earRestR = -0.25;
        const excitement = (speed * 0.032) + (this.currentEmotion === EMOTIONS.EXCITED ? 0.18 : 0);
        const earOsc = Math.sin(t * 11.5) * excitement;

        this.earSpringVelL += (earRestL + earOsc - this.nodes.earL.rotation.z) * 24 * dt;
        this.earSpringVelL *= Math.exp(-9 * dt);
        this.nodes.earL.rotation.z += this.earSpringVelL * dt;

        this.earSpringVelR += (earRestR - earOsc - this.nodes.earR.rotation.z) * 24 * dt;
        this.earSpringVelR *= Math.exp(-9 * dt);
        this.nodes.earR.rotation.z += this.earSpringVelR * dt;
      }

      const vy = this.physics.velocityY;
      const targetEarX = THREE.MathUtils.clamp(-speed * 0.045 + vy * 0.03, -0.45, 0.38);
      this.earSpringVelX += (targetEarX - this.earSpringX) * 28 * dt;
      this.earSpringVelX *= Math.exp(-8 * dt);
      this.earSpringX += this.earSpringVelX * dt;
      if (anim !== 'bark' && anim !== 'idle') {
        this.nodes.earL.rotation.x = damp(this.nodes.earL.rotation.x, this.earSpringX, 12, dt);
        this.nodes.earR.rotation.x = damp(this.nodes.earR.rotation.x, this.earSpringX, 12, dt);
      }
    }

    if (this.nodes.antenna) {
      const vyDelta = this.physics.velocityY - this.lastVelocityY;
      this.lastVelocityY = this.physics.velocityY;
      const targetAntX = THREE.MathUtils.clamp(-speed * 0.05 + this.physics.velocityY * 0.035, -0.5, 0.45);
      const targetAntZ = THREE.MathUtils.clamp((this.bankAngle || 0) * 1.6, -0.45, 0.45);

      this.antennaSpringVelX += (targetAntX - this.antennaSpringX) * 38 * dt - vyDelta * 0.5;
      this.antennaSpringVelX *= Math.exp(-6.5 * dt);
      this.antennaSpringX += this.antennaSpringVelX * dt;

      this.antennaSpringVelZ += (targetAntZ - this.antennaSpringZ) * 38 * dt;
      this.antennaSpringVelZ *= Math.exp(-6.5 * dt);
      this.antennaSpringZ += this.antennaSpringVelZ * dt;

      this.nodes.antenna.rotation.x = this.antennaSpringX + Math.sin(t * 3.8) * 0.04;
      this.nodes.antenna.rotation.z = this.antennaSpringZ;
    }

    if (this.nodes.medalPivot) {
      const targetMedal = THREE.MathUtils.clamp(-speed * 0.055, -0.45, 0.2);
      this.medalVel += (targetMedal - this.medalSwing) * 30 * dt;
      this.medalVel *= Math.exp(-5 * dt);
      this.medalSwing += this.medalVel * dt;
      this.nodes.medalPivot.rotation.x = this.medalSwing + Math.sin(t * 7) * Math.min(0.12, speed * 0.02);
    }

    if (this.nodes.tail) {
      const targetTailLag = THREE.MathUtils.clamp(speed * 0.035, 0, 0.28);
      this.tailSpringVel += (targetTailLag - this.tailSpringAngle) * 26 * dt;
      this.tailSpringVel *= Math.exp(-7 * dt);
      this.tailSpringAngle += this.tailSpringVel * dt;

      if (this.tailHelicopterTimer > 0) {
        this.tailHelicopterTimer = Math.max(0, this.tailHelicopterTimer - dt);
        this.nodes.tail.rotation.z = (this.nodes.tail.rotation.z + dt * 24.0) % (Math.PI * 2);
      }
    }

    if (this.nodes.turboFlames) {
      const isDashing = speed > 4.6;
      for (let i = 0; i < this.nodes.turboFlames.length; i++) {
        const flame = this.nodes.turboFlames[i];
        flame.visible = isDashing;
        if (isDashing) {
          const s = 0.85 + Math.sin(t * 38 + i) * 0.25;
          flame.scale.set(s, s * (1.25 + Math.cos(t * 42) * 0.25), s);
        }
      }
    }

    if (this.nodes.wingL && this.nodes.wingR) {
      const flapFreq = 6.5 + speed * 0.6;
      const wingFlap = Math.sin(t * flapFreq) * (0.26 + Math.min(0.18, speed * 0.03));
      this.nodes.wingL.rotation.y = 0.25 + wingFlap;
      this.nodes.wingR.rotation.y = -0.25 - wingFlap;
    }

    if (this.nodes.tailPropeller) {
      this.nodes.tailPropeller.rotation.z = (this.nodes.tailPropeller.rotation.z + dt * (9 + speed * 4)) % (Math.PI * 2);
    }

    if (this.hasTarget && this.nodes.neck) {
      if (this.lookTimeout > 0) {
        this.lookTimeout -= dt;
        if (this.lookTimeout <= 0) {
          this.hasTarget = false;
        }
      }
      if (this.hasTarget) {
        TMP.v1.copy(this.lookTarget);
        this.group.worldToLocal(TMP.v1);
        const angleY = Math.atan2(TMP.v1.x, TMP.v1.z);
        const clampedY = THREE.MathUtils.clamp(angleY, -0.85, 0.85);
        this.nodes.neck.rotation.y = damp(this.nodes.neck.rotation.y, clampedY, 6, dt);

        const horizDist = Math.max(0.4, Math.hypot(TMP.v1.x, TMP.v1.z));
        const angleX = -Math.atan2(TMP.v1.y - 1.33, horizDist);
        const clampedX = THREE.MathUtils.clamp(angleX, -0.4, 0.4);
        this.nodes.neck.rotation.x = damp(this.nodes.neck.rotation.x, clampedX, 6, dt);
      }
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.faceGen) {
      this.faceGen.dispose();
    }
    if (this.skeleton) {
      this.skeleton.dispose();
      this.skeleton = null;
    }
    for (let i = 0; i < this._ownedDisposables.length; i++) {
      const res = this._ownedDisposables[i];
      if (res && typeof res.dispose === 'function') {
        res.dispose();
      }
    }
    this._ownedDisposables.length = 0;
    this.nodes = {};
    this.materials = {};
  }
}
