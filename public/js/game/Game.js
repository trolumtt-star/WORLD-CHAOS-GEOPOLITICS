import * as THREE from 'three';
import { EVENTS } from '../../shared/events.js';
import { SceneKit } from '../render/SceneSetup.js';
import { CityRenderer } from '../render/CityRenderer.js';
import { Effects, missilePosAt } from '../render/Effects.js';
import { EntityManager } from '../entities/EntityManager.js';
import { CameraRig } from '../input/CameraRig.js';
import { Controls } from '../input/Controls.js';
import { PlayerController } from './PlayerController.js';
import { GameUI } from '../ui/GameUI.js';
import { isTouch } from '../core/Settings.js';
import { tl } from '../core/dom.js';

/** Bir oyun oturumu: sahne + ağ olayları + arayüz + döngü. */
export class Game {
  constructor(app, init) {
    this.app = app;
    this.net = app.net;
    this.audio = app.audio;
    this.init = init;
    this.selfId = init.selfId;
    this.handlers = [];
    this.running = true;
    this.lastWarAt = 0;
    this.targeting = null;
    this.inspecting = null;
    this.build();
  }

  build() {
    const { init, app } = this;
    const kit = (this.kit = new SceneKit(app.renderer, { worldSize: init.world.size }));
    this.effects = new Effects(kit.scene, kit.camera, app.renderer, this.audio);

    this.roster = new Map();
    for (const r of init.leaderboard) this.roster.set(r.id, { ...r });
    for (const p of init.players) this.roster.set(p.id, { ...this.roster.get(p.id), ...p, online: true });
    const colors = new Map([...this.roster.values()].map((r) => [r.id, r.color]));

    this.city = new CityRenderer(kit.scene, init.world, [], { effects: this.effects, tiles: init.tiles, playerColors: colors });
    for (const r of init.leaderboard) this.city.playerEras.set(r.id, r.era ?? 1);
    for (const b of init.buildings) this.city.upsert(b);

    const ents = (this.entities = new EntityManager(kit.scene, this.selfId));
    for (const p of init.players) ents.addPlayer(p);
    for (const n of init.npcs) ents.addNpc(n);
    ents.applyNpcs(init.npcSnapshot);
    for (const u of init.units) ents.addUnit(u);
    for (const v of init.vehicles) ents.addVehicle(v);
    for (const m of init.missiles) this.effects.addMissile(m);
    this.effects.setHazards(init.hazards);
    this.hazards = init.hazards;

    this.self = ents.getPlayer(this.selfId);
    const touch = isTouch();

    this.rig = new CameraRig(kit.camera, app.renderer.domElement, {
      onTap: (e) => this.onTap(e),
      // Hedefleme modunda ya da panel açıkken imleç serbest kalsın
      canLock: () => !this.targeting && !this.ui.sheetKind,
    });
    this.onLockChange = () => this.ui.setPointerLock(document.pointerLockElement === app.renderer.domElement);
    document.addEventListener('pointerlockchange', this.onLockChange);
    this.rig.snap(this.self.g.position);
    this.controls = new Controls(app.ui, {
      touch,
      onKey: (code) => {
        if (code === 'KeyE') this.interact();
        if (code === 'Escape') { this.cancelTargeting(); this.ui.closeSheet(); }
        if (code === 'KeyM') this.ui.openMilitary(this.myUnits().length);
        if (code === 'KeyB') this.openProperties();
        if (code === 'KeyC') this.ui.openCity('city');
      },
    });
    this.controller = new PlayerController({
      object: this.self.g,
      rig: this.rig,
      controls: this.controls,
      getColliders: () => this.city.colliders,
      bounds: init.world.half + init.world.roadWidth,
      speed: init.config.playerSpeed,
      sprintMultiplier: init.config.sprintMultiplier,
      onMove: (x, z, r) => this.net.sendMove(x, z, r),
      audio: this.audio,
    });

    this.ui = new GameUI(app.ui, {
      catalog: init.catalog,
      world: init.world,
      selfId: this.selfId,
      room: init.room,
      touch,
      audio: this.audio,
      handlers: {
        onAction: (a) => this.runAction(a),
        onInspect: (kind, id) => this.inspect(kind, id),
        onInteract: () => this.interact(),
        onProperties: () => this.openProperties(),
        onMenu: () => this.openMenu(),
        onSprintToggle: () => (this.controls.sprintToggle = !this.controls.sprintToggle),
        onTargetMissile: (type, def) => this.startTargeting({ kind: 'missile', type, def }),
        onTargetMove: () => this.startTargeting({ kind: 'move' }),
        myUnitCount: () => this.myUnits().length,
        onSheetClosed: () => { this.inspecting = null; },
      },
    });
    this.ui.minimap.setBuildings(this.cityData());
    this.ui.minimap.setTiles(this.city.tiles, this.city.playerColors);
    this.ui.setSelf(init.self);
    this.ui.balanceShown = init.self.balance;
    this.ui.setCity(init);
    this.applyClock(init);

    // Hedef işaretçisi
    this.marker = new THREE.Mesh(new THREE.RingGeometry(3, 4, 40), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 30;
    kit.scene.add(this.marker);
    this.adRings = [];

    this.bindNet();
    this.audio.setMusic('game');
    this.audio.startAmbience();
    this.ui.toast(`🌍 ${init.room.name} · Oda kodu ${init.room.code}`, 'info');
    if (!init.self.owned.length) setTimeout(() => this.ui.toast('İpucu: Kırmızı SATILIK tabelalı bir arsayı incele ve tapusunu al! 🔑', 'info'), 3500);

    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.miniTimer = 0;
    this.hintTimer = 0;
    this.inspectTimer = 0;
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  cityData() {
    const m = new Map();
    for (const [id, e] of this.city.entries) m.set(id, e.data);
    return m;
  }

  myUnits() { return [...this.entities.units.values()].filter((u) => u.ownerId === this.selfId); }

  // ------------------------------------------------------------------ ağ
  on(event, fn) {
    this.net.on(event, fn);
    this.handlers.push([event, fn]);
  }

  bindNet() {
    const E = EVENTS;
    this.on(E.SNAPSHOT, (s) => {
      this.entities.applyPlayers(s.p);
      if (s.n) this.entities.applyNpcs(s.n);
      if (s.u) this.entities.applyUnits(s.u);
      if (s.v) this.entities.applyVehicles(s.v);
    });
    this.on(E.PLAYER_JOINED, (p) => {
      this.roster.set(p.id, { ...this.roster.get(p.id), ...p, online: true });
      this.city.playerColors.set(p.id, p.color);
      this.entities.addPlayer(p);
      this.audio.play('notify');
    });
    this.on(E.PLAYER_LEFT, ({ id }) => {
      const r = this.roster.get(id);
      if (r) r.online = false;
      this.entities.removePlayer(id);
    });
    this.on(E.PLAYER_STATE, (s) => {
      const prev = this.ui.self;
      if (prev.jailed && !s.jailed) this.ui.toast('🔓 Özgürsün!', 'ok');
      if (!prev.jailed && s.jailed) this.audio.play('siren');
      this.ui.setSelf(s);
      this.controller.locked = s.jailed;
      if (this.ui.sheetKind === 'props') this.openProperties();
    });
    this.on(E.PLAYER_CORRECTION, ({ x, z, teleport }) => {
      this.controller.applyCorrection(x, z);
      if (teleport) this.rig.snap(this.self.g.position);
    });
    this.on(E.ENTITY_SPAWN, ({ kind, data }) => {
      if (kind === 'npc') this.entities.addNpc(data);
      else if (kind === 'unit') { this.entities.addUnit(data); if (data.ownerId === this.selfId) this.audio.play('build'); }
      else if (kind === 'vehicle') this.entities.addVehicle(data);
    });
    this.on(E.ENTITY_REMOVE, ({ kind, id, reason }) => {
      if (kind === 'npc') this.entities.removeNpc(id);
      else if (kind === 'unit') this.entities.removeUnit(id);
      else if (kind === 'vehicle') {
        const v = this.entities.removeVehicle(id);
        if (v && reason === 'destroyed') this.effects.explosion(v.g.position.x, 1, v.g.position.z, 0.6);
      }
    });
    this.on(E.BUILDING_UPDATE, (list) => {
      for (const b of list) {
        const prev = this.city.get(b.id);
        this.city.upsert(b);
        if (prev && !prev.destroyed && b.destroyed) {
          this.effects.explosion(b.x, b.height * 0.4, b.z, 1.6);
          for (let i = 0; i < 12; i++) this.effects.smoke(b.x + (Math.random() - 0.5) * 12, 2, b.z + (Math.random() - 0.5) * 12, 2, true);
        }
        if (prev?.construction && !b.construction && !b.destroyed && b.ownerId === this.selfId) {
          this.ui.toast(`🏗️ ${b.name} hizmete açıldı!`, 'ok');
        }
      }
      this.ui.minimap.setBuildings(this.cityData());
    this.ui.minimap.setTiles(this.city.tiles, this.city.playerColors);
      this.refreshInspectSoon();
    });
    this.on(E.TERRITORY, (list) => {
      const mine = list.some(([, , owner]) => owner === this.selfId);
      this.city.setTiles(list);
      this.ui.minimap.setTiles(this.city.tiles, this.city.playerColors);
      if (mine) this.effects.built(this.self.g.position.x, this.self.g.position.z);
    });
    this.on(E.FX, (list) => {
      for (const f of list) {
        if (f.t === 'shot') { this.effects.tracer(f.a, f.b, f.k); this.lastWarAt = performance.now(); }
        else if (f.t === 'melee') { this.effects.melee(f.a, f.b); this.lastWarAt = performance.now(); }
        else if (f.t === 'explosion') this.effects.explosion(f.x, 1.5, f.z, f.r / 6);
        else if (f.t === 'alarm') this.effects.alarm(f.x, f.z);
        else if (f.t === 'built') this.effects.built(f.x, f.z);
      }
    });
    this.on(E.MISSILE, (m) => {
      this.lastWarAt = performance.now();
      if (m.t === 'launch') this.effects.addMissile(m);
      else if (m.t === 'intercept') this.effects.intercept(m);
      else if (m.t === 'destroyed') this.effects.missileDestroyed(m.id, m.x, m.y, m.z);
      else if (m.t === 'miss') this.effects.explosion(m.x, m.y, m.z, 0.3, { sound: false });
      else if (m.t === 'impact') this.effects.impact(m);
      else if (m.t === 'hazards') { this.hazards = m.hazards; this.effects.setHazards(m.hazards); }
    });
    this.on(E.ALERT, (a) => {
      this.ui.alert(a);
      if (a.level === 'nuclear') this.audio.play('siren', { minGap: 0, important: true });
      else this.audio.play('notify');
    });
    this.on(E.CLOCK, (c) => {
      this.applyClock(c);
      this.ui.setCity(c);
      let erasChanged = false;
      for (const r of c.leaderboard) {
        this.roster.set(r.id, { ...this.roster.get(r.id), ...r });
        if (this.city.playerEras.get(r.id) !== r.era) { this.city.playerEras.set(r.id, r.era); erasChanged = true; }
        if (!this.city.playerColors.has(r.id)) { this.city.playerColors.set(r.id, r.color); erasChanged = true; }
      }
      if (erasChanged) this.city.scheduleRebuild();
    });
    this.on(E.NEWS, (n) => this.ui.news(n));
    this.on('disconnect', () => this.ui.setReconnecting(true));
    this.on('connect', () => this.app.rejoin());
  }

  applyClock(c) {
    this.clockBase = { ...c.clock, at: performance.now() };
  }

  // ------------------------------------------------------------------ etkileşim
  async inspect(kind, id) {
    const data = await this.net.inspect(kind, id);
    if (!data) return;
    this.inspecting = { kind, id };
    this.rig.unlock();
    this.ui.showInspect(data);
    this.showRangeFor(kind === 'building' ? this.city.get(id) : null);
  }

  refreshInspectSoon() {
    if (!this.inspecting || this._refreshQueued) return;
    this._refreshQueued = true;
    setTimeout(async () => {
      this._refreshQueued = false;
      if (!this.inspecting || !this.ui.sheetKind?.startsWith('inspect')) return;
      const data = await this.net.inspect(this.inspecting.kind, this.inspecting.id);
      if (data && this.ui.sheetKind?.startsWith('inspect')) this.ui.showInspect(data);
    }, 250);
  }

  showRangeFor(b) {
    for (const r of this.adRings) this.kit.scene.remove(r);
    this.adRings = [];
    if (b?.type !== 'air_defense') return;
    const R = this.init.config.airDefenseRange;
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 1, R, 64), new THREE.MeshBasicMaterial({ color: 0x3dff8a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(b.x, 0.5, b.z);
    this.kit.scene.add(ring);
    this.adRings.push(ring);
  }

  interact() {
    const p = this.self.g.position;
    const b = this.city.nearestBuilding(p.x, p.z, 32);
    if (b) this.inspect('building', b.id);
    else this.ui.toast('Yakında bina yok. Bir binanın kapısına yaklaş ya da dokun.', 'warn');
  }

  openProperties() {
    const list = (this.ui.self.owned ?? []).map((id) => this.city.get(id)).filter(Boolean)
      .sort((a, b) => (b.type === 'town_hall') - (a.type === 'town_hall') || (a.type === 'land') - (b.type === 'land'));
    this.ui.openProperties(list);
  }

  openMenu() {
    this.ui.menu([
      { label: '⚙️ Ayarlar', onClick: () => { this.ui.closeSheet(); this.app.menu.openSettings(true); } },
      { label: `🔗 Davet Et (${this.init.room.code})`, onClick: () => this.ui.share() },
      { label: '🚪 Odadan Çık', style: 'danger', onClick: () => this.app.leaveGame() },
    ]);
  }

  async runAction(a) {
    if (a.ui === 'build') return this.ui.openBuild(a.params.buildingId);
    if (a.ui === 'military') return this.ui.openMilitary(this.myUnits().length);
    if (a.ui === 'missiles') return this.ui.openMilitary(this.myUnits().length);
    if (a.ui === 'tech') return this.ui.openTech();
    if (a.ui === 'map') return this.ui.openMap();
    if (a.ui === 'advertise') return this.ui.openAdvertise(a.params.buildingId);
    if (a.inspect) return this.inspect(a.inspect.kind, a.inspect.id);

    const params = { ...(a.params ?? {}) };
    if (a.confirm && !(await this.ui.confirm(a.confirm))) return;
    if (a.input) {
      const values = await this.ui.form(a.input);
      if (!values) return;
      Object.assign(params, values);
    }
    const res = await this.net.action(a.type, params);
    if (res?.ok) {
      this.audio.play(res.sfx ?? 'success');
      if (res.message) this.ui.toast(res.message, 'ok');
      if (a.type === 'property:build') this.ui.closeSheet();
    } else {
      this.audio.play('error');
      this.ui.toast(res?.error ?? 'Olmadı.', 'err');
    }
    if (this.inspecting) this.refreshInspectSoon();
    return res;
  }

  // ------------------------------------------------------------------ hedefleme
  startTargeting(t) {
    this.rig.unlock();
    this.ui.closeSheet();
    this.targeting = { ...t, point: null };
    this.rig.setStrategic(true);
    const label = t.kind === 'missile'
      ? `${t.def.icon} ${t.def.label} (${tl(t.def.cost)}) — haritada hedefe dokun`
      : `🎯 ${this.myUnits().length} birlik — haritada konuşlanma noktasına dokun`;
    this.ui.setTargeting(label, { onCancel: () => this.cancelTargeting() });
  }

  cancelTargeting() {
    if (!this.targeting) return;
    this.targeting = null;
    this.marker.visible = false;
    this.rig.setStrategic(false);
    this.ui.setTargeting(null);
  }

  async confirmTargeting() {
    const t = this.targeting;
    if (!t?.point) return;
    const { x, z } = t.point;
    let res;
    if (t.kind === 'missile') res = await this.runAction({ type: 'military:launch', params: { missileType: t.type, x, z } });
    else res = await this.runAction({ type: 'military:move', params: { x, z } });
    if (res?.ok) this.cancelTargeting();
  }

  groundPoint(e) {
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.kit.camera);
    const hit = this.raycaster.intersectObject(this.city.ground, false)[0];
    return hit ? hit.point : null;
  }

  onTap(e) {
    if (this.targeting) {
      const p = this.groundPoint(e);
      if (!p) return;
      this.targeting.point = { x: p.x, z: p.z };
      this.marker.position.set(p.x, 0.6, p.z);
      const r = this.targeting.kind === 'missile' ? this.targeting.def.radius : 4;
      this.marker.scale.setScalar(r / 4);
      this.marker.visible = true;
      this.audio.play('click');
      const label = this.targeting.kind === 'missile' ? `${this.targeting.def.icon} Hedef kilitlendi! Fırlatılsın mı?` : '🎯 Konuşlanma noktası seçildi.';
      this.ui.setTargeting(label, { canConfirm: true, onConfirm: () => this.confirmTargeting(), onCancel: () => this.cancelTargeting() });
      return;
    }
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.kit.camera);
    const hits = this.raycaster.intersectObjects([...this.entities.pickables, ...this.city.pickables], false)
      .filter((h) => h.object.userData?.kind && isVisible(h.object));
    const npc = this.entities.pickNpc(this.raycaster);
    let best = hits[0] ? { ...hits[0].object.userData, distance: hits[0].distance } : null;
    if (npc && (!best || npc.distance < best.distance + 2)) best = npc;
    if (best) {
      this.audio.play('soft');
      this.inspect(best.kind, best.id);
      return;
    }
    // Boş zemine dokunuldu: o parselin bilgisi (keşif / sahiplen)
    const p = this.groundPoint(e);
    const w = this.init.world;
    if (p && Math.abs(p.x) < w.half && Math.abs(p.z) < w.half) {
      const i = Math.floor((p.x + w.half) / w.blockSize);
      const j = Math.floor((p.z + w.half) / w.blockSize);
      this.audio.play('soft');
      this.inspect('tile', `${i},${j}`);
    } else this.ui.closeSheet();
  }

  // ------------------------------------------------------------------ döngü
  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const kit = this.kit;

    this.controller.update(dt);
    const shake = this.effects.update(dt);
    this.rig.update(dt, this.self.g.position, shake);
    this.entities.update(dt, this.self.g);
    this.city.update(dt, kit.camera, kit.night ?? 0);

    const cb = this.clockBase;
    const frac = Math.min(0.999, cb.minute / 60 + (performance.now() - cb.at) / this.init.config.msPerGameHour);
    const hourF = cb.hour + frac;
    kit.setTime(hourF);
    kit.followShadow(this.self.g.position.x, this.self.g.position.z);
    this.ui.setClock(cb.day, cb.hour, Math.floor(frac * 60));
    this.ui.tickBalance(dt);
    this.audio.setListener(this.self.g.position.x, this.self.g.position.z);
    this.audio.setMusic(performance.now() - this.lastWarAt < 25000 || this.effects.missiles.size ? 'war' : 'game');

    if (this.marker.visible) this.marker.rotation.z += dt * 2;

    this.miniTimer -= dt;
    if (this.miniTimer <= 0) {
      this.miniTimer = 0.2;
      const now = performance.now();
      this.ui.minimap.draw({
        selfId: this.selfId,
        self: this.self.g.position,
        yaw: this.rig.yaw,
        players: [...this.entities.players.values()].map((p) => ({ id: p.id, x: p.g.position.x, z: p.g.position.z, color: this.roster.get(p.id)?.color ?? '#fff' })),
        units: this.entities.unitPositions(),
        missiles: [...this.effects.missiles.values()].map((m) => ({ ...missilePosAt(m, now), to: m.to })),
        hazards: this.hazards,
      });
    }
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) {
      this.hintTimer = 0.3;
      const p = this.self.g.position;
      this.ui.setInteractHint(this.targeting ? null : this.city.nearestBuilding(p.x, p.z, 26));
    }
    // Açık inceleme panelini canlı tut (stok, kasa değişir)
    this.inspectTimer -= dt;
    if (this.inspectTimer <= 0) {
      this.inspectTimer = 3;
      if (this.inspecting && this.ui.sheetKind?.startsWith('inspect')) this.refreshInspectSoon();
    }

    this.app.renderer.render(kit.scene, kit.camera);
  }

  destroy() {
    this.running = false;
    document.removeEventListener('pointerlockchange', this.onLockChange);
    cancelAnimationFrame(this.raf);
    for (const [e, fn] of this.handlers) this.net.off(e, fn);
    this.ui.destroy();
    this.controls.dispose();
    this.rig.dispose();
    this.kit.dispose();
    this.audio.stopAmbience();
  }
}

function isVisible(o) {
  for (let x = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}
