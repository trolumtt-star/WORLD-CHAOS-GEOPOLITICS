// Tüm denge ayarları. Her oda bunun bir kopyasıyla başlar (structuredClone).
export const CONFIG = {
  port: Number(process.env.PORT) || 3000,
  maxPlayersPerRoom: 10,
  maxRooms: 30,
  roomIdleCloseMs: 15 * 60 * 1000, // boş oda 15 dk sonra kapanır (telefonu kilitleyen geri dönebilsin)

  world: {
    gridSize: 8,
    blockSize: 44,
    roadWidth: 9,
  },

  genesis: {
    npcCount: 50,
    unemploymentChance: 0.08,
    npcBalance: [150, 1500],
    bossBonus: [2000, 8000],
    forSaleChance: 0.12, // NPC işletmelerinin/evlerinin bir kısmı satılık başlar
  },

  population: {
    target: 70,              // göçle ulaşılmaya çalışılan nüfus
    maxImmigrantsPerDay: 3,
  },

  npc: {
    speed: 22,
    hungerPerHour: 4,
    eatAtHomeAbove: 40,
  },

  player: {
    speed: 20,
    sprintMultiplier: 1.6,
    startBalance: [8000, 15000],
    sandboxBalance: 10_000_000,
    maxUnits: 30,
  },

  time: {
    msPerGameHour: Number(process.env.MS_PER_HOUR) || 5000, // test için: MS_PER_HOUR=500 npm start (10x hız)
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
