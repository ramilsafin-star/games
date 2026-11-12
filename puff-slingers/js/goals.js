// =====================================================
// МЕДАЛИ, РАЗРУШОМЕР И СЛЕДЫ
// Медаль — особое задание уровня (обвал, комбо, ящики-бум, очки, выстрелы, шарики).
// Засчитывается, только если уровень пройден. Разрушомер копит очки за сломанные блоки
// и один раз за уровень дарит бонусного пуфа. Следы за пуфом открываются за звёзды и медали.
// Подключается до game.js; переменные игры берутся в момент вызова.
// =====================================================
const Goals = {
  kind: null,
  need: 0,
  done: false,
  failed: false,
  best: 0,
  turnBots: 0,
  turnBlocks: 0,
  boomTotal: 0,
  boomBroken: 0,
  meter: 0,
  meterMax: 0,
  shownMeter: 0,
  bonusGiven: false,

  // Новый уровень: задание и полный разрушомер считаются по постройке после её усадки
  reset(cfg) {
    const g = cfg.goal || ['score', 20000];
    this.kind = g[0];
    this.need = g[1] || 0;
    this.done = false;
    this.failed = false;
    this.best = 0;
    this.turnBots = 0;
    this.turnBlocks = 0;
    this.boomBroken = 0;
    this.boomTotal = blocks.filter((b) => b.mat === 'boom').length;
    if (this.kind === 'boom') this.need = this.boomTotal;
    if (this.kind === 'balloons') this.need = Balloons.total;
    this.meter = 0;
    this.shownMeter = 0;
    this.meterMax = blocks.reduce((a, b) => a + MATERIALS[b.mat].pts, 0) * METER_SHARE;
    this.bonusGiven = false;
    UI.updateGoal();
  },

  onFire() {
    this.turnBots = 0;
    this.turnBlocks = 0;
    if (this.kind === 'shots' && shotsFired > this.need && !this.done) this.failed = true;
    UI.updateGoal();
  },

  onBlock(b, pts) {
    this.turnBlocks++;
    if (b.mat === 'boom') this.boomBroken++;
    if (this.kind === 'collapse') this.best = Math.max(this.best, this.turnBlocks);
    // Разрушомер: только пока уровень идёт. Сам пуф приходит в конце хода, если боты ещё остались
    if (!levelOver && this.meterMax > 0 && !this.bonusGiven) this.meter += pts;
    this.check();
  },

  onBot() {
    this.turnBots++;
    if (this.kind === 'combo') this.best = Math.max(this.best, this.turnBots);
    this.check();
  },

  onBalloon() {
    this.check();
  },

  onScore() {
    if (this.kind === 'score') this.check();
  },

  progress() {
    switch (this.kind) {
      case 'collapse':
      case 'combo':
        return Math.min(this.best, this.need);
      case 'boom':
        return Math.min(this.boomBroken, this.need);
      case 'balloons':
        return Balloons.popped;
      case 'score':
        return Math.min(score, this.need);
      case 'shots':
        return shotsFired;
      default:
        return 0;
    }
  },

  // Задание выполнено прямо сейчас? (выстрелы проверяются только на победе)
  check() {
    if (this.done || this.failed) return;
    const k = this.kind;
    const ok =
      ((k === 'collapse' || k === 'combo') && this.best >= this.need) ||
      (k === 'boom' && this.need > 0 && this.boomBroken >= this.need) ||
      (k === 'balloons' && this.need > 0 && Balloons.popped >= this.need) ||
      (k === 'score' && score >= this.need);
    if (ok) this.complete();
    else UI.updateGoal();
  },

  complete() {
    this.done = true;
    Sound.medal();
    const at = lastKill || { x: cam.x, y: cam.y - 80 };
    FX.text(at.x, at.y - 96, t('wordMedal'), '#ffd23f', 32, 1.3);
    for (let i = 0; i < 12; i++) FX.star(at.x, at.y - 60, i % 2 ? '#ffd23f' : '#ffffff');
    UI.updateGoal(true);
  },

  // Итог уровня: медаль получена? Сохраняется в Save.medals (битовая маска)
  finish(win) {
    if (!win) return { earned: false, fresh: false };
    if (this.kind === 'shots') {
      if (shotsFired <= this.need) this.done = true;
    } else this.check();
    const had = Save.hasMedal(level);
    if (this.done) Save.setMedal(level);
    return { earned: this.done, fresh: this.done && !had };
  },

  // Бонусный пуф встаёт в очередь первым: следующий выстрел — им
  giveBonus() {
    this.bonusGiven = true;
    const type = 'dyna';
    queue.unshift(type);
    queueView.unshift({ type, x: SLING_X - 30, bonus: 1 });
    Sound.bonus();
    const x = queueX(0);
    FX.ring(x, GROUND_Y - 30, 90, '#ffd23f', 10, 0.45);
    FX.flash(x, GROUND_Y - 30, 110, '#fff2a8', 0.25);
    for (let i = 0; i < 14; i++) FX.star(x, GROUND_Y - 40, i % 2 ? '#ffd23f' : '#ff9a2e');
    UI.banner(t('bonusPuff'), t('bonusPuffSub'));
    UI.meterFull();
  },

  // Конец хода, всё улеглось, а боты ещё есть: полный разрушомер дарит пуфа
  maybeBonus() {
    if (!this.bonusGiven && !levelOver && this.meterMax > 0 && this.meter >= this.meterMax) this.giveBonus();
  },

  meterShare() {
    return this.meterMax > 0 ? clamp(this.meter / this.meterMax, 0, 1) : 0;
  },

  // {форма1|форма2|форма5} в русских строках — по числу need
  text() {
    const n = this.need;
    const k = n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2;
    return t('goal_' + this.kind)
      .replace('{n}', formatNumber(n))
      .replace(/\{([^}|]*)\|([^}|]*)\|([^}|]*)\}/, (m, a, b, c) => [a, b, c][k]);
  },

  short() {
    const p = this.progress();
    switch (this.kind) {
      case 'score':
        return `${formatNumber(Math.floor(p / 1000))}k/${formatNumber(Math.floor(this.need / 1000))}k`;
      case 'shots':
        return `${p}/${this.need}`;
      default:
        return `${p}/${this.need}`;
    }
  }
};

// Сколько звёзд и медалей вместе — от этого открываются следы
function trailPoints() {
  return Save.totalStars() + Save.totalMedals();
}
function trailOpen(i) {
  return trailPoints() >= TRAILS[i].need;
}
