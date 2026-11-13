// Трассы «Велопанды». ground — профиль [x, y] (м), length — где почтовый ящик (финиш).
// stars — звёздочки: x и «low» (низко, колесо чуть приподнять) или «high» (высоко — поднять сильнее).
// Высота каждой звёздочки берётся с эталонного заезда автопилота, поэтому все их можно собрать.
import { simulate } from "./ride.js?v=74669838";

const DEF = [
  {
    id: "school",
    name: "Велошкола",
    theme: "park",
    training: true,
    length: 70,
    ground: [[-20, 0], [200, 0]],
    stars: [[18, "low"], [28, "low"], [38, "high"], [50, "low"], [60, "high"]],
    parcel: "🧸",
  },
  {
    id: "park",
    name: "Парк",
    theme: "park",
    length: 95,
    ground: [[-20, 0], [20, 0], [30, 0.4], [40, 0], [55, 0.3], [65, 0], [200, 0]],
    stars: [[16, "low"], [26, "high"], [36, "low"], [46, "high"], [58, "low"], [70, "high"], [82, "low"]],
    parcel: "🎈",
  },
  {
    id: "hills",
    name: "Три холма",
    theme: "meadow",
    length: 130,
    // ТЗ: три участка по 40 м — плавный подъём, гребень, спуск
    ground: [[-20, 0], [10, 0], [30, 2.6], [50, 2.6], [58, 3.4], [66, 2.6], [90, 2.6], [110, 0], [200, 0]],
    stars: [[18, "high"], [28, "low"], [42, "high"], [58, "low"], [72, "high"], [86, "low"], [98, "low"], [112, "high"], [122, "low"]],
    parcel: "🌻",
  },
  {
    id: "beach",
    name: "Пляж",
    theme: "beach",
    length: 125,
    ground: [[-20, 0], [12, 0], [22, 0.9], [32, 0], [42, 1.1], [52, 0], [62, 1.2], [72, 0], [84, 1.3], [96, 0], [106, 0.8], [116, 0], [200, 0]],
    stars: [[17, "high"], [27, "low"], [37, "high"], [47, "low"], [57, "high"], [67, "low"], [78, "high"], [90, "low"], [101, "high"], [112, "low"]],
    parcel: "🐚",
  },
  {
    id: "city",
    name: "Город",
    theme: "city",
    length: 140,
    ground: [[-20, 0], [10, 0], [26, 2.2], [40, 2.2], [52, 0.4], [64, 0.4], [80, 3], [92, 3], [104, 1], [118, 1.6], [130, 0], [200, 0]],
    stars: [[16, "high"], [30, "low"], [38, "high"], [48, "low"], [60, "high"], [72, "low"], [86, "high"], [98, "low"], [110, "high"], [124, "low"]],
    parcel: "🎂",
  },
  {
    id: "mountains",
    name: "Горы",
    theme: "snow",
    length: 150,
    ground: [[-20, 0], [10, 0], [28, 3.4], [36, 3.4], [50, 1], [62, 1], [80, 4.2], [90, 4.2], [108, 0.8], [118, 2.2], [132, 0], [200, 0]],
    stars: [[17, "high"], [26, "low"], [34, "high"], [44, "low"], [56, "high"], [70, "low"], [84, "high"], [98, "low"], [112, "high"], [125, "low"], [140, "high"]],
    parcel: "🧣",
  },
  {
    id: "rainbow",
    name: "Радужная дорога",
    theme: "candy",
    length: 175,
    ground: [[-20, 0], [10, 0], [22, 1.6], [34, 0.2], [46, 2.4], [58, 2.4], [70, 0.6], [82, 3.4], [94, 1.2], [106, 1.2], [120, 3.6], [134, 1], [146, 2], [160, 0], [220, 0]],
    stars: [[16, "high"], [28, "low"], [40, "high"], [52, "low"], [64, "high"], [76, "low"], [88, "high"], [100, "low"], [114, "high"], [128, "low"], [140, "high"], [152, "low"], [166, "high"]],
    parcel: "🌈",
  },
];

// Угол автопилота: обычно 37°, у высокой звёздочки — почти свечкой (74°), у низкой — 17°
export const CRUISE = 0.65;
const pilotFor = (stars) => (x) => {
  for (const [sx, h] of stars) if (sx - (x + 0.85) < 5.5 && x + 0.85 - sx < 1.0) return h === "high" ? 1.3 : 0.3;
  return CRUISE;
};
export const TRACKS = DEF.map((t, i) => {
  const track = { ...t, index: i, stars: [] };
  const pilot = pilotFor(t.stars);
  const { path } = simulate({ ...track, stars: [] }, pilot);
  track.stars = t.stars.map(([sx, h]) => {
    let best = path[0];
    for (const p of path) if (Math.abs(p.fw[0] - sx) < Math.abs(best.fw[0] - sx)) best = p;
    return [best.fw[0], best.fw[1], h];
  });
  track.pilot = pilot;
  return track;
});
