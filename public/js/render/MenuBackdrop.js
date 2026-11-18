import { SceneKit } from './SceneSetup.js';
import { CityRenderer, fakeCity } from './CityRenderer.js';
import { Effects } from './Effects.js';

/**
 * Menü arka planı: alacakaranlıkta yavaşça dönen bir kamera ile prosedürel bir şehir,
 * ara sıra ufukta füze izleri ve patlamalar. Sunucuya bağlanmadan çalışır.
 */
export class MenuBackdrop {
  constructor(renderer, audio) {
    this.renderer = renderer;
    const { info, buildings } = fakeCity();
    this.info = info;
    this.kit = new SceneKit(renderer, { worldSize: info.size });
    this.effects = new Effects(this.kit.scene, this.kit.camera, renderer, null);
    this.city = new CityRenderer(this.kit.scene, info, buildings, { effects: this.effects });
    this.audio = audio;
    this.t = 0;
    this.hour = 19.4;
    this.nextStrike = 7;
    this.pending = [];
    this.running = true;
    this.cinematic = false;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  strike(x, z, { loud = false, type = 'tactical' } = {}) {
    const h = this.info.half;
    const from = { x: (Math.random() < 0.5 ? -1 : 1) * h * 2.5, z: (Math.random() - 0.5) * h * 3 };
    const id = `bm${Math.random()}`;
    const flightMs = loud ? 2200 : 5500;
    this.effects.addMissile({ id, type, from, to: { x, z }, flightMs, apex: loud ? 60 : 140, elapsed: 600 });
    this.pending.push({ id, at: performance.now() + flightMs - 600, x, z, loud, type });
  }

  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;

    const a = this.t * 0.045 + 0.6;
    const R = this.info.size * (0.55 + Math.sin(this.t * 0.07) * 0.12);
    const H = 55 + Math.sin(this.t * 0.11) * 22;
    const cam = this.kit.camera;
    cam.position.set(Math.cos(a) * R, H, Math.sin(a) * R);
    const shake = this.effects.update(dt);
    if (shake) cam.position.add(shake.multiplyScalar(2));
    cam.lookAt(0, 12, 0);

    this.hour = 19.4 + Math.min(1.8, this.t * 0.01);
    this.kit.setTime(this.hour);
    this.city.update(dt, cam, this.kit.night ?? 1);

    if (!this.cinematic) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 9 + Math.random() * 8;
        const h = this.info.half * 0.8;
        this.strike((Math.random() - 0.5) * h * 2, (Math.random() - 0.5) * h * 2);
      }
    }
    this.pending = this.pending.filter((p) => {
      if (now < p.at) return true;
      this.effects.impact({ id: p.id, type: p.type, x: p.x, z: p.z, radius: p.loud ? 34 : 22 });
      if (this.audio) this.audio.play(p.loud ? 'boom' : 'explosion', { vol: p.loud ? 1 : 0.25, size: 1.5, minGap: 0 });
      return false;
    });

    this.renderer.render(this.kit.scene, cam);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.kit.dispose();
  }
}
