// Tüm denge ayarları. Her oda bunun bir kopyasıyla başlar (structuredClone).
export const CONFIG = {
  port: Number(process.env.PORT) || 3000,
  maxPlayersPerRoom: 10,
  maxRooms: 30,
  roomIdleCloseMs: 15 * 60 * 1000, // boş oda 15 dk sonra kapanır (telefonu kilitleyen geri dönebilsin)

  persistence: {
    saveEveryMs: 60_000,     // her dakika kaydet
    maxCatchUpHours: 120,    // uyurken en fazla 5 oyun günü telafi
    unloadIdleMs: 10 * 60_000, // boş dünya 10 dk sonra kaydedilip bellekten çıkar
  },

  world: {
    gridSize: 28,   // 28x28 parsel açık dünya (1232 x 1232 birim)
    townSize: 5,    // merkezdeki tarafsız kasaba (5x5 parsel)
    blockSize: 44,
    roadWidth: 9,
  },

  genesis: {
    npcCount: 30,           // merkez kasaba nüfusu
    villagersPerPlayer: 8,  // her oyuncu köyüyle gelen köylüler
    unemploymentChance: 0.08,
    npcBalance: [150, 1500],
    bossBonus: [2000, 8000],
    forSaleChance: 0.12, // NPC işletmelerinin/evlerinin bir kısmı satılık başlar
  },

  population: {
    target: 90,              // göçle ulaşılmaya çalışılan nüfus
    maxImmigrantsPerDay: 3,
  },

  npc: {
    speed: 13,              // saatte 65 birim -> gerçek zamanda ~6.5 birim/sn (yürüyen insan)
    hungerPerHour: 4,
    eatAtHomeAbove: 40,
  },

  player: {
    speed: 8,               // yürüme
    sprintMultiplier: 1.9,  // koşu ~15
    startBalance: [25000, 25000], // ülke modu: başkan 25.000₺ ile başlar
    rentMul: 3,               // oyuncu kirası = ev başı kira × 3
    sandboxBalance: 10_000_000,
    maxUnits: 30,
  },

  time: {
    msPerGameHour: Number(process.env.MS_PER_HOUR) || 10000, // 1 oyun günü = 4 dk. Test için: MS_PER_HOUR=500 npm start (10x hız)
    startHour: 7,
    simTickMs: 50,
    npcNetEvery: 4,  // 5 Hz
    unitNetEvery: 2, // 10 Hz
  },

  economy: {
    startingTreasury: 30000,
    wholesaleMarkup: 1.25,
    restockFraction: 0.35,     // stok hedefin %35'ine inince sipariş
    factoryMaxStock: 400,
    rawMaterialRatio: 0.35,    // girdisiz üretimde birim başı ham madde maliyeti
    businessReserve: 1500,
    dividendRate: 0.3,
    truckSpeed: 34,
  },

  // Belediye başkanı bu değerleri oyunda değiştirebilir
  policy: {
    incomeTax: 0.15,
    salesTax: 0.08,
    propertyTax: 0.002,
    welfare: 12, // işsizlik maaşı / gün
  },

  territory: {
    baseClaimCost: 1200,   // her yeni parsel: baseClaimCost * (1 + 0.1 * sahip olunan) * (1 + 0.35 * (çağ-1))
    scoutCost: 100,
    villageMinDistance: 6, // köyler arası en az parsel mesafesi
  },

  ai: {
    nations: 3,             // NPC ülke sayısı
    hourlyStipend: 90,      // çağ başına saatlik devlet geliri
    warChancePerDay: 0.18,  // savaş açma ihtimali (gün başına)
    firstWarDay: 3,
  },

  // Oyuncu hayatta kalma (saat başı değişim, 0..100)
  life: {
    foodPerHour: 0,        // ülke modu: açlık/susuzluk/enerji yok        // tam tok -> aç: ~83 oyun saati (~14 dk)
    waterPerHour: 0,       // ~62 oyun saati (~10 dk)
    energyPerHour: 0,      // uyanıkken ~55 oyun saati (~9 dk)
    sleepEnergyPerHour: 24,
    starveDamagePerHour: 5,
    regenPerHour: 4,
    respawnMs: 8000,
    deathCashLoss: 0.12,
    healCost: 250,
    voiceRange: 45,
  },

  country: {
    foundCost: 15000,       // ülke kurmak bedava değil
  },

  // Savaş masrafları: bedava savaş yok
  costs: {
    declareWar: 8000,       // seferberlik
    marchPer100: 6,         // birlik başına her 100 birim yol (yakıt/erzak)
    upkeepFoot: 5,          // savaşta yaya asker başı saatlik yemek
    upkeepVehicle: 18,      // savaşta tank/top/süvari başı saatlik yakıt/yem
    missileFuel: 0.15,      // füze fiyatına ek yakıt + fırlatma masrafı
    airFuel: 0.2,           // uçak/helikopter kalkış yakıtı
    interceptor: 600,       // hava savunmasının her önleme füzesi
  },

  war: {
    justifyMs: Number(process.env.WAR_JUSTIFY_MS) || 3 * 60 * 1000, // savaş gerekçesi süresi (3 dk)
  },

  tech: {
    baseCost: 300,
    costGrowth: 1.75,      // her çağ ~1.75 kat pahalı
  },

  crime: {
    playerRobCooldownMs: 30000,
    jailHoursPerWanted: 4,
    bailPerHour: 150,
  },

  politics: {
    electionEveryDays: 3,
    candidateFee: 2000,
  },
};
