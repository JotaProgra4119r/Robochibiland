// Emotion System with Animated High-Def OLED Visor Textures, Cached GPU Particle Bursts & Neon Themes
import * as THREE from 'three';
import { roboAudio } from './audio.js';

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
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.needsUpdate = true;

    this.blinkTimer = 0;
    this.nextBlinkInterval = 3.2 + Math.random() * 2.2;
    this.isBlinking = false;
    this.animTime = 0;
    this.redrawAccumulator = 0;
    this.lastExpression = '';
    this.lastGlowColor = '';
  }

  drawFace(expression = 'happy', glowColor = '#00e5ff', isBlinking = false) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.lastExpression = expression;
    this.lastGlowColor = glowColor;

    // Dark sleek cyber OLED background with subtle vignette
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 20, w * 0.5, h * 0.5, w * 0.6);
    bgGrad.addColorStop(0, '#0a1120');
    bgGrad.addColorStop(1, '#04070d');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle scanline matrix
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.045)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 24;
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
        // Curved joyful anime eyes ^_^ with glowing blush and cute "w" mouth
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY + 20, 52, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY + 20, 52, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();

        // Subtle cute cyber smile in center
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(w * 0.5 - 12, eyeY + 34, 12, 0.1, Math.PI - 0.1);
        ctx.arc(w * 0.5 + 12, eyeY + 34, 12, 0.1, Math.PI - 0.1);
        ctx.stroke();

        // Blushing cheeks
        ctx.fillStyle = 'rgba(255, 90, 160, 0.78)';
        ctx.beginPath();
        ctx.ellipse(eyeLeftX - 28, eyeY + 52, 24, 13, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeRightX + 28, eyeY + 52, 24, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }

      case 'curious': {
        // Big expressive round eyes (one tilted with pupil glints)
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
        // Pulsing glowing hearts <3 <3
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
        // Twinkling multi-pointed anime stars *_*
        const rotOffset = Math.sin(this.animTime * 6.0) * 0.18;
        this.drawStar(ctx, eyeLeftX, eyeY, 5, 52, 22, rotOffset);
        this.drawStar(ctx, eyeRightX, eyeY, 5, 52, 22, -rotOffset);
        break;
      }

      case 'sleepy': {
        // Relaxed curved slits -_- with floating 'zZz'
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
        // Focused sharp eyes with warning pupils
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 44, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 16, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 16, 0, Math.PI * 2);
        ctx.fill();

        // Angry/Alert brow lines
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
        // Sneaky angled cat eyes >:) with winking right eye
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
        // Pixel cyber sunglasses with shiny glint reflection
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
        // Trembling wide pupils with sweat drop
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
        // Sparkly round eyes with animated licking tongue
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
        // Real-time Disco Equalizer soundwave visualizer
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
          ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
          ctx.fillRect(bx, by, barWidth, barH);
        }
        break;
      }

      case 'confused': {
        // Cocked eyes with bobbing holographic '?'
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
    // Center the heart vertically around (x, y)
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
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
  }

  // FIXED: Smoothly updates animated expressions (party, scared, loving, etc.) at ~24 FPS without freezing
  update(delta, expression = 'happy', glowColor = '#00e5ff') {
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

    if (this.isBlinking && this.blinkTimer > 0.15) {
      this.isBlinking = false;
      this.blinkTimer = 0;
      this.drawFace(expression, glowColor, false);
      return;
    }

    if (!this.isBlinking) {
      if (stateChanged || (ANIMATED_EXPRESSIONS.has(expression) && this.redrawAccumulator >= 0.042)) {
        this.redrawAccumulator = 0;
        this.drawFace(expression, glowColor, false);
      }
    }
  }
}

export class EmotionParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    // Cached CanvasTextures per emotionType to prevent GPU memory leaks
    this.textureCache = new Map();
  }

  getOrCreateTexture(emotionType) {
    const key = emotionType || 'HAPPY';
    if (this.textureCache.has(key)) {
      return this.textureCache.get(key);
    }

    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 96;
    textureCanvas.height = 96;
    const ctx = textureCanvas.getContext('2d');

    let symbol = '✨';
    let glow = '#22ff88';
    if (key === 'LOVING') { symbol = '💖'; glow = '#ff3399'; }
    else if (key === 'CURIOUS') { symbol = '🔍'; glow = '#00e5ff'; }
    else if (key === 'EXCITED') { symbol = '⭐'; glow = '#ff9100'; }
    else if (key === 'SLEEPY') { symbol = '💤'; glow = '#7986cb'; }
    else if (key === 'ALERT') { symbol = '⚡'; glow = '#ff3d00'; }
    else if (key === 'MISCHIEVOUS') { symbol = '😈'; glow = '#a855f7'; }
    else if (key === 'PROUD') { symbol = '👑'; glow = '#fbbf24'; }
    else if (key === 'SCARED') { symbol = '💦'; glow = '#38bdf8'; }
    else if (key === 'HUNGRY') { symbol = '🍪'; glow = '#f97316'; }
    else if (key === 'PARTY') { symbol = '🪩'; glow = '#ec4899'; }
    else if (key === 'CONFUSED') { symbol = '❓'; glow = '#818cf8'; }

    // Soft neon radial aura behind symbol
    const grad = ctx.createRadialGradient(48, 48, 6, 48, 48, 44);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(48, 48, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '50px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 48, 50);

    const texture = new THREE.CanvasTexture(textureCanvas);
    this.textureCache.set(key, texture);
    return texture;
  }

  spawnBurst(position, emotionType = 'HAPPY') {
    if (!position) return;
    const count = 16;
    const texture = this.getOrCreateTexture(emotionType);

    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      const baseScale = 0.65 + Math.random() * 0.25;
      sprite.scale.set(baseScale, baseScale, baseScale);

      const offsetRadius = 0.25 + Math.random() * 0.55;
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      sprite.position.set(
        position.x + Math.cos(angle) * offsetRadius,
        position.y + 1.3 + Math.random() * 0.6,
        position.z + Math.sin(angle) * offsetRadius
      );

      const speedOut = 1.1 + Math.random() * 1.4;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speedOut,
        1.6 + Math.random() * 2.0,
        Math.sin(angle) * speedOut
      );

      this.scene.add(sprite);
      this.particles.push({
        sprite,
        velocity,
        baseScale,
        swirlPhase: Math.random() * Math.PI * 2,
        lifetime: 1.7 + Math.random() * 0.6,
        age: 0
      });
    }
  }

  update(delta) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += delta;
      if (p.age >= p.lifetime) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
      } else {
        p.swirlPhase += delta * 4.0;
        p.sprite.position.addScaledVector(p.velocity, delta);
        p.sprite.position.x += Math.sin(p.swirlPhase) * delta * 0.35;
        p.velocity.y -= delta * 0.85;
        p.velocity.x *= 0.98;
        p.velocity.z *= 0.98;

        const progress = p.age / p.lifetime;
        p.sprite.material.opacity = Math.max(0, 1 - Math.pow(progress, 1.5));
        const s = p.baseScale * (1 + Math.sin(progress * Math.PI) * 0.35);
        p.sprite.scale.set(s, s, s);
      }
    }
  }
}