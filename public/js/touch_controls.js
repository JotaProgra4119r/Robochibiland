// Mobile-First Touch Controls: Viewport-Aligned Floating Left Joystick + Right Camera Orbit/Pinch + Haptics

export class TouchControls {
  constructor(canvasElement, cameraController, eventBus, appState) {
    this.canvas = canvasElement || null;
    this.cameraController = cameraController || null;
    this.eventBus = eventBus || null;
    this.appState = appState || null;

    this._ac = new AbortController();
    this._visible = false;

    // Movement state (zero-alloc)
    this._moveX = 0;
    this._moveY = 0;
    this._runByStick = false;
    this._runToggle = false;

    // Left floating joystick state
    this._joyTouchId = null;
    this._joyCenterX = 0;
    this._joyCenterY = 0;
    this._joyRadius = 44;

    // Right camera touch / pinch state
    this._camPrimaryId = null;
    this._camPrevX = 0;
    this._camPrevY = 0;
    this._camSecondaryId = null;
    this._camSecX = 0;
    this._camSecY = 0;
    this._prevPinchDist = 0;

    // DOM refs
    this._overlay = document.getElementById('virtual-touch-controls');
    this._zone = document.getElementById('joystick-zone');
    this._base = document.getElementById('joystick-base');
    this._stick = document.getElementById('joystick-stick');

    this._bindEvents();

    const isTouchCapable =
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.innerWidth <= 900;
    this.setVisible(isTouchCapable);
  }

  _haptic(pattern = 15) {
    if (this.eventBus) {
      this.eventBus.emit('haptic:pulse', { pattern });
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  _bindEvents() {
    const sig = { signal: this._ac.signal };

    if (this._zone) {
      this._zone.addEventListener('touchstart', (e) => this._onJoyTouchStart(e), { passive: false, signal: this._ac.signal });
      this._zone.addEventListener('mousedown', (e) => this._onJoyMouseDown(e), sig);
    }

    window.addEventListener('touchmove', (e) => this._onWindowTouchMove(e), { passive: false, signal: this._ac.signal });
    window.addEventListener('touchend', (e) => this._onWindowTouchEnd(e), sig);
    window.addEventListener('touchcancel', (e) => this._onWindowTouchEnd(e), sig);

    window.addEventListener('mousemove', (e) => this._onJoyMouseMove(e), sig);
    window.addEventListener('mouseup', () => this._onJoyMouseUp(), sig);

    if (this.canvas) {
      this.canvas.addEventListener('touchstart', (e) => this._onCanvasTouchStart(e), { passive: true, signal: this._ac.signal });
      this.canvas.addEventListener('touchmove', (e) => this._onCanvasTouchMove(e), { passive: false, signal: this._ac.signal });
      this.canvas.addEventListener('touchend', (e) => this._onCanvasTouchEnd(e), sig);
      this.canvas.addEventListener('touchcancel', (e) => this._onCanvasTouchEnd(e), sig);
    }

    const actionButtons = document.querySelectorAll('.touch-act-btn');
    for (let i = 0; i < actionButtons.length; i++) {
      const btn = actionButtons[i];
      const key = btn.dataset.key;
      let lastTapMs = 0;

      const fireAction = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        if (now - lastTapMs < 140) return;
        lastTapMs = now;
        this._haptic(15);

        if (key === 'shift') {
          this._runToggle = !this._runToggle;
          btn.classList.toggle('pressed', this._runToggle);
          return;
        }

        let action = null;
        if (key === ' ') action = 'jump';
        else if (key === 'b') action = 'bark';
        else if (key === 'g') action = 'throwBall';
        else if (key === 'p') action = 'pet';

        if (action && this.eventBus) {
          this.eventBus.emit('input:action', { action, source: 'touch' });
        }
      };

      btn.addEventListener('pointerdown', fireAction, sig);
    }
  }

  _showJoystickAt(cx, cy) {
    this._joyCenterX = cx;
    this._joyCenterY = cy;
    if (this._base) {
      this._base.style.transform = `translate3d(${cx - 52}px, ${cy - 52}px, 0)`;
      this._base.classList.remove('hidden');
    }
    if (this._stick) {
      this._stick.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }

  _updateJoystickTo(px, py) {
    const dx = px - this._joyCenterX;
    const dy = py - this._joyCenterY;
    const dist = Math.hypot(dx, dy);
    const maxR = this._joyRadius;

    let sx = dx;
    let sy = dy;
    if (dist > maxR && dist > 0.0001) {
      const inv = maxR / dist;
      sx = dx * inv;
      sy = dy * inv;
    }

    if (this._stick) {
      this._stick.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
    }

    this._moveX = sx / maxR;
    this._moveY = sy / maxR;
    this._runByStick = (Math.min(dist, maxR) / maxR) > 0.72;
  }

  _resetJoystick() {
    this._joyTouchId = null;
    this._moveX = 0;
    this._moveY = 0;
    this._runByStick = false;
    if (this._base) {
      this._base.classList.add('hidden');
    }
    if (this._stick) {
      this._stick.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }

  _onJoyTouchStart(e) {
    if (this._joyTouchId !== null) return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    e.preventDefault();
    e.stopPropagation();

    const t = e.changedTouches[0];
    this._joyTouchId = t.identifier;
    this._showJoystickAt(t.clientX, t.clientY);
    this._haptic(10);
  }

  _onJoyMouseDown(e) {
    if (e.button !== 0 || this._joyTouchId !== null) return;
    e.stopPropagation();
    this._joyTouchId = 'mouse';
    this._showJoystickAt(e.clientX, e.clientY);
  }

  _onJoyMouseMove(e) {
    if (this._joyTouchId !== 'mouse') return;
    this._updateJoystickTo(e.clientX, e.clientY);
  }

  _onJoyMouseUp() {
    if (this._joyTouchId !== 'mouse') return;
    this._resetJoystick();
  }

  _onWindowTouchMove(e) {
    if (this._joyTouchId === null || this._joyTouchId === 'mouse') return;
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === this._joyTouchId) {
        e.preventDefault();
        this._updateJoystickTo(touches[i].clientX, touches[i].clientY);
        break;
      }
    }
  }

  _onWindowTouchEnd(e) {
    if (this._joyTouchId === null || this._joyTouchId === 'mouse') return;
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === this._joyTouchId) {
        this._resetJoystick();
        break;
      }
    }
  }

  _onCanvasTouchStart(e) {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      if (t.identifier === this._joyTouchId) continue;

      if (this._camPrimaryId === null) {
        this._camPrimaryId = t.identifier;
        this._camPrevX = t.clientX;
        this._camPrevY = t.clientY;
      } else if (this._camSecondaryId === null && t.identifier !== this._camPrimaryId) {
        this._camSecondaryId = t.identifier;
        this._camSecX = t.clientX;
        this._camSecY = t.clientY;
        this._prevPinchDist = Math.hypot(this._camPrevX - this._camSecX, this._camPrevY - this._camSecY);
      }
    }
  }

  _onCanvasTouchMove(e) {
    const touches = e.changedTouches;
    let movedPrimary = false;
    let movedSecondary = false;

    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      if (t.identifier === this._joyTouchId) continue;

      if (t.identifier === this._camPrimaryId) {
        const dx = t.clientX - this._camPrevX;
        const dy = t.clientY - this._camPrevY;
        this._camPrevX = t.clientX;
        this._camPrevY = t.clientY;
        movedPrimary = true;

        // Single-finger camera orbit on canvas (skip while grabbing a robot with Hand Tool)
        if (this._camSecondaryId === null && !(this.appState && this.appState.isHandToolActive)) {
          if (this.cameraController && this.cameraController.addOrbitDelta) {
            this.cameraController.addOrbitDelta(dx, dy);
          }
        }
      } else if (t.identifier === this._camSecondaryId) {
        this._camSecX = t.clientX;
        this._camSecY = t.clientY;
        movedSecondary = true;
      }
    }

    if ((movedPrimary || movedSecondary) && this._camPrimaryId !== null && this._camSecondaryId !== null) {
      e.preventDefault();
      const newDist = Math.hypot(this._camPrevX - this._camSecX, this._camPrevY - this._camSecY);
      const pinchDelta = this._prevPinchDist - newDist;
      this._prevPinchDist = newDist;
      if (this.cameraController && this.cameraController.addZoomDelta) {
        this.cameraController.addZoomDelta(pinchDelta * 2.5);
      }
    } else if (movedPrimary && !(this.appState && this.appState.isHandToolActive)) {
      e.preventDefault();
    }
  }

  _onCanvasTouchEnd(e) {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++) {
      const id = touches[i].identifier;
      if (id === this._camPrimaryId) {
        this._camPrimaryId = this._camSecondaryId;
        this._camPrevX = this._camSecX;
        this._camPrevY = this._camSecY;
        this._camSecondaryId = null;
        this._prevPinchDist = 0;
      } else if (id === this._camSecondaryId) {
        this._camSecondaryId = null;
        this._prevPinchDist = 0;
      }
    }
  }

  getMoveVector(outVec2) {
    if (outVec2 && outVec2.set) {
      outVec2.set(this._moveX, this._moveY);
    } else if (outVec2) {
      outVec2.x = this._moveX;
      outVec2.y = this._moveY;
    }
    return outVec2;
  }

  isRunning() {
    return this._runToggle || this._runByStick;
  }

  isVisible() {
    return this._visible;
  }

  setVisible(v) {
    this._visible = !!v;
    if (this.appState) {
      this.appState.isTouchVisible = this._visible;
    }
    if (this._overlay) {
      this._overlay.classList.toggle('hidden', !this._visible);
    }
    if (!this._visible) {
      this._resetJoystick();
      this._runToggle = false;
    }
  }

  dispose() {
    this._ac.abort();
    this._resetJoystick();
  }
}
