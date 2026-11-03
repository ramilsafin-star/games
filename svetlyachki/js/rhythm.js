// Ритм «Светлячкового концерта» без графики и звука: разбор песенок, окно попадания, часы с паузой.
// Проверяется в node: tests/songs.mjs (критерии PT-1…PT-4 из ТЗ).

export const WINDOW = 0.18; // ±180 мс — попадание
export const EARLY = 0.42; // раньше окна, но уже близко — мягкая подсветка без очка
export const PERFECT = 0.07; // очень точно — особые искры
export const APPROACH = 2.3; // сколько секунд светлячок летит от домика до кружка

// Высота ноты → частота. «F#5» — фа-диез пятой октавы
export function hz(name) {
  const steps = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const sharp = name[1] === "#" ? 1 : 0;
  const midi = 12 * (Number(name.slice(-1)) + 1) + steps[name[0]] + sharp;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Песенка: такты по 8 восьмых. Нота «3G5:2» — дорожка 3, соль пятой октавы, две восьмых; «-:4» — пауза.
// Аккорды — один или два на такт («C G»).
export function parseSong(song) {
  const eighth = 30 / song.bpm;
  const notes = [];
  let at = 0;
  song.bars.forEach((bar, b) => {
    let len = 0;
    for (const tok of bar.trim().split(/\s+/)) {
      const m = tok.match(/^([1-4])?([A-G]#?\d|-)(?::(\d+))?$/);
      if (!m) throw new Error(`${song.id}: не понял «${tok}» в такте ${b + 1}`);
      const d = Number(m[3] || 1);
      if (m[2] !== "-") notes.push({ i: notes.length, t: at * eighth, lane: Number(m[1] || 2) - 1, pitch: m[2], f: hz(m[2]), bar: b });
      at += d;
      len += d;
    }
    if (len !== 8) throw new Error(`${song.id}: в такте ${b + 1} ${len} восьмых вместо 8`);
  });
  const chords = [];
  song.chords.forEach((pair, b) => {
    const names = pair.split(" ");
    names.forEach((name, half) => chords.push({ t: (b * 8 + (names.length === 2 ? half * 4 : 0)) * eighth, name, len: (names.length === 2 ? 4 : 8) * eighth }));
  });
  const lanes = [...new Set(notes.map((n) => n.lane))].sort();
  return { ...song, eighth, beat: eighth * 2, notes, chords, lanes, length: song.bars.length * 8 * eighth };
}

// Судья: каждая нота ждёт, потом попадание или промах. Одно касание — не больше одной ноты.
export class Judge {
  constructor(notes) {
    this.notes = notes.map((n) => ({ ...n, state: "wait", err: 0 }));
    this.hits = 0;
    this.perfect = 0;
    this.miss = 0;
    this.early = 0;
    this.combo = 0;
    this.best = 0;
  }
  // Касание дорожки lane в момент t (секунды песни)
  tap(lane, t) {
    let best = null,
      bd = Infinity;
    for (const n of this.notes) {
      if (n.lane !== lane || n.state !== "wait") continue;
      const d = Math.abs(n.t - t);
      if (d < bd) {
        bd = d;
        best = n;
      }
      if (n.t - t > EARLY) break;
    }
    if (best && bd <= WINDOW + 1e-9) {
      best.state = "hit";
      best.err = t - best.t;
      this.hits++;
      this.combo++;
      this.best = Math.max(this.best, this.combo);
      const perfect = bd <= PERFECT;
      if (perfect) this.perfect++;
      return { type: perfect ? "perfect" : "hit", note: best };
    }
    if (best && best.t - t > WINDOW && best.t - t <= EARLY) {
      this.early++;
      return { type: "early", note: best };
    }
    return { type: "empty" };
  }
  // Ноты, которые улетели за окно, — промахи (нота молчит, песня идёт дальше)
  update(t) {
    const out = [];
    for (const n of this.notes) {
      if (n.t - t > WINDOW) break;
      if (n.state === "wait" && t - n.t > WINDOW) {
        n.state = "miss";
        this.miss++;
        this.combo = 0;
        out.push(n);
      }
    }
    return out;
  }
  // Ноты, которые сейчас в окне попадания (светлячок «зовёт»)
  inWindow(t) {
    return this.notes.filter((n) => n.state === "wait" && Math.abs(n.t - t) <= WINDOW);
  }
  stars() {
    const r = this.hits / Math.max(1, this.notes.length);
    return 1 + (r >= 0.75 ? 1 : 0) + (r >= 0.95 ? 1 : 0);
  }
}

// Часы песни: идут по времени звука, на паузе стоят, после паузы продолжают с того же места
export class Clock {
  constructor(now) {
    this.now = now;
    this.running = false;
    this.base = 0;
    this.paused = 0;
  }
  start(at) {
    this.base = this.now() - at;
    this.running = true;
  }
  time() {
    return this.running ? this.now() - this.base : this.paused;
  }
  pause() {
    if (!this.running) return;
    this.paused = this.time();
    this.running = false;
  }
  resume(at = this.paused) {
    this.base = this.now() - at;
    this.running = true;
  }
}
