// Колода таро: 78 карт (22 Старших аркана и 4 масти по 14 карт). Здесь только «паспорт» карт —
// номер, имя, масть; толкования лежат в js/data/tarot-*.js и подключаются по id.
// id совпадает с именем файла картинки: assets/tarot/<id>.webp (или .jpg).

export const MAJOR = [
  ["fool", "Шут"],
  ["magician", "Маг"],
  ["high-priestess", "Верховная Жрица"],
  ["empress", "Императрица"],
  ["emperor", "Император"],
  ["hierophant", "Иерофант"],
  ["lovers", "Влюблённые"],
  ["chariot", "Колесница"],
  ["strength", "Сила"],
  ["hermit", "Отшельник"],
  ["wheel", "Колесо Фортуны"],
  ["justice", "Справедливость"],
  ["hanged-man", "Повешенный"],
  ["death", "Смерть"],
  ["temperance", "Умеренность"],
  ["devil", "Дьявол"],
  ["tower", "Башня"],
  ["star", "Звезда"],
  ["moon", "Луна"],
  ["sun", "Солнце"],
  ["judgement", "Суд"],
  ["world", "Мир"],
];

// Масти: имя в родительном падеже для «Туз Кубков», стихия и символ для процедурной карты
export const SUITS = {
  wands: { name: "Жезлы", of: "Жезлов", element: "огонь", hue: 28 },
  cups: { name: "Кубки", of: "Кубков", element: "вода", hue: 205 },
  swords: { name: "Мечи", of: "Мечей", element: "воздух", hue: 255 },
  pentacles: { name: "Пентакли", of: "Пентаклей", element: "земля", hue: 95 },
};

const RANKS = ["Туз", "Двойка", "Тройка", "Четвёрка", "Пятёрка", "Шестёрка", "Семёрка", "Восьмёрка", "Девятка", "Десятка", "Паж", "Рыцарь", "Королева", "Король"];

export const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

// Полный список: { id, name, arcana: "major" | масть, n (0–21 или 1–14) }
export const DECK = [
  ...MAJOR.map(([slug, name], n) => ({ id: `major-${String(n).padStart(2, "0")}-${slug}`, name, arcana: "major", n })),
  ...Object.entries(SUITS).flatMap(([suit, s]) =>
    RANKS.map((rank, i) => ({ id: `${suit}-${String(i + 1).padStart(2, "0")}`, name: `${rank} ${s.of}`, arcana: suit, n: i + 1 })),
  ),
];

export const byId = Object.fromEntries(DECK.map((c) => [c.id, c]));

// Короткая подпись карты под именем: «Старший аркан · XIII» или «Кубки · вода»
export function caption(card) {
  if (card.arcana === "major") return "Старший аркан · " + ROMAN[card.n];
  const s = SUITS[card.arcana];
  return `${s.name} · ${s.element}`;
}
