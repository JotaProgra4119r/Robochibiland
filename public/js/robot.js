// Detailed Cyber-Chibi Robot Dog 3D Model with Articulated Joints and Deep Character Construction
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
    this.affection = 88; // Canine bonding / attachment level
    this.hydration = 90; // Water / lake drinking drive
    this.playfulness = 80; // Fetch and game motivation
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
      role, // 'user' | 'robot' | 'system'
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
    const mainMat = new THREE.MeshStandardMaterial({
      color: this.primaryColor,
      roughness: 0.28,
      metalness: 0.35
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: this.secondaryColor,
      roughness: 0.4,
      metalness: 0.65
    });

    const jointMat = new THREE.MeshStandardMaterial({
      color: this.accentMetalColor,
      roughness: 0.25,
      metalness: 0.8
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.15,
      metalness: 0.95
    });

    const neonMat = new THREE.MeshStandardMaterial({
      color: this.defaultGlowColor,
      emissive: this.defaultGlowColor,
      emissiveIntensity: 1.15,
      roughness: 0.15
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
      face: faceMat
    };

    // 1. ROOT & BODY
    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.95;
    this.group.add(bodyGroup);
    this.nodes.body = bodyGroup;

    // Torso Chassis
    const torsoGeo = new THREE.BoxGeometry(0.92, 0.72, 1.35);
    const torsoMesh = new THREE.Mesh(torsoGeo, mainMat);
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    bodyGroup.add(torsoMesh);

    // Side Armor Plates
    const panelGeo = new THREE.BoxGeometry(0.96, 0.48, 1.1);
    const panelMesh = new THREE.Mesh(panelGeo, darkMat);
    panelMesh.position.y = 0.04;
    bodyGroup.add(panelMesh);

    // Glowing Neon Flank Stripes
    const stripeGeo = new THREE.BoxGeometry(0.98, 0.08, 0.95);
    const stripe = new THREE.Mesh(stripeGeo, neonMat);
    bodyGroup.add(stripe);

    // Chest Power Arc-Reactor
    const coreRimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 24);
    coreRimGeo.rotateX(Math.PI / 2);
    const coreRim = new THREE.Mesh(coreRimGeo, chromeMat);
    coreRim.position.set(0, 0.05, 0.68);
    bodyGroup.add(coreRim);

    const coreInnerGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 24);
    coreInnerGeo.rotateX(Math.PI / 2);
    const coreInner = new THREE.Mesh(coreInnerGeo, neonMat);
    coreInner.position.set(0, 0.05, 0.69);
    bodyGroup.add(coreInner);
    this.nodes.powerCore = coreInner;

    // Cyber Collar & Holographic Tag
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.12, 20), darkMat);
    collar.position.set(0, 0.38, 0.58);
    collar.rotation.x = 0.35;
    bodyGroup.add(collar);

    const tagGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16);
    tagGeo.rotateX(Math.PI / 2);
    const tag = new THREE.Mesh(tagGeo, neonMat);
    tag.position.set(0, 0.3, 0.76);
    bodyGroup.add(tag);

    // Cyber Backpack / Power Cell & Jet Thrusters
    const packGroup = new THREE.Group();
    packGroup.position.set(0, 0.46, -0.1);
    bodyGroup.add(packGroup);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.75), darkMat);
    pack.castShadow = true;
    packGroup.add(pack);

    for (let f = -0.2; f <= 0.2; f += 0.1) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.03), chromeMat);
      fin.position.set(0, 0.18, f);
      packGroup.add(fin);
    }

    const thrusterGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.22, 16);
    thrusterGeo.rotateX(-Math.PI / 3);
    const thrusterL = new THREE.Mesh(thrusterGeo, darkMat);
    thrusterL.position.set(-0.22, 0.02, -0.42);
    const thrusterR = new THREE.Mesh(thrusterGeo, darkMat);
    thrusterR.position.set(0.22, 0.02, -0.42);

    const nozzleGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.06, 16);
    nozzleGeo.rotateX(-Math.PI / 3);
    const nozzleL = new THREE.Mesh(nozzleGeo, neonMat);
    nozzleL.position.set(-0.22, -0.05, -0.5);
    const nozzleR = new THREE.Mesh(nozzleGeo, neonMat);
    nozzleR.position.set(0.22, -0.05, -0.5);
    packGroup.add(thrusterL, thrusterR, nozzleL, nozzleR);

    // 2. NECK & HEAD
    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 0.38, 0.65);
    bodyGroup.add(neckPivot);
    this.nodes.neck = neckPivot;

    const headGroup = new THREE.Group();
    neckPivot.add(headGroup);
    this.nodes.head = headGroup;

    // Chibi Puppy Head
    const headGeo = new THREE.BoxGeometry(1.12, 0.95, 1.02);
    const headMesh = new THREE.Mesh(headGeo, mainMat);
    headMesh.position.set(0, 0.48, 0.22);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Forehead Brow Visor
    const browMesh = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 0.45), darkMat);
    browMesh.position.set(0, 0.92, 0.48);
    headGroup.add(browMesh);

    // OLED Face Screen
    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.58), faceMat);
    faceMesh.position.set(0, 0.48, 0.74);
    headGroup.add(faceMesh);
    this.nodes.faceMesh = faceMesh;

    // Cute Snout & Boopable Nose
    const snoutGroup = new THREE.Group();
    snoutGroup.position.set(0, 0.26, 0.76);
    headGroup.add(snoutGroup);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.25, 0.32), darkMat);
    snoutGroup.add(snout);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), neonMat);
    nose.position.set(0, 0.08, 0.18);
    snoutGroup.add(nose);
    this.nodes.nose = nose;

    // Mouth Pickup Anchor for Fetching Balls & Toys
    const mouthAnchor = new THREE.Group();
    mouthAnchor.position.set(0, -0.08, 0.22);
    snoutGroup.add(mouthAnchor);
    this.nodes.mouthAnchor = mouthAnchor;

    // Articulated Mechanical Ears
    const earGeo = new THREE.BoxGeometry(0.22, 0.58, 0.14);
    earGeo.translate(0, -0.28, 0);

    // Left Ear
    const earPivotL = new THREE.Group();
    earPivotL.position.set(-0.56, 0.9, 0.18);
    earPivotL.rotation.z = 0.25;
    const earHingeL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), jointMat);
    earHingeL.rotation.x = Math.PI / 2;
    earPivotL.add(earHingeL);

    const earL = new THREE.Mesh(earGeo, darkMat);
    earL.castShadow = true;
    const earInnerL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.02), neonMat);
    earInnerL.position.set(0, -0.28, 0.08);
    earPivotL.add(earL, earInnerL);
    headGroup.add(earPivotL);
    this.nodes.earL = earPivotL;

    // Right Ear
    const earPivotR = new THREE.Group();
    earPivotR.position.set(0.56, 0.9, 0.18);
    earPivotR.rotation.z = -0.25;
    const earHingeR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), jointMat);
    earHingeR.rotation.x = Math.PI / 2;
    earPivotR.add(earHingeR);

    const earR = new THREE.Mesh(earGeo, darkMat);
    earR.castShadow = true;
    const earInnerR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.02), neonMat);
    earInnerR.position.set(0, -0.28, 0.08);
    earPivotR.add(earR, earInnerR);
    headGroup.add(earPivotR);
    this.nodes.earR = earPivotR;

    // Antenna
    const antStemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 12);
    antStemGeo.translate(0, 0.175, 0);
    const antennaStem = new THREE.Mesh(antStemGeo, chromeMat);
    antennaStem.position.set(0, 0.95, 0.05);

    const antRingGeo = new THREE.TorusGeometry(0.09, 0.02, 8, 16);
    antRingGeo.rotateX(Math.PI / 2);
    const antRing = new THREE.Mesh(antRingGeo, neonMat);
    antRing.position.set(0, 1.25, 0.05);

    const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), neonMat);
    antBall.position.set(0, 1.35, 0.05);
    headGroup.add(antennaStem, antRing, antBall);

    // 3. WAGGING TAIL
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.24, -0.68);
    tailPivot.rotation.x = 0.55;
    bodyGroup.add(tailPivot);
    this.nodes.tail = tailPivot;

    const tailHinge = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), jointMat);
    tailPivot.add(tailHinge);

    const seg1Geo = new THREE.CylinderGeometry(0.045, 0.06, 0.35, 10);
    seg1Geo.translate(0, 0.175, 0);
    const seg1 = new THREE.Mesh(seg1Geo, darkMat);
    tailPivot.add(seg1);

    const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), neonMat);
    tailTip.position.set(0, 0.48, 0);
    tailPivot.add(tailTip);

    // 4. DETAILED LEGS & PAWS
    this.nodes.legs = {};
    const legConfigs = [
      { id: 'FL', x: -0.45, z: 0.46 },
      { id: 'FR', x: 0.45, z: 0.46 },
      { id: 'BL', x: -0.45, z: -0.46 },
      { id: 'BR', x: 0.45, z: -0.46 }
    ];

    legConfigs.forEach(cfg => {
      const hipGroup = new THREE.Group();
      hipGroup.position.set(cfg.x, -0.18, cfg.z);
      bodyGroup.add(hipGroup);

      const servoBall = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), jointMat);
      hipGroup.add(servoBall);

      const upperGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.44, 12);
      upperGeo.translate(0, -0.22, 0);
      const upperMesh = new THREE.Mesh(upperGeo, darkMat);
      upperMesh.castShadow = true;
      hipGroup.add(upperMesh);

      const kneeGroup = new THREE.Group();
      kneeGroup.position.set(0, -0.44, 0);
      hipGroup.add(kneeGroup);

      const kneeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), jointMat);
      kneeRing.rotation.z = Math.PI / 2;
      kneeGroup.add(kneeRing);

      const lowerGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.4, 12);
      lowerGeo.translate(0, -0.2, 0);
      const lowerMesh = new THREE.Mesh(lowerGeo, mainMat);
      lowerMesh.castShadow = true;
      kneeGroup.add(lowerMesh);

      const pawGroup = new THREE.Group();
      pawGroup.position.set(0, -0.4, 0.08);
      kneeGroup.add(pawGroup);

      const pawFoot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.38), darkMat);
      pawFoot.castShadow = true;
      pawGroup.add(pawFoot);

      const mainPadGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12);
      mainPadGeo.rotateX(Math.PI / 2);
      const mainPad = new THREE.Mesh(mainPadGeo, neonMat);
      mainPad.position.set(0, -0.08, 0);
      pawGroup.add(mainPad);

      for (let toe = -1; toe <= 1; toe++) {
        const toeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8);
        toeGeo.rotateX(Math.PI / 2);
        const toePad = new THREE.Mesh(toeGeo, neonMat);
        toePad.position.set(toe * 0.08, -0.08, 0.13);
        pawGroup.add(toePad);
      }

      this.nodes.legs[cfg.id] = {
        hip: hipGroup,
        knee: kneeGroup,
        paw: pawGroup
      };
    });

    // Player Selection Halo Ring (Shows above currently possessed robot!)
    const haloGeo = new THREE.TorusGeometry(0.85, 0.04, 16, 32);
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

    // Build Distinctive Character Accessories
    this.buildCharacterAccessories();
  }

  buildCharacterAccessories() {
    const { main: mainMat, dark: darkMat, joint: jointMat, chrome: chromeMat, neon: neonMat } = this.materials;
    const headGroup = this.nodes.head;
    const bodyGroup = this.nodes.body;

    if (this.name === 'Sparky') {
      // 1. Sparky: Explorer Aviator Goggles & Compass Gadget
      const gogglesGroup = new THREE.Group();
      gogglesGroup.position.set(0, 0.88, 0.42);

      const strapGeo = new THREE.BoxGeometry(1.18, 0.08, 0.98);
      const strap = new THREE.Mesh(strapGeo, darkMat);
      gogglesGroup.add(strap);

      [-0.26, 0.26].forEach(gx => {
        const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 20);
        rimGeo.rotateX(Math.PI / 2);
        const rim = new THREE.Mesh(rimGeo, chromeMat);
        rim.position.set(gx, 0.06, 0.22);

        const lensGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.09, 16);
        lensGeo.rotateX(Math.PI / 2);
        const lensMat = new THREE.MeshStandardMaterial({
          color: 0x22ff88,
          emissive: 0x22ff88,
          emissiveIntensity: 0.85,
          roughness: 0.1,
          transparent: true,
          opacity: 0.85
        });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.set(gx, 0.06, 0.23);
        gogglesGroup.add(rim, lens);
      });
      headGroup.add(gogglesGroup);

      // Mini compass on chest
      const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), chromeMat);
      compass.rotation.x = Math.PI / 2;
      compass.position.set(0, 0.18, 0.71);
      bodyGroup.add(compass);
    } else if (this.name === 'Bolt') {
      // 2. Bolt: Aerodynamic Lightning Fin & Turbo Boost Jets
      const finGroup = new THREE.Group();
      finGroup.position.set(0, 0.72, -0.2);

      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.lineTo(0.35, -0.55);
      finShape.lineTo(0.15, -0.55);
      finShape.lineTo(0, -0.25);
      finShape.closePath();

      const finGeo = new THREE.BoxGeometry(0.06, 0.45, 0.65);
      const finMesh = new THREE.Mesh(finGeo, neonMat);
      finMesh.rotation.x = -0.35;
      finGroup.add(finMesh);
      bodyGroup.add(finGroup);

      // Twin plasma turbo cones
      [-0.22, 0.22].forEach(tx => {
        const flameGeo = new THREE.ConeGeometry(0.07, 0.28, 12);
        flameGeo.rotateX(-Math.PI / 2);
        const flameMat = new THREE.MeshBasicMaterial({
          color: 0xffea00,
          transparent: true,
          opacity: 0.85
        });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(tx, 0.4, -0.68);
        bodyGroup.add(flame);
        if (!this.nodes.turboFlames) this.nodes.turboFlames = [];
        this.nodes.turboFlames.push(flame);
      });
    } else if (this.name === 'Pixel') {
      // 3. Pixel: Holographic Cyber Scanner Visor & Dual Sat-Antennas
      const visorGeo = new THREE.BoxGeometry(0.48, 0.28, 0.08);
      const visorMat = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.75
      });
      const pixelVisor = new THREE.Mesh(visorGeo, visorMat);
      pixelVisor.position.set(-0.25, 0.58, 0.78);
      headGroup.add(pixelVisor);

      // Dual satellite sensor stalks
      [-0.32, 0.32].forEach(ax => {
        const satDish = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.02, 0.04, 12), chromeMat);
        satDish.rotation.x = 0.5;
        satDish.position.set(ax, 1.25, -0.05);
        headGroup.add(satDish);
      });
    } else if (this.name === 'Luna') {
      // 4. Luna: Celestial Cyber Wings & Radiant Heart Amulet
      const wingGeo = new THREE.BoxGeometry(0.04, 0.32, 0.6);
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0xff80ab,
        emissive: 0xff4081,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.85
      });

      const wingL = new THREE.Group();
      wingL.position.set(-0.52, 0.22, 0.0);
      const wingMeshL = new THREE.Mesh(wingGeo, wingMat);
      wingMeshL.rotation.y = 0.25;
      wingL.add(wingMeshL);

      const wingR = new THREE.Group();
      wingR.position.set(0.52, 0.22, 0.0);
      const wingMeshR = new THREE.Mesh(wingGeo, wingMat);
      wingMeshR.rotation.y = -0.25;
      wingR.add(wingMeshR);

      bodyGroup.add(wingL, wingR);
      this.nodes.wingL = wingL;
      this.nodes.wingR = wingR;

      // Heart emblem on collar
      const heartMat = new THREE.MeshStandardMaterial({ color: 0xff3399, emissive: 0xff3399, emissiveIntensity: 1.0 });
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), heartMat);
      heart.position.set(0, 0.28, 0.78);
      bodyGroup.add(heart);
    } else if (this.name === 'Rusty') {
      // 5. Rusty: Gymnast Sporty Headband & Tail Acrobatic Propeller
      const headband = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.12, 1.08), neonMat);
      headband.position.set(0, 0.78, 0.22);
      headGroup.add(headband);

      // Tail mini-propeller
      if (this.nodes.tail) {
        const propHub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), chromeMat);
        propHub.position.set(0, 0.48, 0.06);

        const propGeo = new THREE.BoxGeometry(0.38, 0.04, 0.02);
        const propBlade = new THREE.Mesh(propGeo, neonMat);
        propHub.add(propBlade);

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
    const pitch = this.profile.voicePitch || 1.0;
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

    // Speed estimation for physics & secondary motion
    const movedDist = this.group.position.distanceTo(this.lastPosition);
    this.speedScalar = THREE.MathUtils.lerp(this.speedScalar, movedDist / Math.max(delta, 0.001), delta * 8);
    this.lastPosition.copy(this.group.position);

    // 1. Halo pulse animation when active player
    if (this.nodes.haloRing && this.nodes.haloRing.visible) {
      this.nodes.haloRing.rotation.z += delta * 1.5;
      this.nodes.haloRing.position.y = 2.3 + Math.sin(this.faceGen.animTime * 4) * 0.08;
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
      const isDashing = this.speedScalar > 5.5;
      this.nodes.turboFlames.forEach(flame => {
        flame.visible = isDashing;
        if (isDashing) {
          const s = 0.8 + Math.random() * 0.5;
          flame.scale.set(s, s * (1.2 + Math.random() * 0.4), s);
        }
      });
    }

    // 5. Celestial wings fluttering for Luna
    if (this.nodes.wingL && this.nodes.wingR) {
      const wingFlap = Math.sin(this.faceGen.animTime * 6) * 0.25;
      this.nodes.wingL.rotation.y = 0.25 + wingFlap;
      this.nodes.wingR.rotation.y = -0.25 - wingFlap;
    }

    // 6. Tail propeller for Rusty
    if (this.nodes.tailPropeller) {
      this.nodes.tailPropeller.rotation.z += delta * (8 + this.speedScalar * 4);
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
    } else if (this.nodes.neck) {
      this.nodes.neck.rotation.y = THREE.MathUtils.lerp(this.nodes.neck.rotation.y, 0, delta * 3);
      this.nodes.neck.rotation.x = THREE.MathUtils.lerp(this.nodes.neck.rotation.x, 0, delta * 3);
    }
  }
}
