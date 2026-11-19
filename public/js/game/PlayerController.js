import { animateWalk } from '../entities/EntityManager.js';

const RADIUS = 0.9;
const SEND_EVERY = 0.05;

/** Yerel oyuncu: kameraya göre hareket, bina çarpışması, yürüme animasyonu, sunucuya 20 Hz konum. */
export class PlayerController {
  constructor({ object, rig, controls, getColliders, bounds, speed, sprintMultiplier, onMove, audio, getAnim, onInputWhilePosed, getDrive }) {
    Object.assign(this, { object, rig, controls, getColliders, bounds, speed, sprintMultiplier, onMove, audio, getAnim, onInputWhilePosed, getDrive });
    this.outdoorBounds = bounds;
    this.locked = false;
    this.sendTimer = 0;
    this.dirty = true;
    this.stepTimer = 0;
  }

  update(dt) {
    const inp = this.controls.read();
    let speed = 0;
    const anim = this.getAnim?.() ?? {};
    const drive = this.getDrive?.() ?? 0;
    if (anim.pose && anim.pose !== 'dead' && !drive && inp.mag > 0.3) this.onInputWhilePosed?.();
    const slow = anim.slow ?? 1;
    // Otururken/yatarken joystick = kalk (sunucu mobilyanın önüne koyar), o an yürüme
    const seated = (anim.pose === 'sit' || anim.pose === 'sleep') && !drive;
    if (!this.locked && !seated && inp.mag > 0.05 && (!anim.pose || drive || inp.mag > 0.3)) {
      const yaw = this.rig.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * inp.y + rx * inp.x;
      let mz = fz * inp.y + rz * inp.x;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      speed = this.noclip ? 55 * inp.mag : drive ? drive * Math.min(1, inp.mag * 1.15) : this.speed * (inp.sprint && slow >= 1 ? this.sprintMultiplier : 1) * inp.mag * slow;
      const p = this.object.position;
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      if (!this.noclip) this.collide(p);
      p.x = Math.max(-this.bounds, Math.min(this.bounds, p.x));
      p.z = Math.max(-this.bounds, Math.min(this.bounds, p.z));
      let d = Math.atan2(mx, mz) - this.object.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.object.rotation.y += d * Math.min(1, dt * (drive ? 4 : 12));
      this.dirty = true;
    }
    animateWalk(this.object, anim.pose || drive ? 0 : speed, dt, drive ? { ...anim, pose: 'drive' } : anim);
    // Yönetici uçuşu: karakter havada süzülür
    const fy = this.noclip ? 7 + Math.sin(performance.now() / 400) * 0.6 : 0;
    this.object.position.y += (fy - this.object.position.y) * Math.min(1, dt * 4);

    this.sendTimer += dt;
    if (this.dirty && this.sendTimer >= SEND_EVERY) {
      this.sendTimer = 0;
      this.dirty = false;
      const p = this.object.position;
      this.onMove?.(p.x, p.z, this.object.rotation.y);
    }
  }

  collide(p) {
    for (const c of this.getColliders()) {
      const ox = c.hw + RADIUS - Math.abs(p.x - c.x);
      const oz = c.hd + RADIUS - Math.abs(p.z - c.z);
      if (ox > 0 && oz > 0) {
        if (ox < oz) p.x += Math.sign(p.x - c.x || 1) * ox;
        else p.z += Math.sign(p.z - c.z || 1) * oz;
      }
    }
  }

  applyCorrection(x, z, rotY) {
    this.object.position.x = x;
    this.object.position.z = z;
    if (Number.isFinite(rotY)) this.object.rotation.y = rotY;
  }
}
