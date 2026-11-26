// Shared GPU Asset Registry & Lifecycle Disposer (Geometries, Materials, Textures)

function safeDispose(resource) {
  if (resource && typeof resource.dispose === 'function') {
    try {
      resource.dispose();
    } catch (e) {
      console.warn('[AssetCache] dispose warning:', e);
    }
  }
}

export class AssetCache {
  constructor() {
    this._geometries = new Map();
    this._materials = new Map();
    this._textures = new Map();
    this._tracked = new Set();
  }

  /**
   * Return cached BufferGeometry or build and cache via factory().
   */
  getGeometry(key, factory) {
    if (this._geometries.has(key)) {
      return this._geometries.get(key);
    }
    if (typeof factory !== 'function') return null;
    const geo = factory();
    if (geo) {
      this._geometries.set(key, geo);
    }
    return geo;
  }

  /**
   * Return cached Material or build and cache via factory().
   */
  getMaterial(key, factory) {
    if (this._materials.has(key)) {
      return this._materials.get(key);
    }
    if (typeof factory !== 'function') return null;
    const mat = factory();
    if (mat) {
      this._materials.set(key, mat);
    }
    return mat;
  }

  /**
   * Return cached Texture or build and cache via factory().
   */
  getTexture(key, factory) {
    if (this._textures.has(key)) {
      return this._textures.get(key);
    }
    if (typeof factory !== 'function') return null;
    const tex = factory();
    if (tex) {
      this._textures.set(key, tex);
    }
    return tex;
  }

  /**
   * Track an ad-hoc disposable resource (BufferGeometry, Material, Texture, RenderTarget, etc.).
   */
  track(disposable) {
    if (disposable && typeof disposable.dispose === 'function') {
      this._tracked.add(disposable);
    }
    return disposable;
  }

  /**
   * Dispose and remove a keyed resource from any cache bucket.
   */
  release(key) {
    let released = false;
    if (this._geometries.has(key)) {
      safeDispose(this._geometries.get(key));
      this._geometries.delete(key);
      released = true;
    }
    if (this._materials.has(key)) {
      safeDispose(this._materials.get(key));
      this._materials.delete(key);
      released = true;
    }
    if (this._textures.has(key)) {
      safeDispose(this._textures.get(key));
      this._textures.delete(key);
      released = true;
    }
    return released;
  }

  /**
   * Dispose all cached and tracked GPU resources.
   */
  disposeAll() {
    for (const geo of this._geometries.values()) safeDispose(geo);
    this._geometries.clear();

    for (const mat of this._materials.values()) safeDispose(mat);
    this._materials.clear();

    for (const tex of this._textures.values()) safeDispose(tex);
    this._textures.clear();

    for (const res of this._tracked) safeDispose(res);
    this._tracked.clear();
  }
}

export const assetCache = new AssetCache();
