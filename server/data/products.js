// Ürün kataloğu. Fiyat zinciri: baseCost -> fabrika toptan (x wholesaleMarkup) -> dükkan perakende (x markup)
export const PRODUCTS = {
  food:        { label: 'Gıda',       icon: '🍞', baseCost: 4 },
  drink:       { label: 'İçecek',     icon: '🥤', baseCost: 2 },
  electronics: { label: 'Elektronik', icon: '📱', baseCost: 80 },
  steel:       { label: 'Çelik',      icon: '🔩', baseCost: 10 },
  weapons:     { label: 'Silah',      icon: '🔫', baseCost: 150 },
  // ileride: fuel (petrol), lumber (kereste), uranium (uranyum)...
};

export function wholesalePrice(product, config) {
  return Math.round(PRODUCTS[product].baseCost * config.economy.wholesaleMarkup * 100) / 100;
}
