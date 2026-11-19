import { interiorLayout } from '../../shared/interiors.js';
import { JOBS, ACTIVITY_LABELS, inHours, wageOf } from '../data/jobs.js';
import { PRODUCTS } from '../data/products.js';
import { labelOf } from '../data/buildingTypes.js';
import { UNIT_TYPES } from '../data/military.js';
import { ERAS, TECHS, playerEra } from '../data/tech.js';
import { TERRAIN_LABELS } from '../systems/TerritorySystem.js';

const tl = (n) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const pad = (n) => String(n).padStart(2, '0');
const hours = (r) => (r ? `${pad(r[0])}:00–${pad(r[1])}:00` : '7/24');
const bar = (v) => '█'.repeat(Math.round(v / 10)) + '░'.repeat(10 - Math.round(v / 10));

/**
 * Bilgi paneli: ne görünür + bu oyuncu burada ne yapabilir (actions).
 * İstemci action listesini olduğu gibi butona çevirir; yeni eylem eklemek için
 * buraya bir satır + actions/ altına bir handler eklemek yeterli.
 */
export function describe(ctx, kind, id, player) {
  const { world } = ctx;
  if (kind === 'shop') {
    const b = world.buildings.get(id);
    if (!b) return null;
    const items = Object.entries(b.stock).filter(([, s]) => s.sell).map(([k, s]) => ({ product: k, label: PRODUCTS[k]?.label ?? k, icon: PRODUCTS[k]?.icon ?? '📦', price: s.price, qty: Math.floor(s.qty) }));
    return { kind: 'shop', id: b.id, type: b.type, title: b.name, served: !!b.def.served, open: world.isOpen(b), items, weaponStock: Math.floor(b.stock.weapons?.qty ?? 0) };
  }
  const e = world.findEntity(kind, id);
  if (!e) return null;
  if (kind === 'building') return describeBuilding(ctx, e, player);
  if (kind === 'npc') return describeNpc(ctx, e, player);
  if (kind === 'player') return describePlayer(ctx, e, player);
  if (kind === 'tile') return describeTile(ctx, e, player);
  if (kind === 'unit') {
    const owner = world.players.get(e.ownerId);
    return { kind, id, icon: UNIT_TYPES[e.type].icon, title: UNIT_TYPES[e.type].label, subtitle: owner?.name ?? '?', rows: [['Can', `${Math.round((e.hp / e.maxHp) * 100)}%`], ['Menzil', `${e.def.range} m`]], actions: [] };
  }
  return null;
}

function describeBuilding(ctx, b, p) {
  const { world, config } = ctx;
  const def = b.def;
  const isOwner = b.ownerKind === 'player' && b.ownerId === p.id;
  const jailed = p.jailedUntil > world.clockHours();
  const rows = [
    ['Tür', labelOf(b)],
    ['Sahibi', world.ownerName(b)],
    ['Adres', b.address],
    ['Değer', tl(b.value)],
  ];
  if (b.forSale) rows.push(['Satılık', tl(b.salePrice)]);
  if (b.construction) rows.push(['İnşaat', `%${Math.round(b.construction.progress * 100)}`]);
  if (b.destroyed) rows.push(['Durum', '🔥 YIKILMIŞ']);
  else if (b.hp < b.maxHp) rows.push(['Hasar', `%${Math.round((1 - b.hp / b.maxHp) * 100)}`]);

  if (b.operational && def.open) rows.push(['Saatler', `${hours(def.open)} · ${world.isOpen(b) ? '🟢 Açık' : '🔴 Kapalı'}`]);
  if (b.operational) {
    for (const [product, s] of Object.entries(b.stock)) {
      if (!s.sell) continue;
      rows.push([`${PRODUCTS[product].icon} ${PRODUCTS[product].label}`, `${tl(s.price)} · stok ${Math.floor(s.qty)}`]);
    }
  }
  if (def.staff) rows.push(['Personel', `${b.employeeIds.length}/${def.staff.count} ${JOBS[def.staff.job].label}`]);
  if (def.category === 'residential' && b.operational) {
    rows.push(['Sakinler', `${b.residentIds.length}/${b.capacity}`]);
    rows.push(['Kira', `${tl(b.rentPerResident)} / kişi / gün`]);
  }
  if (b.type === 'factory' && b.operational) rows.push(['Üretim', b.active ? '⚙️ Çalışıyor' : '⏸️ Durdu']);
  if (b.type === 'palace') {
    rows.push(['Hazine', tl(world.treasury)]);
    rows.push(['Başkan', `${world.politics.mayor?.name} (${world.politics.mayor?.party ?? ''})`]);
    rows.push(['Seçim', `Gün ${world.politics.nextElectionDay}`]);
    rows.push(['Vergiler', `Gelir %${Math.round(world.policy.incomeTax * 100)} · KDV %${Math.round(world.policy.salesTax * 100)} · Emlak ‰${(world.policy.propertyTax * 1000).toFixed(1)}`]);
  }
  if (b.type === 'town_hall') {
    const owner = world.getOwner(b);
    if (owner) {
      const era = ERAS[playerEra(owner)];
      rows.push(['Çağ', `${era.icon} ${era.label} (${era.years})`]);
      rows.push(['Ülke', `${owner.isAI ? '🤖 ' : ''}${owner.countryName ?? owner.name}`]);
      rows.push(['Nüfus', `${world.populationOf(owner.id)} kişi`]);
      rows.push(['Toprak', `${world.ownedTileCount(owner.id)} parsel`]);
      const wars = world.warsOf(owner.id).map((id) => world.players.get(id)?.countryName ?? id);
      if (wars.length) rows.push(['Savaşta', `⚔️ ${wars.join(', ')}`]);
      rows.push(['Teknoloji', `${owner.techs.length}/${Object.keys(TECHS).length}`]);
      if (owner.research) rows.push(['Araştırılıyor', `${TECHS[owner.research.techId].icon} ${TECHS[owner.research.techId].label} · ${owner.research.hoursLeft} saat`]);
    }
  }
  if ((b.adUntil ?? 0) > world.clockHours()) rows.push(['Reklam', `📣 ${b.adUntil - world.clockHours()} saat daha etkili`]);
  if (b.crimeHeat > 1) rows.push(['Suç riski', '⚠️'.repeat(Math.min(3, Math.round(b.crimeHeat / 2)))]);

  const actions = [];
  const A = (label, type, params = {}, extra = {}) => actions.push({ label, type, params: { buildingId: b.id, ...params }, ...extra });

  if (jailed) {
    if (b.type === 'prison') {
      const left = p.jailedUntil - world.clockHours();
      A(`🔓 Kefalet Öde · ${tl(left * config.crime.bailPerHour)}`, 'crime:bail', {}, { style: 'primary' });
    }
    return { kind: 'building', id: b.id, icon: def.icon, title: b.name, subtitle: labelOf(b), rows, actions };
  }

  // İçeri gir (ev: sahibi/evi olan/misafir, dükkan: açık saatler, iş yeri: çalışanlar)
  if (interiorLayout(b.type) && b.operational && !p.inside) {
    const access = ctx.engine.getSystem('life').canEnter(p, b);
    A(access.ok ? '🚪 İçeri Gir' : `🔒 ${access.error.replace(/^🔒 |^🌙 /, '')}`, 'building:enter', {}, { style: access.ok ? 'primary' : 'ghost' });
  }
  if (b.id === p.homeId || (isOwner && def.category === 'residential')) {
    A(b.guestsOpen ? '🔒 Kapıyı Kilitle' : '🚪 Kapıyı Misafirlere Aç', 'home:guests', { open: !b.guestsOpen }, { style: 'ghost' });
  }

  if (b.forSale && !isOwner) {
    A(`🔑 Tapuyu Satın Al · ${tl(b.salePrice)}`, 'property:buy', {}, { style: 'primary', confirm: `${b.name} için ${tl(b.salePrice)} ödenecek. Onaylıyor musun?` });
  }

  let manage = null;
  if (isOwner) {
    if (b.type === 'land' && !b.construction) actions.push({ label: '🏗️ İnşa Et', ui: 'build', params: { buildingId: b.id }, style: 'primary' });
    if (b.type === 'town_hall') {
      actions.push({ label: '🔬 Teknoloji Ağacı', ui: 'tech', params: {}, style: 'primary' });
      actions.push({ label: '🗺️ Toprak Genişlet (Harita)', ui: 'map', params: {} });
    }
    if (b.category === 'commercial' && b.operational) actions.push({ label: '📣 Reklam Ver', ui: 'advertise', params: { buildingId: b.id } });
    if (b.destroyed) A('🧹 Enkazı Kaldır · ₺500', 'property:clear', {}, { style: 'primary' });
    if (b.type === 'barracks' && b.operational) actions.push({ label: '🪖 Ordu Komutası', ui: 'military', params: {}, style: 'primary' });
    if (b.type === 'missile_silo' && b.operational) actions.push({ label: '🚀 Füze Komutası', ui: 'missiles', params: {}, style: 'danger' });
    if (b.type === 'airbase' && b.operational) actions.push({ label: '✈️ Hava Kuvvetleri', ui: 'military', params: {}, style: 'danger' });
    if (def.category === 'residential' && b.operational) {
      A('🏷️ Kira Belirle', 'property:setRent', {}, { input: { title: 'Kişi başı günlük kira', fields: [{ key: 'rent', label: 'Kira (₺)', kind: 'number', min: 0, max: 500, value: b.rentPerResident }] } });
    }
    if (b.isBusiness && b.operational) {
      A('💰 Kasadan Çek', 'property:withdraw', {}, { input: { title: `Kasa: ${tl(b.balance)}`, fields: [{ key: 'amount', label: 'Tutar', kind: 'number', min: 1, max: Math.floor(b.balance), value: Math.floor(b.balance) }] } });
      A('🏦 Kasaya Koy', 'property:deposit', {}, { style: 'ghost', input: { title: 'Kasaya para koy', fields: [{ key: 'amount', label: 'Tutar', kind: 'number', min: 1, max: Math.floor(p.balance), value: 500 }] } });
      manage = buildManage(ctx, b);
    }
    if (b.type === 'town_hall') { /* konak satılamaz */ } else if (b.forSale) A('❌ İlanı Kaldır', 'property:unlist', {}, { style: 'ghost' });
    else A('📢 Satışa Çıkar', 'property:list', {}, { style: 'ghost', input: { title: 'Satış fiyatı', fields: [{ key: 'price', label: 'Fiyat (₺)', kind: 'number', min: 1, value: Math.round(b.value * 1.2) }] } });
  } else if (b.operational) {
    const staff = def.staff;
    if (staff) {
      if (p.jobBuildingId === b.id) A('🚪 İşten Ayrıl', 'job:quit', {}, { style: 'ghost' });
      else {
        const job = JOBS[staff.job];
        A(`💼 Burada Çalış · ${tl(wageOf(staff.job, ctx.config))}/saat (${hours(job.shift)})`, 'job:apply');
      }
    }
    if (def.category === 'commercial') {
      A('🔫 Soygun Yap', 'crime:rob', {}, { style: 'danger', confirm: 'Aranma seviyen artacak ve polis peşine düşecek. Emin misin?' });
    }
  }

  if (b.type === 'town_hall' && b.ownerKind === 'player' && b.ownerId !== p.id) actions.push(...diplomacyActions(world, p, b.ownerId, ctx));

  if (b.type === 'palace') {
    const pol = world.politics;
    const isCandidate = pol.candidates.some((c) => c.playerId === p.id);
    if (!p.isMayor && !isCandidate) {
      A(`🗳️ Başkanlığa Aday Ol · ${tl(config.politics.candidateFee)}`, 'politics:run', {}, { style: 'primary' });
    }
    if (p.isMayor || isCandidate) {
      A('📣 Seçim Kampanyası', 'politics:campaign', {}, { input: { title: 'Kampanyaya bütçe ayır', fields: [{ key: 'amount', label: 'Tutar (₺)', kind: 'number', min: 100, max: Math.floor(p.balance), value: 1000 }] } });
    }
    if (p.isMayor) {
      A('📜 Vergi & Sosyal Politika', 'politics:setPolicy', {}, { style: 'primary', input: { title: 'Belediye meclisi kararı', fields: [
        { key: 'incomeTax', label: 'Gelir Vergisi %', kind: 'number', min: 0, max: 50, value: Math.round(world.policy.incomeTax * 100) },
        { key: 'salesTax', label: 'KDV %', kind: 'number', min: 0, max: 40, value: Math.round(world.policy.salesTax * 100) },
        { key: 'propertyTax', label: 'Emlak Vergisi ‰', kind: 'number', min: 0, max: 20, step: 0.5, value: world.policy.propertyTax * 1000 },
        { key: 'welfare', label: 'İşsizlik Maaşı ₺/gün', kind: 'number', min: 0, max: 100, value: world.policy.welfare },
      ] } });
      A('🤫 Örtülü Ödenek (Hazineden Çek)', 'politics:embezzle', {}, { style: 'danger', input: { title: `Hazine: ${tl(world.treasury)} — yakalanırsan skandal çıkar!`, fields: [{ key: 'amount', label: 'Tutar', kind: 'number', min: 1, max: Math.floor(world.treasury * 0.5), value: 1000 }] } });
    }
  }

  return { kind: 'building', id: b.id, icon: def.icon, title: b.name, subtitle: labelOf(b), rows, actions, manage };
}

function buildManage(ctx, b) {
  const logistics = ctx.engine.getSystem('logistics');
  return {
    buildingId: b.id,
    till: Math.round(b.balance),
    revenueToday: Math.round(b.revenueToday),
    revenueYesterday: Math.round(b.revenueYesterday ?? 0),
    stock: Object.entries(b.stock).map(([product, s]) => {
      const supplier = logistics.findSupplier(ctx, b, product);
      return {
        product,
        label: PRODUCTS[product].label,
        icon: PRODUCTS[product].icon,
        qty: Math.floor(s.qty),
        price: s.price,
        sell: s.sell,
        incoming: s.incoming,
        autoRestock: s.autoRestock,
        restockTo: s.restockTo,
        soldYesterday: s.soldYesterday ?? 0,
        wholesale: supplier ? supplier.stock[product].price : null,
      };
    }),
  };
}

function describeTile(ctx, t, p) {
  const { world, engine } = ctx;
  const ter = engine.getSystem('territory');
  const ownerName = t.owner === 'state' ? '🏛️ Merkez Kasaba' : t.owner ? (world.players.get(t.owner)?.countryName ?? world.players.get(t.owner)?.name ?? '?') : '— Sahipsiz —';
  const explored = t.exploredBy.has(p.id);
  const rows = [
    ['Arazi', TERRAIN_LABELS[t.terrain]],
    ['Sahibi', ownerName],
    ['Konum', `Parsel ${t.i}-${t.j}`],
    ['Keşif', explored ? '✅ Keşfedildi' : '❔ Keşfedilmedi'],
  ];
  const actions = [];
  const params = { i: t.i, j: t.j };
  if (!t.owner && t.terrain !== 'w') {
    const adj = ter.isAdjacent(world, t, p.id);
    rows.push(['Sınırına komşu', adj ? 'Evet' : 'Hayır']);
    if (!explored) actions.push({ label: `🧭 Kaşif Gönder · ₺${world.config.territory.scoutCost}`, type: 'explore:scout', params, style: 'primary' });
    else if (adj) {
      const cost = ter.claimCost({ world, config: world.config }, p);
      actions.push({ label: `🚩 Sınırı Ör ve Sahiplen · ₺${cost.toLocaleString('tr-TR')}`, type: 'territory:claim', params, style: 'primary', confirm: `Bu parseli ₺${cost.toLocaleString('tr-TR')} karşılığında topraklarına katmak istiyor musun?` });
    }
  }
  if (t.owner && t.owner !== 'state' && t.owner !== p.id) actions.push(...diplomacyActions(world, p, t.owner, ctx));
  if (t.owner && t.owner !== 'state') {
    const o = world.players.get(t.owner);
    if (o) {
      rows.push(['Ülke', `${o.isAI ? '🤖 ' : ''}${o.countryName ?? o.name}`]);
      rows.push(['Nüfus', `${world.populationOf(o.id)} kişi`]);
      if (o.id !== p.id) rows.push(['İlişki', world.atWar(p.id, o.id) ? '⚔️ SAVAŞ' : '🤝 Barış']);
    }
  }
  const b = world.buildings.get(t.buildingId);
  if (b) actions.push({ label: `🔍 ${b.name}`, inspect: { kind: 'building', id: b.id }, params: {} });
  return { kind: 'tile', id: `${t.i},${t.j}`, icon: TERRAIN_LABELS[t.terrain].split(' ')[0], title: `${TERRAIN_LABELS[t.terrain].split(' ')[1]} · ${t.i}-${t.j}`, subtitle: ownerName, rows, actions };
}

export function diplomacyActions(world, p, targetId, ctx) {
  const t = world.players.get(targetId);
  if (!t || !p.village) return [];
  const name = t.countryName ?? t.name;
  const out = [];
  const P = { targetId };
  const dip0 = ctx?.engine?.getSystem('diplomacy');
  if (t.overlordId === p.id) {
    out.push({ label: `🗽 ${name}'ı Serbest Bırak (kukla)`, type: 'war:release', params: { puppetId: targetId }, style: 'ghost', confirm: `${name} artık sana vergi ödemeyecek. Emin misin?` });
    return out;
  }
  if (p.overlordId === targetId) {
    out.push({ label: `🗽 Bağımsızlığını Satın Al · ₺${dip0.independenceCost(p).toLocaleString('tr-TR')}`, type: 'war:independence', params: {}, style: 'primary', confirm: 'Bu para efendine gidecek ve artık vergi ödemeyeceksin.' });
    return out;
  }
  if (world.atWar(p.id, targetId)) {
    const sg = dip0.siege(p.id, targetId);
    if (sg.ok) {
      out.push({ label: `🎎 Teslim Al: KUKLA DEVLET Yap (her gün %15 vergi)`, type: 'war:conquer', params: { targetId, mode: 'puppet' }, style: 'primary', confirm: `${name} sana bağlı kukla devlet olsun mu? Ülkesi kalır ama her gün hazinesinin %15'ini sana öder.` });
      out.push({ label: `🏴 Teslim Al: İLHAK ET (her şeyi al)`, type: 'war:conquer', params: { targetId, mode: 'annex' }, style: 'danger', confirm: `${name} haritadan silinsin mi? Tüm toprakları, binaları ve nüfusu senin olur; ordusu dağılır.` });
    } else {
      out.push({ label: `🏰 Kuşatma: sarayın çevresinde ${sg.mine}/3 askerin · ${sg.theirs} savunan${sg.destroyed ? ' · saray yıkık' : ''}`, type: 'war:conquer', params: { targetId, mode: 'puppet' }, style: 'ghost' });
    }
    out.push({ label: `🕊️ ${name}'a Barış Teklif Et`, type: 'war:peace', params: P });
  } else {
    const ready = world.justifications.get(`${p.id}>${targetId}`);
    if (!ready) out.push({ label: `📜 Savaş Gerekçesi Hazırla (3 dk) · ${name}`, type: 'war:justify', params: P, style: 'danger', confirm: `${name}'a karşı savaş gerekçesi hazırlansın mı? Karşı taraf istihbarattan haberdar olacak.` });
    else if (Date.now() < ready) out.push({ label: `⏳ Gerekçe hazırlanıyor · ${Math.ceil((ready - Date.now()) / 1000)} sn`, type: 'war:declare', params: P, style: 'ghost' });
    else out.push({ label: `⚔️ ${name}'a SAVAŞ İLAN ET`, type: 'war:declare', params: P, style: 'danger', confirm: `${name}'a savaş ilan edilsin mi? Askerlerin, füzelerin ve uçakların artık onlara saldırabilir.` });
  }
  const dip = ctx?.engine?.getSystem('diplomacy');
  if (dip?.peaceOffers.has(`${targetId}>${p.id}`)) out.push({ label: `🤝 ${name}'ın Barış Teklifini Kabul Et`, type: 'war:acceptPeace', params: { fromId: targetId }, style: 'primary' });
  return out;
}

function describeNpc({ world }, n, viewer) {
  const work = world.buildings.get(n.workId);
  const home = world.buildings.get(n.homeId);
  const now = world.clockHours();
  const rows = [
    ['Yaş', String(n.age)],
    ['Meslek', JOBS[n.job].label + (n.isBoss ? ' · 👔 PATRON' : '')],
    ['İş yeri', work?.name ?? '—'],
    ['Durum', (n.state === 'moving' ? '🚶 Yolda → ' : '') + (ACTIVITY_LABELS[n.activity] ?? n.activity)],
    ['Açlık', bar(n.hunger)],
    ['Mutluluk', bar(n.happiness)],
    ['Cüzdan', tl(n.balance)],
    ['Ev', home?.name ?? '🏚️ Evsiz'],
  ];
  if (n.ownedBuildingIds.length) rows.push(['Mülkler', n.ownedBuildingIds.map((id) => world.buildings.get(id)?.name).filter(Boolean).join(', ')]);
  if (n.criminalRecord) rows.push(['Sabıka', `${n.criminalRecord} kayıt`]);
  if (n.jailedUntil > now) rows.push(['Hapis', `${n.jailedUntil - now} saat kaldı`]);
  if (n.armed) rows.push(['⚠️', 'Silahlı']);
  const actions = [];
  if (n.robberUntil > now) {
    rows.unshift(['🚨', 'ARANAN SOYGUNCU!']);
    actions.push({ label: '🚔 Tutukla', type: 'police:arrest', params: { npcId: n.id }, style: 'primary' });
  }
  if (n.state !== 'inside' && !viewer?.inside) actions.push({ label: '👊 Saldır', type: 'combat:attack', params: { kind: 'npc', id: n.id }, style: 'danger' });
  rows.push(['Can', bar(n.hp)]);
  return { kind: 'npc', id: n.id, icon: n.gender === 'f' ? '👩' : '👨', title: n.name, subtitle: JOBS[n.job].label, rows, actions };
}

function describePlayer({ world }, p, viewer) {
  let assets = 0;
  for (const id of p.ownedBuildingIds) assets += world.buildings.get(id)?.value ?? 0;
  return {
    kind: 'player', id: p.id, icon: '⭐', title: p.name, subtitle: p.title,
    rows: [
      ['Net servet', tl(p.balance + assets)],
      ['Mülk', `${p.ownedBuildingIds.length} adet`],
      ['Aranma', p.wanted ? '⭐'.repeat(p.wanted) : 'Temiz'],
      ['Ülke', p.countryName ? `🏳️ ${p.countryName}` : `Vatandaş · ${p.citizenName ?? '—'}`],
    ],
    actions: viewer && viewer.id !== p.id && !p.dead ? [{ label: '👊 Saldır', type: 'combat:attack', params: { kind: 'player', id: p.id }, style: 'danger' }] : [],
  };
}
