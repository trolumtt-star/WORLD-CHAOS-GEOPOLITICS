import { el, clear, tl } from '../core/dom.js';
import { WEAPONS } from '../../shared/interiors.js';

/**
 * Gündelik hayat arayüzü (GameUI'nin üstüne eklenir):
 *  ihtiyaç barları, saldırı/silah/zoom, mikrofon, çanta, bina içi çubuğu, mesai görevi,
 *  uyku / ölüm / TV ekranları, polis ihbar kartı.
 */
export class LifeUI {
  constructor(ui, h) {
    this.ui = ui;
    this.h = h;
    this.s = {};
    const btn = (label, cls, onClick, title) => el('button', { class: `btn ${cls ?? ''}`, title, onClick: (e) => { e.stopPropagation(); ui.sfx('click'); onClick(); } }, label);
    const hud = ui.hud;

    // İhtiyaçlar
    const bar = (icon, cls) => {
      const fill = el('i');
      const wrap = el('div', { class: `need ${cls}` }, el('b', {}, icon), el('span', {}, fill));
      wrap.fill = fill;
      return wrap;
    };
    this.needs = { food: bar('🍔', 'food'), water: bar('💧', 'water'), energy: bar('⚡', 'energy'), health: bar('❤️', 'health') };
    // Ülke modu: açlık/su/enerji yok, sadece can
    for (const k of ['food', 'water', 'energy']) this.needs[k].style.display = 'none';
    hud.querySelector('.status')?.append(el('div', { class: 'needs' }, ...Object.values(this.needs)));

    // Saldırı / silah / zoom
    this.weaponBtn = btn('👊', 'icon weapon', () => this.h.onCycleWeapon(), 'Silah değiştir (Q)');
    this.attackBtn = el('button', { class: 'attack-btn', onPointerdown: (e) => { e.stopPropagation(); this.h.onAttack(); this._hold = setInterval(() => this.h.onAttack(), 230); }, onPointerup: () => clearInterval(this._hold), onPointerleave: () => clearInterval(this._hold), onPointercancel: () => clearInterval(this._hold) }, '👊');
    this.ammo = el('div', { class: 'ammo hidden' });
    this.carBtn = btn('🚗', 'icon car hidden', () => this.h.onCar(), 'Araba (G)');
    this.shootBtn = el('button', { class: 'shoot-btn hidden', onClick: (e) => { e.stopPropagation(); this.h.onShoot(); } }, '⚽');
    hud.append(el('div', { class: 'zoom-pill' }, btn('＋', 'icon', () => this.h.onZoom(0.75), 'Yakınlaş'), btn('－', 'icon', () => this.h.onZoom(1.33), 'Uzaklaş')),
      el('div', { class: 'combat' }, this.carBtn, this.weaponBtn, this.ammo, this.shootBtn, this.attackBtn));

    // Üst ikonlar: mikrofon + çanta
    const row = hud.querySelector('.icon-row');
    this.micBtn = btn('🎙️', 'icon mic', () => this.h.onMic(), 'Sesli sohbet (V)');
    row?.prepend(this.micBtn);

    // Bina içi çubuğu + mesai
    this.insideName = el('b');
    this.shiftBtn = btn('👔 Mesaiye Başla', 'mini primary hidden', () => this.h.onShift());
    this.guestBtn = btn('🚪', 'mini ghost hidden', () => this.h.onGuests());
    this.insideBar = el('div', { class: 'inside-bar glass hidden' }, this.insideName, this.shiftBtn, this.guestBtn, btn('🚪 Çık', 'mini', () => this.h.onExit()));
    this.taskLabel = el('div', { class: 'task-label' });
    this.taskFill = el('i');
    this.taskBtn = el('button', { class: 'btn primary task-do', onClick: (e) => { e.stopPropagation(); this.h.onTask(); } }, '🛠️ Görevi Yap');
    this.taskCard = el('div', { class: 'task-card glass hidden' }, this.taskLabel, el('div', { class: 'task-prog' }, this.taskFill), this.taskBtn);
    this.incident = el('div', { class: 'incident glass hidden' });
    this.trial = el('div', { class: 'trial glass hidden' });
    this.chase = el('div', { class: 'chase-ban hidden' });
    this.kidText = el('span');
    this.kid = el('div', { class: 'kid-ban glass hidden' }, this.kidText, el('button', { class: 'btn primary', onClick: (e) => { e.stopPropagation(); this.h.onRansom?.(); } }, '💸 Fidye Öde'));
    hud.append(this.kid);
    this.chaseEdge = el('div', { class: 'chase-edge hidden' });
    hud.append(this.chase, this.chaseEdge);
    hud.append(this.insideBar, this.taskCard, this.incident, this.trial);

    // Tam ekran katmanlar
    this.sleep = el('div', { class: 'sleep-ov hidden' }, el('div', { class: 'zzz' }, '😴 Zzz…'), (this.sleepE = el('div', { class: 'sleep-e' })), btn('☀️ Uyan', 'primary', () => this.h.onStand()));
    this.death = el('div', { class: 'death-ov hidden' }, el('h1', {}, '💀 ÖLDÜN'), (this.deathT = el('p')));
    this.tv = el('div', { class: 'tv-ov hidden' }, el('span', {}, '📺 TV izliyorsun · etrafa bakmak için ekranı sürükle'), btn('✕ Kalk', 'mini', () => this.h.onStand()));
    this.tvBody = el('div');
    this.tvTick = el('span');
    hud.append(this.sleep, this.death, this.tv);
  }

  set(s) {
    const prev = this.s;
    this.s = { ...this.s, ...s };
    s = this.s;
    for (const k of ['food', 'water', 'energy', 'health']) {
      const v = Math.max(0, Math.min(100, s[k] ?? 100));
      const n = this.needs[k];
      n.fill.style.width = `${v}%`;
      n.classList.toggle('low', v < 25);
    }
    if (prev.health !== undefined && s.health < prev.health - 4) { this.ui.sfx('hurt'); this.flash(); }
    // silah
    const w = WEAPONS[s.weapon] ?? WEAPONS.fist;
    this.weaponBtn.textContent = w.icon;
    this.attackBtn.textContent = w.icon;
    this.ammo.textContent = w.ammo ? `${s.ammo?.[s.weapon] ?? 0}` : '';
    this.ammo.classList.toggle('hidden', !w.ammo);
    this.weaponBtn.classList.toggle('hidden', (s.weapons ?? []).length < 2);
    // uyku / ölüm / tv
    this.sleep.classList.toggle('hidden', s.pose !== 'sleep');
    this.sleepE.textContent = `⚡ Enerji %${Math.round(s.energy ?? 0)}`;
    this.death.classList.toggle('hidden', !s.dead);
    if (s.dead && !prev.dead) this.deathTimer(s.respawnAt);
    this.tv.classList.toggle('hidden', !s.tv);
    this.h.onCarState?.();
    // mesai
    const task = s.shift?.task;
    this.taskCard.classList.toggle('hidden', !task);
    if (task) this.taskLabel.textContent = `👔 Görev ${s.shift.done + 1}: ${task.label}`;
    this.shiftBtn.classList.toggle('hidden', !(s.inside && s.jobBuildingId === s.inside));
    this.shiftBtn.textContent = s.shift ? '🏁 Mesaiyi Bitir' : '👔 Mesaiye Başla';
    // kaçırılma
    const kd = s.org?.kidnapped;
    this.kid.classList.toggle('hidden', !kd);
    if (kd) this.kidText.textContent = `🥷 KAÇIRILDIN (${kd.org}) · Fidye ${tl(kd.ransom)} · ${kd.left} sn`;
    // polis kovalamacası
    const ch = s.chase;
    this.chase.classList.toggle('hidden', !ch);
    this.chaseEdge.classList.toggle('hidden', !ch || !!ch?.hiding);
    if (ch) this.chase.textContent = ch.hiding ? `🤫 Saklanıyorsun... polis kapıda bekliyor` : `🚨 POLİS PEŞİNDE · ${ch.cops} memur · en yakın ${ch.nearest ?? '?'} m${ch.lost > 0 ? ' · izini kaybediyorlar...' : ' · KOŞ!'}`;
    if (ch && !prev.chase) this.ui.sfx('siren');
    // duruşma
    this.trial.classList.toggle('hidden', !s.myCase);
    if (s.myCase && (!prev.myCase || prev.myCase.id !== s.myCase.id)) {
      clearInterval(this._trialT);
      const c = s.myCase;
      const tick = () => {
        const left = Math.max(0, Math.ceil((c.autoAt - Date.now()) / 1000));
        clear(this.trial).append(el('b', {}, '⚖️ DURUŞMA'), el('div', {}, c.npc ? `NPC hakim kararını açıklıyor... ${left} sn` : `Hakim kararını veriyor · en geç ${left} sn`), el('small', {}, `Suçlar: ${c.crimes.join(' · ') || '—'}`));
        if (!this.s.myCase) clearInterval(this._trialT);
      };
      tick();
      this._trialT = setInterval(tick, 500);
    }
    // polis ihbarı
    this.incident.classList.toggle('hidden', !s.incident);
    if (s.incident) clear(this.incident).append(el('b', {}, '🚨 SOYGUN İHBARI'), el('div', {}, `${s.incident.building} soyuldu! Kaçan: ${s.incident.name}`), el('small', {}, 'Haritada ve sokakta kırmızı halkayla işaretli. Yaklaş ve 🚔 Tutukla!'));
  }

  setInside(b, isHome, guestsOpen) {
    this.insideBar.classList.toggle('hidden', !b);
    if (!b) return;
    this.insideName.textContent = `${b.icon ?? '🏠'} ${b.name}`;
    this.guestBtn.classList.toggle('hidden', !isHome);
    this.guestBtn.textContent = guestsOpen ? '🔓 Misafire açık' : '🔒 Kapı kilitli';
  }

  setTaskNear(near, progress) {
    this.taskBtn.disabled = !near;
    this.taskBtn.textContent = near ? (progress > 0 ? '⏳ Çalışıyorsun...' : '🛠️ Görevi Yap') : '📍 Sarı işarete git';
    this.taskFill.style.width = `${Math.round((progress ?? 0) * 100)}%`;
  }

  setMic(on, talking) {
    this.micBtn.classList.toggle('on', !!on);
    this.micBtn.classList.toggle('talking', !!talking);
    this.micBtn.textContent = on ? '🎙️' : '🔇';
  }

  deathTimer(at) {
    clearInterval(this._dt);
    const tick = () => {
      const left = Math.max(0, Math.ceil((at - Date.now()) / 1000));
      this.deathT.textContent = left > 0 ? `${left} saniye sonra yeniden doğacaksın...` : 'Uyanıyorsun...';
      if (left <= 0) clearInterval(this._dt);
    };
    tick();
    this._dt = setInterval(tick, 250);
  }

  refreshTv() {
    const items = this.ui.newsLog.slice(0, 6);
    clear(this.tvBody).append(...(items.length ? items.map((n) => el('div', { class: 'tv-item' }, n.text)) : [el('div', { class: 'tv-item' }, 'Bugün şehir sakin. Hava güneşli. 🌤️')]));
    this.tvTick.textContent = items.map((n) => n.text).join('   •   ') || 'WORLD CHAOS TV — 7/24 haber';
  }

  flash() {
    this.ui.hud.classList.remove('hurt');
    void this.ui.hud.offsetWidth;
    this.ui.hud.classList.add('hurt');
  }

  // ------------------------------------------------------------------ çanta
  openBag() {
    const s = this.s;
    const inv = s.inventory ?? {};
    const A = (label, cls, fn) => el('button', { class: `btn ${cls}`, onClick: async () => { await fn(); this.openBag(); } }, label);
    const weapons = (s.weapons ?? ['fist']).map((k) => {
      const w = WEAPONS[k];
      return el('button', { class: `btn ${s.weapon === k ? 'primary' : 'ghost'}`, onClick: async () => { await this.h.onEquip(k); this.openBag(); } }, `${w.icon} ${w.label}${w.ammo ? ` · ${s.ammo?.[k] ?? 0} mermi` : ''}`);
    });
    this.ui.openSheet('bag', { icon: '🎒', title: 'Çanta', subtitle: `${tl(s.balance ?? 0)} nakit` },
      el('div', { class: 'grid2' },
        el('div', { class: 'card' }, el('div', { class: 'big-n' }, `🍞 ${inv.food ?? 0}`), el('small', {}, 'Yiyecek'), A('🥪 Ye', 'mini primary', () => this.h.onConsume('food'))),
        el('div', { class: 'card' }, el('div', { class: 'big-n' }, `🥤 ${inv.drink ?? 0}`), el('small', {}, 'İçecek'), A('🥤 İç', 'mini primary', () => this.h.onConsume('drink')))),
      el('h4', {}, '🔫 Silahlar'), el('div', { class: 'col' }, ...weapons),
      el('p', { class: 'muted' }, 'İpucu: Marketten aldıklarını evde buzdolabına koy. Silah dükkanından bıçak, tabanca, tüfek ve mermi alabilirsin.'));
  }
}
