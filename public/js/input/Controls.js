import { el } from '../core/dom.js';

/**
 * Birleşik girdi: klavye (WASD/oklar, Shift koşu, E etkileşim) + dokunmatik sanal joystick.
 * Joystick dinamiktir: ekranın sol alt yarısında nereye dokunursan orada belirir.
 */
export class Controls {
  constructor(root, { touch, onKey } = {}) {
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false };
    this.sprintToggle = false;
    this.onKey = onKey;
    this.touch = touch;

    const isTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    this.kd = (e) => {
      if (isTyping()) return;
      this.keys.add(e.code);
      this.onKey?.(e.code, e);
    };
    this.ku = (e) => this.keys.delete(e.code);
    this.blur = () => this.keys.clear();
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    window.addEventListener('blur', this.blur);

    if (touch) this.buildJoystick(root);
  }

  buildJoystick(root) {
    this.zone = el('div', { class: 'joy-zone' });
    this.base = el('div', { class: 'joy-base' });
    this.knob = el('div', { class: 'joy-knob' });
    this.base.append(this.knob);
    this.zone.append(this.base);
    root.append(this.zone);
    let id = null;
    let cx = 0, cy = 0;
    const R = 56;
    const setKnob = (dx, dy) => {
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    this.zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);
      const r = this.zone.getBoundingClientRect();
      cx = e.clientX;
      cy = e.clientY;
      this.base.style.left = `${cx - r.left}px`;
      this.base.style.top = `${cy - r.top}px`;
      this.base.classList.add('on');
      this.joy.active = true;
    });
    this.zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      setKnob(dx, dy);
      this.joy.x = dx / R;
      this.joy.y = -dy / R;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.joy = { x: 0, y: 0, active: false };
      setKnob(0, 0);
      this.base.classList.remove('on');
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
  }

  // { x: sağ, y: ileri, sprint }
  read() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.sprintToggle;
    if (this.joy.active) {
      x = this.joy.x;
      y = this.joy.y;
      if (Math.hypot(x, y) > 0.95) sprint = sprint || false;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, mag: Math.min(1, len), sprint };
  }

  dispose() {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    window.removeEventListener('blur', this.blur);
    this.zone?.remove();
  }
}
