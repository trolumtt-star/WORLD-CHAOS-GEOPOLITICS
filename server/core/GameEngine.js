import { GameClock } from './GameClock.js';

/**
 * Game Tick Engine.
 *
 * Bir "System" şu opsiyonel metotlara sahip düz bir nesnedir:
 *   name                       -> log ve getSystem() için
 *   init(ctx)                  -> engine.use() anında bir kez
 *   onTick(dt, ctx)            -> her simülasyon adımında (dt saniye)
 *   onHour(time, ctx)          -> her oyun saati başında
 *   onDay(time, ctx)           -> her gece 00:00'da (onHour'dan ÖNCE)
 *
 * Sistemler kayıt sırasıyla çalışır; sıra önemlidir
 * (ör. maaş/temettü -> vergi -> ağ yayını).
 */
export class GameEngine {
  constructor({ world, rng, bus, config }) {
    this.clock = new GameClock(config.time);
    bus.clock = this.clock;
    world.clock = this.clock;
    this.ctx = { world, rng, bus, config, clock: this.clock, engine: this };
    this.systems = [];
    this.timer = null;
    this.lastStep = 0;
    this.perf = { lastStepMs: 0, maxStepMs: 0 };
  }

  use(system) {
    this.systems.push(system);
    this.#safe(system, 'init');
    return this;
  }

  getSystem(name) {
    return this.systems.find((s) => s.name === name);
  }

  start() {
    this.lastStep = performance.now();
    this.timer = setInterval(() => this.step(), this.ctx.config.time.simTickMs);
    console.log(`[engine] başladı, ${this.systems.length} sistem: ${this.systems.map((s) => s.name).join(', ')}`);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  step() {
    const t0 = performance.now();
    // Sunucu takılırsa (GC, debugger) dünyanın birden ileri sarmaması için sınırla
    const realMs = Math.min(t0 - this.lastStep, 1000);
    this.lastStep = t0;

    for (const time of this.clock.advance(realMs)) {
      if (time.hour === 0) {
        for (const s of this.systems) this.#safe(s, 'onDay', time);
      }
      for (const s of this.systems) this.#safe(s, 'onHour', time);
      this.ctx.bus.emit('clock:hour', time);
    }

    const dt = realMs / 1000;
    for (const s of this.systems) this.#safe(s, 'onTick', dt);

    this.perf.lastStepMs = performance.now() - t0;
    this.perf.maxStepMs = Math.max(this.perf.maxStepMs, this.perf.lastStepMs);
  }

  /**
   * Hızlı ileri sarma (sunucu uyurken geçen süre): her oyun saati 10 kaba adımda simüle edilir,
   * ağ yayını yapılmaz. Döndürür: simüle edilen saat.
   */
  fastForward(hours) {
    if (!(hours > 0)) return 0;
    const sub = 10;
    const ms = this.ctx.config.time.msPerGameHour / sub;
    const quiet = this.systems.filter((s) => s.name !== 'network');
    for (let h = 0; h < hours; h++) {
      for (let k = 0; k < sub; k++) {
        for (const time of this.clock.advance(ms)) {
          if (time.hour === 0) for (const s of quiet) this.#safe(s, 'onDay', time);
          for (const s of quiet) this.#safe(s, 'onHour', time);
        }
        for (const s of quiet) this.#safe(s, 'onTick', ms / 1000);
      }
    }
    const w = this.ctx.world;
    w.dirtyBuildings.clear(); w.dirtyPlayers.clear(); w.dirtyTiles.clear();
    return hours;
  }

  // Bir sistemin hatası tüm dünyayı durdurmasın
  #safe(system, method, arg) {
    const fn = system[method];
    if (typeof fn !== 'function') return;
    try {
      method === 'init' ? fn.call(system, this.ctx) : fn.call(system, arg, this.ctx);
    } catch (err) {
      console.error(`[${system.name ?? 'system'}.${method}]`, err);
    }
  }
}
