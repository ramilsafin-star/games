// Карточки «Почты Дракоши»: 36 слов в трёх темах. level: 1 — короткое знакомое слово, 2 — длиннее, 3 — два слова.
// pic — картинка-подсказка (эмодзи), hint — загадка (её можно послушать голосом).
export const THEMES = [
  { id: "home", name: "Дом", icon: "🏡", color: "#ff8f5f" },
  { id: "animals", name: "Животные", icon: "🐾", color: "#3fbf7a" },
  { id: "city", name: "Город", icon: "🏙️", color: "#4f8bff" },
];

export const CARDS = [
  // Дом
  { theme: "home", asset: "home-01", word: "СТУЛ", pic: "🪑", level: 1, hint: "На нём сидят за столом." },
  { theme: "home", asset: "home-02", word: "ДИВАН", pic: "🛋️", level: 1, hint: "Мягкий, на нём сидят всей семьёй." },
  { theme: "home", asset: "home-03", word: "ЛОЖКА", pic: "🥄", level: 1, hint: "Ею едят суп и кашу." },
  { theme: "home", asset: "home-04", word: "ЧАШКА", pic: "☕", level: 1, hint: "Из неё пьют чай." },
  { theme: "home", asset: "home-05", word: "КЛЮЧ", pic: "🔑", level: 1, hint: "Открывает дверь." },
  { theme: "home", asset: "home-06", word: "ОКНО", pic: "🪟", level: 1, hint: "Через него смотрят на улицу." },
  { theme: "home", asset: "home-07", word: "ЧАСЫ", pic: "⏰", level: 1, hint: "Тик-так, показывают время." },
  { theme: "home", asset: "home-08", word: "КРОВАТЬ", pic: "🛏️", level: 2, hint: "На ней спят ночью." },
  { theme: "home", asset: "home-09", word: "НОСКИ", pic: "🧦", level: 2, hint: "Их надевают на ноги." },
  { theme: "home", asset: "home-10", word: "СВЕЧА", pic: "🕯️", level: 2, hint: "Горит маленьким огоньком." },
  { theme: "home", asset: "home-11", word: "ПЛЮШЕВЫЙ МИШКА", pic: "🧸", level: 3, hint: "Мягкая игрушка, с ней спят." },
  { theme: "home", asset: "home-12", word: "ЗУБНАЯ ЩЁТКА", pic: "🪥", level: 3, hint: "Ею чистят зубы утром и вечером." },
  // Животные
  { theme: "animals", asset: "animals-01", word: "КОТ", pic: "🐱", level: 1, hint: "Мурлычет и ловит мышей." },
  { theme: "animals", asset: "animals-02", word: "ЁЖИК", pic: "🦔", level: 1, hint: "Колючий, живёт в лесу." },
  { theme: "animals", asset: "animals-03", word: "ЛИСА", pic: "🦊", level: 1, hint: "Рыжая, с пушистым хвостом." },
  { theme: "animals", asset: "animals-04", word: "СЛОН", pic: "🐘", level: 1, hint: "Большой, с длинным хоботом." },
  { theme: "animals", asset: "animals-05", word: "ЗАЯЦ", pic: "🐰", level: 1, hint: "Длинные уши, прыгает по лесу." },
  { theme: "animals", asset: "animals-06", word: "СОВА", pic: "🦉", level: 1, hint: "Птица, которая не спит ночью." },
  { theme: "animals", asset: "animals-07", word: "ЖИРАФ", pic: "🦒", level: 2, hint: "У него самая длинная шея." },
  { theme: "animals", asset: "animals-08", word: "ПИНГВИН", pic: "🐧", level: 2, hint: "Птица, которая не летает, а плавает." },
  { theme: "animals", asset: "animals-09", word: "ЧЕРЕПАХА", pic: "🐢", level: 2, hint: "Ходит медленно и носит домик." },
  { theme: "animals", asset: "animals-10", word: "БЕЛКА", pic: "🐿️", level: 2, hint: "Прыгает по деревьям и любит орешки." },
  { theme: "animals", asset: "animals-11", word: "ДЕЛЬФИН", pic: "🐬", level: 2, hint: "Плавает в море, выпрыгивает из воды и дышит воздухом." },
  { theme: "animals", asset: "animals-12", word: "БОЖЬЯ КОРОВКА", pic: "🐞", level: 3, hint: "Красный жучок в чёрных точках." },
  // Город
  { theme: "city", asset: "city-01", word: "ДОМ", pic: "🏠", level: 1, hint: "В нём живут люди." },
  { theme: "city", asset: "city-02", word: "МОСТ", pic: "🌉", level: 1, hint: "По нему переходят через реку." },
  { theme: "city", asset: "city-03", word: "ПАРК", pic: "🌳", level: 1, hint: "Туда приходят погулять по дорожкам в тени деревьев." },
  { theme: "city", asset: "city-04", word: "ПОЧТА", pic: "📮", level: 1, hint: "Там отправляют письма и посылки." },
  { theme: "city", asset: "city-05", word: "АВТОБУС", pic: "🚌", level: 2, hint: "У него много сидений. Он возит людей от остановки до остановки." },
  { theme: "city", asset: "city-06", word: "ТРАМВАЙ", pic: "🚋", level: 2, hint: "Ездит по рельсам и звенит." },
  { theme: "city", asset: "city-07", word: "СВЕТОФОР", pic: "🚦", level: 2, hint: "Красный — стой, зелёный — иди." },
  { theme: "city", asset: "city-08", word: "МАГАЗИН", pic: "🏪", level: 2, hint: "Там покупают продукты." },
  { theme: "city", asset: "city-09", word: "БОЛЬНИЦА", pic: "🏥", level: 2, hint: "Там работают врачи и помогают тем, кто заболел." },
  { theme: "city", asset: "city-10", word: "КАРУСЕЛЬ", pic: "🎠", level: 2, hint: "Крутится, а на ней лошадки." },
  { theme: "city", asset: "city-11", word: "ПОЖАРНАЯ МАШИНА", pic: "🚒", level: 3, hint: "Красная, тушит огонь." },
  { theme: "city", asset: "city-12", word: "КОЛЕСО ОБОЗРЕНИЯ", pic: "🎡", level: 3, hint: "Большое колесо, с него видно весь город." },
].map((c) => ({ id: c.word, ...c }));
