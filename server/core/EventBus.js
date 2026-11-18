import { EventEmitter } from 'node:events';

// Sistemler birbirini doğrudan çağırmaz; olay yayınlar ve dinler.
// Örn: CrimeSystem 'npc:arrived' dinleyip soygun başlatabilir,
// ElectionSystem 'economy:taxCollected' ile memnuniyeti hesaplayabilir.
export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.clock = null; // GameEngine tarafından atanır
  }

  // Oyunculara haber akışı olarak gidecek olaylar
  news(category, text, data = {}) {
    this.emit('news', {
      category,
      text,
      data,
      time: this.clock ? this.clock.label() : '',
    });
  }
}
