// Detailed Cyber-Chibi Robot Dog 3D Model with Beveled Designer Geometry, Clearcoat Materials & Hydraulic Joints
import * as THREE from 'three';
import { EMOTIONS, FaceTextureGenerator } from './emotions.js';
import { roboAudio } from './audio.js';

export const CHARACTER_PROFILES = {
  Sparky: {
    name: "Sparky",
    title: "El Explorador Curioso",
    description: "Equilibrado, cariñoso y fascinado por descubrir cada rincón del prado y el lago.",
    primaryColor: 0xf8fafc,
    secondaryColor: 0x1e293b,
    glowColor: 0x22ff88,
    speedMultiplier: 1.0,
    voicePitch: 1.0,
    avatarIcon: "🐾",
    favoritePlace: "Prado Esmeralda",
    thoughts: [
      "¡El prado verde huele a flores y aire fresco digital!",
      "¿Qué habrá al otro lado de esa colina?",
      "¡Me encanta pasear con mi manada de amigos!",
      "Siento una gran energía en mis sensores hoy.",
      "El agua del lago refleja el cielo como un espejo cristalino."
    ]
  },
  Bolt: {
    name: "Bolt",
    title: "El Relámpago Veloz",
    description: "Hiperactivo y supersónico. Vive por y para perseguir pelotas a toda velocidad.",
    primaryColor: 0x1e293b,
    secondaryColor: 0xfacc15,
    glowColor: 0xffea00,
    speedMultiplier: 1.35,
    voicePitch: 1.25,
    avatarIcon: "⚡",
    favoritePlace: "Parque de Juegos",
    thoughts: [
      "¡Zuuuum! ¡Nadie me gana en una carrera hacia la pelota!",
      "¡Pásamela, pásamela, goléala fuerte!",
      "¡Mis propulsores jet están que arden de emoción!",
      "¡Mira qué rápido puedo dar la vuelta al parque!",
      "¡Una pelota en movimiento! ¡Allá vooooy!"
    ]
  },
  Pixel: {
    name: "Pixel",
    title: "El Hacker del Lago",
    description: "Analítico y curioso. Adora escanear el agua, las rocas y calcular trayectorias.",
    primaryColor: 0x0f172a,
    secondaryColor: 0x00e5ff,
    glowColor: 0x00e5ff,
    speedMultiplier: 1.05,
    voicePitch: 1.12,
    avatarIcon: "🔍",
    favoritePlace: "Lago de Cristal",
    thoughts: [
      "Analizando refracción de luz en las ondas del lago...",
      "Detecto 99.8% de serenidad en el muelle de madera.",
      "Escaneando objetos interactivos en el cuadrante norte.",
      "¡Qué estructura tan interesante tienen estos nenúfares!",
      "Calibrando compás digital con la orilla."
    ]
  },
  Luna: {
    name: "Luna",
    title: "La Soñadora Celestial",
    description: "Dulce, tranquila y afectuosa. Le fascina mirar las nubes y tomar siestas acogedoras.",
    primaryColor: 0x334155,
    secondaryColor: 0xf472b6,
    glowColor: 0xff4081,
    speedMultiplier: 0.95,
    voicePitch: 1.35,
    avatarIcon: "💖",
    favoritePlace: "Estación de Recarga",
    thoughts: [
      "El cielo está tan bonito hoy... parece un cuadro suave.",
      "Descansar en la estación de recarga me llena de paz.",
      "¡Te mando un saludo lleno de chispas de amor y mimos!",
      "Las flores silvestres huelen delicioso.",
      "A veces es lindo sentarse y simplemente escuchar el viento."
    ]
  },
  Rusty: {
    name: "Rusty",
    title: "El Acróbata Ágil",
    description: "Gimnasta intrépido y juguetón. Siempre está inventando saltos, giros y volteretas.",
    primaryColor: 0x1e293b,
    secondaryColor: 0xf97316,
    glowColor: 0xff9100,
    speedMultiplier: 1.15,
    voicePitch: 0.88,
    avatarIcon: "🤸",
    favoritePlace: "Parque de Juegos",
    thoughts: [
      "¿Viste mi voltereta triple sobre el trampolín?",
      "¡Acrobacia completada con un 10 perfecto!",
      "¡Voy a subirme al carrusel a dar vueltas!",
      "¡Hagamos un truco nuevo juntos, mira cómo giro!",
      "¡El suelo es lava cibernética! ¡A saltar alto!"
    ]
  }
};

// Procedural Beveled Box Helper for smooth Astro-Bot / Aibo style curves
function createBeveledBox(width, height, depth, radius = 0.08, smoothness = 3) {
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
    bevelSegments: smoothness * 2,
    steps: 1,
    bevelSize: r,
    bevelThickness: r,
    curveSegments: smoothness
  });
  geo.center();
  return geo;
}

export class ChibiRobotDog {
  constructor(name = "Sparky", options = {}) {
    this.name = name;
    this.profile = CHARACTER_PROFILES[name] || {
      name: name,
      title: "RoboPup",
      description: "Un tierno perrito robot chibi.",
      primaryColor: options.primaryColor || 0xf8fafc,
      secondaryColor: options.secondaryColor || 0x1e293b,
      glowColor: options.glowColor || 0x00e5ff,
      speedMultiplier: 1.0,
      voicePitch: 1.0,
      avatarIcon: "🐾",
      favoritePlace: "Prado",
      thoughts: ["Explorando felizmente el entorno virtual."]
    };

    this.isPlayer = options.isPlayer !== undefined ? options.isPlayer : false;
    this.primaryColor = options.primaryColor || this.profile.primaryColor;
    this.secondaryColor = options.secondaryColor || this.profile.secondaryColor;
    this.accentMetalColor = options.accentColor || 0x64748b;
    this.defaultGlowColor = options.glowColor || this.profile.glowColor;

    this.currentEmotion = EMOTIONS.HAPPY;
    this.faceGen = new FaceTextureGenerator();

    this.group = new THREE.Group();
    this.group.name = `ChibiRobot_${name}`;

    this.nodes = {};
    this.materials = {};

    this.buildDetailedModel();
    this.setEmotion(this.currentEmotion);

    // Telemetry and movement physics
    this.velocity = new THREE.Vector3();
    this.rotationY = 0;
    this.targetRotation = 0;
    this.bankAngle = 0;
    this.speed = 0;
    this.energy = 100;
    this.curiosity = 85;
    this.sociability = 90;
    this.affection = 88;
    this.hydration = 90;
    this.playfulness = 80;
    this.carriedObject = null;
    this.tailHelicopterTimer = 0;
    this.isResting = false;

    // Secondary spring physics for floppy ears & tail
    this.earSpringAngleL = 0.25;
    this.earSpringAngleR = -0.25;
    this.earSpringVelL = 0;
    this.earSpringVelR = 0;
    this.tailSpringAngle = 0;
    this.tailSpringVel = 0;
    this.lastPosition = this.group.position.clone();
    this.speedScalar = 0;

    // Head look target
    this.lookTarget = new THREE.Vector3();
    this.hasTarget = false;

    // Independent Dialogue & Mission State
    this.dialogueHistory = [];
    this.activeMission = null;
    this.isPickedUp = false;
    this.fallVelocityY = 0;
    this.stuckCount = 0;
    this.isInWater = false;
    this.wasInWater = false;
    this.hasDugTreasure = false;
    this.dizzyTimer = 0;
    this.swimmingTimer = 0;
    this.shakeOffTimer = 0;
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
    return arr[Math.floor(Math.random() * arr.length)] || "Explorando con alegría.";
  }

  buildDetailedModel() {
    // High-gloss ceramic/automotive clearcoat shell
    const mainMat = new THREE.MeshPhysicalMaterial({
      color: this.primaryColor,
      roughness: 0.2,
      metalness: 0.25,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: this.secondaryColor,
      roughness: 0.35,
      metalness: 0.7
    });

    const jointMat = new THREE.MeshStandardMaterial({
      color: this.accentMetalColor,
      roughness: 0.22,
      metalness: 0.85
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.1,
      metalness: 0.95
    });

    const neonMat = new THREE.MeshStandardMaterial({
      color: this.defaultGlowColor,
      emissive: this.defaultGlowColor,
      emissiveIntensity: 1.35,
      roughness: 0.15
    });

    const visorGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.08,
      metalness: 0.1,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.28
    });

    const faceMat = new THREE.MeshBasicMaterial({
      map: this.faceGen.texture,
      transparent: false
    });

    this.materials = {
      main: mainMat,
      dark: darkMat,
      joint: jointMat,
      chrome: chromeMat,
      neon: neonMat,
      face: faceMat,
      visorGlass: visorGlassMat
    };

    // 1. ROOT & BEVELED CHIBI BODY
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.95;
    this.group.add(bodyGroup);
    this.nodes.body = bodyGroup;

    // Beveled Chest & Torso Chassis
    const torsoGeo = createBeveledBox(0.92, 0.72, 1.35, 0.14, 3);
    const torsoMesh = new THREE.Mesh(torsoGeo, mainMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    bodyGroup.add(torsoMesh);

    // Contoured Belly Under-Chassis
    const bellyGeo = createBeveledBox(0.76, 0.24, 1.12, 0.08, 2);
    const bellyMesh = new THREE.Mesh(bellyGeo, darkMat);
    bellyMesh.position.set(0, -0.28, 0);
    bodyGroup.add(bellyMesh);

    // Side Armor Plates with Vent Louvers
    const panelGeo = createBeveledBox(0.98, 0.46, 1.06, 0.08, 2);
    const panelMesh = new THREE.Mesh(panelGeo, darkMat);
    panelMesh.position.y = 0.04;
    bodyGroup.add(panelMesh);

    // Glowing Neon Flank Stripes
    const stripeGeo = createBeveledBox(1.01, 0.08, 0.92, 0.02, 2);
    const stripe = new THREE.Mesh(stripeGeo, neonMat);
    stripe.position.y = 0.04;
    bodyGroup.add(stripe);

    // Chest Power Arc-Reactor with Turbine Ring
    const coreRimGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.07, 24);
    coreRimGeo.rotateX(Math.PI / 2);
    const coreRim = new THREE.Mesh(coreRimGeo, chromeMat);
    coreRim.position.set(0, 0.05, 0.67);
    bodyGroup.add(coreRim);

    const coreInnerGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.09, 24);
    coreInnerGeo.rotateX(Math.PI / 2);
    const coreInner = new THREE.Mesh(coreInnerGeo, neonMat);
    coreInner.position.set(0, 0.05, 0.68);
    bodyGroup.add(coreInner);
    this.nodes.powerCore = coreInner;

    // Cyber Collar & Holographic Bell Tag
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.065, 16, 28), darkMat);
    collar.position.set(0, 0.36, 0.56);
    collar.rotation.x = Math.PI / 2 + 0.35;
    bodyGroup.add(collar);

    const collarGlowRing = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.02, 12, 28), neonMat);
    collarGlowRing.position.copy(collar.position);
    collarGlowRing.rotation.copy(collar.rotation);
    bodyGroup.add(collarGlowRing);

    const tagGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.035, 20);
    tagGeo.rotateX(Math.PI / 2);
    const tag = new THREE.Mesh(tagGeo, neonMat);
    tag.position.set(0, 0.26, 0.76);
    bodyGroup.add(tag);

    // Cyber Backpack / Power Cell & Dual Jet Thrusters
    const packGroup = new THREE.Group();
    packGroup.position.set(0, 0.45, -0.08);
    bodyGroup.add(packGroup);

    const pack = new THREE.Mesh(createBeveledBox(0.64, 0.32, 0.78, 0.08, 2), darkMat);
    pack.castShadow = true;
    packGroup.add(pack);

    // Glowing Battery Level Bars on Backpack Top
    for (let b = -0.18; b <= 0.18; b += 0.12) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.05), neonMat);
      bar.position.set(0, 0.17, b);
      packGroup.add(bar);
    }

    const thrusterGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.26, 16);
    thrusterGeo.rotateX(-Math.PI / 3);
    [-0.22, 0.22].forEach(tx => {
      const thruster = new THREE.Mesh(thrusterGeo, chromeMat);
      thruster.position.set(tx, 0.02, -0.44);
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.08, 0.08, 16).rotateX(-Math.PI / 3),
        neonMat
      );
      nozzle.position.set(tx, -0.05, -0.52);
      packGroup.add(thruster, nozzle);
    });

    // 2. NECK & BEVELED CHIBI HEAD
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.38, 0.65);
    bodyGroup.add(neckPivot);
    this.nodes.neck = neckPivot;

    // Articulated Neck Servo Cylinder
    const neckJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 16), jointMat);
    neckJoint.position.set(0, 0.08, 0.05);
    neckPivot.add(neckJoint);

    const headGroup = new THREE.Group();
    neckPivot.add(headGroup);
    this.nodes.head = headGroup;

    // Rounded Chibi Puppy Head Shell
    const headGeo = createBeveledBox(1.14, 0.96, 1.04, 0.18, 3);
    const headMesh = new THREE.Mesh(headGeo, mainMat);
    headMesh.position.set(0, 0.48, 0.22);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Side Headphone / Audio Sensor Discs on Cheeks
    [-0.58, 0.58].forEach(cx => {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 20).rotateZ(Math.PI / 2), darkMat);
      disc.position.set(cx, 0.46, 0.22);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 12, 20).rotateY(Math.PI / 2), neonMat);
      ring.position.set(cx + (cx > 0 ? 0.03 : -0.03), 0.46, 0.22);
      headGroup.add(disc, ring);
    });

    // Recessed Dark Bezel Frame around OLED Face
    const bezelGeo = createBeveledBox(0.98, 0.64, 0.08, 0.04, 2);
    const bezelMesh = new THREE.Mesh(bezelGeo, darkMat);
    bezelMesh.position.set(0, 0.48, 0.71);
    headGroup.add(bezelMesh);

    // OLED Face Screen
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.58), faceMat);
    faceMesh.position.set(0, 0.48, 0.752);
    headGroup.add(faceMesh);
    this.nodes.faceMesh = faceMesh;

    // Glossy Protective Glass Visor Layer over OLED Face
    const glassVisor = new THREE.Mesh(new THREE.PlaneGeometry(0.93, 0.59), visorGlassMat);
    glassVisor.position.set(0, 0.48, 0.758);
    headGroup.add(glassVisor);

    // Forehead Brow Shield
    const browMesh = new THREE.Mesh(createBeveledBox(1.12, 0.13, 0.46, 0.04, 2), darkMat);
    browMesh.position.set(0, 0.91, 0.49);
    headGroup.add(browMesh);

    // Cute Sculpted Snout & Boopable Heart-Like Nose
    const snoutGroup = new THREE.Group();
    snoutGroup.position.set(0, 0.25, 0.76);
    headGroup.add(snoutGroup);

    const snout = new THREE.Mesh(createBeveledBox(0.48, 0.25, 0.34, 0.07, 2), darkMat);
    snoutGroup.add(snout);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 20), neonMat);
    nose.scale.set(1.15, 0.85, 0.95);
    nose.position.set(0, 0.08, 0.18);
    snoutGroup.add(nose);
    this.nodes.nose = nose;

    // Mouth Pickup Anchor for Fetching Balls & Toys
    const mouthAnchor = new THREE.Group();
    mouthAnchor.position.set(0, -0.08, 0.22);
    snoutGroup.add(mouthAnchor);
    this.nodes.mouthAnchor = mouthAnchor;

    // Articulated Beveled Mechanical Ears
    const earGeo = createBeveledBox(0.24, 0.58, 0.14, 0.05, 2);
    earGeo.translate(0, -0.28, 0);

    const buildEar = (isLeft) => {
      const sign = isLeft ? -1 : 1;
      const earPivot = new THREE.Group();
      earPivot.position.set(sign * 0.56, 0.9, 0.18);
      earPivot.rotation.z = sign * 0.25;

      const earHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.18, 16), chromeMat);
      earHinge.rotation.x = Math.PI / 2;
      earPivot.add(earHinge);

      const earOuter = new THREE.Mesh(earGeo, darkMat);
      earOuter.castShadow = true;
      const earInner = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.025), neonMat);
      earInner.position.set(0, -0.28, 0.075);
      earPivot.add(earOuter, earInner);
      headGroup.add(earPivot);
      return earPivot;
    };

    this.nodes.earL = buildEar(true);
    this.nodes.earR = buildEar(false);

    // Cyber Antenna with Floating Signal Halo
    const antBase = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.1, 16), darkMat);
    antBase.position.set(0, 0.98, 0.05);
    const antStemGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.34, 12);
    antStemGeo.translate(0, 0.17, 0);
    const antennaStem = new THREE.Mesh(antStemGeo, chromeMat);
    antennaStem.position.set(0, 0.98, 0.05);

    const antRing = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 10, 20).rotateX(Math.PI / 2), neonMat);
    antRing.position.set(0, 1.26, 0.05);

    const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 16), neonMat);
    antBall.position.set(0, 1.36, 0.05);
    headGroup.add(antBase, antennaStem, antRing, antBall);

    // 3. MULTI-SEGMENTED ARTICULATED WAGGING TAIL
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.24, -0.68);
    tailPivot.rotation.x = 0.55;
    bodyGroup.add(tailPivot);
    this.nodes.tail = tailPivot;

    const tailHinge = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), jointMat);
    tailPivot.add(tailHinge);

    const seg1Geo = new THREE.CylinderGeometry(0.045, 0.068, 0.38, 12);
    seg1Geo.translate(0, 0.19, 0);
    const seg1 = new THREE.Mesh(seg1Geo, darkMat);
    tailPivot.add(seg1);

    // Glowing Energy Rings along Tail
    [0.14, 0.28].forEach(ry => {
      const tRing = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.015, 8, 16).rotateX(Math.PI / 2), neonMat);
      tRing.position.set(0, ry, 0);
      tailPivot.add(tRing);
    });

    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 16), neonMat);
    tailTip.position.set(0, 0.48, 0);
    tailPivot.add(tailTip);

    // 4. DETAILED LEGS WITH SERVO RINGS, HYDRAULIC PISTONS & SCULPTED PAWS
    this.nodes.legs = {};
    const legConfigs = [
      { id: 'FL', x: -0.46, z: 0.46 },
      { id: 'FR', x: 0.46, z: 0.46 },
      { id: 'BL', x: -0.46, z: -0.46 },
      { id: 'BR', x: 0.46, z: -0.46 }
    ];

    legConfigs.forEach(cfg => {
      const isLeft = cfg.x < 0;
      const hipGroup = new THREE.Group();
      hipGroup.position.set(cfg.x, -0.18, cfg.z);
      bodyGroup.add(hipGroup);

      // Shoulder/Hip Servo Drum + Glowing LED Ring
      const servoBall = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 16), jointMat);
      hipGroup.add(servoBall);

      const hipLedRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.016, 10, 20).rotateY(Math.PI / 2), neonMat);
      hipLedRing.position.x = isLeft ? -0.05 : 0.05;
      hipGroup.add(hipLedRing);

      // Upper Thigh Armor + Chrome Hydraulic Piston
      const upperGeo = new THREE.CylinderGeometry(0.115, 0.095, 0.44, 14);
      upperGeo.translate(0, -0.22, 0);
      const upperMesh = new THREE.Mesh(upperGeo, darkMat);
      upperMesh.castShadow = true;
      hipGroup.add(upperMesh);

      const pistonRod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8), chromeMat);
      pistonRod.position.set(0, -0.22, -0.09);
      hipGroup.add(pistonRod);

      // Knee Joint
      const kneeGroup = new THREE.Group();
      kneeGroup.position.set(0, -0.44, 0);
      hipGroup.add(kneeGroup);

      const kneeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.17, 14), chromeMat);
      kneeRing.rotation.z = Math.PI / 2;
      kneeGroup.add(kneeRing);

      // Lower Shin Segment
      const lowerGeo = new THREE.CylinderGeometry(0.095, 0.115, 0.4, 14);
      lowerGeo.translate(0, -0.2, 0);
      const lowerMesh = new THREE.Mesh(lowerGeo, mainMat);
      lowerMesh.castShadow = true;
      kneeGroup.add(lowerMesh);

      // Sculpted Chibi Paw with Toe Beans
      const pawGroup = new THREE.Group();
      pawGroup.position.set(0, -0.4, 0.08);
      kneeGroup.add(pawGroup);

      const pawFoot = new THREE.Mesh(createBeveledBox(0.28, 0.16, 0.38, 0.05, 2), darkMat);
      pawFoot.castShadow = true;
      pawGroup.add(pawFoot);

      const mainPadGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14);
      mainPadGeo.rotateX(Math.PI / 2);
      const mainPad = new THREE.Mesh(mainPadGeo, neonMat);
      mainPad.position.set(0, -0.075, -0.02);
      pawGroup.add(mainPad);

      for (let toe = -1; toe <= 1; toe++) {
        const toeBeam = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), mainMat);
        toeBeam.position.set(toe * 0.085, -0.02, 0.17);
        pawGroup.add(toeBeam);

        const toePad = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10).rotateX(Math.PI / 2), neonMat);
        toePad.position.set(toe * 0.085, -0.075, 0.14);
        pawGroup.add(toePad);
      }

      this.nodes.legs[cfg.id] = {
        hip: hipGroup,
        knee: kneeGroup,
        paw: pawGroup
      };
    });

    // Player Selection Halo Ring
    const haloGeo = new THREE.TorusGeometry(0.85, 0.038, 16, 36);
    haloGeo.rotateX(Math.PI / 2);
    const halo = new THREE.Mesh(haloGeo, neonMat);
    halo.position.set(0, 2.3, 0);
    halo.visible = this.isPlayer;
    this.group.add(halo);
    this.nodes.haloRing = halo;

    // Overhead UI Anchor
    const overheadAnchor = new THREE.Group();
    overheadAnchor.position.set(0, 2.5, 0);
    this.group.add(overheadAnchor);
    this.nodes.overheadAnchor = overheadAnchor;

    this.buildCharacterAccessories();
  }

  buildCharacterAccessories() {
    const { dark: darkMat, chrome: chromeMat, neon: neonMat } = this.materials;
    const headGroup = this.nodes.head;
    const bodyGroup = this.nodes.body;

    if (this.name === 'Sparky') {
      // 1. Sparky: Explorer Aviator Goggles & Compass Gadget
      const gogglesGroup = new THREE.Group();
      gogglesGroup.position.set(0, 0.88, 0.42);

      const strap = new THREE.Mesh(createBeveledBox(1.18, 0.09, 0.98, 0.02, 2), darkMat);
      gogglesGroup.add(strap);

      const lensMat = new THREE.MeshPhysicalMaterial({
        color: 0x22ff88,
        emissive: 0x22ff88,
        emissiveIntensity: 0.75,
        roughness: 0.05,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.88
      });

      [-0.26, 0.26].forEach(gx => {
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.09, 24).rotateX(Math.PI / 2), chromeMat);
        rim.position.set(gx, 0.06, 0.22);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 20).rotateX(Math.PI / 2), lensMat);
        lens.position.set(gx, 0.06, 0.23);
        gogglesGroup.add(rim, lens);
      });
      headGroup.add(gogglesGroup);

      const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.035, 20).rotateX(Math.PI / 2), chromeMat);
      compass.position.set(0, 0.19, 0.71);
      bodyGroup.add(compass);
    } else if (this.name === 'Bolt') {
      // 2. Bolt: Aerodynamic Lightning Dorsal Fin & Twin Plasma Boost Cones
      const finGroup = new THREE.Group();
      finGroup.position.set(0, 0.72, -0.2);

      const finMesh = new THREE.Mesh(createBeveledBox(0.07, 0.46, 0.68, 0.02, 2), neonMat);
      finMesh.rotation.x = -0.38;
      finGroup.add(finMesh);
      bodyGroup.add(finGroup);

      [-0.22, 0.22].forEach(tx => {
        const flameGeo = new THREE.ConeGeometry(0.075, 0.32, 14);
        flameGeo.rotateX(-Math.PI / 2);
        const flameMat = new THREE.MeshBasicMaterial({
          color: 0xffea00,
          transparent: true,
          opacity: 0.88
        });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(tx, 0.4, -0.69);
        bodyGroup.add(flame);
        if (!this.nodes.turboFlames) this.nodes.turboFlames = [];
        this.nodes.turboFlames.push(flame);
      });
    } else if (this.name === 'Pixel') {
      // 3. Pixel: Holographic Cyber Scouter Visor & Dual Sat-Antennas
      const visorMat = new THREE.MeshPhysicalMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 1.15,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.78
      });
      const pixelVisor = new THREE.Mesh(createBeveledBox(0.5, 0.28, 0.06, 0.02, 2), visorMat);
      pixelVisor.position.set(-0.24, 0.56, 0.79);
      headGroup.add(pixelVisor);

      [-0.32, 0.32].forEach(ax => {
        const satDish = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.02, 0.045, 16), chromeMat);
        satDish.rotation.x = 0.5;
        satDish.position.set(ax, 1.25, -0.05);
        headGroup.add(satDish);
      });
    } else if (this.name === 'Luna') {
      // 4. Luna: Multi-Feathered Celestial Cyber Wings & Radiant Heart Amulet
      const wingMat = new THREE.MeshPhysicalMaterial({
        color: 0xff80ab,
        emissive: 0xff4081,
        emissiveIntensity: 0.85,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.88
      });

      const buildWing = (isLeft) => {
        const sign = isLeft ? -1 : 1;
        const wingPivot = new THREE.Group();
        wingPivot.position.set(sign * 0.52, 0.24, 0.0);
        for (let f = 0; f < 3; f++) {
          const feather = new THREE.Mesh(
            createBeveledBox(0.04, 0.14 - f * 0.02, 0.62 - f * 0.12, 0.015, 2),
            wingMat
          );
          feather.position.set(0, 0.1 - f * 0.11, -f * 0.06);
          feather.rotation.y = sign * 0.26;
          feather.rotation.x = 0.15;
          wingPivot.add(feather);
        }
        return wingPivot;
      };

      const wingL = buildWing(true);
      const wingR = buildWing(false);
      bodyGroup.add(wingL, wingR);
      this.nodes.wingL = wingL;
      this.nodes.wingR = wingR;

      const heartMat = new THREE.MeshStandardMaterial({ color: 0xff3399, emissive: 0xff3399, emissiveIntensity: 1.2 });
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 16), heartMat);
      heart.position.set(0, 0.26, 0.78);
      bodyGroup.add(heart);
    } else if (this.name === 'Rusty') {
      // 5. Rusty: Gymnast Sporty Headband & Dual-Blade Tail Propeller
      const headband = new THREE.Mesh(createBeveledBox(1.18, 0.13, 1.08, 0.03, 2), neonMat);
      headband.position.set(0, 0.79, 0.22);
      headGroup.add(headband);

      if (this.nodes.tail) {
        const propHub = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 14), chromeMat);
        propHub.position.set(0, 0.48, 0.06);

        const propBlade1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.02), neonMat);
        const propBlade2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.02), neonMat);
        propHub.add(propBlade1, propBlade2);

        this.nodes.tail.add(propHub);
        this.nodes.tailPropeller = propHub;
      }
    }
  }

  setEmotion(emotion) {
    if (!emotion) return;
    this.currentEmotion = emotion;

    const hex = emotion.colorHex;
    this.materials.neon.color.setHex(hex);
    this.materials.neon.emissive.setHex(hex);

    this.faceGen.drawFace(emotion.faceExpression, emotion.glowColor, false);

    const pitch = this.profile.voicePitch || 1.0;
    if (this.isPlayer) {
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

  petRobot() {
    this.setEmotion(EMOTIONS.LOVING);
    this.curiosity = Math.min(100, this.curiosity + 15);
    this.energy = Math.min(100, this.energy + 25);
    this.affection = Math.min(100, (this.affection || 85) + 15);
    const pitch = this.profile.voicePitch || 1.0;
    roboAudio.playBoop(1.2 * pitch);
  }

  praise(customMessage = null) {
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

  lookAt(targetPos) {
    this.lookTarget.copy(targetPos);
    this.hasTarget = true;
  }

  update(delta) {
    this.faceGen.update(delta, this.currentEmotion.faceExpression, this.currentEmotion.glowColor);

    const movedDist = this.group.position.distanceTo(this.lastPosition);
    this.speedScalar = THREE.MathUtils.lerp(this.speedScalar, movedDist / Math.max(delta, 0.001), delta * 8);
    this.lastPosition.copy(this.group.position);

    // 1. Halo & Power Core pulse
    if (this.nodes.haloRing && this.nodes.haloRing.visible) {
      this.nodes.haloRing.rotation.z += delta * 1.5;
      this.nodes.haloRing.position.y = 2.3 + Math.sin(this.faceGen.animTime * 4) * 0.08;
    }
    if (this.nodes.powerCore && this.materials.neon) {
      this.materials.neon.emissiveIntensity = 1.2 + Math.sin(this.faceGen.animTime * 3.5) * 0.25;
    }

    // 2. Body Bank Angle
    if (this.nodes.body) {
      this.nodes.body.rotation.z = THREE.MathUtils.lerp(this.nodes.body.rotation.z, this.bankAngle, delta * 8);
    }

    // 3. Floppy Ears Spring Dynamics
    if (this.nodes.earL && this.nodes.earR) {
      const earRestL = 0.25;
      const earRestR = -0.25;
      const earExcitement = (this.speedScalar * 0.035) + (this.currentEmotion === EMOTIONS.EXCITED ? 0.2 : 0);
      const earOsc = Math.sin(this.faceGen.animTime * 12) * earExcitement;

      this.earSpringVelL += (earRestL + earOsc - this.nodes.earL.rotation.z) * 22 * delta;
      this.earSpringVelL *= Math.exp(-9 * delta);
      this.nodes.earL.rotation.z += this.earSpringVelL * delta;

      this.earSpringVelR += (earRestR - earOsc - this.nodes.earR.rotation.z) * 22 * delta;
      this.earSpringVelR *= Math.exp(-9 * delta);
      this.nodes.earR.rotation.z += this.earSpringVelR * delta;
    }

    // 4. Turbo boost flames for Bolt
    if (this.nodes.turboFlames) {
      const isDashing = this.speedScalar > 5.2;
      this.nodes.turboFlames.forEach(flame => {
        flame.visible = isDashing;
        if (isDashing) {
          const s = 0.85 + Math.random() * 0.45;
          flame.scale.set(s, s * (1.25 + Math.random() * 0.4), s);
        }
      });
    }

    // 5. Celestial wings fluttering for Luna
    if (this.nodes.wingL && this.nodes.wingR) {
      const wingFlap = Math.sin(this.faceGen.animTime * 6.5) * 0.28;
      this.nodes.wingL.rotation.y = 0.25 + wingFlap;
      this.nodes.wingR.rotation.y = -0.25 - wingFlap;
    }

    // 6. Tail propeller for Rusty
    if (this.nodes.tailPropeller) {
      this.nodes.tailPropeller.rotation.z += delta * (9 + this.speedScalar * 4);
    }

    // 7. Helicopter Tail Wagging
    if (this.tailHelicopterTimer > 0) {
      this.tailHelicopterTimer -= delta;
      if (this.nodes.tail) {
        this.nodes.tail.rotation.z += delta * 28.0;
      }
    }

    // 8. Head look-at target
    if (this.hasTarget && this.nodes.neck) {
      const localTarget = this.lookTarget.clone();
      this.group.worldToLocal(localTarget);
      const angleY = Math.atan2(localTarget.x, localTarget.z);
      const clampedY = THREE.MathUtils.clamp(angleY, -0.85, 0.85);
      this.nodes.neck.rotation.y = THREE.MathUtils.lerp(this.nodes.neck.rotation.y, clampedY, delta * 5);

      const angleX = -Math.atan2(localTarget.y - 1.2, localTarget.z);
      const clampedX = THREE.MathUtils.clamp(angleX, -0.4, 0.4);
      this.nodes.neck.rotation.x = THREE.MathUtils.lerp(this.nodes.neck.rotation.x, clampedX, delta * 5);
    }
  }
}