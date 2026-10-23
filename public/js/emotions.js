// Emotion System with High-Def LED Visor Textures, Neon Themes, and Particle Outbursts
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

export class FaceTextureGenerator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.needsUpdate = true;
    this.blinkTimer = 0;
    this.isBlinking = false;
    this.animTime = 0;
  }

  drawFace(expression = 'happy', glowColor = '#00e5ff', isBlinking = false) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Dark sleek cyber OLED background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(0, 0, w, h);

    // Subtle hexagonal scanline matrix
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 12) {
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
      ctx.moveTo(eyeLeftX - 45, eyeY);
      ctx.lineTo(eyeLeftX + 45, eyeY);
      ctx.moveTo(eyeRightX - 45, eyeY);
      ctx.lineTo(eyeRightX + 45, eyeY);
      ctx.stroke();
      ctx.restore();
      this.texture.needsUpdate = true;
      return;
    }

    switch (expression) {
      case 'happy': // Curved joyful anime eyes ^_^ with glowing blush
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY + 20, 52, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY + 20, 52, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();

        // Cute animated blushing cheeks
        ctx.fillStyle = 'rgba(255, 90, 160, 0.75)';
        ctx.beginPath();
        ctx.ellipse(eyeLeftX - 25, eyeY + 54, 24, 14, 0, 0, Math.PI * 2);
        ctx.ellipse(eyeRightX + 25, eyeY + 54, 24, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'curious': // Big expressive round eyes (one tilted with pupil glints)
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY - 8, 48, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX + 16, eyeY - 22, 14, 0, Math.PI * 2);
        ctx.arc(eyeLeftX - 12, eyeY + 14, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY + 14, 38, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeRightX + 12, eyeY + 2, 10, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'loving': // Pulsing glowing hearts <3 <3
        this.drawHeart(ctx, eyeLeftX, eyeY - 10, 50);
        this.drawHeart(ctx, eyeRightX, eyeY - 10, 50);
        break;

      case 'excited': // Glowing multi-pointed anime stars *_*
        this.drawStar(ctx, eyeLeftX, eyeY, 5, 50, 22);
        this.drawStar(ctx, eyeRightX, eyeY, 5, 50, 22);
        break;

      case 'sleepy': // Relaxed curved slits -_- with animated 'zZz'
        ctx.beginPath();
        ctx.moveTo(eyeLeftX - 45, eyeY);
        ctx.lineTo(eyeLeftX + 45, eyeY);
        ctx.moveTo(eyeRightX - 45, eyeY);
        ctx.lineTo(eyeRightX + 45, eyeY);
        ctx.stroke();

        ctx.font = 'bold 36px monospace';
        ctx.fillText('z', eyeRightX + 60, eyeY - 25);
        ctx.font = 'bold 48px monospace';
        ctx.fillText('Z', eyeRightX + 85, eyeY - 55);
        break;

      case 'alert': // Focused sharp hexagonal eyes with warning pupils
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 44, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 44, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 16, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 16, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'mischievous': // Sneaky angled cat eyes >:) with winking left eye
        ctx.beginPath();
        ctx.moveTo(eyeLeftX - 42, eyeY + 12);
        ctx.lineTo(eyeLeftX + 42, eyeY - 24);
        ctx.lineTo(eyeLeftX + 30, eyeY + 28);
        ctx.closePath();
        ctx.fill();

        // Right eye sly wink line
        ctx.beginPath();
        ctx.arc(eyeRightX, eyeY + 12, 45, Math.PI * 1.2, Math.PI * 1.8, false);
        ctx.stroke();

        // Little smirk in the middle bottom
        ctx.beginPath();
        ctx.arc(w * 0.52, eyeY + 45, 20, 0, Math.PI * 0.9);
        ctx.stroke();
        break;

      case 'proud': // Pixel cyber sunglasses 😎 with shiny glint reflection
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(eyeLeftX - 55, eyeY - 28, 100, 56);
        ctx.fillRect(eyeRightX - 45, eyeY - 28, 100, 56);
        // Bridge
        ctx.fillRect(eyeLeftX + 45, eyeY - 14, eyeRightX - eyeLeftX - 90, 16);

        // Neon outline
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 6;
        ctx.strokeRect(eyeLeftX - 55, eyeY - 28, 100, 56);
        ctx.strokeRect(eyeRightX - 45, eyeY - 28, 100, 56);

        // Reflection glint in glass
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

      case 'scared': // Trembling wide pupils with shock zigzag lines 😱
        const jitterX = Math.sin(this.animTime * 35) * 4;
        ctx.beginPath();
        ctx.arc(eyeLeftX + jitterX, eyeY, 52, 0, Math.PI * 2);
        ctx.arc(eyeRightX + jitterX, eyeY, 52, 0, Math.PI * 2);
        ctx.stroke();

        // Tiny pinprick pupils
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX + jitterX, eyeY, 8, 0, Math.PI * 2);
        ctx.arc(eyeRightX + jitterX, eyeY, 8, 0, Math.PI * 2);
        ctx.fill();

        // Anime blue sweat drop
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(w * 0.85, eyeY - 40, 14, 0, Math.PI);
        ctx.lineTo(w * 0.85, eyeY - 65);
        ctx.closePath();
        ctx.fill();
        break;

      case 'hungry': // Sparkly round eyes with licking mouth 😋
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY - 6, 46, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY - 6, 46, 0, Math.PI * 2);
        ctx.fill();

        // Big glints
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(eyeLeftX + 14, eyeY - 18, 16, 0, Math.PI * 2);
        ctx.arc(eyeRightX - 10, eyeY - 18, 16, 0, Math.PI * 2);
        ctx.fill();

        // Tongue sticking out
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.arc(w * 0.5, eyeY + 44, 22, 0, Math.PI);
        ctx.fill();
        break;

      case 'party': // Disco Equalizer soundwave visualizer 🪩
        const bars = 8;
        const totalW = 280;
        const startX = (w - totalW) / 2;
        const barWidth = 24;
        const gap = 12;

        for (let i = 0; i < bars; i++) {
          const barH = 20 + Math.abs(Math.sin(this.animTime * 10 + i * 0.85)) * 90;
          const bx = startX + i * (barWidth + gap);
          const by = eyeY + 45 - barH;

          // Rainbow gradient per bar
          const hue = (this.animTime * 120 + i * 45) % 360;
          ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
          ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
          ctx.fillRect(bx, by, barWidth, barH);
        }
        break;

      case 'confused': // Cocked eyes with spinning holographic '?' 🤔
        ctx.save();
        ctx.translate(eyeLeftX, eyeY);
        ctx.rotate(-0.25);
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(eyeRightX, eyeY - 14);
        ctx.rotate(0.35);
        ctx.beginPath();
        ctx.arc(0, 0, 32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Glowing question mark
        ctx.font = 'bold 64px monospace';
        ctx.fillStyle = '#c084fc';
        ctx.fillText('?', w * 0.5 - 16, eyeY - 35);
        break;

      default:
        ctx.beginPath();
        ctx.arc(eyeLeftX, eyeY, 42, 0, Math.PI * 2);
        ctx.arc(eyeRightX, eyeY, 42, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  drawHeart(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    const d = size;
    ctx.moveTo(0, d / 4);
    ctx.bezierCurveTo(d / 2, -d / 2, d, d / 4, 0, d);
    ctx.bezierCurveTo(-d, d / 4, -d / 2, -d / 2, 0, d / 4);
    ctx.fill();
    ctx.restore();
  }

  drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
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
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }

  update(delta, expression, glowColor) {
    this.animTime += delta;
    this.blinkTimer += delta;

    if (!this.isBlinking && this.blinkTimer > 3.2 + Math.random() * 2) {
      this.isBlinking = true;
      this.blinkTimer = 0;
      this.drawFace(expression, glowColor, true);
    } else if (this.isBlinking && this.blinkTimer > 0.16) {
      this.isBlinking = false;
      this.blinkTimer = 0;
      this.drawFace(expression, glowColor, false);
    }
  }
}

export class EmotionParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
  }

  spawnBurst(position, emotionType) {
    const count = 16;
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 64;
    textureCanvas.height = 64;
    const ctx = textureCanvas.getContext('2d');

    let symbol = '✨';
    if (emotionType === 'LOVING') symbol = '💖';
    else if (emotionType === 'CURIOUS') symbol = '🔍';
    else if (emotionType === 'EXCITED') symbol = '⭐';
    else if (emotionType === 'SLEEPY') symbol = '💤';
    else if (emotionType === 'ALERT') symbol = '⚡';
    else if (emotionType === 'MISCHIEVOUS') symbol = '😈';
    else if (emotionType === 'PROUD') symbol = '👑';
    else if (emotionType === 'SCARED') symbol = '💦';
    else if (emotionType === 'HUNGRY') symbol = '🍪';
    else if (emotionType === 'PARTY') symbol = '🪩';
    else if (emotionType === 'CONFUSED') symbol = '❓';

    ctx.font = '44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 32, 32);

    const texture = new THREE.CanvasTexture(textureCanvas);

    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95
      });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.7, 0.7, 0.7);

      const offsetRadius = 0.3 + Math.random() * 0.5;
      const angle = Math.random() * Math.PI * 2;
      sprite.position.set(
        position.x + Math.cos(angle) * offsetRadius,
        position.y + 1.4 + Math.random() * 0.6,
        position.z + Math.sin(angle) * offsetRadius
      );

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        1.4 + Math.random() * 1.8,
        (Math.random() - 0.5) * 2.2
      );

      this.scene.add(sprite);
      this.particles.push({
        sprite,
        velocity,
        lifetime: 1.8 + Math.random() * 0.6,
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
        p.sprite.position.addScaledVector(p.velocity, delta);
        p.velocity.y -= delta * 0.7;
        p.velocity.x *= 0.98;
        p.velocity.z *= 0.98;
        const progress = p.age / p.lifetime;
        p.sprite.material.opacity = 1 - progress;
        const s = 0.7 * (1 + progress * 0.5);
        p.sprite.scale.set(s, s, s);
      }
    }
  }
}
