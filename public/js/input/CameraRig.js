import * as THREE from 'three';

/**
 * 3. şahıs yörünge kamera. PC: sürükle = döndür, tekerlek = zoom.
 * Mobil: tek parmak sürükle = döndür, iki parmak = pinch zoom + döndür. Kısa dokunuş = onTap.
 */
export class CameraRig {
  constructor(camera, dom, { onTap, canLock } = {}) {
    this.camera = camera;
    this.dom = dom;
    this.onTap = onTap;
    this.yaw = 0.7;
    this.pitch = 0.62;
    this.distance = 34;
    this.minDist = 10;
    this.maxDist = 280;
    this.target = new THREE.Vector3();
    this.goalDistance = this.distance;
    this.goalPitch = this.pitch;
    this.pointers = new Map();
    this.pinch = null;
    // PC'de GTA tarzı: tıkla -> imleç kilitlenir, fare hareketi kamerayı döndürür
    this.desktop = matchMedia('(pointer: fine)').matches;
    this.canLock = canLock ?? (() => true);
    this.bind();
  }

  bind() {
    const d = this.dom;
    this.h = {
      down: (e) => {
        if (this.desktop && e.pointerType === 'mouse') {
          if (document.pointerLockElement === d) {
            // Kilitliyken tıklama = ekranın ortasındakini incele
            if (e.button === 0) this.onTap?.({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
            return;
          }
          if (e.button === 0 && this.canLock()) {
            d.requestPointerLock?.();
            return;
          }
        }
        d.setPointerCapture?.(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
        if (this.pointers.size === 2) this.pinch = this.pinchState();
      },
      move: (e) => {
        if (document.pointerLockElement === d) {
          this.yaw -= e.movementX * 0.0032;
          this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + e.movementY * 0.0026, 0.12, 1.45);
          return;
        }
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        p.moved += Math.abs(dx) + Math.abs(dy);
        if (this.pointers.size === 1) {
          const k = e.pointerType === 'touch' ? 0.006 : 0.005;
          this.yaw -= dx * k;
          this.goalPitch = THREE.MathUtils.clamp(this.goalPitch + dy * k * 0.8, 0.15, 1.45);
        } else if (this.pointers.size === 2 && this.pinch) {
          const now = this.pinchState();
          this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * (this.pinch.dist / Math.max(20, now.dist)), this.minDist, this.maxDist);
          this.yaw -= (now.angle - this.pinch.angle);
          this.pinch = now;
        }
      },
      up: (e) => {
        const p = this.pointers.get(e.pointerId);
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) this.pinch = null;
        if (p && p.moved < 10 && performance.now() - p.t < 450 && this.pointers.size === 0) this.onTap?.(e);
      },
      wheel: (e) => {
        e.preventDefault();
        this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * (1 + Math.sign(e.deltaY) * 0.12), this.minDist, this.maxDist);
      },
    };
    d.addEventListener('pointerdown', this.h.down);
    d.addEventListener('pointermove', this.h.move);
    d.addEventListener('pointerup', this.h.up);
    d.addEventListener('pointercancel', this.h.up);
    d.addEventListener('wheel', this.h.wheel, { passive: false });
  }

  unlock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  zoomBy(f) { this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * f, this.minDist, this.maxDist); }

  setStrategic(on) {
    if (on) {
      this._saved = { d: this.goalDistance, p: this.goalPitch };
      this.goalDistance = Math.max(this.goalDistance, 190);
      this.goalPitch = 1.15;
    } else if (this._saved) {
      this.goalDistance = this._saved.d;
      this.goalPitch = this._saved.p;
      this._saved = null;
    }
  }

  update(dt, follow, shake) {
    const k = 1 - Math.exp(-dt * 8);
    this.target.lerp(follow, Math.min(1, k * 1.5));
    this.distance += (this.goalDistance - this.distance) * k;
    this.pitch += (this.goalPitch - this.pitch) * k;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + 2 + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    if (shake) this.camera.position.add(shake);
    this.camera.lookAt(this.target.x, this.target.y + 2, this.target.z);
  }

  snap(follow) {
    this.target.copy(follow);
  }

  dispose() {
    this.unlock();
    const d = this.dom;
    d.removeEventListener('pointerdown', this.h.down);
    d.removeEventListener('pointermove', this.h.move);
    d.removeEventListener('pointerup', this.h.up);
    d.removeEventListener('pointercancel', this.h.up);
    d.removeEventListener('wheel', this.h.wheel);
  }
}
