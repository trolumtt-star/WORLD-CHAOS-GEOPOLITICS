# WORLD CHAOS · Dünya Durumu Şeması (State Schema)

**✅ = MVP'de çalışıyor** · **🔜 = alan/şema hazır, sistemi sonraki adımda**

Tüm durum sunucuda, oda başına tek bir `World` nesnesinde tutulur.

```ts
// ================================================================ WORLD
interface World {
  config: Config;                       // ✅ oda başına kopya (denge ayarları)
  clock: GameClock;                     // ✅ { day, hour, minute, totalHours }
  size: number; half: number; gridSize: number; blockSize: number; roadWidth: number; // ✅

  buildings: Map<Id, Building>;         // ✅
  npcs:      Map<Id, NPC>;              // ✅
  players:   Map<Id, Player>;           // ✅
  units:     Map<Id, Unit>;             // ✅ kara birlikleri
  vehicles:  Map<Id, Vehicle>;          // ✅ lojistik kamyonları
  missiles:  Map<Id, Missile>;          // ✅
  interceptors: Interceptor[];          // ✅ hava savunma önleyicileri
  hazards:   Hazard[];                  // ✅ radyasyon bölgeleri

  treasury: number;                     // ✅ devlet hazinesi
  policy:   Policy;                     // ✅ başkanın belirlediği oranlar
  politics: Politics;                   // ✅
  ids: { palace, police, prison, hospital, bank: Id };  // ✅ kritik binalar

  countries?:  Map<Id, Country>;        // 🔜 ülke kurma
  factions?:   Map<Id, Faction>;        // 🔜 mafya / parti / milis
  loans?:      Map<Id, Loan>;           // 🔜 banka
  companies?:  Map<Id, Company>;        // 🔜 borsa
}

// ================================================================ BİNA
type BuildingType =
  | 'house' | 'apartment' | 'villa'                                         // konut
  | 'market' | 'cafe' | 'restaurant' | 'tech_store' | 'gun_shop' | 'bar'   // ticaret
  | 'factory'                                                               // sanayi (subtype)
  | 'palace' | 'police' | 'bank' | 'hospital' | 'prison'                    // devlet
  | 'park' | 'land'                                                         // doğa / arsa
  | 'barracks' | 'missile_silo' | 'air_defense'                             // askeri ✅
  | 'tech_lab' | 'airbase' | 'radar' | 'power_plant' | 'nuclear_silo';      // 🔜

interface Building {
  id: Id; type: BuildingType; subtype: FactorySubtype | null; variant: 0..3;
  name: string; address: string;
  x: number; z: number; width: number; depth: number; height: number;
  door: { x: number; z: number };      // her zaman yolun üstünde
  // Tapu
  value: number; ownerKind: 'state' | 'npc' | 'player'; ownerId: Id | null;
  forSale: boolean; salePrice: number; taxDebt: number; rentPerResident: number;
  // Durum
  construction: { progress: 0..1; hours: number } | null;
  hp: number; maxHp: number; destroyed: boolean; active: boolean;   // active = fabrika çalışıyor
  // İşletme
  balance: number;                     // kasa
  stock: Record<ProductId, StockEntry>;
  revenueToday: number; revenueYesterday: number; unpaidHours: number;
  // İnsanlar
  capacity: number; residentIds: Id[]; employeeIds: Id[]; playerWorkerIds: Id[]; occupants: Set<Id>;
  // Suç
  crimeHeat: number; lastRobbedAt: number;
  // 🔜 countryId, protectionPaidTo (haraç), insurance, powered (elektrik)
}

interface StockEntry {
  qty: number; price: number; sell: boolean;      // sell=false → hammadde
  autoRestock: boolean; restockTo: number; incoming: number;
  soldToday: number; soldYesterday: number; stockouts: number;
}

type FactorySubtype = 'food' | 'drink' | 'steel' | 'electronics' | 'arms'  // ✅
                    | 'oil' | 'lumber' | 'uranium';                         // 🔜

// ================================================================ ÜRÜN
type ProductId = 'food' | 'drink' | 'electronics' | 'steel' | 'weapons'    // ✅
               | 'fuel' | 'lumber' | 'uranium';                            // 🔜
// Zincir: Demir-Çelik → (çelik) → Silah / Elektronik fabrikası → (kamyon) → Mağaza → NPC

// ================================================================ NPC
interface NPC {
  id: Id; name: string; age: number; gender: 'm' | 'f'; alive: boolean;
  job: JobId; workId: Id | null; homeId: Id | null;         // null ev = evsiz
  balance: number; earnedToday: number; ownedBuildingIds: Id[];  // patronlar mülk sahibi
  traits: { greed: 0..1; lawfulness: 0..1; sociability: 0..1; loyalty: 0..1 };
  hunger: 0..100; happiness: 0..100; groceries: number; armed: boolean;
  activity: 'sleep' | 'home' | 'work' | 'buy_food' | 'eat_out' | 'leisure' | 'luxury'
          | 'weapon' | 'job_hunt' | 'crime' | 'jail' | 'respond';
  state: 'inside' | 'moving'; locationId: Id | null; targetId: Id; path: Point[];
  plan: { goesOut; luxury; weapon; crimeTargetId; respondTo; respondUntil };
  rentMissed: number; jailedUntil: number; criminalRecord: number;
  // 🔜
  factionId: Id | null;            // mafya / milis / darbeci birlik
  votingIntent: Id | null;
  bribePrice?: number;             // darbe: sadakati satın almak için gereken para
  rank?: 'private' | 'officer' | 'general';
}
type JobId = 'worker' | 'clerk' | 'waiter' | 'bartender' | 'civil_servant'
           | 'police' | 'banker' | 'doctor' | 'guard' | 'unemployed'          // ✅
           | 'soldier' | 'general' | 'scientist' | 'pilot';                   // 🔜

// ================================================================ OYUNCU
interface Player {
  id: Id; token: string;            // ✅ telefon uykuya girse de karakter korunur
  socketId: string | null; online: boolean;
  name: string; color: string; title: string; isMayor: boolean;
  balance: number; earnedToday: number; ownedBuildingIds: Id[]; jobBuildingId: Id | null;
  x: number; z: number; rotY: number; moveBudget: number;   // hız hilesi koruması
  wanted: 0..5; jailedUntil: number; lastRobAt: number; campaign?: number;
  techLevel: 1..4;                  // 🔜 tech tree (MVP'de 2: kara ordusu açık)
  countryId: Id | null; allianceIds: Id[];   // 🔜
}

// ================================================================ ASKERİ
interface Unit {                     // ✅ infantry | tank   🔜 jet | stealth | cargo_plane
  id: Id; type: UnitType; ownerId: Id; color: string;
  x: number; z: number; rotY: number; aimRot: number;
  hp: number; maxHp: number; path: Point[]; cooldown: number;
  altitude?: number;                 // 🔜 hava birlikleri
  stealth?: boolean;                 // 🔜 radarda görünmez
}

interface Missile {                  // ✅ tactical | ballistic | nuclear
  id: Id; type: MissileType; ownerId: Id;
  from: Point; to: Point; start: number /*ms*/; flightMs: number; apex: number;
  engagedUntil: number;
  // konum(t) = lerp(from, to, s), y = 4·apex·s·(1−s),  s = (t − start) / flightMs
}

interface Interceptor { id: Id; missileId: Id; hitAt: number; success: boolean; at: Point3 }
interface Hazard { kind: 'radiation'; x: number; z: number; radius: number; untilHour: number }

// ================================================================ SİYASET
interface Policy { incomeTax: 0..0.5; salesTax: 0..0.4; propertyTax: number; welfare: number }
interface Politics {
  mayor: { kind: 'npc' | 'player'; id: Id; name: string; party: string };
  opposition: { name: string; party: string };
  candidates: { playerId: Id; name: string; campaign: number }[];
  nextElectionDay: number; lastResult: { name: string; pct: number }[] | null;
  // 🔜 coup: { leaderId, bribedUnitIds[], startedAt, palaceHp }
}

// ================================================================ 🔜 GELECEK MODÜLLER
interface Country { id: Id; name: string; leaderId: Id; color: string;
  territory: Id[] /* lot id'leri */; treasury: number; policy: Policy; techLevel: 1..4;
  relations: Record<Id, 'war' | 'neutral' | 'ally'>; }
interface Faction { id: Id; kind: 'mafia' | 'party' | 'militia'; bossId: Id; memberIds: Id[];
  protectedBuildingIds: Id[] /* haraç */; }
interface Loan { id: Id; borrowerId: Id; principal: number; rate: number; dueDay: number;
  collateralIds: Id[] /* ödenmezse haciz */; }
interface Company { id: Id; name: string; buildingIds: Id[]; shares: Record<Id, number>; sharePrice: number }
interface TechNode { id: string; level: 1..4; cost: number; hours: number; unlocks: string[] }
```

## Kimlik önekleri

`b` bina · `n` NPC · `p` oyuncu · `u` birlik · `v` araç · `m` füze · `i` önleyici
