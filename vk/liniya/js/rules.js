// Прогресс игрока: звёзды, открытые уровни, подсказки. Одна строка в localStorage («liniya-v1»),
// около 150 байт — в облако VK помещается с огромным запасом.
export const SAVE_KEY = "liniya-v1";
export const FREE_HINTS = 3; // подсказки на старте
export const STARS_PER_HINT = 10; // новая подсказка за каждые 10 звёзд
export const SKIP_AHEAD = 2; // сколько уровней можно открыть, перепрыгнув непройденный

export function fresh(n) {
  return { stars: new Array(n).fill(0), hinted: new Array(n).fill(0), used: 0, ad: 0, mute: false, last: 0, time: 0 };
}

export function decode(text, n) {
  const s = fresh(n);
  if (!text) return s;
  try {
    const o = JSON.parse(text);
    if (o.v !== 1) return s;
    const st = String(o.s || "");
    for (let i = 0; i < n; i++) s.stars[i] = Math.max(0, Math.min(3, Number(st[i]) || 0));
    const bits = String(o.h || "");
    for (let i = 0; i < n; i++) {
      const d = parseInt(bits[i >> 2] || "0", 16);
      s.hinted[i] = (d >> (i & 3)) & 1;
    }
    s.used = Math.max(0, o.u | 0);
    s.ad = Math.max(0, o.a | 0);
    s.mute = !!o.m;
    s.last = Math.max(0, Math.min(n - 1, o.l | 0));
    s.time = Math.max(0, Number(o.t) || 0);
  } catch {
    // испорченное сохранение — начинаем заново, игра не падает
  }
  return s;
}

export function encode(s) {
  let h = "";
  for (let i = 0; i < s.hinted.length; i += 4) {
    let d = 0;
    for (let j = 0; j < 4; j++) if (s.hinted[i + j]) d |= 1 << j;
    h += d.toString(16);
  }
  return JSON.stringify({ v: 1, s: s.stars.join(""), h: h.replace(/0+$/, ""), u: s.used, a: s.ad, m: s.mute ? 1 : 0, l: s.last, t: Math.round(s.time) });
}

export const totalStars = (s) => s.stars.reduce((a, b) => a + b, 0);
export const solved = (s) => s.stars.filter((x) => x > 0).length;
export function firstGap(s) {
  const i = s.stars.findIndex((x) => x === 0);
  return i < 0 ? s.stars.length : i;
}
export const isOpen = (s, i) => s.stars[i] > 0 || i <= firstGap(s) + SKIP_AHEAD;
export const hintsLeft = (s) => Math.max(0, FREE_HINTS + Math.floor(totalStars(s) / STARS_PER_HINT) + s.ad - s.used);
export const starsToHint = (s) => STARS_PER_HINT - (totalStars(s) % STARS_PER_HINT);

// Куда вести кнопку «Продолжить»: первый непройденный уровень (или последний сыгранный, если всё пройдено)
export function nextLevel(s) {
  const g = firstGap(s);
  return g < s.stars.length ? g : s.last;
}
