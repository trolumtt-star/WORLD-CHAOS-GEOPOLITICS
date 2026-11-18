import { animateWalk } from '../entities/EntityManager.js';

const RADIUS = 0.9;
const SEND_EVERY = 0.05;

/** Yerel oyuncu: kameraya göre hareket, bina çarpışması, yürüme animasyonu, sunucuya 20 Hz konum. */
export class PlayerController {
  constructor({ object, rig, controls, getColliders, bounds, speed, sprintMultiplier, onMove, audio }) {
    Object.assign(this, { object, rig, controls, getColliders, bounds, speed, sprintMultiplier, onMove, audio });
    this.locked = false;
    this.sendTimer = 0;
    this.dirty = true;
    this.stepTimer = 0;
  }

  update(dt) {
    const inp = this.controls.read();
    let speed = 0;
    if (!this.locked && inp.mag > 0.05) {
      const yaw = this.rig.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mx = fx * inp.y + rx * inp.x;
      let mz = fz * inp.y + rz * inp.x;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      speed = this.speed * (inp.sprint ? this.sprintMultiplier : 1) * inp.mag;
      const p = this.object.position;
      p.x += mx * speed * dt;
      p.z += mz * speed * dt;
      this.collide(p);
      p.x = Math.max(-this.bounds, Math.min(this.bounds, p.x));
      p.z = Math.max(-this.bounds, Math.min(this.bounds, p.z));
      let d = Math.atan2(mx, mz) - this.object.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.object.rotation.y += d * Math.min(1, dt * 12);
      this.dirty = true;
    }
    animateWalk(this.object, speed, dt);

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

  applyCorrection(x, z) {
    this.object.position.x = x;
    this.object.position.z = z;
  }
}
