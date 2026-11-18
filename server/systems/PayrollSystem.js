import { JOBS, inHours } from '../data/jobs.js';
import { playerAtWork } from './ProductionSystem.js';

/**
 * İş gücü piyasası:
 *  - Saatlik maaş (devlet kurumları hazineden, işletmeler kasadan; oyuncu işletmesi kasa yetmezse cüzdandan)
 *  - Maaş ödenmezse moral düşer, 16 saat birikirse işten çıkarma
 *  - Boş kadrolara işsiz NPC alımı
 *  - Gece: işsizlik maaşı, NPC patronlara temettü, batmak üzere olan şirkete sermaye
 */
export class PayrollSystem {
  name = 'payroll';
  reported = new Set();

  onHour(time, ctx) {
    const { world, bus } = ctx;
    const hour = time.hour;

    for (const npc of world.npcs.values()) {
      if (npc.activity !== 'work' || npc.state !== 'inside' || npc.locationId !== npc.workId) continue;
      const job = JOBS[npc.job];
      if (!inHours(job.shift, hour)) continue;
      const employer = world.buildings.get(npc.workId);
      if (this.payWage(ctx, employer, job.wage)) {
        npc.balance += job.wage;
        npc.earnedToday += job.wage;
        npc.happiness = Math.min(100, npc.happiness + 0.3);
      } else {
        npc.happiness = Math.max(0, npc.happiness - 4);
        employer.unpaidHours++;
        if (!this.reported.has(employer.id)) {
          this.reported.add(employer.id);
          bus.news('economy', `💸 ${employer.name} maaşları ödeyemiyor! Çalışanlar huzursuz.`);
        }
      }
    }

    // Oyuncu çalışanlar: iş yerinin yanında olmaları yeterli
    for (const p of world.players.values()) {
      const b = world.buildings.get(p.jobBuildingId);
      if (!b || !b.operational || !playerAtWork(p, b, hour, world)) continue;
      const wage = JOBS[b.def.staff.job].wage;
      if (this.payWage(ctx, b, wage)) {
        p.balance += wage;
        p.earnedToday += wage;
        world.touchPlayer(p);
      }
    }

    if (hour >= 8 && hour <= 16) this.hire(ctx);
    this.layoffs(ctx);
  }

  payWage({ world }, employer, wage) {
    if (employer.category === 'civic') {
      if (world.treasury < wage) return false;
      world.treasury -= wage;
      return true;
    }
    if (employer.balance >= wage) {
      employer.balance -= wage;
      return true;
    }
    // Oyuncu işletmesi kendi kasasıyla döner (cüzdanı otomatik eritmez); kasaya para koymak oyuncunun kararı
    return false;
  }

  hire({ world, bus }) {
    const now = world.clockHours();
    for (const b of world.buildings.values()) {
      const staff = b.def.staff;
      if (!staff || !b.operational || b.employeeIds.length >= staff.count) continue;
      if (b.unpaidHours > 0) continue; // maaş ödeyemeyen yere kimse gelmez
      const candidates = [...world.npcs.values()].filter((n) => n.job === 'unemployed' && n.jailedUntil <= now);
      if (!candidates.length) return;
      // Önce İŞKUR'da (sarayda) iş arayanlar
      candidates.sort((a, c) => (c.activity === 'job_hunt') - (a.activity === 'job_hunt'));
      const npc = candidates[0];
      npc.job = staff.job;
      npc.workId = b.id;
      b.employeeIds.push(npc.id);
      npc.happiness = Math.min(100, npc.happiness + 10);
      if (b.ownerKind === 'player') bus.news('job', `🤝 ${npc.name}, ${b.name} işletmesinde işe başladı.`);
    }
  }

  layoffs({ world, bus }) {
    for (const b of world.buildings.values()) {
      if (b.unpaidHours < 16 || !b.employeeIds.length) continue;
      const id = b.employeeIds.pop();
      const npc = world.npcs.get(id);
      if (npc) {
        npc.job = 'unemployed';
        npc.workId = null;
        npc.happiness = Math.max(0, npc.happiness - 15);
        bus.news('economy', `📉 ${b.name} ${npc.name} adlı çalışanını işten çıkardı.`);
      }
      b.unpaidHours = 0;
    }
  }

  onDay(_time, { world, config, bus }) {
    this.reported.clear();
    const { businessReserve, dividendRate } = config.economy;

    // İşsizlik maaşı
    for (const npc of world.npcs.values()) {
      if (npc.job !== 'unemployed' || world.treasury < world.policy.welfare) continue;
      world.treasury -= world.policy.welfare;
      npc.balance += world.policy.welfare;
    }

    for (const b of world.buildings.values()) {
      if (!b.isBusiness || b.ownerKind !== 'npc') continue;
      const owner = world.getOwner(b);
      if (!owner) continue;
      const surplus = b.balance - businessReserve;
      if (surplus > 0) {
        const dividend = Math.floor(surplus * dividendRate);
        b.balance -= dividend;
        owner.balance += dividend;
        owner.earnedToday += dividend;
      } else if (b.balance < businessReserve / 3 && owner.balance > 1500) {
        const inject = Math.floor(Math.min(owner.balance * 0.4, businessReserve - b.balance));
        owner.balance -= inject;
        b.balance += inject;
      }
    }
  }
}
