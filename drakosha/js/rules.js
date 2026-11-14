// Правила «Почты Дракоши» без графики: слово, буквы, марки, колода без повторов.
// Проверяется в node: tests/rules.mjs (критерии HA-1…HA-4 из ТЗ).

export const STAMPS = 4; // столько неверных букв можно назвать
export const ALPHABET = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ".split(""); // Ё набирается клавишей Е
const OPEN = new Set([" ", "-"]); // пробелы и дефисы открыты сразу

// Клавиша, которой открывается буква: Ё — это Е, остальные как есть
export const keyOf = (ch) => (ch === "Ё" ? "Е" : ch);

export class Round {
  constructor(card, maxStamps = STAMPS) {
    this.maxStamps = maxStamps;
    this.card = card;
    this.text = card.word.toUpperCase();
    this.tried = new Set(); // клавиши, которые уже нажимали
    this.misses = 0;
    this.hadMiss = false;
    this.state = "play"; // play | won | lost
    this.events = [];
  }
  // Открыта ли буква на позиции i
  shown(i) {
    const ch = this.text[i];
    return OPEN.has(ch) || this.tried.has(keyOf(ch)) || this.state === "lost";
  }
  hidden() {
    return [...this.text].filter((ch, i) => !OPEN.has(ch) && !this.tried.has(keyOf(ch))).length;
  }
  // Нажата клавиша (буква А…Я). Результат: repeat | hit | miss | ignored
  guess(key) {
    key = key.toUpperCase();
    if (key === "Ё") key = "Е";
    if (this.state !== "play" || !ALPHABET.includes(key)) return { type: "ignored" };
    // Повтор проверяется до ответа: вторая такая же буква ничего не тратит
    if (this.tried.has(key)) return { type: "repeat", key };
    this.tried.add(key);
    const at = [...this.text].map((ch, i) => (keyOf(ch) === key ? i : -1)).filter((i) => i >= 0);
    if (at.length) {
      const r = { type: "hit", key, at };
      if (this.hidden() === 0) {
        this.state = "won";
        r.won = true;
      }
      return r;
    }
    this.misses++;
    this.hadMiss = true;
    const r = { type: "miss", key, left: this.maxStamps - this.misses };
    // На последней ошибке результат фиксируется один раз
    if (this.misses >= this.maxStamps) {
      this.state = "lost";
      r.lost = true;
    }
    return r;
  }
  // Подсказка: открыть самую частую из ещё закрытых букв (без траты марки)
  hint() {
    if (this.state !== "play") return null;
    const count = {};
    for (const ch of this.text) if (!OPEN.has(ch) && !this.tried.has(keyOf(ch))) count[keyOf(ch)] = (count[keyOf(ch)] || 0) + 1;
    const key = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b, "ru"))[0];
    if (!key) return null;
    return this.guess(key);
  }
}

// Колода темы: в одном конверте 6 разных слов; пока не сыграны все, слова не повторяются
export class Deck {
  constructor(cards, rnd = Math.random, seen = []) {
    this.cards = cards;
    this.rnd = rnd;
    this.seen = new Set(seen);
  }
  pack(n = 6) {
    let pool = this.cards.filter((c) => !this.seen.has(c.id));
    if (pool.length < n) {
      // Почти все сыграны — начинаем круг заново, но недавние в начало не ставим
      const rest = this.cards.filter((c) => this.seen.has(c.id));
      this.seen = new Set();
      pool = [...this.shuffle(pool), ...this.shuffle(rest)];
    } else pool = this.shuffle(pool);
    // Сначала покороче: лёгкие слова в начале конверта
    const out = pool.slice(0, n).sort((a, b) => a.level - b.level);
    for (const c of out) this.seen.add(c.id);
    return out;
  }
  shuffle(a) {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
