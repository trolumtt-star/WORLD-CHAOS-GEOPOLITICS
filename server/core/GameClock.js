const pad = (n) => String(n).padStart(2, '0');

// Oyun saati. Gerçek zamanı oyun zamanına çevirir ve geçilen saatleri bildirir.
export class GameClock {
  constructor({ msPerGameHour, startHour = 6 }) {
    this.msPerGameHour = msPerGameHour;
    this.elapsedMs = startHour * msPerGameHour;
  }

  get totalHours() { return Math.floor(this.elapsedMs / this.msPerGameHour); }
  get day() { return Math.floor(this.totalHours / 24) + 1; }
  get hour() { return this.totalHours % 24; }
  get minute() {
    return Math.floor(((this.elapsedMs % this.msPerGameHour) / this.msPerGameHour) * 60);
  }

  // Zamanı ilerletir; bu adımda geçilen her saat için bir kayıt döner.
  advance(realMs) {
    const before = this.totalHours;
    this.elapsedMs += realMs;
    const after = this.totalHours;
    const crossed = [];
    for (let h = before + 1; h <= after; h++) {
      crossed.push({ totalHours: h, day: Math.floor(h / 24) + 1, hour: h % 24 });
    }
    return crossed;
  }

  snapshot() {
    return { day: this.day, hour: this.hour, minute: this.minute, totalHours: this.totalHours };
  }

  label() { return `Gün ${this.day} ${pad(this.hour)}:${pad(this.minute)}`; }
}
