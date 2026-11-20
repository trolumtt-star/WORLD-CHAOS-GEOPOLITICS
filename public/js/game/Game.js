import * as THREE from 'three';
import { textSprite } from '../render/geometry.js';
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
import { tl, el } from '../core/dom.js';
import { InteriorRenderer } from '../render/InteriorRenderer.js';
import { LifeUI } from '../ui/LifeUI.js';
import { VoiceChat } from '../net/VoiceChat.js';
import { setWeapon } from '../entities/EntityManager.js';
import { WEAPONS, canFoundAtTiles } from '../../shared/interiors.js';
import { PhoneUI } from '../ui/PhoneUI.js';
import { AdminUI } from '../ui/AdminUI.js';
import { MatchSim } from './MatchSim.js';
import { OUTFITS, CARS, HELIS, CLUBS, priceOf, AD_TIERS, adTier } from '../../shared/catalogs.js';

/** Bir oyun oturumu: sahne + ağ olayları + arayüz + döngü. */
/** Onay sorulmadan direkt yapılan satın almalar */
const NO_CONFIRM = new Set(['veh:buy', 'car:buy', 'car:rent', 'org:hire', 'org:found', 'org:hq', 'org:escort', 'org:payFor', 'org:ransom', 'ceo:hire', 'home:rent',
  'property:buy', 'property:build', 'territory:claim', 'outfit:buy', 'shop:buy', 'life:buy', 'weapon:buy', 'tech:buy', 'tech:research', 'military:train',
  'missile:buy', 'air:buy', 'shop:weapon', 'shop:order', 'business:advertise', 'war:independence', 'bank:loan', 'bank:repay', 'org:press']);

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
    colors.set('underworld', '#5a0a0a');

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

    this.interior = new InteriorRenderer(kit.scene);
    this.selfAttackT = 0;
    this.rig = new CameraRig(kit.camera, app.renderer.domElement, {
      onTap: (e) => this.onTap(e),
      onLockedClick: () => this.attack(),
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
        if (code === 'KeyF') this.attack();
        if (code === 'KeyQ') this.cycleWeapon();
        if (code === 'KeyV') this.toggleMic();
        if (code === 'KeyI') this.life.openBag();
        if (code === 'KeyP') this.phone.toggle();
        if (code === 'KeyG') this.toggleCar();
        if (code === 'Equal' || code === 'NumpadAdd') this.rig.zoomBy(0.8);
        if (code === 'Minus' || code === 'NumpadSubtract') this.rig.zoomBy(1.25);
      },
    });
    this.controller = new PlayerController({
      object: this.self.g,
      rig: this.rig,
      controls: this.controls,
      getColliders: () => (this.interior.active ? this.interior.colliders : this.city.colliders),
      getAnim: () => this.selfAnim(),
      getDrive: () => (this.ui.self.driving ? CARS[this.ui.self.driving]?.speed ?? 0 : 0),
      onInputWhilePosed: () => this.standUp(),
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
        onPin: (p) => this.setPin(p),
        nameOf: (id) => this.roster.get(id)?.name,
        onInteract: () => this.interact(),
        onProperties: () => this.openProperties(),
        onMenu: () => this.openMenu(),
        onSprintToggle: () => (this.controls.sprintToggle = !this.controls.sprintToggle),
        onTargetMissile: (type, def) => this.startTargeting({ kind: 'missile', type, def }),
        onTargetMove: () => this.startTargeting({ kind: 'move' }),
        onNation: () => this.openNation(),
        onPreviewAD: (buildingId, sub) => this.showRangeFor(this.city.get(buildingId), sub),
        onTargetAir: (type, def) => this.startTargeting({ kind: 'air', type, def }),
        onFound: () => this.runAction({ type: 'country:found', params: {}, input: { title: '🏳️ Ülkenin adı ne olsun?', fields: [{ key: 'name', label: 'Ülke adı', kind: 'text', value: `${this.roster.get(this.selfId)?.name ?? ''} Cumhuriyeti` }] } }),
        nameOf: (id) => this.roster.get(id)?.countryName ?? this.roster.get(id)?.name ?? id,
        myUnitCount: () => this.myUnits().length,
        onSheetClosed: () => { this.inspecting = null; },
        onPhone: () => this.phone.toggle(),
      },
    });
    this.life = new LifeUI(this.ui, {
      onAttack: () => this.attack(),
      onRansom: () => this.runAction({ type: 'org:ransom', params: {} }),
      onCycleWeapon: () => this.cycleWeapon(),
      onZoom: (f) => this.rig.zoomBy(f),
      onMic: () => this.toggleMic(),
      onExit: () => this.runAction({ type: 'building:exit', params: {} }),
      onShift: () => this.runAction({ type: this.ui.self.shift ? 'job:shiftEnd' : 'job:shiftStart', params: {} }),
      onGuests: () => this.runAction({ type: 'home:guests', params: { open: !this.city.get(this.ui.self.inside)?.guestsOpen && !this._guestsOpen } }).then((r) => { if (r?.ok) { this._guestsOpen = !this._guestsOpen; this.refreshInsideBar(); } }),
      onTask: () => this.startTask(),
      onStand: () => this.standUp(true),
      onConsume: (item) => this.runAction({ type: 'life:consume', params: { item } }),
      onEquip: (weapon) => this.runAction({ type: 'combat:equip', params: { weapon } }),
      onCar: () => this.toggleCar(),
      onCarState: () => this.updateCarButton(),
      onShoot: () => this.runAction({ type: 'match:shoot', params: {} }),
    });
    this.match = init.match ?? null;
    this.matchSim = new MatchSim();
    this.matchSim.setMatch(this.match);
    this.commentary = el('div', { class: 'commentary hidden' });
    this.ui.hud.append(this.commentary);
    this.matchSim.onEvent = (text) => {
      if (!this.watchingMatch()) return;
      this.commentary.textContent = `🎙️ ${text}`;
      this.commentary.classList.remove('hidden', 'pop');
      void this.commentary.offsetWidth;
      this.commentary.classList.add('pop');
      clearTimeout(this._comT);
      this._comT = setTimeout(() => this.commentary.classList.add('hidden'), 3500);
      if (text.includes('GOOOL')) this.audio.play('success', { important: true });
      else if (text.includes('Şut')) this.audio.play('whoosh', { vol: 0.5 });
    };
    this.phone = new PhoneUI(app.ui, {
      ui: this.ui,
      sfx: (n) => this.audio.play(n),
      action: (type, params) => this.runAction({ type, params }),
      runAction: (a) => this.runAction(a),
      roster: () => [...this.roster.values()],
      selfId: () => this.selfId,
      toast: (t, k) => this.ui.toast(t, k),
      confirm: (t) => this.ui.confirm(t),
      setBadge: (n) => this.ui.setPhoneBadge(n),
      onProperties: () => this.openProperties(),
      onBag: () => this.life.openBag(),
      onMenu: () => this.openMenu(),
      showOnMap: (pos) => this.showOnMap(pos),
      showBuildingType: (t) => this.showBuildingType(t),
      ensureMic: () => { if (!this.voice.enabled) this.toggleMic(); },
      takePhoto: () => this.takePhoto(),
      flash: () => { const f = el('div', { class: 'photo-flash' }); document.body.append(f); setTimeout(() => f.remove(), 400); },
      myShops: () => [...this.city.entries.values()].map((e) => e.data).filter((b) => b.ownerId === this.selfId && this.init.catalog.buildings[b.type]?.category === 'commercial'),
      icon: (t) => this.init.catalog.buildings[t]?.icon ?? '🏠',
      orgTargets: () => {
        const me = this.self.g.position;
        const cat = this.init.catalog.buildings;
        const buildings = [...this.city.entries.values()].map((e) => e.data).filter((b) => !b.destroyed && b.type !== 'land' && b.type !== 'park' && b.ownerId !== this.selfId)
          .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, 40)
          .map((b) => ({ id: b.id, label: `${cat[b.type]?.icon ?? '🏢'} ${b.name ?? cat[b.type]?.label} · ${Math.round(Math.hypot(b.x - me.x, b.z - me.z))} m` }));
        const players = [...this.roster.values()].filter((r) => !r.isAI && r.id !== this.selfId).map((r) => ({ id: r.id, label: `👤 ${r.name}` }));
        const vehicles = [...this.entities.units.values()].filter((u) => (u.type === 'pcar' || u.type === 'pheli') && u.ownerId !== this.selfId)
          .map((u) => ({ id: u.id, label: `${u.type === 'pheli' ? '🚁' : '🚗'} ${u.tag ?? ''} · ${(u.type === 'pheli' ? HELIS : CARS)[u.model]?.label ?? u.model} · ${Math.round(Math.hypot(u.g.position.x - me.x, u.g.position.z - me.z))} m` }));
        return { buildings, players, vehicles };
      },
      flyHeli: (unitId) => { const u = this.entities.units.get(unitId); if (u) this.pickLanding(u); },
      showNearest: (type) => this.showBuildingType?.(type) ?? this.ui.toast('Haritada 🏭 depoları ara.', 'info'),
      hourNow: () => (this.clockBase.day - 1) * 24 + this.clockBase.hour,
      isOwner: () => !!this.init.isOwner,
      openAdmin: () => this.admin.open(),
    });
    this.admin = new AdminUI(app.ui, { action: (t, p) => this.net.action(t, p), toast: (t, k) => this.ui.toast(t, k), sfx: (n) => this.audio.play(n) });
    this.phone.setMatch(this.match);
    this.voice = new VoiceChat({
      audio: this.audio,
      range: init.config.voiceRange ?? 45,
      send: (b64) => this.net.sendVoice(b64),
      onSpeaking: (id) => { const e = this.entities.getPlayer(id); if (e) e.talkUntil = performance.now() + 350; },
      onTalking: (on) => { this.life.setMic(this.voice.enabled, on); const e = this.entities.getPlayer(this.selfId); if (e && on) e.talkUntil = performance.now() + 350; },
    });
    this.ui.minimap.setBuildings(this.cityData());
    this.ui.minimap.setTiles(this.city.tiles, this.city.playerColors);
    this.ui.setSelf(init.self);
    this.applySelf(init.self, {});
    this.ui.balanceShown = init.self.balance;
    this.ui.setCity(init);
    this.applyClock(init);

    // Hedef işaretçisi
    this.marker = new THREE.Mesh(new THREE.RingGeometry(3, 4, 40), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 30;
    kit.scene.add(this.marker);
    // Harita işareti: gökyüzüne uzanan kırmızı ışık sütunu
    this.pinBeam = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 60, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xff2d3c, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3, 32), new THREE.MeshBasicMaterial({ color: 0xff2d3c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4;
    this.pinBeam.add(beam, ring);
    this.pinBeam.visible = false;
    kit.scene.add(this.pinBeam);
    this.pinChip = el('button', { class: 'pin-chip hidden', onClick: (e) => { e.stopPropagation(); this.setPin(null); } });
    this.ui.hud.append(this.pinChip);
    try { const sp = JSON.parse(localStorage.getItem(`wc_pin_${init.room.code}`) || 'null'); if (sp) this.setPin(sp, true); } catch { /* yok */ }
    this.adRings = [];

    this.bindNet();
    this.audio.setMusic('game');
    this.audio.startAmbience();
    this.ui.toast(`🌍 ${init.room.name} · Oda kodu ${init.room.code}`, 'info');
    if (!init.self.village) {
      const job = this.city.entries.get(init.self.jobBuildingId)?.data;
      setTimeout(() => this.ui.toast(`🧳 ${init.self.citizenName ?? 'Bu ülkenin'} vatandaşısın. ${init.self.rent ? `Kiradaki evinin önündesin (günlük ${tl(init.self.rent.amount)}).` : 'Evinin önündesin.'}`, 'info'), 2200);
      if (job) setTimeout(() => { this.ui.toast(`👔 İşin hazır: ${job.name}. Mesai saatinde git, içeride "Mesaiye Başla" de. Beğenmezsen başka iş bulabilirsin.`, 'info'); }, 4600);
      setTimeout(() => this.ui.toast('🏳️ Kendi ülkeni kurmak için sınırlardan uzak, boş bir bölgeye yürü. ÜLKE KUR butonu orada çıkacak.', 'info'), 7000);
    }

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

  myUnits() { return [...this.entities.units.values()].filter((u) => u.ownerId === this.selfId && !u.g.userData.air && u.type !== 'scout'); }

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
      const before = { ...this.ui.self };
      this.ui.setSelf(s);
      this.applySelf(s, before);
      if (this.ui.sheetKind === 'props') this.openProperties();
    });
    this.on(E.PLAYER_CORRECTION, ({ x, z, teleport, rotY }) => {
      this.controller.applyCorrection(x, z, teleport ? rotY : undefined);
      if (teleport) this.rig.snap(this.self.g.position);
    });
    this.on('match:update', (m) => {
      this.match = m;
      this.matchSim.setMatch(m);
      this.phone.setMatch(m);
      this.interior.setMatch?.(m);
      this.refreshShootBtn();
    });
    this.on('social:new', (p) => {
      this.lastAd = p.boost ? p : this.lastAd;
      this.socialFeed = [p, ...(this.socialFeed ?? [])].slice(0, 10);
      if (p.authorId !== this.selfId) this.ui.toast(`📸 ${p.author} paylaştı${p.boost ? ' (sponsorlu)' : ''}: ${p.caption.slice(0, 40)}`, 'info');
    });
    this.on('player:look', ({ id, outfit }) => this.entities.setOutfit(id, outfit));
    this.on('phone:msg', (m) => this.phone.onMessage(m));
    this.on('phone:ring', (r) => this.phone.incoming(r));
    this.on('phone:call', (c) => {
      if (c.state === 'on' || c.state === 'join') { this.ui.toast(`📞 ${c.name} görüşmeye katıldı! 🎙️`, 'ok'); if (!this.voice.enabled) this.toggleMic(); }
      else if (c.state === 'declined') this.ui.toast(`📵 ${c.name} meşgule attı.`, 'warn');
      else if (c.state === 'noanswer') this.ui.toast(`📵 ${c.name} açmadı.`, 'warn');
      else if (c.state === 'left') this.ui.toast(`👋 ${c.name} görüşmeden ayrıldı.`, 'info');
      else this.ui.toast('📵 Görüşme bitti.', 'info');
    });
    this.on('voice:in', (m) => {
      const e = this.entities.getPlayer(m.id);
      this.voice.receive(m, e?.g.position);
    });
    this.on(E.ENTITY_SPAWN, ({ kind, data }) => {
      if (kind === 'npc') this.entities.addNpc(data);
      else if (kind === 'unit') { this.entities.addUnit(data); if (data.ownerId === this.selfId) this.audio.play('build'); }
      else if (kind === 'vehicle') this.entities.addVehicle(data);
    });
    this.on(E.ENTITY_REMOVE, ({ kind, id, reason }) => {
      if (kind === 'npc') this.entities.removeNpc(id, reason);
      else if (kind === 'unit') {
        const u = this.entities.removeUnit(id);
        if (u && reason === 'shot_down') this.effects.explosion(u.g.position.x, u.g.position.y, u.g.position.z, 1.2);
        else if (u && reason === 'destroyed' && u.type === 'gangcar') this.effects.explosion(u.g.position.x, 1, u.g.position.z, 0.8);
      }
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
        if (f.t === 'shot') { this.effects.tracer(f.a, f.b, f.k, f.ay); this.lastWarAt = performance.now(); }
        else if (f.t === 'airstrike') { this.effects.airstrike(f); this.lastWarAt = performance.now(); }
        else if (f.t === 'melee') { this.effects.melee(f.a, f.b); this.lastWarAt = performance.now(); }
        else if (f.t === 'explosion') this.effects.explosion(f.x, 1.5, f.z, f.r / 6);
        else if (f.t === 'alarm') this.effects.alarm(f.x, f.z);
        else if (f.t === 'sale') this.saleFx(f);
        else if (f.t === 'built') this.effects.built(f.x, f.z);
        else if (f.t === 'punch' || f.t === 'gun') this.combatFx(f);
        else if (f.t === 'robber') this.entities.setRobber(f.id, !!f.on);
        else if (f.t === 'goal') { this.interior.goalFx?.(f.side); if (this.interior.pitch) { this.audio.play('success', { important: true }); this.effects.built(this.self.g.position.x, this.self.g.position.z); } }
        else if (f.t === 'kick') { const e = this.entities.getPlayer(f.by); if (e) e.attackT = 0.3; }
      }
    });
    this.on(E.MISSILE, (m) => {
      this.lastWarAt = performance.now();
      if (m.t === 'launch') this.effects.addMissile(m);
      else if (m.t === 'intercept') this.effects.intercept(m);
      else if (m.t === 'destroyed') this.effects.missileDestroyed(m.id, m.x, m.y, m.z);
      else if (m.t === 'miss') this.effects.explosion(m.x, m.y, m.z, 0.3, { sound: false });
      else if (m.t === 'impact') this.effects.impact(m);
      else if (m.t === 'bomb') this.effects.dropBomb(m);
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
    this.on(E.NEWS, (n) => { this.ui.news(n); if (this.ui.self.tv) this.life.refreshTv(); });
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

  /** Hava savunma menzil halkası. preview: inşa etmeden önce kademeyi göster + mevcut kalkanlarını soluk çiz */
  showRangeFor(b, previewSub = null) {
    for (const r of this.adRings) this.kit.scene.remove(r);
    this.adRings = [];
    if (!b || (b.type !== 'air_defense' && !previewSub)) return;
    const ring = (x, z, R, color, op, fill) => {
      const w = Math.max(1.2, R / 90);
      const m = new THREE.Mesh(new THREE.RingGeometry(R - w, R, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.6, z);
      this.kit.scene.add(m); this.adRings.push(m);
      if (fill) {
        const d = new THREE.Mesh(new THREE.CircleGeometry(R - w, 96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fill, side: THREE.DoubleSide, depthWrite: false }));
        d.rotation.x = -Math.PI / 2; d.position.set(x, 0.5, z);
        this.kit.scene.add(d); this.adRings.push(d);
      }
    };
    const T = previewSub ? AD_TIERS[previewSub] : adTier(b);
    if (previewSub) {
      for (const id of this.ui.self.owned ?? []) {
        const o = this.city.get(id);
        if (o?.type === 'air_defense' && o.id !== b.id) ring(o.x, o.z, adTier(o).range, 0x3d9bff, 0.35, 0.04);
      }
    }
    ring(b.x, b.z, T.range, T.nuke ? 0xffcc33 : 0x3dff8a, 0.75, 0.08);
    if (previewSub) {
      this.ui.toast(`📡 ${T.label}: menzil ${T.range} m · isabet %${Math.round(T.hit * 100)}${T.nuke ? ' · ☢️ nükleer önler' : ''} (yeşil halka)`, 'info');
      clearTimeout(this._adPrevT);
      this._adPrevT = setTimeout(() => { if (!this.inspecting) this.showRangeFor(null); }, 20000);
    }
  }

  interact() {
    const p = this.self.g.position;
    if (this.interior.active) {
      const spot = this.interior.nearestSpot(p.x, p.z);
      if (spot) this.openSpot(spot);
      else this.ui.toast('Bir eşyanın yanına git (buzdolabı, yatak, kasa...).', 'warn');
      return;
    }
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
    // Satın almalarda "emin misin?" sorulmaz: tıkla, al
    if (a.confirm && !NO_CONFIRM.has(a.type) && !(await this.ui.confirm(a.confirm))) return;
    if (a.input) {
      const values = await this.ui.form(a.input);
      if (!values) return;
      Object.assign(params, values);
    }
    const res = await this.net.action(a.type, params);
    if (res?.quiet) {
      if (res.message) this.ui.toast(res.message, res.ok ? 'ok' : 'err');
      return res;
    }
    if (res?.ok) {
      this.audio.play(res.sfx ?? 'success');
      if (res.entered || res.exited) this.ui.closeSheet();
      if (res.message) this.ui.toast(res.message, 'ok');
      if (a.type === 'property:build') this.ui.closeSheet();
    } else {
      this.audio.play('error');
      this.ui.toast(res?.error ?? 'Olmadı.', 'err');
      if (res?.hint) {
        this.marker.position.set(res.hint.x, 0.6, res.hint.z);
        this.marker.scale.setScalar(5);
        this.marker.visible = true;
        clearTimeout(this._hintT);
        this._hintT = setTimeout(() => { if (!this.targeting) this.marker.visible = false; }, 20000);
      }
    }
    if (res?.founded) {
      this.marker.visible = false;
      this.rig.snap(this.self.g.position);
      this.effects.built(this.self.g.position.x, this.self.g.position.z);
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
    const label = t.kind === 'missile' || t.kind === 'air'
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
    else if (t.kind === 'air') res = await this.runAction({ type: 'air:launch', params: { airType: t.type, x, z } });
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
      const r = this.targeting.kind === 'missile' ? this.targeting.def.radius : this.targeting.kind === 'air' ? (this.targeting.def.radius ?? (this.targeting.type === 'b2' ? 120 : 30)) : 4;
      this.marker.scale.setScalar(r / 4);
      this.marker.visible = true;
      this.audio.play('click');
      const label = this.targeting.kind === 'missile' ? `${this.targeting.def.icon} Hedef kilitlendi! Fırlatılsın mı?` : this.targeting.kind === 'air' ? `${this.targeting.def.icon} Hedef kilitlendi! Uçak kalksın mı?` : '🎯 Konuşlanma noktası seçildi.';
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

  // ------------------------------------------------------------------ gündelik hayat
  applySelf(s, before) {
    this.controller.locked = (!!s.jailed && !s.myCase) || !!s.dead || (s.pose === 'sleep' && s.energy < 15) || !!s.rideWith || !!s.myCase || !!s.veh?.flying;
    this.life.set(s);
    if ((s.inside ?? null) !== (before.inside ?? null)) {
      if (s.inside) this.enterInterior(s.inside);
      else this.leaveInterior();
    }
    if (s.shift?.task?.spotId !== before.shift?.task?.spotId) {
      this.interior.setTask(s.shift?.task?.spotId ?? null);
      this.task = null;
    }
    if (s.dead && !before.dead) { this.audio.play('death', { important: true }); this.ui.closeSheet(); }
    if (s.incident && !before.incident) this.audio.play('siren');
    if (s.tv && !before.tv) this.interior.setTv(['📺 HABERLER', this.ui.newsLog[0]?.text?.slice(0, 30) ?? 'Şehirde bugün']);
    this.incidentNpc = s.incident?.npcId ?? null;
    this.phone.setSelf({ ...this.ui.self });
    this.ui.setCountryBar(!!s.village);
    this.controller.noclip = !!s.admin?.fly;
    const me = this.entities.getPlayer(this.selfId);
    if (me) this.entities.setCar(me, s.driving ?? '');
    if (s.tv && !before.tv) this.enterTv();
    const inStadium = this.city.get(s.inside)?.type === 'stadium';
    if (inStadium && s.pose === 'sit' && before.pose !== 'sit' && this.interior.pitch) {
      const p = this.self.g.position;
      this.rig.setFirstPerson({ x: p.x, y: 6.5, z: p.z + 1 }, { x: this.interior.pitch.x, y: 0, z: this.interior.pitch.z });
      this.self.g.visible = false;
    }
    if (inStadium && before.pose === 'sit' && s.pose !== 'sit') { this.rig.setFirstPerson(null); this.self.g.visible = true; }
    if (!s.tv && before.tv) { this.rig.setFirstPerson(null); this.self.g.visible = true; }
    if (s.outfit && JSON.stringify(s.outfit) !== JSON.stringify(before.outfit ?? {}) && before.outfit !== undefined) this.entities.setOutfit(this.selfId, s.outfit);
    this.refreshShootBtn();
  }

  refreshShootBtn() {
    const M = this.match, s = this.ui.self;
    const on = M?.status === 'live' && (M.roster.h.includes(this.selfId) || M.roster.a.includes(this.selfId)) && this.city.get(s.inside)?.type === 'stadium';
    this.life?.shootBtn.classList.toggle('hidden', !on);
  }

  /** Yakında sürücüsü olan bir araba varsa ona bin */
  nearbyRide() {
    const s = this.ui.self;
    if (s.driving || s.rideWith || s.inside) return null;
    const me = this.self.g.position;
    let best = null, bd = 9;
    for (const e of this.entities.players.values()) {
      if (e.id === this.selfId || !e.car || !e.g.visible) continue;
      const d = Math.hypot(e.g.position.x - me.x, e.g.position.z - me.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Yakındaki park halindeki araçlar: kendi arabam / helikopterim / başkasınınki (çalınabilir) */
  nearbyParked() {
    const me = this.self.g.position;
    let mineCar = null, mineHeli = null, other = null, dc = 9, dh = 12, dor = 6;
    for (const u of this.entities.units.values()) {
      if (u.type !== 'pcar' && u.type !== 'pheli') continue;
      const d = Math.hypot(u.g.position.x - me.x, u.g.position.z - me.z);
      if (u.ownerId === this.selfId) { if (u.type === 'pcar' && d < dc) { dc = d; mineCar = u; } if (u.type === 'pheli' && d < dh && u.g.position.y < 1) { dh = d; mineHeli = u; } }
      else if (d < dor) { dor = d; other = u; }
    }
    return { mineCar, mineHeli, other };
  }

  updateCarButton() {
    const s = this.ui.self;
    const b = this.life?.carBtn;
    if (!b) return;
    if (s.veh?.flying) { b.classList.add('hidden'); return; }
    const ride = this.nearbyRide();
    const P = s.inside ? {} : this.nearbyParked();
    const garage = (s.veh?.cars ?? s.cars ?? []).find((c) => !c.parked);
    const mode = s.rideWith ? 'leave' : s.driving ? 'park' : ride ? 'ride' : P.mineCar ? 'drive' : P.mineHeli ? 'heli' : P.other ? 'steal' : garage && !s.inside ? 'summon' : null;
    b.classList.toggle('hidden', !mode);
    b.classList.toggle('on', mode === 'park' || mode === 'leave');
    b.classList.toggle('danger', mode === 'steal');
    b.textContent = { leave: '🚪', park: '🅿️', ride: '🚕', drive: '🚗', heli: '🚁', steal: '🔓', summon: '🚗' }[mode] ?? '🚗';
    b.title = { leave: 'Arabadan in', park: 'Park et (kilitli kalır)', ride: `${this.roster.get(ride?.id)?.name ?? ''} arabasına bin`, drive: 'Arabana bin', heli: 'Helikoptere bin, iniş yeri seç', steal: 'Aracı çal', summon: 'Garajdaki arabanı getir' }[mode] ?? '';
  }

  toggleCar() {
    const s = this.ui.self;
    if (s.rideWith) return this.runAction({ type: 'car:leave', params: {} });
    if (s.driving) return this.runAction({ type: 'car:park', params: {} });
    const ride = this.nearbyRide();
    if (ride) return this.runAction({ type: 'car:ride', params: { driverId: ride.id } });
    const P = s.inside ? {} : this.nearbyParked();
    if (P.mineCar) return this.runAction({ type: 'car:drive', params: { model: P.mineCar.model } });
    if (P.mineHeli) return this.pickLanding(P.mineHeli);
    if (P.other) return this.runAction({ type: 'veh:steal', params: { unitId: P.other.id }, confirm: `Bu ${P.other.type === 'pheli' ? 'helikopteri' : 'arabayı'} çalmaya çalışılsın mı? Kilitliyse alarm çalabilir, aranırsın.` });
    const garage = (s.veh?.cars ?? s.cars ?? []).find((c) => !c.parked);
    if (!garage) return this.ui.toast('🚗 Araban yok. Telefon › 🏎️ Galeri\'den al.', 'info');
    return this.runAction({ type: 'car:drive', params: { model: garage.model } });
  }

  /** Helikopter: haritadan iniş yeri seç, oraya uç */
  pickLanding(u) {
    this.ui.toast('🚁 Haritada iniş yerine dokun.', 'info');
    this.ui.worldMap.open({ pick: (x, z) => this.runAction({ type: 'heli:fly', params: { unitId: u.id, x, z } }) });
  }

  /** Kasada satış: "+₺12" havaya yükselir, yakındaysan kasa sesi */
  saleFx(f) {
    const p = this.self.g.position;
    if (Math.hypot(f.x - p.x, f.z - p.z) > 40) return;
    const s = textSprite(`+${tl(f.v)}`, { color: '#3ddc84', border: '#3ddc84', scale: 0.7 });
    s.position.set(f.x, 3.4, f.z);
    s.material.depthTest = false;
    s.renderOrder = 40;
    this.kit.scene.add(s);
    this.floaters = this.floaters ?? [];
    this.floaters.push({ s, t: 0 });
    this.audio.play(f.by === this.selfId ? 'cash' : 'soft');
    if (f.by === this.selfId) this.ui.toast(`💰 Müşteriye sattın: +${tl(f.v)} kasaya, %10 prim cebine.`, 'ok');
  }

  /** Harita işareti (waypoint) koy / kaldır */
  setPin(p, silent) {
    this.pin = p ? { x: p.x, z: p.z, label: p.label ?? '📍 İşaret' } : null;
    this.ui.minimap.pin = this.pin;
    this.pinBeam.visible = !!this.pin;
    if (this.pin) this.pinBeam.position.set(this.pin.x, 0, this.pin.z);
    this.pinChip.classList.toggle('hidden', !this.pin);
    try { localStorage.setItem(`wc_pin_${this.init.room.code}`, JSON.stringify(this.pin)); } catch { /* yok */ }
    if (!silent) this.ui.toast(this.pin ? `📍 ${this.pin.label} işaretlendi. Kırmızı ışık sütununu takip et!` : '📍 İşaret kaldırıldı.', 'info');
    this.updatePinChip();
  }

  updatePinChip() {
    if (!this.pin) return;
    const p = this.self.g.position;
    const dx = this.pin.x - p.x, dz = this.pin.z - p.z, d = Math.hypot(dx, dz);
    if (d < 7 && !this.interior.active) { this.ui.toast(`✅ Vardın: ${this.pin.label}`, 'ok'); return this.setPin(null, true); }
    // kameraya göre yön oku
    const ang = Math.atan2(dx, dz) - this.rig.yaw + Math.PI;
    this.pinChip.innerHTML = '';
    this.pinChip.append(el('i', { style: { transform: `rotate(${-ang}rad)` } }, '⬆'), el('span', {}, `${this.pin.label} · ${Math.round(d)} m`), el('small', {}, '✕'));
  }

  showOnMap(pos) {
    if (!pos) return;
    return this.setPin({ x: pos.x, z: pos.z, label: pos.label ?? (pos.name ? `📍 ${pos.name}` : '📍 Hedef') });
    this.marker.position.set(pos.x, 0.6, pos.z);
    this.marker.scale.setScalar(3);
    this.marker.visible = true;
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { if (!this.targeting) this.marker.visible = false; }, 60000);
    const p = this.self.g.position;
    const d = Math.round(Math.hypot(pos.x - p.x, pos.z - p.z));
    const dir = Math.atan2(pos.x - p.x, pos.z - p.z);
    const names = ['güney', 'güneydoğu', 'doğu', 'kuzeydoğu', 'kuzey', 'kuzeybatı', 'batı', 'güneybatı'];
    this.ui.toast(`📍 Hedef işaretlendi: ${names[((Math.round(dir / (Math.PI / 4)) % 8) + 8) % 8]} yönünde ~${d} m (kırmızı halka)`, 'info');
  }

  showBuildingType(type) {
    const p = this.self.g.position;
    let best = null, bd = Infinity;
    for (const { data: b } of this.city.entries.values()) {
      if (b.type !== type) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.showOnMap({ ...best.door, label: `${this.init.catalog.buildings[best.type]?.icon ?? '📍'} ${best.name}` }); else this.ui.toast('Bu dünyada öyle bir yer yok.', 'warn');
  }

  takePhoto() {
    try {
      this.app.renderer.render(this.kit.scene, this.kit.camera);
      const src = this.app.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 400; c.height = 225;
      const x = c.getContext('2d');
      const sw = src.width, sh = src.height, r = 16 / 9;
      const cw = sw / sh > r ? sh * r : sw, ch = sw / sh > r ? sh : sw / r;
      x.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, 400, 225);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) {
      console.warn(e);
      this.ui.toast('Fotoğraf çekilemedi.', 'err');
      return null;
    }
  }

  // ---- TV: koltuktan ekrana birinci şahıs bakış, ekranda canlı yayın
  enterTv() {
    const tv = this.interior.tvPos;
    if (!tv) return;
    const p = this.self.g.position;
    this.rig.setFirstPerson({ x: p.x, y: 3.1, z: p.z }, { x: tv.x, y: 2.4, z: tv.z });
    this.self.g.visible = false;
    this.tvSlide = 0;
    this.tvTimer = 0;
    this.drawTv();
  }

  watchingMatch() {
    return !!this.ui.self.tv || this.city.get(this.ui.self.inside)?.type === 'stadium';
  }

  drawTv() {
    const scr = this.interior.tvScreen;
    if (!scr) return;
    if (!this.tvCanvas) { this.tvCanvas = document.createElement('canvas'); this.tvCanvas.width = 512; this.tvCanvas.height = 288; this.tvTex = null; }
    const c = this.tvCanvas, x = c.getContext('2d');
    if (this.matchSim.live) {
      // CANLI MAÇ YAYINI: kuşbakışı saha + skor + spiker
      const M = this.match;
      x.fillStyle = '#0b1a0f'; x.fillRect(0, 0, 512, 288);
      this.matchSim.draw2D(x, 10, 40, 492, 210);
      x.fillStyle = 'rgba(0,0,0,0.75)'; x.fillRect(0, 0, 512, 36);
      const min = Math.min(90, Math.floor(((Date.now() - M.startedAt) / 120000) * 90));
      x.fillStyle = '#fff'; x.font = 'bold 20px sans-serif'; x.textAlign = 'center';
      x.fillText(`${CLUBS[M.home].name}  ${M.score[0]} - ${M.score[1]}  ${CLUBS[M.away].name}`, 256, 25);
      x.textAlign = 'left'; x.fillStyle = '#ff3b30'; x.fillText(`🔴 ${min}'`, 8, 25);
      x.fillStyle = '#111'; x.fillRect(0, 252, 512, 36);
      x.fillStyle = '#ffd34d'; x.font = '15px sans-serif'; x.fillText(`🎙️ ${this.matchSim.lastEvent || 'Maç başladı!'}`.slice(0, 64), 10, 276);
    } else {
    const slide = this.tvSlide % 4;
    const bg = ['#0b2a4a', '#0b3b2a', '#3a0b2a', '#1a1a2a'][slide];
    x.fillStyle = bg; x.fillRect(0, 0, 512, 288);
    x.fillStyle = '#c0392b'; x.fillRect(0, 0, 512, 34);
    x.fillStyle = '#fff'; x.font = 'bold 20px sans-serif'; x.textAlign = 'left';
    x.fillText(['📺 WORLD CHAOS HABER', '📈 EKONOMİ', '📸 REKLAM', '⚽ SPOR'][slide], 12, 24);
    const wrap = (text, y0, size = 20, max = 4) => {
      x.font = `${size}px sans-serif`;
      const words = String(text).split(' ');
      let line = '', y = y0, n = 0;
      for (const w of words) {
        if (x.measureText(line + w).width > 480) { x.fillText(line, 16, y); line = ''; y += size + 6; if (++n >= max) return; }
        line += w + ' ';
      }
      x.fillText(line, 16, y);
    };
    x.fillStyle = '#fff';
    if (slide === 0) {
      const items = this.ui.newsLog.slice(0, 3);
      items.forEach((n, i) => { x.fillStyle = i ? '#cfd8e3' : '#ffd34d'; wrap(n.text, 70 + i * 74, i ? 16 : 20, 2); });
      if (!items.length) wrap('Şehirde bugün sakin bir gün.', 90);
    } else if (slide === 1) {
      const e = this.ui.self.econ ?? { mul: 1, history: [] };
      const last = e.history[e.history.length - 1];
      x.font = 'bold 44px sans-serif'; x.fillStyle = '#3ddc84'; x.fillText(`Endeks ${(e.mul * 100).toFixed(1)}`, 16, 100);
      x.fillStyle = '#fff'; wrap(last ? `Son zam: ${last.day}. gün maaşlar ve fiyatlar %${(last.rate * 100).toFixed(1)} arttı.` : 'Fiyatlar sabit. İlk zam 3. günde bekleniyor.', 150, 20);
      wrap(`Kasandaki para: ${tl(this.ui.self.balance ?? 0)}`, 240, 18);
    } else if (slide === 2) {
      const ad = this.lastAd ?? this.socialFeed?.[0];
      if (ad?.img) {
        if (!this._adImg || this._adImg.dataset.id !== ad.id) { this._adImg = new Image(); this._adImg.dataset.id = ad.id; this._adImg.onload = () => this.drawTv(); this._adImg.src = ad.img; }
        if (this._adImg.complete) x.drawImage(this._adImg, 0, 34, 512, 200);
        x.fillStyle = 'rgba(0,0,0,0.65)'; x.fillRect(0, 234, 512, 54);
        x.fillStyle = '#fff'; wrap(`${ad.author}: ${ad.caption} ${ad.tags}`, 262, 18, 2);
      } else wrap('Reklam vermek ister misin? Telefon › ChaosGram › Paylaş › Reklam bütçesi', 100);
    } else {
      const M = this.match;
      if (M) {
        x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
        x.fillText(`${CLUBS[M.home].name}  ${M.score[0]} - ${M.score[1]}  ${CLUBS[M.away].name}`, 256, 130);
        x.font = '20px sans-serif'; x.fillStyle = '#ffd34d';
        x.fillText(M.status === 'live' ? 'CANLI YAYIN 🔴' : M.status === 'done' ? 'MAÇ SONU' : `Bugün 14:00 · Oranlar 1:${M.odds.h} X:${M.odds.d} 2:${M.odds.a}`, 256, 180);
        x.textAlign = 'left';
      } else wrap('Bugün maç yok.', 120);
    }
    x.fillStyle = '#111'; x.fillRect(0, 268, 512, 20);
    x.fillStyle = '#ffd34d'; x.font = '13px sans-serif'; x.fillText((this.ui.newsLog[0]?.text ?? 'WORLD CHAOS TV').slice(0, 70), 8, 283);
    }
    if (!this.tvTex || scr.material.map !== this.tvTex) { this.tvTex = new THREE.CanvasTexture(c); this.tvTex.colorSpace = THREE.SRGBColorSpace; scr.material.map = this.tvTex; scr.material.needsUpdate = true; }
    this.tvTex.needsUpdate = true;
  }

  /** Örgüt karargahı içi: matbaa + örgüt yönetimi */
  openCompound(b) {
    const s = this.ui.self;
    const mine = b.org && s.org?.org?.hq?.id === b.id;
    if (!mine) return this.ui.toast(b.org ? `🏴 Burası "${b.org.name}" karargahı.` : '🏭 Sahipsiz depo. Örgütün varsa kapıdan "Karargah Yap".', 'info');
    const press = s.org?.press;
    const AM = [1000, 5000, 10000, 25000, 50000, 100000];
    this.ui.openSheet('compound', { icon: '🏴', title: b.org.name, subtitle: 'Kendi karargahın · matbaa bedava' },
      el('div', { class: 'col' },
        (() => {
          // Sürgüyle miktar seç, para vermeden üret
          const amt = el('input', { type: 'range', min: 1000, max: 200000, step: 1000, value: 100000, class: 'uw-range' });
          const out = el('b', { class: 'uw-big' }, `🆓 ${tl(100000)} üret`);
          amt.addEventListener('input', () => { out.textContent = `🆓 ${tl(amt.value)} üret`; });
          return el('div', { class: 'uw-card' }, el('div', { class: 'uw-h' }, el('span', {}, '🖨️'), el('b', {}, 'Bedava Para Bas')),
            el('small', {}, 'Miktarı sürükle, Üret\'e bas: para vermeden 1 saat (10 sn) sonra bakiyene geçer. Baskın riski %20.'), out, amt,
            el('button', { class: 'btn primary', onClick: () => this.runAction({ type: 'under:order', params: { job: 'fake', amount: Number(amt.value) } }).then((r) => { if (r?.ok) this.ui.closeSheet(); }) }, '🖨️ Üret'));
        })(),
        el('div', { class: 'uw-card' }, el('div', { class: 'uw-h' }, el('span', {}, '🔁'), el('b', {}, 'Otomatik Matbaa')),
          el('small', {}, press ? `Çalışıyor: her 5 saatte ${tl(press.amount)} · sonraki ${press.left} saat sonra` : 'Miktar seç: her 5 oyun saatinde (50 sn) bakiyene otomatik eklenir. Karargahı kaybedersen durur.'),
          el('div', { class: 'row wrap' }, ...AM.map((a) => el('button', { class: `btn ${press?.amount === a ? 'primary' : ''}`, onClick: () => this.runAction({ type: 'org:press', params: { amount: a } }).then((r) => { if (r?.ok) this.ui.closeSheet(); }) }, tl(a)))),
          press ? el('button', { class: 'btn ghost', onClick: () => this.runAction({ type: 'org:press', params: { amount: 0 } }).then(() => this.ui.closeSheet()) }, '⏹️ Durdur') : ''),
        el('button', { class: 'btn wide', onClick: () => { this.ui.closeSheet(); this.phone.open('org'); } }, '🕴️ Örgüt Yönetimi (adam tut, görev ver)')));
  }

  /** 💻 Saray bilgisayarı: siber harekât */
  async openHack(targetId = null) {
    const res = await this.net.action('hack:info', {});
    if (!res?.ok) return this.ui.toast(res?.error ?? 'Bilgisayar açılmadı.', 'err');
    const { targets, ops } = res.data;
    if (!targets.length) return this.ui.toast('Hacklenecek başka ülke yok.', 'warn');
    let sel = targetId ?? targets[0].id;
    const box = el('div', { class: 'col' });
    const draw = () => {
      box.replaceChildren(
        el('small', { class: 'muted' }, 'Hedef ülke seç, sonra harekâtı başlat. Başarısız olursan hedef seni öğrenir. 🛡️ = hedefin siber savunması.'),
        el('div', { class: 'row wrap' }, ...targets.map((t) => el('button', { class: `btn ${t.id === sel ? 'primary' : ''}`, onClick: () => { sel = t.id; draw(); } },
          `${t.ai ? '🤖' : '👤'} ${t.country}${t.shield ? ` 🛡️%${t.shield}` : ''}`))),
        ...ops.map((o) => el('div', { class: 'uw-card' },
          el('div', { class: 'uw-h' }, el('b', {}, o.label)),
          el('small', {}, `${o.desc} · Başarı %${Math.round(o.chance * 100)} · Bekleme ${Math.round(o.cooldown / 60000)} dk`),
          el('button', { class: `btn ${o.ready ? '' : 'danger'}`, disabled: o.ready > 0, onClick: async () => {
            const r = await this.runAction({ type: 'hack:run', params: { op: o.key, targetId: sel } });
            if (r) this.openHack(sel);
          } }, o.ready ? `⏳ ${o.ready} sn` : `💻 Başlat · ${tl(o.cost)}`))));
    };
    draw();
    this.ui.openSheet('hack', { icon: '💻', title: 'Siber Harekât Merkezi', subtitle: 'Saray bilgisayarı · gizli operasyonlar' }, box);
  }

  /** 🏳️ Ülke paneli: nüfus, gelir, mutluluk, politikalar */
  openNation() {
    const n = this.ui.self.nation;
    if (!n) return this.ui.toast('Henüz bir ülken yok.', 'warn');
    const pol = (key, label, desc) => el('div', { class: 'uw-card' },
      el('div', { class: 'uw-h' }, el('b', {}, label)), el('small', {}, desc),
      el('button', { class: `btn ${n.policies[key] ? 'primary' : ''}`, onClick: () => this.runAction({ type: 'nation:policy', params: { key, on: !n.policies[key] } }).then(() => setTimeout(() => this.openNation(), 300)) }, n.policies[key] ? '✅ Açık (kapat)' : '⬜ Kapalı (aç)'));
    const warn = [n.unrest && `🔥 İsyan: ${n.unrest} sn`, n.adLock && `📡 Hava savunması kilitli: ${n.adLock} sn`, n.bankLock && `🏦 Banka kilitli: ${n.bankLock} sn`].filter(Boolean);
    this.ui.openSheet('nation', { icon: '🏳️', title: this.ui.self.countryName ?? 'Ülkem', subtitle: `${tl(n.perSec)}/sn gelir` },
      el('div', { class: 'col' },
        warn.length ? el('div', { class: 'uw-card' }, ...warn.map((w) => el('b', {}, w))) : '',
        el('div', { class: 'uw-card' },
          el('div', {}, `👥 Nüfus: ${n.pop.toLocaleString('tr-TR')} / ${n.cap.toLocaleString('tr-TR')} kapasite`),
          el('div', {}, `😊 Mutluluk: %${n.happy}`),
          el('div', {}, `💰 Gelir: ${tl(n.perSec)}/sn (binalar ${tl(n.fromBuildings)} + vergi ${tl(n.fromTax)})${n.mul < 1 ? ` ×${n.mul}` : ''}`),
          el('div', {}, `🪖 Asker sınırı: ${n.soldierCap.toLocaleString('tr-TR')} (nüfusun %${n.policies.mobilize ? 25 : 10}'u)`),
          el('small', { class: 'muted' }, n.factors.map(([l, v]) => `${l} ${v > 0 ? '+' : ''}${v}`).join(' · ') || 'Mutluluğu artırmak için hastane, okul, park, dükkan kur.')),
        el('small', { class: 'muted' }, '🏠 Konut kur → kapasite artar (ev 1.000, apartman 10.000). Mutlu halk hızlı çoğalır ve diğer ülkelerden göç gelir. Her bina saniyede değerinin 1/600\'ü kadar para kazandırır.'),
        pol('birth', '👶 Doğum Teşviki', 'Nüfus %50 daha hızlı artar. Her saat kişi başı ₺0,05 masraf.'),
        pol('open', '🛂 Açık Kapı Göç', 'Göç 2 kat artar ama mutluluk -5.'),
        pol('mobilize', '🚨 Seferberlik', 'Asker sınırı %10 → %25. Gelir -%15, mutluluk -10.'),
        el('button', { class: 'btn wide', onClick: () => this.openHack() }, '💻 Siber Harekât (saray bilgisayarı)')));
  }

  /** Yeraltı patronu: parayı ver, adamlar işi yapsın */
  openUnderworld() {
    const s = this.ui.self;
    const mul = s.econ?.mul ?? 1;
    const me = this.self.g.position;
    const shops = [...this.city.entries.values()].map((e) => e.data).filter((b) => this.init.catalog.buildings[b.type]?.category === 'commercial' && b.ownerId !== this.selfId)
      .sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, 25);
    const players = [...this.roster.values()].filter((r) => !r.isAI && r.id !== this.selfId);
    const sel = (list, label) => el('select', { class: 'uw-sel' }, el('option', { value: '' }, label), ...list.map((x) => el('option', { value: x.id }, x.name)));
    const order = (job, params, confirm) => this.runAction({ type: 'under:order', params: { job, ...params }, confirm }).then((r) => { if (r?.ok) this.ui.closeSheet(); });
    const fakeAmt = el('input', { type: 'range', min: 100, max: Math.max(100, Math.min(20000, Math.floor(s.balance / 100) * 100)), step: 100, value: 100, class: 'uw-range' });
    const fakeOut = el('b', {}, `${tl(100)} ver → ${tl(1000)} sahte para`);
    fakeAmt.addEventListener('input', () => { fakeOut.textContent = `${tl(fakeAmt.value)} ver → ${tl(fakeAmt.value * 10)} sahte para`; });
    const shopSel = sel(shops, '🏪 Hedef dükkan seç'), shopSel2 = sel(shops, '🏪 Hedef dükkan seç'), plSel = sel(players, '🎯 Hedef oyuncu seç');
    const card = (icon, title, desc, ...rest) => el('div', { class: 'uw-card' }, el('div', { class: 'uw-h' }, el('span', {}, icon), el('b', {}, title)), el('small', {}, desc), ...rest);
    const price = (c) => tl(Math.round(c * mul));
    this.ui.openSheet('uw', { icon: '🕶️', title: 'Patron', subtitle: '"Paranı ver, gerisini düşünme. Polis %50 ihtimalle adamlarımı yakalar, bazen de ötüyorlar..."' },
      el('div', { class: 'col' },
        card('💵', 'Sahte Para Bastır', '1 saat sonra hazır. %50 polis baskını riski.', fakeOut, fakeAmt, el('button', { class: 'btn primary', onClick: () => order('fake', { amount: Number(fakeAmt.value) }) }, 'Matbaayı Çalıştır')),
        card('🔫', `Dükkan Tarat · ${price(2500)}`, `3-4 adam gider, kasanın %30'u gider, bina hasar alır, etraftakiler ölür.`, shopSel, el('button', { class: 'btn danger', onClick: () => shopSel.value ? order('shoot', { targetId: shopSel.value }) : this.ui.toast('Dükkan seç.', 'warn') }, 'Tarat')),
        card('💼', `Haraç Kestir · ${price(1500)}`, `Dükkan 3 gün boyunca cirosunun %15'ini sana öder.`, shopSel2, el('button', { class: 'btn', onClick: () => shopSel2.value ? order('racket', { targetId: shopSel2.value }) : this.ui.toast('Dükkan seç.', 'warn') }, 'Haraç Kes')),
        card('🎯', `Oyuncu Öldürt · ${price(6000)}`, 'Kiralık katil hedefin peşine düşer.', plSel, el('button', { class: 'btn danger', onClick: () => plSel.value ? order('hit', { targetId: plSel.value }, 'Kiralık katil gönderilsin mi?') : this.ui.toast('Oyuncu seç.', 'warn') }, 'Katili Gönder')),
        card('💥', `Devlete Darbe · ${price(60000)}`, '8 adam merkez şehre saldırır: dükkanlar patlar, sokaktakiler vurulur. Başarırsa yönetim senin.', el('button', { class: 'btn danger', onClick: () => order('coup', {}, 'Darbe başlasın mı? Merkez şehir yanacak!') }, '💥 DARBEYİ BAŞLAT'))));
  }

  openOutfitShop(b) {
    const s = this.ui.self;
    const mul = s.econ?.mul ?? 1;
    const owned = new Set(s.wardrobe ?? []);
    const rows = Object.entries(OUTFITS).map(([id, o]) => el('div', { class: 'shop-item' },
      el('span', { class: 'sw', style: { background: `#${o.color.toString(16).padStart(6, '0')}`, width: '22px', height: '22px', borderRadius: '6px', display: 'inline-block' } }),
      el('span', { class: 'nm' }, o.label, el('small', { class: 'muted' }, ` · ${{ top: 'üst', bottom: 'alt', hat: 'şapka', acc: 'aksesuar' }[o.slot]}`)),
      owned.has(id) ? el('span', { class: 'muted' }, s.outfit?.[o.slot] === id ? '✔ giyili' : '✔ sende') : el('span', { class: 'pr' }, tl(priceOf(o.price, mul))),
      el('button', { class: 'btn mini primary', onClick: () => this.runAction({ type: 'outfit:buy', params: { id } }).then(() => setTimeout(() => this.openOutfitShop(b), 250)) }, owned.has(id) ? 'Giy' : 'Satın Al')));
    this.ui.openSheet('shop', { icon: '👕', title: b.name, subtitle: `${Object.keys(OUTFITS).length} ürün · aldığın an üstüne giyersin` }, el('div', { class: 'col' }, ...rows));
  }

  openCarShop(b) {
    const mul = this.ui.self.econ?.mul ?? 1;
    const rows = Object.entries(CARS).map(([id, c]) => el('div', { class: 'shop-item' }, el('span', {}, '🚗'),
      el('span', { class: 'nm' }, c.label, el('small', { class: 'muted' }, ` · ${c.speed * 4} km/s`)),
      el('button', { class: 'btn mini primary', onClick: () => this.runAction({ type: 'car:buy', params: { model: id }, confirm: `${c.label} · ${tl(priceOf(c.price, mul))} ödensin mi?` }) }, `Al ${tl(priceOf(c.price, mul))}`),
      el('button', { class: 'btn mini', onClick: () => this.runAction({ type: 'car:buy', params: { model: id, rent: true } }) }, `Kirala ${tl(priceOf(c.rent, mul))}/gün`)));
    this.ui.openSheet('shop', { icon: '🚗', title: b.name, subtitle: 'Satın al ya da 24 saatliğine kirala · dışarıda 🚗 butonuyla bin' }, el('div', { class: 'col' }, ...rows));
  }

  enterInterior(id) {
    const b = this.city.get(id);
    if (!b) return;
    this.interior.build(b, { accent: b.ownerId ? this.city.playerColors.get(b.ownerId) : undefined });
    this.interior.setTask(this.ui.self.shift?.task?.spotId ?? null);
    this.interior.setMatch?.(this.match);
    this.city.root.visible = false;
    this.entities.setOutdoorVisible(false);
    this.kit.setInterior(true);
    this.rig.setInterior(true);
    this.controller.bounds = Infinity;
    this.ui.canvasMini.style.visibility = 'hidden';
    this.rig.snap(this.self.g.position);
    this._guestsOpen = !!b.guestsOpen;
    this.refreshInsideBar();
    this.audio.play('door');
  }

  leaveInterior() {
    this.interior.clear();
    this.city.root.visible = true;
    this.entities.setOutdoorVisible(true);
    this.kit.setInterior(false);
    this.rig.setInterior(false);
    this.controller.bounds = this.controller.outdoorBounds;
    this.ui.canvasMini.style.visibility = '';
    this.life.setInside(null);
    this.rig.snap(this.self.g.position);
    this.task = null;
  }

  refreshInsideBar() {
    const s = this.ui.self;
    const b = s.inside ? this.city.get(s.inside) : null;
    const isHome = b && (b.id === s.homeId || (b.ownerId === this.selfId && ['house', 'villa', 'apartment', 'town_hall'].includes(b.type)));
    this.life.setInside(b && { ...b, icon: this.init.catalog.buildings[b.type]?.icon }, isHome, this._guestsOpen);
  }

  selfAnim() {
    const s = this.ui.self;
    const w = s.weapon ?? 'fist';
    return {
      seat: s.seat ?? 0,
      pose: this.task ? 'work' : s.rideWith ? 'drive' : (s.pose || ''),
      attackT: this.selfAttackT,
      gun: w === 'pistol' || w === 'rifle' ? w : null,
      slow: s.energy < 8 ? 0.55 : s.health < 20 ? 0.7 : 1,
    };
  }

  standUp(force) {
    const s = this.ui.self;
    if (!s.pose || s.pose === 'dead' || this._standing) return;
    if (s.pose === 'sleep' && s.energy < 15) {
      if (force) this.ui.toast('😵 Çok yorgunsun... Enerji %15 olunca kalkabilirsin.', 'warn');
      return;
    }
    this._standing = true;
    // Sunucu bizi mobilyanın önüne ışınlayana kadar yürüme (koltuğun içinde sıkışma olmasın)
    this.controller.locked = true;
    const unlock = () => { const t = this.ui.self; this.controller.locked = (!!t.jailed && !t.myCase) || !!t.dead || !!t.rideWith || !!t.myCase || !!t.veh?.flying; };
    setTimeout(unlock, 700);
    this.net.action('life:stand', {}).finally(() => { this._standing = false; setTimeout(unlock, 150); });
    this.ui.setSelf({ pose: '', tv: false });
    this.life.set({ pose: '', tv: false });
  }

  // ---- mesai görevi: işarete git, butona bas, süre dolunca tamamla
  startTask() {
    const t = this.ui.self.shift?.task;
    if (!t || this.task) return;
    const w = this.interior.spotWorld(t.spotId);
    const p = this.self.g.position;
    if (!w || Math.hypot(p.x - w.x, p.z - w.z) > 3.8) { this.ui.toast('📍 Önce sarı işaretli yere git.', 'warn'); return; }
    this.task = { start: performance.now(), secs: t.secs, spot: w };
    this.self.g.rotation.y = Math.atan2(w.x - p.x, w.z - p.z) || this.self.g.rotation.y;
    this.audio.play('click');
  }

  updateTask() {
    const t = this.ui.self.shift?.task;
    if (!this.life || !t) { if (this.task) this.task = null; return; }
    const w = this.interior.spotWorld(t.spotId);
    const p = this.self.g.position;
    const near = !!w && Math.hypot(p.x - w.x, p.z - w.z) <= 3.8;
    if (this.task) {
      if (!near) { this.task = null; this.ui.toast('Görev yarıda kaldı, işaretin yanında kal!', 'warn'); }
      else {
        const prog = (performance.now() - this.task.start) / (this.task.secs * 1000);
        if (prog >= 1 && !this.task.sent) {
          this.task.sent = true;
          this.runAction({ type: 'job:task', params: {} }).then(() => { this.task = null; });
        }
        this.life.setTaskNear(true, Math.min(1, prog));
        return;
      }
    }
    this.life.setTaskNear(near, 0);
  }

  // ---- iç mekân eşyaları
  async openSpot(spot) {
    const s = this.ui.self;
    const b = this.city.get(s.inside);
    if (!b) return;
    const act = (label, cls, a, extra) => el('button', { class: `btn ${cls}`, onClick: async () => { const r = await this.runAction({ type: 'life:use', params: { spot: spot.id, act: a } }); if (r?.ok && !extra?.keep) this.ui.closeSheet(); else if (r?.ok) setTimeout(() => this.openSpot(spot), 300); } }, label);
    const home = ['house', 'villa', 'apartment', 'town_hall'].includes(b.type);
    const task = s.shift?.task;
    const open = (...content) => this.ui.openSheet('spot', { icon: spot.icon, title: spot.label, subtitle: b.name }, el('div', { class: 'spot-actions' }, ...content));
    if (task?.spotId === spot.id) return this.startTask();
    switch (spot.tag) {
      case 'exit': return this.runAction({ type: 'building:exit', params: {} });
      case 'fridge': {
        const f = s.fridge ?? { food: 0, drink: 0 };
        const inv = s.inventory ?? {};
        return open(
          el('div', { class: 'grid2' }, el('div', { class: 'card' }, el('div', { class: 'big-n' }, `🍞 ${f.food}`), el('small', {}, 'Dolapta yiyecek')), el('div', { class: 'card' }, el('div', { class: 'big-n' }, `🥤 ${f.drink}`), el('small', {}, 'Dolapta içecek'))),
          act(`🧊 Çantadakileri Koy (🍞${inv.food ?? 0} 🥤${inv.drink ?? 0})`, 'ghost', 'store', { keep: true }),
          act('🍽️ Yemek Ye', 'primary', 'eat', { keep: true }),
          act('🥤 Bir Şey İç', 'primary', 'drink', { keep: true }),
          act('🎒 Çantaya Al (yolda yemek için)', 'ghost', 'take', { keep: true }),
          el('p', { class: 'muted' }, `🍔 Tokluk %${Math.round(s.food)} · 💧 Su %${Math.round(s.water)}`));
      }
      case 'stove':
        if (!home) break;
        return open(act('🍵 Çay Demle (misafirlere de ikram)', 'primary', 'tea'), act('☕ Türk Kahvesi Yap (+enerji)', 'primary', 'coffee'), el('p', { class: 'muted' }, 'Evdeki herkes de içer. Misafirlerinle oturup sohbet edin! 🎙️'));
      case 'sofa':
        return open(act('📺 Otur ve TV İzle', 'primary', 'tv'), act('🛋️ Otur', 'ghost', 'sit'));
      case 'table':
        if (b.type === 'bar' || b.type === 'cafe' || b.type === 'restaurant') return open(act('🪑 Otur', 'primary', 'sit'), el('button', { class: 'btn ghost', onClick: () => this.openShop(b, true) }, '🧾 Sipariş Ver'));
        return open(act('🪑 Otur', 'primary', 'sit'));
      case 'bed':
        if (!home && b.type !== 'hospital') break;
        return open(act('😴 Uyu', 'primary', 'sleep'), el('p', { class: 'muted' }, `⚡ Enerji %${Math.round(s.energy)}. Uyurken enerji hızla dolar; hareket edersen uyanırsın.`));
      case 'counter':
        if (b.type === 'gun_shop') return this.openGunShop(b);
        if (b.type === 'clothing') return this.openOutfitShop(b);
        if (b.type === 'car_dealer') return this.openCarShop(b);
        if (b.type === 'stadium') return this.phone.open('match');
        if (b.type === 'bank') return this.phone.open('bank');
        return this.openShop(b, !!(b.type === 'cafe' || b.type === 'restaurant' || b.type === 'bar'), spot);
      case 'bench': return this.phone.open('court');
      case 'boss': return b.type === 'compound' ? this.openCompound(b) : this.openUnderworld();
      case 'tribune': return open(act('🏟️ Tribüne Otur ve İzle', 'primary', 'sit'), el('p', { class: 'muted' }, this.match?.status === 'live' ? '🔴 Maç canlı!' : `Maç her gün 14:00'te · 2 dakika sürer`), el('button', { class: 'btn ghost', onClick: () => this.phone.open('match') }, '🎟️ Bahis & Kadro'));
      case 'mirror': return this.phone.open('wardrobe');
      case 'pitch': return this.match?.status === 'live' ? this.ui.toast('⚽ Kadrodaysan ekrandaki ⚽ Şut butonuna bas!', 'info') : this.phone.open('match');
      case 'reception':
        return open(act(`🩺 Tedavi Ol · ₺250`, 'primary', 'heal'), el('p', { class: 'muted' }, `❤️ Can %${Math.round(s.health)}`));
      case 'pc': return this.openHack();
      case 'desk':
        if (b.type === 'bank') return this.phone.open('bank');
        if (b.type === 'town_hall') return open(
          el('button', { class: 'btn primary', onClick: () => this.openNation() }, '🏳️ Ülke Yönetimi'),
          el('button', { class: 'btn primary', onClick: () => this.ui.openTech() }, '🔬 Teknoloji'),
          el('button', { class: 'btn danger', onClick: () => this.ui.openMilitary(this.myUnits().length) }, '⚔️ Ordu'),
          el('button', { class: 'btn', onClick: () => this.ui.openMap() }, '🗺️ Toprak'),
          el('button', { class: 'btn', onClick: () => this.ui.openCity('city') }, '🏛️ Şehir'));
        break;
      default:
    }
    if (s.jobBuildingId === b.id) this.ui.toast(s.shift ? `Burası çalışma alanı. Görevin: ${task?.label ?? '—'}` : 'Burası çalışma alanı. Önce üstten 👔 Mesaiye Başla.', 'info');
    else this.ui.toast(`${spot.icon} ${spot.label}: Burada çalışanlar görev yapar. (İşe girmek için dışarıdan binaya dokun → Burada Çalış)`, 'info');
  }

  async openShop(b, served, spot) {
    const d = await this.net.inspect('shop', b.id);
    if (!d) return;
    const buy = (product, qty, now) => this.runAction({ type: 'shop:buy', params: { product, qty, now } }).then((r) => { if (r?.ok) this.openShop(b, served, spot); });
    const rows = d.items.map((it) => el('div', { class: 'shop-item' },
      el('span', {}, it.icon), el('span', { class: 'nm' }, `${it.label}`, el('small', { class: 'muted' }, ` · stok ${it.qty}`)), el('span', { class: 'pr' }, tl(it.price)),
      served
        ? el('button', { class: 'btn mini primary', onClick: () => buy(it.product, 1, true) }, it.product === 'food' ? '🍽️ Ye' : '🥤 İç')
        : el('button', { class: 'btn mini primary', onClick: () => buy(it.product, 1) }, '+1'),
      served ? null : el('button', { class: 'btn mini', onClick: () => buy(it.product, 5) }, '+5')));
    const seat = spot?.seats ? el('button', { class: 'btn ghost', onClick: () => this.runAction({ type: 'life:use', params: { spot: spot.id, act: 'sit' } }) }, '🪑 Bara Otur') : null;
    this.ui.openSheet('shop', { icon: served ? '🧾' : '🛒', title: d.title, subtitle: d.open ? (served ? 'Siparişin hemen gelir' : 'Aldıkların çantana konur') : '🌙 Kapalı' },
      el('div', { class: 'col' }, ...(rows.length ? rows : [el('p', { class: 'muted' }, 'Raflar boş... Tedarik bekleniyor.')]), seat,
        el('p', { class: 'muted' }, `🎒 Çanta: 🍞${this.ui.self.inventory?.food ?? 0} 🥤${this.ui.self.inventory?.drink ?? 0} · ${tl(this.ui.self.balance)}`)));
  }

  async openGunShop(b) {
    const d = await this.net.inspect('shop', b.id);
    const s = this.ui.self;
    const rows = ['knife', 'pistol', 'rifle'].map((k) => {
      const w = WEAPONS[k];
      const owned = s.weapons?.includes(k);
      return el('div', { class: 'shop-item' }, el('span', {}, w.icon), el('span', { class: 'nm' }, w.label, el('small', { class: 'muted' }, ` · hasar ${w.dmg}${w.ammo ? ` · menzil ${w.range}` : ''}`)),
        owned ? el('span', { class: 'muted' }, '✔ sende') : el('span', { class: 'pr' }, tl(w.price)),
        owned ? null : el('button', { class: 'btn mini primary', onClick: () => this.runAction({ type: 'shop:weapon', params: { weapon: k } }).then(() => this.openGunShop(b)) }, 'Satın Al'),
        owned && w.ammo ? el('button', { class: 'btn mini', onClick: () => this.runAction({ type: 'shop:weapon', params: { weapon: k, ammo: true } }).then(() => this.openGunShop(b)) }, `📦 +${w.ammo.qty} mermi · ${tl(w.ammo.price)}`) : null);
    });
    this.ui.openSheet('shop', { icon: '🔫', title: b.name, subtitle: `Ateşli silah stoğu: ${d?.weaponStock ?? '?'}` },
      el('div', { class: 'col' }, ...rows, el('p', { class: 'muted' }, '⚠️ Masum birine ateş edersen aranırsın ve polis peşine düşer.')));
  }

  // ---- dövüş
  attack() {
    if (this.ui.self.dead || this.ui.self.jailed || this.targeting) return;
    const w = WEAPONS[this.ui.self.weapon] ?? WEAPONS.fist;
    const now = performance.now();
    if (now - (this._lastAtk ?? 0) < w.cd) return;
    this._lastAtk = now;
    if (this.ui.self.pose) this.standUp(true);
    const me = this.self.g.position;
    const range = w.range + 1.5;
    const gunAim = !w.melee;
    const fx = gunAim ? -Math.sin(this.rig.yaw) : Math.sin(this.self.g.rotation.y);
    const fz = gunAim ? -Math.cos(this.rig.yaw) : Math.cos(this.self.g.rotation.y);
    let best = null, bs = Infinity;
    const consider = (kind, id, x, z) => {
      const dx = x - me.x, dz = z - me.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) return;
      const cos = (dx * fx + dz * fz) / d;
      const score = d * (cos > 0.5 ? 1 : cos > 0 ? 2.5 : 6);
      if (score < bs) { bs = score; best = { kind, id, x, z }; }
    };
    if (!this.interior.active) for (const n of this.entities.npcs.values()) if (n.visible) consider('npc', n.id, n.x, n.z);
    for (const e of this.entities.players.values()) if (e.id !== this.selfId && e.g.visible && e.pose !== 'dead') consider('player', e.id, e.g.position.x, e.g.position.z);
    // Sokak birimleri: polis, özel harekât, kartel adamları (kendi örgütün hariç)
    const myOrg = this.ui.self.org?.org?.id;
    if (!this.interior.active) for (const u of this.entities.units.values()) if (u.g.userData.street && u.ownerId !== `org:${myOrg}`) consider('unit', u.id, u.g.position.x, u.g.position.z);
    this.selfAttackT = 0.3;
    if (!best) {
      if (w.melee) this.audio.play('whoosh', { vol: 0.4 });
      else this.ui.toast('🎯 Menzilde hedef yok.', 'warn');
      return;
    }
    this.self.g.rotation.y = Math.atan2(best.x - me.x, best.z - me.z);
    this.controller.dirty = true;
    this.net.action('combat:attack', { kind: best.kind, id: best.id }).then((r) => {
      if (r?.message) this.ui.toast(r.message, r.ok ? 'ok' : 'err');
      else if (r && !r.ok && r.error) this.ui.toast(r.error, 'err');
    });
  }

  combatFx(f) {
    const e = f.by && this.entities.getPlayer(f.by);
    if (e) e.attackT = 0.3;
    if (f.t === 'punch') {
      this.effects.melee(f.a, f.b);
      this.audio.playAt('punch', f.a[0], f.a[1], { minGap: 60 });
    } else {
      this.effects.tracer(f.a, f.b, 'infantry');
      this.audio.playAt(f.w === 'rifle' ? 'rifle' : 'pistol', f.a[0], f.a[1], { minGap: 40, range: 300 });
    }
  }

  cycleWeapon() {
    const s = this.ui.self;
    const list = s.weapons ?? ['fist'];
    if (list.length < 2) { this.ui.toast('🔫 Silah dükkanından bıçak / tabanca / tüfek alabilirsin.', 'info'); return; }
    const next = list[(list.indexOf(s.weapon) + 1) % list.length];
    this.ui.self.weapon = next;
    this.life.set({ weapon: next });
    this.net.action('combat:equip', { weapon: next });
    this.audio.play('click');
  }

  async toggleMic() {
    try {
      if (this.voice.enabled) {
        this.voice.stop();
        this.ui.toast('🔇 Mikrofon kapandı.', 'info');
      } else {
        await this.voice.start();
        this.ui.toast('🎙️ Mikrofon açık! Yakınındaki oyuncular seni duyar (~45 m).', 'ok');
      }
    } catch (err) {
      this.ui.toast(`🎙️ Mikrofon açılamadı: ${err.message ?? err}`, 'err');
    }
    this.life.setMic(this.voice.enabled, false);
  }

  // ---- ülke kur butonu yalnızca sınırlardan uzaktayken
  updateFoundButton() {
    const s = this.ui.self;
    let show = false;
    if (!s.village && !s.inside && !s.dead) {
      const w = this.init.world;
      const p = this.self.g.position;
      const i = Math.floor((p.x + w.half) / w.blockSize), j = Math.floor((p.z + w.half) / w.blockSize);
      const g = this.init.config.gridSize ?? w.gridSize;
      const ts = this.init.config.townSize ?? 4;
      const get = (a, b) => this.city.tile(a, b);
      for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (canFoundAtTiles(get, g, ts, i + di, j + dj)) { show = true; break; }
    }
    if (show && this.ui.foundBtn.classList.contains('hidden')) { this.audio.play('notify'); this.ui.toast('🏳️ Burası ülke kurmaya uygun! ÜLKE KUR butonu açıldı.', 'ok'); }
    this.ui.foundBtn.classList.toggle('hidden', !show);
  }

  // ------------------------------------------------------------------ döngü
  loop() {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const kit = this.kit;

    this.selfAttackT = Math.max(0, this.selfAttackT - dt);
    // Yolcuysan sürücüyle birlikte git
    if (this.ui.self.rideWith) {
      const d = this.entities.getPlayer(this.ui.self.rideWith);
      if (d) { this.self.g.position.x = d.g.position.x; this.self.g.position.z = d.g.position.z; this.self.g.rotation.y = d.g.rotation.y; }
    }
    // Helikopterdeyken kamera helikopteri takip eder, karakter kabinde
    const fly = this.ui.self.veh?.flying;
    if (fly) {
      const hu = this.entities.units.get(fly.unitId);
      if (hu) { this.self.g.position.x = hu.g.position.x; this.self.g.position.z = hu.g.position.z; this.self.g.position.y = hu.g.position.y + 1; }
      this.self.g.visible = false;
      this._wasFlying = true;
    } else if (this._wasFlying) { this._wasFlying = false; this.self.g.visible = true; this.self.g.position.y = 0; }
    this.updateTask(dt);
    this.controller.update(dt);
    this.entities.selfInside = this.ui.self.inside || 0;
    this.entities.camX = this.self.g.position.x;
    this.entities.camZ = this.self.g.position.z;
    setWeapon(this.self.g, this.ui.self.weapon ?? 'fist');
    this.interior.update(dt, kit.night ?? 0);
    if (this.matchSim.live && this.watchingMatch()) {
      this.matchSim.update(dt);
      if (this.interior.pitch) this.interior.renderMatch(this.matchSim, dt);
    }
    if (this.ui.self.tv && this.matchSim.live) { this.tvTimer = (this.tvTimer ?? 0) + dt; if (this.tvTimer > 0.1) { this.tvTimer = 0; this.drawTv(); } }
    else if (this.ui.self.tv) { this.tvTimer = (this.tvTimer ?? 0) + dt; if (this.tvTimer > 4.5) { this.tvTimer = 0; this.tvSlide = (this.tvSlide ?? 0) + 1; this.drawTv(); } }
    if (this.interior.scoreboard) { this._sbT = (this._sbT ?? 0) + dt; if (this._sbT > 1) { this._sbT = 0; this.interior.drawScoreboard(this.match, (i) => CLUBS[i].name); } }
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
    this.voice.setListener(this.self.g.position.x, this.self.g.position.z, this.rig.yaw);
    this.audio.setMusic(performance.now() - this.lastWarAt < 25000 || this.effects.missiles.size ? 'war' : 'game');

    if (this.marker.visible) this.marker.rotation.z += dt * 2;
    if (this.floaters?.length) this.floaters = this.floaters.filter((f) => { f.t += dt; f.s.position.y += dt * 1.2; f.s.material.opacity = Math.max(0, 1 - f.t / 1.8); if (f.t > 1.8) { this.kit.scene.remove(f.s); f.s.material.map?.dispose(); f.s.material.dispose(); return false; } return true; });
    if (this.pin) { this.pinBeam.children[1].rotation.z += dt; this._pinT = (this._pinT ?? 0) - dt; if (this._pinT <= 0) { this._pinT = 0.15; this.updatePinChip(); } }

    this.miniTimer -= dt;
    if (this.miniTimer <= 0) {
      this.miniTimer = 0.2;
      const now = performance.now();
      this.ui.minimap.draw({
        selfId: this.selfId,
        self: this.self.g.position,
        yaw: this.rig.yaw,
        players: [...this.entities.players.values()].filter((p) => p.g.visible).map((p) => ({ id: p.id, x: p.g.position.x, z: p.g.position.z, color: this.roster.get(p.id)?.color ?? '#fff', name: this.roster.get(p.id)?.name })),
        units: this.entities.unitPositions(),
        missiles: [...this.effects.missiles.values()].map((m) => ({ ...missilePosAt(m, now), to: m.to })),
        hazards: this.hazards,
      });
    }
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) {
      this.hintTimer = 0.3;
      const p = this.self.g.position;
      if (this.interior.active) {
        const spot = this.interior.nearestSpot(p.x, p.z);
        this.ui.setInteractHint(spot ? { name: `${spot.icon} ${spot.label}` } : null);
      } else {
        const b = this.targeting ? null : this.city.nearestBuilding(p.x, p.z, 26);
        this.ui.setInteractHint(b ? { name: `${b.name}${b.type !== 'land' && b.type !== 'park' ? ' · 🚪' : ''}` } : null);
      }
      this.updateFoundButton();
      this.updateCarButton();
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
    this.phone?.close();
    this.phone?.dispose();
    this.admin?.node.remove();
    this.voice.dispose();
    this.interior.clear();
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
