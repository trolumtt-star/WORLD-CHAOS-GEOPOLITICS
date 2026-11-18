# WORLD CHAOS · Mimari

## 1. Büyük resim

```
┌──────────────────────── İSTEMCİ (Tarayıcı / Android APK) ────────────────────────┐
│  main.js (durum makinesi: boot → intro → menü ⇄ oyun)                             │
│   ├─ ui/       Intro · Menu · GameUI (HUD, paneller, modal) · Minimap             │
│   ├─ render/   SceneKit (ışık, gökyüzü, gün-gece) · CityRenderer · BuildingFactory│
│   │            Effects (GPU parçacık, patlama, mantar bulutu, füze, iz)           │
│   ├─ entities/ EntityManager (oyuncu, NPC instanced, tank/piyade, kamyon)         │
│   ├─ input/    CameraRig (orbit/pinch) · Controls (WASD + sanal joystick)         │
│   ├─ game/     Game (oturum, ağ olayları, hedefleme) · PlayerController           │
│   ├─ audio/    AudioEngine (prosedürel SFX + üretken müzik, dosya yok)            │
│   └─ net/      Network (socket.io sarmalayıcı)                                    │
└───────────────────────────────▲───────────────────────────┬───────────────────────┘
          SNAPSHOT 20/10/5 Hz,   │                           │  PLAYER_MOVE 20 Hz
          olaylar, CLOCK (saatlik)│        Socket.io          │  ACTION {action, params} → ack
┌───────────────────────────────┴───────────────────────────▼───────────────────────┐
│                               SUNUCU (Node.js)                                    │
│  index.js → Lobby (oda kur/katıl/yeniden bağlan) → Room × N                       │
│  Room = kendi World + GameEngine + sistemleri olan bağımsız evren                 │
│   ├─ core/      GameEngine (tick) · GameClock · EventBus · rng (seed'li)          │
│   ├─ world/     World (durum) · WorldGenerator (Genesis) · BuildingSetup · Path   │
│   ├─ entities/  Building · NPC · Player · Unit · Vehicle                          │
│   ├─ systems/   14 sistem (aşağıda)                                               │
│   ├─ actions/   Oyuncu eylemleri (tek kapı, ~25 eylem)                            │
│   ├─ services/  InspectService (panel içeriği + o oyuncuya özel butonlar)         │
│   └─ data/      Kataloglar: bina, ürün, meslek, askeri, isimler                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

**Otorite sunucudadır.** İstemci yalnızca kendi yürüyüşünü hesaplar (akıcı his için); sunucu bunu "hareket bütçesi" ile doğrular. Para, mülk, NPC zekâsı, üretim, füze balistiği ve çatışma tamamen sunucuda çalışır.

## 2. Klasör yapısı

```
world-chaos/
├─ server/
│  ├─ index.js                 Express + Socket.io + /vendor (three, socket.io istemcisi)
│  ├─ config.js                TÜM denge ayarları (oda başına kopyalanır)
│  ├─ core/                    GameEngine.js · GameClock.js · EventBus.js · rng.js
│  ├─ lobby/                   Lobby.js · Room.js
│  ├─ world/                   World.js · WorldGenerator.js · BuildingSetup.js · Pathfinding.js
│  ├─ entities/                Building.js · NPC.js · Player.js · Unit.js (+Vehicle)
│  ├─ systems/                 Needs · NpcBrain · Commerce · Production · Logistics · Payroll ·
│  │                           RealEstate · Crime · Politics · Tax · Military · Missile · Population
│  ├─ network/                 NetworkSyncSystem.js
│  ├─ actions/index.js         property:* · shop:* · job:* · crime:* · politics:* · military:*
│  ├─ services/InspectService.js
│  └─ data/                    buildingTypes · products · jobs · military · names
├─ shared/events.js            Ortak olay isimleri
├─ public/                     İstemci (index.html, css/, js/)
├─ scripts/build-mobile.js     APK için www/ hazırlar
├─ capacitor.config.json
├─ .github/workflows/android-apk.yml   Bulutta APK derleme
└─ docs/                       ARCHITECTURE.md · STATE_SCHEMA.md
```

## 3. Tick motoru

`GameEngine.step()` her **50 ms**'de çalışır (20 Hz). 1 oyun saati = 5 sn (`MS_PER_HOUR` ile değişir).

1. Saat ilerler. Bir saat sınırı geçildiyse: (gece yarısıysa) tüm `onDay` → tüm `onHour`
2. Tüm `onTick(dt)` (NPC yürüyüşü, kamyonlar, birlikler, füzeler, ağ)

Sistemler **kayıt sırasıyla** çalışır (Room.js):

| # | Sistem | onTick | onHour | onDay |
|---|---|---|---|---|
| 1 | Needs | | açlık, evde yemek, personel yemeği, mutluluk, ölüm | |
| 2 | NpcBrain | yürüyüş | karar: iş / yemek / alışveriş / suç / eğlence / uyku | günlük plan |
| 3 | Commerce | | bar harcaması | NPC dükkan fiyatlarını talebe göre ayarlama |
| 4 | Production | | fabrika üretimi (işçi × verim, girdi tüketimi) | |
| 5 | Logistics | kamyon hareketi | stok azalınca toptan sipariş | |
| 6 | Payroll | | maaş, işe alım, işten çıkarma | işsizlik maaşı, temettü, sermaye desteği |
| 7 | RealEstate | | inşaat ilerlemesi | kira, icra, evsizler, NPC alıcılar, değer dalgalanması |
| 8 | Crime | | oyuncu yakalanma riski, tahliye | NPC soygun planı |
| 9 | Politics | | | seçim (N günde bir) |
| 10 | Tax | | | gelir vergisi, KDV, emlak vergisi |
| 11 | Military | hareket + otomatik çatışma | | |
| 12 | Missile | balistik, hava savunması, çarpma | radyasyon süresi | |
| 13 | Population | | | göç alma / verme |
| 14 | NetworkSync | snapshot + kirli veriler | CLOCK | |

Sistemler birbirini doğrudan çağırmaz; **EventBus** üzerinden konuşur (`npc:arrived`, `building:destroyed`, `economy:taxCollected`, `net:*`).

## 4. Ağ protokolü (shared/events.js)

| Olay | Yön | İçerik |
|---|---|---|
| `lobby:list` / `room:create` / `room:join` / `room:leave` | C→S (ack) | oda işlemleri, `token` ile yeniden bağlanma |
| `world:init` | S→C | tüm dünya: binalar, NPC'ler, birlikler, füzeler, katalog, saat |
| `snapshot` | S→C (volatile) | `p` oyuncular 20 Hz · `u` birlikler 10 Hz · `n` NPC + `v` kamyon 5 Hz |
| `building:update` | S→C | değişen binalar (inşaat %, hasar, sahip, satılık) |
| `player:state` | S→tek C | cüzdan, aranma, hapis, unvan, mülkler |
| `entity:spawn` / `entity:remove` | S→C | npc / unit / vehicle |
| `fx` | S→C | `shot`, `explosion`, `alarm`, `built` |
| `missile` | S→C | `launch`, `intercept`, `destroyed`, `miss`, `impact`, `hazards` |
| `alert` | S→C | `nuclear` / `warning` / `info` |
| `clock:hour` | S→C | saat, hazine, istatistik, siyaset, servet sıralaması |
| `world:news` | S→C | haber akışı |
| `action` | C→S (ack) | `{ action, params }` → `{ ok, error, message, sfx }` |
| `entity:inspect` | C→S (ack) | panel içeriği + o oyuncuya özel `actions[]` |

**Füzeler deterministiktir:** sunucu yalnızca `launch` (çıkış, hedef, süre, apex) gönderir; istemci aynı parabol formülüyle çizer. Kare başı konum yayını yok.

## 5. Yeni sistem eklemek (ör. Banka & Kredi)

1. `server/systems/BankSystem.js` → `onDay`: faiz işlet, vadesi geçen kredide `world.setOwner(b, 'state')` ile haciz uygula
2. `server/actions/index.js` → `'bank:loan'(ctx, p, { amount })`
3. `server/services/InspectService.js` → `b.type === 'bank'` iken `A('💳 Kredi Çek', 'bank:loan', {}, { input: {...} })`
4. `Room.js` → `.use(new BankSystem())` (NetworkSync'ten önce)

İstemcide hiçbir şey değiştirmen gerekmez: buton, form, onay ve sonuç bildirimi otomatik çalışır.

## 6. Performans notları (mobil)

- Her bina, tüm parçaları vertex renkli **tek mesh**'e birleştirilerek çizilir (bina başı ~2 draw call)
- NPC'ler 2 adet `InstancedMesh` (400 kapasite) ile çizilir, yani tüm nüfus 2 draw call
- Ağaç ve sokak lambaları da instanced
- Parçacıklar GPU'da: tüm ateş, duman ve kıvılcımlar 2 draw call
- Kalite ayarı (Düşük / Orta / Yüksek): piksel oranı, gölge ve parçacık yoğunluğu
- Ses dosyası yok, her şey WebAudio ile sentezleniyor (APK küçük kalır)
