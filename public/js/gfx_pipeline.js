// Mobile-Optimized Graphics Pipeline: ACESFilmic, PMREM+RoomEnvironment IBL, SkyDome Shader, FogExp2, Texel-Snapped Shadows & Single-Renderer PIP
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { assetCache as defaultAssetCache } from './core/AssetCache.js';
import { TMP } from './core/Scratch.js';

const SKY_VERTEX_SHADER = /* glsl */ `
precision mediump float;
varying vec3 vWorldDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldDir = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;
varying vec3 vWorldDir;

uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
uniform vec3 uBottomColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
uniform float uNightFactor;

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = dir.y;

  vec3 sky = h >= 0.0
    ? mix(uHorizonColor, uTopColor, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(uHorizonColor, uBottomColor, clamp(-h * 3.0, 0.0, 1.0));

  // Soft solar/lunar halo + crisp disc
  float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
  float halo = pow(sunDot, mix(14.0, 28.0, uNightFactor)) * mix(0.45, 0.25, uNightFactor);
  float disc = smoothstep(uSunSize - 0.0018, uSunSize, sunDot);
  sky += uSunColor * (halo + disc * 1.15);

  // Subtle cyber-aurora horizon shimmer at night
  float horizonBand = exp(-abs(h) * 9.0) * uNightFactor;
  sky += vec3(0.02, 0.16, 0.24) * horizonBand;

  gl_FragColor = vec4(sky, 1.0);
}
`;

const TIME_PRESETS = {
  day: {
    topColor: 0x1d6fd8,
    horizonColor: 0x9be2ff,
    bottomColor: 0x4ca66b,
    fogColor: 0x9bdcf5,
    fogDensity: 0.0036,
    hemiSky: 0xe0f2fe,
    hemiGround: 0x3b7a3d,
    hemiIntensity: 0.72,
    sunColor: 0xfff7ed,
    sunIntensity: 1.75,
    sunDir: [0.52, 0.74, 0.42],
    sunOrbColor: 0xfffbeb,
    sunSize: 0.9978,
    fillColor: 0x38bdf8,
    fillIntensity: 0.36,
    envIntensity: 0.76,
    exposure: 1.04,
    nightFactor: 0.0
  },
  sunset: {
    topColor: 0x2e1c4f,
    horizonColor: 0xfb8542,
    bottomColor: 0x5c2b22,
    fogColor: 0xf48c56,
    fogDensity: 0.0044,
    hemiSky: 0xfed7aa,
    hemiGround: 0x6b2d18,
    hemiIntensity: 0.65,
    sunColor: 0xffd1a1,
    sunIntensity: 1.45,
    sunDir: [-0.78, 0.28, 0.55],
    sunOrbColor: 0xff8a50,
    sunSize: 0.9972,
    fillColor: 0xd97706,
    fillIntensity: 0.34,
    envIntensity: 0.58,
    exposure: 1.02,
    nightFactor: 0.2
  },
  night: {
    topColor: 0x030712,
    horizonColor: 0x0f1f3d,
    bottomColor: 0x020617,
    fogColor: 0x0b152a,
    fogDensity: 0.0048,
    hemiSky: 0x334155,
    hemiGround: 0x064e3b,
    hemiIntensity: 0.5,
    sunColor: 0x7dd3fc,
    sunIntensity: 0.72,
    sunDir: [-0.52, 0.68, -0.51],
    sunOrbColor: 0xe0f2fe,
    sunSize: 0.9984,
    fillColor: 0x6366f1,
    fillIntensity: 0.4,
    envIntensity: 0.36,
    exposure: 1.08,
    nightFactor: 1.0
  }
};

export class GfxPipeline {
  constructor(container, assetCache = defaultAssetCache, eventBus = null) {
    this.container = container;
    this.assetCache = assetCache || defaultAssetCache;
    this.eventBus = eventBus;

    this._timeOfDay = 'day';
    this._weatherMode = 'CLEAR';
    this._visionMode = '';
    this._baseFogDensity = TIME_PRESETS.day.fogDensity;
    this._baseExposure = TIME_PRESETS.day.exposure;

    this._shadowHalfSize = 38;
    this._shadowMapSize = 1024;
    this._sunDist = 85;
    this._sunDir = new THREE.Vector3(0.52, 0.74, 0.42).normalize();
    this._lightRight = new THREE.Vector3();
    this._lightUp = new THREE.Vector3();
    this._worldUp = new THREE.Vector3(0, 1, 0);

    // PIP single-renderer resources (allocated lazily on first renderEyePip call)
    this._pipWidth = 192;
    this._pipHeight = 108;
    this._pipRT = null;
    this._pipPixels = null;
    this._pipRowBytes = this._pipWidth * 4;
    this._pipCanvas = null;
    this._pipCtx = null;
    this._pipImageData = null;
    this._lastPipMs = 0;

    this._unsubs = [];

    this._initRenderer();
    this._initSceneAndEnvironment();
    this._initLights();
    this._initSkyDome();
    this.setTimeOfDay('day');

    if (this.eventBus) {
      this._unsubs.push(
        this.eventBus.on('world:timeChanged', (p) => {
          if (p && p.timeOfDay && p.timeOfDay !== this._timeOfDay) {
            this.setTimeOfDay(p.timeOfDay);
          }
        }),
        this.eventBus.on('world:weatherChanged', (p) => {
          if (p && p.mode !== undefined && p.mode !== this._weatherMode) {
            this.setWeatherMode(p.mode);
          }
        }),
        this.eventBus.on('world:visionChanged', (p) => {
          if (p && p.mode !== undefined && p.mode !== this._visionMode) {
            this.setVisionMode(p.mode);
          }
        })
      );
    }
  }

  _initRenderer() {
    const rawDpr = window.devicePixelRatio || 1;
    const dpr = Math.min(rawDpr, 1.5);
    const useAA = rawDpr <= 1.5;

    this.renderer = new THREE.WebGLRenderer({
      antialias: useAA,
      powerPreference: 'high-performance',
      stencil: false
    });

    const w = (this.container && this.container.clientWidth) || window.innerWidth || 1280;
    const h = (this.container && this.container.clientHeight) || window.innerHeight || 720;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this._baseExposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';

    if (this.container) {
      this.container.appendChild(canvas);
    } else {
      document.body.appendChild(canvas);
    }
  }

  _initSceneAndEnvironment() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(TIME_PRESETS.day.horizonColor);
    this.scene.fog = new THREE.FogExp2(TIME_PRESETS.day.fogColor, this._baseFogDensity);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this._envRT = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = this._envRT.texture;
    this.scene.environmentIntensity = TIME_PRESETS.day.envIntensity;

    roomEnv.dispose();
    pmrem.dispose();
    this.assetCache.track(this._envRT);
  }

  _initLights() {
    this.hemiLight = new THREE.HemisphereLight(
      TIME_PRESETS.day.hemiSky,
      TIME_PRESETS.day.hemiGround,
      TIME_PRESETS.day.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(
      TIME_PRESETS.day.sunColor,
      TIME_PRESETS.day.sunIntensity
    );
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(this._shadowMapSize, this._shadowMapSize);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 185;

    const d = this._shadowHalfSize;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;

    this.sunLight.position.copy(this._sunDir).multiplyScalar(this._sunDist);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.fillLight = new THREE.DirectionalLight(
      TIME_PRESETS.day.fillColor,
      TIME_PRESETS.day.fillIntensity
    );
    this.fillLight.position.set(-70, 50, -70);
    this.scene.add(this.fillLight);

    this._updateLightBasis();
  }

  _updateLightBasis() {
    this._lightRight.crossVectors(this._worldUp, this._sunDir);
    if (this._lightRight.lengthSq() < 1e-5) {
      this._lightRight.set(1, 0, 0);
    } else {
      this._lightRight.normalize();
    }
    this._lightUp.crossVectors(this._sunDir, this._lightRight).normalize();
  }

  _initSkyDome() {
    this.skyGroup = new THREE.Group();
    this.scene.add(this.skyGroup);

    const skyGeo = this.assetCache.getGeometry('sky_dome_geo', () => new THREE.SphereGeometry(420, 24, 14));
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(TIME_PRESETS.day.topColor) },
      uHorizonColor: { value: new THREE.Color(TIME_PRESETS.day.horizonColor) },
      uBottomColor: { value: new THREE.Color(TIME_PRESETS.day.bottomColor) },
      uSunDir: { value: this._sunDir.clone() },
      uSunColor: { value: new THREE.Color(TIME_PRESETS.day.sunOrbColor) },
      uSunSize: { value: TIME_PRESETS.day.sunSize },
      uNightFactor: { value: 0.0 }
    };

    const skyMat = this.assetCache.getMaterial('sky_dome_mat', () => new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    }));

    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -10;
    this.skyGroup.add(this.skyDome);

    // Night starfield (1 draw call, visible only at night)
    const starCount = 300;
    const starGeo = this.assetCache.getGeometry('sky_stars_geo', () => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * (Math.PI * 0.44);
        const r = 340;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = Math.max(38, r * Math.cos(phi));
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return geo;
    });

    const starMat = this.assetCache.getMaterial('sky_stars_mat', () => new THREE.PointsMaterial({
      color: 0xe0f2fe,
      size: 1.8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false
    }));

    this.starField = new THREE.Points(starGeo, starMat);
    this.starField.visible = false;
    this.skyGroup.add(this.starField);
  }

  setTimeOfDay(mode) {
    const preset = TIME_PRESETS[mode] || TIME_PRESETS.day;
    this._timeOfDay = TIME_PRESETS[mode] ? mode : 'day';

    this.scene.background.setHex(preset.horizonColor);
    this._baseFogDensity = preset.fogDensity;
    this.scene.fog.color.setHex(preset.fogColor);

    this.hemiLight.color.setHex(preset.hemiSky);
    this.hemiLight.groundColor.setHex(preset.hemiGround);
    this.hemiLight.intensity = preset.hemiIntensity;

    this.sunLight.color.setHex(preset.sunColor);
    this.sunLight.intensity = preset.sunIntensity;
    this._sunDir.set(preset.sunDir[0], preset.sunDir[1], preset.sunDir[2]).normalize();
    this._updateLightBasis();

    this.fillLight.color.setHex(preset.fillColor);
    this.fillLight.intensity = preset.fillIntensity;
    this.scene.environmentIntensity = preset.envIntensity;

    this._baseExposure = preset.exposure;

    this.skyUniforms.uTopColor.value.setHex(preset.topColor);
    this.skyUniforms.uHorizonColor.value.setHex(preset.horizonColor);
    this.skyUniforms.uBottomColor.value.setHex(preset.bottomColor);
    this.skyUniforms.uSunDir.value.copy(this._sunDir);
    this.skyUniforms.uSunColor.value.setHex(preset.sunOrbColor);
    this.skyUniforms.uSunSize.value = preset.sunSize;
    this.skyUniforms.uNightFactor.value = preset.nightFactor;

    if (this.starField) {
      this.starField.visible = (this._timeOfDay === 'night');
    }

    this._applyAtmosphereModifiers();
  }

  setWeatherMode(mode) {
    this._weatherMode = mode || 'CLEAR';
    this._applyAtmosphereModifiers();
  }

  setVisionMode(mode) {
    this._visionMode = mode || '';
    this._applyAtmosphereModifiers();
  }

  _applyAtmosphereModifiers() {
    let fogMult = 1.0;
    if (this._weatherMode === 'FOG' || this._weatherMode === 'CYBER_FOG') {
      fogMult = 2.1;
    } else if (this._weatherMode === 'RAIN' || this._weatherMode === 'NEON_RAIN') {
      fogMult = 1.45;
    }
    this.scene.fog.density = this._baseFogDensity * fogMult;

    let exposureOffset = 0;
    if (this._visionMode === 'NIGHT') exposureOffset = 0.28;
    else if (this._visionMode === 'THERMAL') exposureOffset = 0.14;
    this.renderer.toneMappingExposure = this._baseExposure + exposureOffset;
  }

  update(dt, playerPos, elapsedTime = 0) {
    // Keep SkyDome & starfield centered horizontally on player without allocations
    if (playerPos) {
      this.skyGroup.position.set(playerPos.x, 0, playerPos.z);

      // Texel-snapped directional shadow frustum follower
      const texelSize = (this._shadowHalfSize * 2) / this._shadowMapSize;
      const projRight = Math.round(playerPos.dot(this._lightRight) / texelSize) * texelSize;
      const projUp = Math.round(playerPos.dot(this._lightUp) / texelSize) * texelSize;
      const projFwd = playerPos.dot(this._sunDir);

      TMP.v1.copy(this._lightRight).multiplyScalar(projRight);
      TMP.v2.copy(this._lightUp).multiplyScalar(projUp);
      TMP.v3.copy(this._sunDir).multiplyScalar(projFwd);

      this.sunLight.target.position.copy(TMP.v1).add(TMP.v2).add(TMP.v3);
      this.sunLight.position.copy(this.sunLight.target.position).addScaledVector(this._sunDir, this._sunDist);
      this.sunLight.target.updateMatrixWorld();
    }

    if (this.starField && this.starField.visible) {
      this.starField.rotation.y = elapsedTime * 0.004;
    }
  }

  render(camera) {
    if (!camera) return;
    this.renderer.render(this.scene, camera);
  }

  renderEyePip(eyeCamera, targetCanvas) {
    if (!eyeCamera || !targetCanvas) return;

    const now = performance.now();
    if (now - this._lastPipMs < 80) return; // ~12 FPS throttle for mobile GPU budget
    this._lastPipMs = now;

    const pw = this._pipWidth;
    const ph = this._pipHeight;

    if (!this._pipRT) {
      this._pipRT = new THREE.WebGLRenderTarget(pw, ph, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false
      });
      this._pipPixels = new Uint8Array(pw * ph * 4);
      this.assetCache.track(this._pipRT);
    }

    if (this._pipCanvas !== targetCanvas) {
      this._pipCanvas = targetCanvas;
      targetCanvas.width = pw;
      targetCanvas.height = ph;
      this._pipCtx = targetCanvas.getContext('2d');
      this._pipImageData = this._pipCtx ? this._pipCtx.createImageData(pw, ph) : null;
    }
    if (!this._pipCtx || !this._pipImageData) return;

    const prevRT = this.renderer.getRenderTarget();
    const prevAutoUpdate = this.renderer.shadowMap.autoUpdate;

    eyeCamera.aspect = pw / ph;
    eyeCamera.updateProjectionMatrix();
    eyeCamera.updateWorldMatrix(true, false);

    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setRenderTarget(this._pipRT);
    this.renderer.clear();
    this.renderer.render(this.scene, eyeCamera);
    this.renderer.readRenderTargetPixels(this._pipRT, 0, 0, pw, ph, this._pipPixels);
    this.renderer.setRenderTarget(prevRT);
    this.renderer.shadowMap.autoUpdate = prevAutoUpdate;

    // Flip WebGL bottom-up rows into Canvas2D top-down ImageData (zero-alloc byte copy)
    const dst = this._pipImageData.data;
    const src = this._pipPixels;
    const rowBytes = this._pipRowBytes;
    for (let y = 0; y < ph; y++) {
      const srcOffset = (ph - 1 - y) * rowBytes;
      const dstOffset = y * rowBytes;
      for (let b = 0; b < rowBytes; b++) {
        dst[dstOffset + b] = src[srcOffset + b];
      }
    }
    this._pipCtx.putImageData(this._pipImageData, 0, 0);
  }

  getTelemetry(outObj) {
    const info = this.renderer.info;
    const target = outObj || {};
    target.drawCalls = info.render.calls;
    target.triangles = info.render.triangles;
    target.geometries = info.memory.geometries;
    target.textures = info.memory.textures;
    target.dpr = this.renderer.getPixelRatio();
    return target;
  }

  resize(w, h) {
    const width = Math.max(1, w || window.innerWidth || 1280);
    const height = Math.max(1, h || window.innerHeight || 720);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height);
  }

  dispose() {
    for (let i = 0; i < this._unsubs.length; i++) {
      this._unsubs[i]();
    }
    this._unsubs.length = 0;

    if (this._pipRT) {
      this._pipRT.dispose();
      this._pipRT = null;
    }
    if (this._envRT) {
      this._envRT.dispose();
      this._envRT = null;
    }
    if (this.scene) {
      this.scene.environment = null;
    }
    this._pipPixels = null;
    this._pipImageData = null;
    this._pipCtx = null;
    this._pipCanvas = null;

    if (this.renderer) {
      const dom = this.renderer.domElement;
      this.renderer.dispose();
      if (dom && dom.parentNode) {
        dom.parentNode.removeChild(dom);
      }
      this.renderer = null;
    }
  }
}
