// Emotion System with Cached OLED Visor Renderer & Single-Draw-Call Pooled InstancedMesh Particle FX
import * as THREE from 'three';

export const EMOTIONS = {
  HAPPY: {
    id: 'HAPPY',
    name: 'Feliz',
    colorHex: 0x22ff88,
    secondaryHex: 0xffea00,
    cssColor: '#22ff88',
    glowColor: '#39ff14',
    faceExpression: 'happy',
    icon: '😊',
    description: 'Lleno de energía y alegría con sus amigos'
  },
  CURIOUS: {
    id: 'CURIOUS',
    name: 'Curioso',
    colorHex: 0x00e5ff,
    secondaryHex: 0x7c4dff,
    cssColor: '#00e5ff',
    glowColor: '#00e5ff',
    faceExpression: 'curious',
    icon: '🧐',
    description: 'Investigando objetos y descubriendo el entorno'
  },
  LOVING: {
    id: 'LOVING',
    name: 'Cariñoso',
    colorHex: 0xff3399,
    secondaryHex: 0xff80ab,
    cssColor: '#ff3399',
    glowColor: '#ff1493',
    faceExpression: 'loving',
    icon: '💖',
    description: 'Siente afecto por ti y por sus amigos'
  },
  EXCITED: {
    id: 'EXCITED',
    name: 'Juguetón',
    colorHex: 0xff9100,
    secondaryHex: 0xffd600,
    cssColor: '#ff9100',
    glowColor: '#ff6d00',
    faceExpression: 'excited',
    icon: '⚡',
    description: 'Listo para correr, saltar y jugar a la pelota'
  },
  SLEEPY: {
    id: 'SLEEPY',
    name: 'Somnoliento',
    colorHex: 0x5c6bc0,
    secondaryHex: 0x26c6da,
    cssColor: '#7986cb',
    glowColor: '#3f51b5',
    faceExpression: 'sleepy',
    icon: '😴',
    description: 'Recargando baterías y descansando tranquilamente'
  },
  ALERT: {
    id: 'ALERT',
    name: 'Alerta',
    colorHex: 0xff3d00,
    secondaryHex: 0xff9e80,
    cssColor: '#ff3d00',
    glowColor: '#ff1744',
    faceExpression: 'alert',
    icon: '⚠️',
    description: 'Percibió algo inusual o un movimiento rápido'
  },
  MISCHIEVOUS: {
    id: 'MISCHIEVOUS',
    name: 'Pícaro',
    colorHex: 0xa855f7,
    secondaryHex: 0xd8b4fe,
    cssColor: '#a855f7',
    glowColor: '#c084fc',
    faceExpression: 'mischievous',
    icon: '😈',
    description: 'Tramando travesuras y juegos traviesos con sus amigos'
  },
  PROUD: {
    id: 'PROUD',
    name: 'Orgulloso',
    colorHex: 0xfbbf24,
    secondaryHex: 0xfef08a,
    cssColor: '#fbbf24',
    glowColor: '#f59e0b',
    faceExpression: 'proud',
    icon: '😎',
    description: 'Luce sus mejores trucos y piruetas con estilo'
  },
  SCARED: {
    id: 'SCARED',
    name: 'Asustadizo',
    colorHex: 0x38bdf8,
    secondaryHex: 0xbae6fd,
    cssColor: '#38bdf8',
    glowColor: '#0284c7',
    faceExpression: 'scared',
    icon: '😱',
    description: 'Sobresaltado por un ruido o movimiento repentino'
  },
  HUNGRY: {
    id: 'HUNGRY',
    name: 'Glotón',
    colorHex: 0xf97316,
    secondaryHex: 0xfed7aa,
    cssColor: '#f97316',
    glowColor: '#ea580c',
    faceExpression: 'hungry',
    icon: '😋',
    description: 'Buscando con su olfato cibernético ricas galletas'
  },
  PARTY: {
    id: 'PARTY',
    name: 'Fiestero',
    colorHex: 0xec4899,
    secondaryHex: 0x06b6d4,
    cssColor: '#ec4899',
    glowColor: '#f43f5e',
    faceExpression: 'party',
    icon: '🪩',
    description: 'Modo discoteca encendido, listo para bailar al ritmo de los beats'
  },
  CONFUSED: {
    id: 'CONFUSED',
    name: 'Despistado',
    colorHex: 0x818cf8,
    secondaryHex: 0xc7d2fe,
    cssColor: '#818cf8',
    glowColor: '#6366f1',
    faceExpression: 'confused',
    icon: '🤔',
    description: 'Procesando una orden extraña o recalculando coordenadas'
  }
};

const ANIMATED_EXPRESSIONS = new Set([
  'party',
  'scared',
  'loving',
  'excited',
  'sleepy',
  'hungry',
  'confused'
]);

export class FaceTextureGenerator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');

    // Pre-render static OLED background & scanline grid once to avoid per-frame gradient/stroke cost
    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.width = 512;
    this.bgCanvas.height = 256;
    const bgCtx = this.bgCanvas.getContext('2d');
    const bgGrad = bgCtx.createRadialGradient(256, 128, 20, 256, 128, 307);
    bgGrad.addColorStop(0, '#0a1120');
    bgGrad.addColorStop(1, '#04070d');
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, 512, 256);

    bgCtx.strokeStyle = 'rgba(0, 229, 255, 0.045)';
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    for (let y = 0; y < 256; y += 10) {
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(512, y);
    }
    bgCtx.stroke();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    this.blinkTimer = 0;
    this.nextBlinkInterval = 3.2 + Math.random() * 2.2;
    this.isBlinking = false;
    this.animTime = 0;
    this.redrawAccumulator = 0;
    this.lastExpression = '';
    this.lastGlowColor = '';
    this.disposed = false;
  }

  drawFace(expression = 'happy', glowColor = '#00e5ff', isBlinking = false) {
    if (this.disposed) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.lastExpression = expression;
    this.lastGlowColor = glowColor;

    // Fast pre-cached background blit
    ctx.drawImage(this.bgCanvas, 0, 0);

    ctx.save();
    ctx.fillStyle = glowColor;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const eyeLeftX = w * 0.32;
    const eyeRightX = w * 0.68;
    const eyeY = h * 0.52;

    if (isBlinking) {
      ctx.beginPath();
      ctx.arc(eyeLeftX, eyeY + 8, 46, Math.PI * 0.15, Math.PI * 0.85, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(eyeRightX, eyeY + 8, 46, Math.PI * 0.15, Math.PI * 0.85, false);
      ctx.stroke();
      ctx.restore();
      this.texture.needsUpdate = true;
      return;
    }

    switch (expression) {
      case 'happy': {
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY + 20, 52, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY + 20, 52, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();

        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(w * 0.5 - 12, eyeY + 34, 12, 0.1, Math.PI - 0.1);
        ctx.arc(w * 0.5 + 12, eyeY + 34, 12, 0.1, Math.PI - 0.1);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 90, 160, 0.78)';
        ctx.beginPath();
        ctx.ellipse(eyeLeftX - 28, eyeY + 52, 24, 13, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeRightX + 28, eyeY + 52, 24, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'curious': {
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY - 6, 48, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX + 16, eyeY - 20, 14, 0, Math.PI * 2);
        ctx.arc(eyeLeftX - 12, eyeY + 14, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY + 12, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeRightX + 12, eyeY, 10, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'loving': {
        const pulse = 1.0 + Math.sin(this.animTime * 7.5) * 0.12;
        this.drawHeart(ctx, eyeLeftX, eyeY - 6, 52 * pulse);
        this.drawHeart(ctx, eyeRightX, eyeY - 6, 52 * pulse);

        ctx.fillStyle = 'rgba(255, 105, 180, 0.65)';
        ctx.beginPath();
        ctx.ellipse(eyeLeftX - 30, eyeY + 52, 22, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeRightX + 30, eyeY + 52, 22, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'excited': {
        const rotOffset = Math.sin(this.animTime * 6.0) * 0.18;
        this.drawStar(ctx, eyeLeftX, eyeY, 5, 52, 22, rotOffset);
        this.drawStar(ctx, eyeRightX, eyeY, 5, 52, 22, -rotOffset);
        break;
      }

      case 'sleepy': {
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY - 8, 45, Math.PI * 0.2, Math.PI * 0.8, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY - 8, 45, Math.PI * 0.2, Math.PI * 0.8, false);
        ctx.stroke();

        const floatY = Math.sin(this.animTime * 3.0) * 8;
        ctx.font = 'bold 34px monospace';
        ctx.fillText('z', eyeRightX + 55, eyeY - 20 + floatY);
        ctx.font = 'bold 46px monospace';
        ctx.fillText('Z', eyeRightX + 82, eyeY - 50 - floatY * 0.7);
        break;
      }

      case 'alert': {
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 44, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 16, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(eyeLeftX - 42, eyeY - 52);
        ctx.lineTo(eyeLeftX + 35, eyeY - 32);
        ctx.moveTo(eyeRightX + 42, eyeY - 52);
        ctx.lineTo(eyeRightX - 35, eyeY - 32);
        ctx.stroke();
        break;
      }

      case 'mischievous': {
        ctx.beginPath();
        ctx.moveTo(eyeLeftX - 42, eyeY + 12);
        ctx.lineTo(eyeLeftX + 42, eyeY - 24);
        ctx.lineTo(eyeLeftX + 30, eyeY + 28);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY + 12, 45, Math.PI * 1.2, Math.PI * 1.8, false);
        ctx.stroke();

        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(w * 0.52, eyeY + 42, 22, 0.1, Math.PI * 0.85);
        ctx.stroke();
        break;
      }

      case 'proud': {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(eyeLeftX - 55, eyeY - 28, 100, 56);
        ctx.fillRect(eyeRightX - 45, eyeY - 28, 100, 56);
        ctx.fillRect(eyeLeftX + 45, eyeY - 14, eyeRightX - eyeLeftX - 90, 16);

        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 6;
        ctx.strokeRect(eyeLeftX - 55, eyeY - 28, 100, 56);
        ctx.strokeRect(eyeRightX - 45, eyeY - 28, 100, 56);

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(eyeLeftX - 35, eyeY + 20);
        ctx.lineTo(eyeLeftX - 10, eyeY - 20);
        ctx.lineTo(eyeLeftX, eyeY - 20);
        ctx.lineTo(eyeLeftX - 25, eyeY + 20);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(eyeRightX - 25, eyeY + 20);
        ctx.lineTo(eyeRightX, eyeY - 20);
        ctx.lineTo(eyeRightX + 10, eyeY - 20);
        ctx.lineTo(eyeRightX - 15, eyeY + 20);
        ctx.fill();
        break;
      }

      case 'scared': {
        const jitterX = Math.sin(this.animTime * 35) * 4.5;
        const jitterY = Math.cos(this.animTime * 42) * 3.0;
        ctx.beginPath();
        ctx.arc(eyeLeftX + jitterX, eyeY + jitterY, 50, 0, Math.PI * 2);
        ctx.arc(eyeRightX + jitterX, eyeY + jitterY, 50, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX + jitterX, eyeY + jitterY, 9, 0, Math.PI * 2);
        ctx.arc(eyeRightX + jitterX, eyeY + jitterY, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(w * 0.86, eyeY - 36, 14, 0, Math.PI);
        ctx.lineTo(w * 0.86, eyeY - 64);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'hungry': {
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY - 6, 46, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY - 6, 46, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX + 14, eyeY - 18, 16, 0, Math.PI * 2);
        ctx.arc(eyeRightX - 10, eyeY - 18, 16, 0, Math.PI * 2);
        ctx.fill();

        const lickOffset = Math.sin(this.animTime * 6.0) * 6;
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(w * 0.5 + lickOffset, eyeY + 44, 22, 0, Math.PI);
        ctx.fill();
        break;
      }

      case 'party': {
        const bars = 8;
        const totalW = 280;
        const startX = (w - totalW) / 2;
        const barWidth = 24;
        const gap = 12;

        for (let i = 0; i < bars; i++) {
          const barH = 22 + Math.abs(Math.sin(this.animTime * 10 + i * 0.85)) * 92;
          const bx = startX + i * (barWidth + gap);
          const by = eyeY + 46 - barH;
          const hue = (this.animTime * 140 + i * 42) % 360;
          ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
          ctx.fillRect(bx, by, barWidth, barH);
        }
        break;
      }

      case 'confused': {
        ctx.save();
        ctx.translate(eyeLeftX, eyeY);
        ctx.rotate(-0.25);
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(eyeRightX, eyeY - 12);
        ctx.rotate(0.35);
        ctx.beginPath();
        ctx.arc(0, 0, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const bobY = Math.sin(this.animTime * 5.0) * 6;
        ctx.font = 'bold 64px monospace';
        ctx.fillStyle = '#c084fc';
        ctx.fillText('?', w * 0.5 - 16, eyeY - 32 + bobY);
        break;
      }

      default: {
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 42, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 42, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  drawHeart(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y - size * 0.35);
    ctx.beginPath();
    const d = size;
    ctx.moveTo(0, d / 4);
    ctx.bezierCurveTo(d / 2, -d / 2, d, d / 4, 0, d);
    ctx.bezierCurveTo(-d, d / 4, -d / 2, -d / 2, 0, d / 4);
    ctx.fill();
    ctx.restore();
  }

  drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius, rotationOffset = 0) {
    let rot = (Math.PI / 2) * 3 + rotationOffset;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  update(delta, expression = 'happy', glowColor = '#00e5ff') {
    if (this.disposed) return;
    this.animTime += delta;
    this.blinkTimer += delta;
    this.redrawAccumulator += delta;

    const stateChanged = (expression !== this.lastExpression || glowColor !== this.lastGlowColor);

    if (!this.isBlinking && this.blinkTimer > this.nextBlinkInterval) {
      this.isBlinking = true;
      this.blinkTimer = 0;
      this.nextBlinkInterval = 2.8 + Math.random() * 2.6;
      this.drawFace(expression, glowColor, true);
      return;
    }

    if (this.isBlinking && this.blinkTimer > 0.14) {
      this.isBlinking = false;
      this.blinkTimer = 0;
      this.drawFace(expression, glowColor, false);
      return;
    }

    if (!this.isBlinking) {
      // Throttled to ~15 FPS on animated expressions for low mobile GPU upload cost
      if (stateChanged || (ANIMATED_EXPRESSIONS.has(expression) && this.redrawAccumulator >= 0.066)) {
        this.redrawAccumulator = 0;
        this.drawFace(expression, glowColor, false);
      }
    }
  }

  dispose() {
    this.disposed = true;
    if (this.texture) {
      this.texture.dispose();
      this.texture = null;
    }
    this.canvas = null;
    this.bgCanvas = null;
    this.ctx = null;
  }
}

// 4x4 Atlas cell mapping
const EMOTION_CELL_MAP = {
  HAPPY: 0,
  LOVING: 1,
  CURIOUS: 2,
  EXCITED: 3,
  SLEEPY: 4,
  ALERT: 5,
  MISCHIEVOUS: 6,
  PROUD: 7,
  SCARED: 8,
  HUNGRY: 9,
  PARTY: 10,
  CONFUSED: 11
};
const CELL_DUST = 12;
const CELL_SPLASH = 13;
const CELL_SPARK = 14;

const POOL_SIZE = 96;

export class EmotionParticleSystem {
  constructor(scene, assetCache = null) {
    this.scene = scene;
    this.assetCache = assetCache;
    this.activeCount = 0;
    this.disposed = false;

    // Pre-allocated zero-GC particle structs
    this.pool = new Array(POOL_SIZE);
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool[i] = {
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        gravity: 0.85,
        drag: 1.5,
        baseScale: 0.6,
        scaleGrow: 0.35,
        swirlPhase: 0,
        swirlAmp: 0.35,
        age: 0,
        lifetime: 1.0,
        cell: 0,
        r: 1, g: 1, b: 1
      };
    }

    this.atlasTexture = this._buildAtlasTexture();
    this.geometry = new THREE.PlaneGeometry(1, 1);

    // Per-instance attributes (atlas UV rect & RGBA tint)
    this.atlasArray = new Float32Array(POOL_SIZE * 4);
    this.tintArray = new Float32Array(POOL_SIZE * 4);

    this.atlasAttr = new THREE.InstancedBufferAttribute(this.atlasArray, 4);
    this.atlasAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aAtlas', this.atlasAttr);

    this.tintAttr = new THREE.InstancedBufferAttribute(this.tintArray, 4);
    this.tintAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aTint', this.tintAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.atlasTexture }
      },
      vertexShader: `
        attribute vec4 aAtlas;
        attribute vec4 aTint;
        varying vec2 vUv;
        varying vec4 vTint;
        void main() {
          vUv = aAtlas.xy + uv * aAtlas.zw;
          vTint = aTint;
          vec4 worldCenter = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float scale = instanceMatrix[0][0];
          vec4 mvCenter = viewMatrix * worldCenter;
          mvCenter.xy += position.xy * scale;
          gl_Position = projectionMatrix * mvCenter;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec4 vTint;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          float alpha = tex.a * vTint.a;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(tex.rgb * vTint.rgb, alpha);
        }
      `,
      transparent: true,
      depthWrite: false
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, POOL_SIZE);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'PooledParticleSystem';

    // Initialize identity matrix slots
    const mArr = this.mesh.instanceMatrix.array;
    for (let i = 0; i < POOL_SIZE; i++) {
      const o = i * 16;
      mArr[o] = 1; mArr[o + 5] = 1; mArr[o + 10] = 1; mArr[o + 15] = 1;
    }

    if (this.scene) {
      this.scene.add(this.mesh);
    }
  }

  _buildAtlasTexture() {
    const size = 512;
    const cell = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const cells = [
      { sym: '✨', glow: '#22ff88' }, // 0 HAPPY
      { sym: '💖', glow: '#ff3399' }, // 1 LOVING
      { sym: '🔍', glow: '#00e5ff' }, // 2 CURIOUS
      { sym: '⭐', glow: '#ff9100' }, // 3 EXCITED
      { sym: '💤', glow: '#7986cb' }, // 4 SLEEPY
      { sym: '⚡', glow: '#ff3d00' }, // 5 ALERT
      { sym: '😈', glow: '#a855f7' }, // 6 MISCHIEVOUS
      { sym: '👑', glow: '#fbbf24' }, // 7 PROUD
      { sym: '💦', glow: '#38bdf8' }, // 8 SCARED
      { sym: '🍪', glow: '#f97316' }, // 9 HUNGRY
      { sym: '🪩', glow: '#ec4899' }, // 10 PARTY
      { sym: '❓', glow: '#818cf8' }  // 11 CONFUSED
    ];

    for (let i = 0; i < cells.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const cx = col * cell + cell * 0.5;
      const cy = row * cell + cell * 0.5;
      const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 56);
      grad.addColorStop(0, cells[i].glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 56, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '62px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cells[i].sym, cx, cy + 2);
    }

    // Cell 12: Dust puff (col 0, row 3)
    {
      const cx = 0 * cell + 64;
      const cy = 3 * cell + 64;
      const grad = ctx.createRadialGradient(cx, cy, 6, cx, cy, 54);
      grad.addColorStop(0, 'rgba(241, 245, 249, 0.95)');
      grad.addColorStop(0.55, 'rgba(203, 213, 225, 0.55)');
      grad.addColorStop(1, 'rgba(203, 213, 225, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 54, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cell 13: Water splash droplet (col 1, row 3)
    {
      const cx = 1 * cell + 64;
      const cy = 3 * cell + 64;
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 48);
      grad.addColorStop(0, 'rgba(224, 242, 254, 1.0)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.8)');
      grad.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 48, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cell 14: Neon spark / turbo trail orb (col 2, row 3)
    {
      const cx = 2 * cell + 64;
      const cy = 3 * cell + 64;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 52);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.75)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 52, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  _allocSlot() {
    if (this.activeCount < POOL_SIZE) {
      return this.pool[this.activeCount++];
    }
    // Overwrite oldest particle (slot 0) cleanly if pool saturated
    return this.pool[0];
  }

  spawnBurst(position, emotionType = 'HAPPY') {
    if (this.disposed || !position) return;
    const cell = EMOTION_CELL_MAP[emotionType] ?? 0;
    const count = 14;

    for (let i = 0; i < count; i++) {
      const p = this._allocSlot();
      const offsetRadius = 0.25 + Math.random() * 0.55;
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speedOut = 1.1 + Math.random() * 1.4;

      p.x = position.x + Math.cos(angle) * offsetRadius;
      p.y = position.y + 1.3 + Math.random() * 0.6;
      p.z = position.z + Math.sin(angle) * offsetRadius;
      p.vx = Math.cos(angle) * speedOut;
      p.vy = 1.6 + Math.random() * 2.0;
      p.vz = Math.sin(angle) * speedOut;
      p.gravity = 0.85;
      p.drag = 1.4;
      p.baseScale = 0.65 + Math.random() * 0.25;
      p.scaleGrow = 0.35;
      p.swirlPhase = Math.random() * Math.PI * 2;
      p.swirlAmp = 0.35;
      p.age = 0;
      p.lifetime = 1.5 + Math.random() * 0.55;
      p.cell = cell;
      p.r = 1; p.g = 1; p.b = 1;
    }
  }

  spawnDust(position, intensity = 1.0) {
    if (this.disposed || !position) return;
    const count = intensity > 1.2 ? 5 : 2;
    for (let i = 0; i < count; i++) {
      const p = this._allocSlot();
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.45 + Math.random() * 0.85) * intensity;
      p.x = position.x + (Math.random() - 0.5) * 0.45;
      p.y = position.y + 0.14;
      p.z = position.z + (Math.random() - 0.5) * 0.45;
      p.vx = Math.cos(angle) * speed;
      p.vy = 0.45 + Math.random() * 0.55 * intensity;
      p.vz = Math.sin(angle) * speed;
      p.gravity = -0.35; // gently floats up
      p.drag = 3.2;
      p.baseScale = 0.38 + Math.random() * 0.22 * intensity;
      p.scaleGrow = 0.7;
      p.swirlPhase = 0;
      p.swirlAmp = 0;
      p.age = 0;
      p.lifetime = 0.42 + Math.random() * 0.24;
      p.cell = CELL_DUST;
      p.r = 0.92; p.g = 0.94; p.b = 0.96;
    }
  }

  spawnSplash(position, count = 8) {
    if (this.disposed || !position) return;
    const n = Math.min(count, 12);
    for (let i = 0; i < n; i++) {
      const p = this._allocSlot();
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.4 + Math.random() * 1.8;
      p.x = position.x + Math.cos(angle) * 0.35;
      p.y = position.y + 0.35;
      p.z = position.z + Math.sin(angle) * 0.35;
      p.vx = Math.cos(angle) * speed;
      p.vy = 2.6 + Math.random() * 1.9;
      p.vz = Math.sin(angle) * speed;
      p.gravity = 9.5;
      p.drag = 0.8;
      p.baseScale = 0.26 + Math.random() * 0.18;
      p.scaleGrow = 0.15;
      p.swirlPhase = 0;
      p.swirlAmp = 0;
      p.age = 0;
      p.lifetime = 0.55 + Math.random() * 0.25;
      p.cell = CELL_SPLASH;
      p.r = 0.85; p.g = 0.96; p.b = 1.0;
    }
  }

  emitTrail(position, velocity = null, colorHex = 0xffea00) {
    if (this.disposed || !position) return;
    const p = this._allocSlot();
    const r = ((colorHex >> 16) & 255) / 255;
    const g = ((colorHex >> 8) & 255) / 255;
    const b = (colorHex & 255) / 255;

    p.x = position.x + (Math.random() - 0.5) * 0.22;
    p.y = position.y + 0.72 + (Math.random() - 0.5) * 0.14;
    p.z = position.z + (Math.random() - 0.5) * 0.22;
    p.vx = velocity ? -velocity.x * 0.2 + (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.4;
    p.vy = 0.25 + Math.random() * 0.45;
    p.vz = velocity ? -velocity.z * 0.2 + (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.4;
    p.gravity = -0.2;
    p.drag = 3.0;
    p.baseScale = 0.34 + Math.random() * 0.14;
    p.scaleGrow = -0.35;
    p.swirlPhase = 0;
    p.swirlAmp = 0;
    p.age = 0;
    p.lifetime = 0.28 + Math.random() * 0.14;
    p.cell = CELL_SPARK;
    p.r = r; p.g = g; p.b = b;
  }

  update(dt) {
    if (this.disposed) return;
    if (this.activeCount === 0) {
      if (this.mesh.visible) {
        this.mesh.visible = false;
        this.mesh.count = 0;
      }
      return;
    }

    const mArr = this.mesh.instanceMatrix.array;
    const aArr = this.atlasArray;
    const tArr = this.tintArray;

    let i = 0;
    while (i < this.activeCount) {
      const p = this.pool[i];
      p.age += dt;
      if (p.age >= p.lifetime) {
        // Swap-remove with last active slot (O(1), zero GC)
        const lastIdx = this.activeCount - 1;
        if (i !== lastIdx) {
          const temp = this.pool[i];
          this.pool[i] = this.pool[lastIdx];
          this.pool[lastIdx] = temp;
        }
        this.activeCount--;
        continue;
      }

      const dampFactor = Math.exp(-p.drag * dt);
      p.vx *= dampFactor;
      p.vz *= dampFactor;
      p.vy -= p.gravity * dt;

      if (p.swirlAmp > 0) {
        p.swirlPhase += dt * 4.0;
        p.x += Math.sin(p.swirlPhase) * dt * p.swirlAmp;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const progress = p.age / p.lifetime;
      const alpha = Math.max(0, 1.0 - Math.pow(progress, 1.5));
      const scale = Math.max(0.02, p.baseScale * (1.0 + Math.sin(progress * Math.PI) * p.scaleGrow));

      // Write scale & position directly into instanceMatrix buffer
      const mOff = i * 16;
      mArr[mOff] = scale;
      mArr[mOff + 5] = scale;
      mArr[mOff + 10] = scale;
      mArr[mOff + 12] = p.x;
      mArr[mOff + 13] = p.y;
      mArr[mOff + 14] = p.z;

      // Atlas UV rect (4x4 grid, CanvasTexture flipY = true)
      const col = p.cell & 3;
      const row = p.cell >> 2;
      const aOff = i * 4;
      aArr[aOff] = col * 0.25;
      aArr[aOff + 1] = 1.0 - (row + 1) * 0.25;
      aArr[aOff + 2] = 0.25;
      aArr[aOff + 3] = 0.25;

      tArr[aOff] = p.r;
      tArr[aOff + 1] = p.g;
      tArr[aOff + 2] = p.b;
      tArr[aOff + 3] = alpha;

      i++;
    }

    this.mesh.count = this.activeCount;
    this.mesh.visible = this.activeCount > 0;
    if (this.activeCount > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.atlasAttr.needsUpdate = true;
      this.tintAttr.needsUpdate = true;
    }
  }

  dispose() {
    this.disposed = true;
    if (this.scene && this.mesh) {
      this.scene.remove(this.mesh);
    }
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.atlasTexture) this.atlasTexture.dispose();
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.atlasTexture = null;
  }
}
