// Старший футарк: 24 руны и пустая руна Вирд. Толкования — в js/data/runes-text.js по id.
// glyph — штрихи руны в квадрате 100×140 (x, y), рисуются линиями на «камне» (js/art.js).
// flip: false — руна симметрична, перевёрнутого положения у неё нет.

export const RUNES = [
  { id: "fehu", name: "Феху", latin: "Fehu", glyph: ["30,10 30,130", "30,40 72,14", "30,72 72,46"] },
  { id: "uruz", name: "Уруз", latin: "Uruz", glyph: ["28,130 28,12 72,40 72,130"] },
  { id: "thurisaz", name: "Турисаз", latin: "Thurisaz", glyph: ["32,10 32,130", "32,38 70,70 32,102"] },
  { id: "ansuz", name: "Ансуз", latin: "Ansuz", glyph: ["30,10 30,130", "30,14 70,40", "30,46 70,72"] },
  { id: "raidho", name: "Райдо", latin: "Raidho", glyph: ["30,130 30,10 70,38 30,68 70,130"] },
  { id: "kenaz", name: "Кеназ", latin: "Kenaz", glyph: ["70,22 32,70 70,118"] },
  { id: "gebo", name: "Гебо", latin: "Gebo", flip: false, glyph: ["22,20 78,120", "78,20 22,120"] },
  { id: "wunjo", name: "Вуньо", latin: "Wunjo", glyph: ["30,130 30,10 70,38 30,68"] },
  { id: "hagalaz", name: "Хагалаз", latin: "Hagalaz", flip: false, glyph: ["26,10 26,130", "74,10 74,130", "26,50 74,90"] },
  { id: "nauthiz", name: "Наутиз", latin: "Nauthiz", flip: false, glyph: ["50,10 50,130", "28,52 72,86"] },
  { id: "isa", name: "Иса", latin: "Isa", flip: false, glyph: ["50,10 50,130"] },
  { id: "jera", name: "Йера", latin: "Jera", flip: false, glyph: ["46,28 24,52 46,76", "54,64 76,88 54,112"] },
  { id: "eihwaz", name: "Эйваз", latin: "Eihwaz", flip: false, glyph: ["50,10 50,130", "50,10 74,32", "50,130 26,108"] },
  { id: "perthro", name: "Перто", latin: "Perthro", glyph: ["30,10 30,130", "30,10 70,34 70,46", "30,130 70,106 70,94"] },
  { id: "algiz", name: "Альгиз", latin: "Algiz", glyph: ["50,130 50,10", "50,60 22,22", "50,60 78,22"] },
  { id: "sowilo", name: "Совило", latin: "Sowilo", flip: false, glyph: ["64,12 32,52 68,88 36,128"] },
  { id: "tiwaz", name: "Тейваз", latin: "Tiwaz", glyph: ["50,12 50,130", "20,44 50,12 80,44"] },
  { id: "berkano", name: "Беркана", latin: "Berkano", glyph: ["30,10 30,130", "30,10 70,40 30,70 70,100 30,130"] },
  { id: "ehwaz", name: "Эваз", latin: "Ehwaz", glyph: ["24,130 24,12 50,46 76,12 76,130"] },
  { id: "mannaz", name: "Манназ", latin: "Mannaz", glyph: ["24,130 24,12 76,62", "76,130 76,12 24,62"] },
  { id: "laguz", name: "Лагуз", latin: "Laguz", glyph: ["34,130 34,12 70,42"] },
  { id: "ingwaz", name: "Ингуз", latin: "Ingwaz", flip: false, glyph: ["50,32 80,70 50,108 20,70 50,32"] },
  { id: "othala", name: "Отала", latin: "Othala", glyph: ["50,12 78,48 24,110", "50,12 22,48 76,110"] },
  { id: "dagaz", name: "Дагаз", latin: "Dagaz", flip: false, glyph: ["22,24 22,116 78,24 78,116 22,24"] },
  { id: "wyrd", name: "Вирд", latin: "Wyrd", flip: false, blank: true, glyph: [] },
];

export const runeById = Object.fromEntries(RUNES.map((r) => [r.id, r]));
export const canFlip = (r) => r.flip !== false;
