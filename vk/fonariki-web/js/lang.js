// Все тексты игры на русском и английском (как в сетевой версии).
// {name} в строке заменяется параметром name. Язык хранится в сохранении (по умолчанию русский).

let lang = "ru";
export const setLang = (l) => (lang = l === "en" ? "en" : "ru");
export const getLang = () => lang;

const S = {
  // верх экрана
  phase_dusk0: ["СУМЕРКИ", "DUSK"],
  phase_night: ["НОЧЬ {n} / {total}", "NIGHT {n} / {total}"],
  phase_break: ["НОЧЬ {n} ПРОЙДЕНА", "NIGHT {n} SURVIVED"],
  phase_dawn: ["РАССВЕТ!", "DAWN!"],
  phase_lost: ["КОСТЁР ПОГАС", "THE FIRE IS OUT"],
  light: ["СВЕТ {n}%", "LIGHT {n}%"],
  boss: ["БОЛЬШАЯ ТЕНЬ — светите на неё фонарями!", "GREAT SHADOW — shine your lanterns on it!"],
  rate: ["+{rate}/с", "+{rate}/s"],
  jar: ["БАНКА", "JAR"],
  frozenTitle: ["ЗАСТЫЛ!", "FROZEN!"],
  frozenText: ["Друзья спешат на помощь · в лагерь через {s}", "Friends are coming · back to camp in {s}"],
  thawSelf: ["Оттаять сразу", "Thaw now"],
  ad: ["реклама", "ad"],

  // кнопка действия
  act_catch: ["Поймать", "Catch"],
  act_full: ["Банка полна", "Jar is full"],
  act_thaw: ["Разморозить", "Thaw"],
  act_cook: ["Пожарить зефир", "Roast"],
  act_snackFull: ["Зефира хватит", "Enough"],
  act_shrine: ["{cost}", "{cost}"],
  act_rest: ["Отдыхает {s}", "Resting {s}"],
  act_garden: ["Мой сад", "My garden"],

  // меню
  title: ["Фонарики до рассвета", "Lanterns Till Dawn"],
  tagline: ["Лови светлячков, корми костёр и продержись пять ночей", "Catch fireflies, feed the fire and survive five nights"],
  play: ["Играть", "Play"],
  again: ["Ещё раз", "Play again"],
  toMenu: ["В меню", "Menu"],
  resume: ["Продолжить", "Resume"],
  pause: ["Пауза", "Paused"],
  garden: ["Сад", "Garden"],
  book: ["Коллекция", "Collection"],
  upgrades: ["Улучшения", "Upgrades"],
  settings: ["Настройки", "Settings"],
  help: ["Как играть", "How to play"],
  crew: ["Помощники", "Helpers"],
  best: ["Лучший забег: {n} из 5 ночей", "Best run: {n} of 5 nights"],
  bestNone: ["Ещё ни одной ночи — вперёд!", "No nights yet — let's go!"],
  bestDawn: ["Лучший забег: до рассвета! Рассветов: {n}", "Best run: till dawn! Dawns: {n}"],
  snackAd: ["Зефир в дорогу", "Snack for the road"],
  snackAdGot: ["Зефир в дорогу: +1 на старте", "Snack for the road: +1 at start"],
  keys: ["WASD — бег · мышь — камера · E — действие · Esc — пауза", "WASD — run · mouse — camera · E — action · Esc — pause"],
  quality: ["Графика", "Graphics"],
  q_auto: ["Авто", "Auto"],
  q_high: ["Высокая", "High"],
  q_medium: ["Средняя", "Medium"],
  q_low: ["Низкая", "Low"],
  language: ["Язык", "Language"],
  sound: ["Звук", "Sound"],
  on: ["Вкл", "On"],
  off: ["Выкл", "Off"],
  close: ["Закрыть", "Close"],
  leaveRun: ["Выйти в меню? Пройденные ночи засчитаются.", "Back to menu? Survived nights still count."],
  rotate: ["Поверни телефон боком", "Turn your phone sideways"],
  loading: ["Зажигаем костёр…", "Lighting the campfire…"],
  loadFail: ["Игра не запустилась. Нужен браузер с поддержкой WebGL 2.", "The game could not start. A browser with WebGL 2 is needed."],

  // помощники
  crew_fox: ["Лисёнок Рыжик", "Ginger the Fox"],
  crew_bunny: ["Зайка Пушинка", "Fluff the Bunny"],
  crew_bear: ["Медвежонок Бублик", "Bagel the Bear"],
  crewFrozen: ["{who} застыл! Беги к нему с фонарём", "{who} is frozen! Run over with your lantern"],
  crewThawed: ["{who} снова в строю — спасибо!", "{who} is back — thanks!"],
  thawedBy: ["{helper} разморозил тебя!", "{helper} thawed you!"],
  crewHome: ["{who} вернулся в лагерь", "{who} went back to camp"],

  // улучшения и постройки
  up_jar: ["Банка побольше", "Bigger Jar"],
  up_boots: ["Быстрые ботинки", "Swift Boots"],
  unit_jar: ["светлячков", "fireflies"],
  unit_boots: ["скорость", "speed"],
  upInfo: ["{unit}: {a} → {b}", "{a} → {b} {unit}"],
  upMax: ["{unit}: {a} · МАКС", "{a} {unit} · MAX"],
  max: ["МАКС", "MAX"],
  buy: ["Купить", "Buy"],
  build_house: ["Домик светлячков", "Firefly House"],
  build_lamp: ["Фонарный столб", "Lamp Post"],
  build_flowers: ["Цветник", "Flower Bed"],
  build_feeder: ["Кормушка", "Feeder"],
  buildInfo_house: ["+{slots} места в саду и +{rate} сияния/с", "+{slots} garden slots and +{rate} glow/s"],
  buildInfo_lamp: ["сад приносит на {pct}% больше сияния", "the garden makes {pct}% more glow"],
  buildInfo_flowers: ["время от времени растит в саду гиганта", "now and then grows a Giant in the garden"],
  buildInfo_feeder: ["+{hours} часа дохода, пока тебя нет в игре", "+{hours} hours of glow while you are away"],
  gardenTitle: ["Мой сад", "My garden"],
  gardenInfo: ["Светлячков: {count}/{max} · {rate} сияния/с", "{count}/{max} fireflies · {rate} glow/s"],
  gardenHint: ["Неси светлячков на лужайку сада — они поселятся там и будут светить, даже когда тебя нет.", "Carry fireflies onto your garden lawn: they move in and glow even while you are away."],
  gardenEmpty: ["Сад пока пуст", "The garden is empty"],
  built: ["Построено: {name}!", "Built: {name}!"],
  upgraded: ["Улучшено: {name}!", "{name} upgraded!"],
  err_glow: ["Не хватает сияния", "Not enough glow"],
  err_max: ["Уже максимум", "Already maxed"],
  bookTitle: ["Коллекция {found}/{total}", "Collection {found}/{total}"],
  bookHint: ["Кольцо показывает мутацию: зелёное — гигант, золотое — золотой, радужное — радужный. Новая запись — награда.", "The ring shows the mutation: green — Giant, gold — Golden, rainbow — Rainbow. Every new entry pays a bonus."],
  col_none: ["Обычный", "Normal"],
  col_giant: ["Гигант", "Giant"],
  col_golden: ["Золотой", "Golden"],
  col_rainbow: ["Радужный", "Rainbow"],
  unknown: ["???", "???"],

  // мир
  place_mushrooms: ["Грибная поляна", "Mushroom Glade"],
  place_pond: ["Лунное озеро", "Moon Pond"],
  place_stones: ["Каменный круг", "Stone Circle"],
  place_oak: ["Старый дуб", "Old Oak"],
  place_crystals: ["Кристальная горка", "Crystal Hill"],
  campfire: ["Костёр", "Campfire"],

  // подсказки
  jarFull: ["Банка полна! Неси её в сад или к костру", "Your jar is full! Take it to your garden or the campfire"],
  caughtRare: ["Редкая находка: {name}!", "Rare find: {name}!"],
  caught: ["Поймано: {name}!", "You caught a {name}!"],
  newBook: ["Новое в коллекции: {name} +{n}", "New in your collection: {name} +{n}"],
  impComing: ["Вышли проказники! Они рассыпают светлячков из банки", "Imps are out! They scatter your fireflies"],
  bruteComing: ["Бродит громила. Медленный, но достаёт издалека", "A Brute is roaming. Slow, but its reach is long"],
  impStole: ["Проказник рассыпал твоих светлячков!", "An imp scattered your fireflies!"],
  impBoo: ["Бу! Проказник заглянул в пустую банку", "Boo! The imp found your jar empty"],
  fed: ["+{n} сияния · свет растёт!", "+{n} glow · the light grows!"],
  gardenGain: ["Сад светит ярче: +{x} сияния/с", "Your garden glows brighter: +{x} glow/s"],
  gardenFull: ["Сад полон: самые слабые улетели к костру", "Garden is full: the weakest flew to the campfire"],
  escaped: ["Светлячки разлетелись!", "Your fireflies escaped!"],
  backToCamp: ["Свет нашёл тебя. Назад в лагерь!", "The light found you. Back to camp!"],
  frozenBy: ["Тень заморозила тебя!", "A shadow froze you!"],
  snackReady: ["Зефир готов! Тень съест его и не заморозит тебя", "Marshmallow ready! A shadow will eat it instead of freezing you"],
  snackFull: ["Больше зефира не унести", "You can't carry more marshmallows"],
  snackEaten: ["Тень съела твой зефир и убежала довольная!", "The shadow ate your marshmallow and ran off happy!"],
  bossComing: ["Идёт Большая тень! Светите на неё фонарями!", "The Great Shadow is coming! Shine your lanterns on it!"],
  bossGone: ["Большая тень исчезла! +{n}", "The Great Shadow is gone! +{n}"],
  runReward: ["+{n} сияния за забег", "+{n} glow for the run"],
  daily: ["Подарок, день {d}: +{n} сияния! Завтра будет +{m}", "Day {d} gift: +{n} glow! Come back tomorrow for +{m}"],
  quest1: ["Поймай светлячка!", "Catch a firefly!"],
  quest2: ["Отнеси его к костру или в свой сад", "Carry it to the campfire or your garden"],
  quest3: ["Открой «Сад» и построй {n} домика", "Open Garden and build {n} houses"],
  questDone: ["Молодец! +{n} сияния", "Well done! +{n} glow"],
  questTitle: ["ПЕРВЫЕ ШАГИ", "FIRST STEPS"],
  lastNight: ["Последняя ночь. Идёт что-то большое…", "The last night. Something big is coming…"],
  nightStart: ["Ночь {n}: тени просыпаются", "Night {n}: the shadows wake up"],
  dusk: ["Наступает ночь. Лови светлячков и неси их к костру!", "Night is falling. Catch fireflies and bring them to the campfire!"],
  nightSurvived: ["Ночь {n} пройдена!", "Night {n} survived!"],
  dawn: ["РАССВЕТ! Вы сберегли костёр!", "DAWN! You kept the fire alive!"],
  lost: ["Костёр погас… Пройдено ночей: {n} из {total}", "The fire went out… Nights survived: {n} of {total}"],
  offline: ["Пока тебя не было, сад принёс: +{n}", "Your garden glowed while you were away: +{n}"],
  needHouse: ["Сначала построй домик светлячков: кнопка «Сад»", "Build a Firefly House first: press Garden"],
  gardenGrew: ["Цветник вырастил: {name}!", "Your Flower Bed grew a {name}!"],
  lowLight: ["Костёр слабеет! Неси светлячков!", "The fire is fading! Bring fireflies!"],

  // усиления у лесных мест
  buff_speed: ["Грибной чай", "Mushroom Tea"],
  buff_luck: ["Лунная вода", "Moon Water"],
  buff_ward: ["Руна-оберег", "Stone Rune"],
  buff_wood: ["Дубовые дрова", "Oak Firewood"],
  buff_double: ["Кристалл удачи", "Lucky Crystal"],
  buffInfo_speed: ["бежишь быстрее", "run faster"],
  buffInfo_luck: ["чаще ловишь мутации", "more mutations when you catch"],
  buffInfo_ward: ["тени тебя не видят", "shadows can't see you"],
  buffInfo_wood: ["костёр гаснет вдвое медленнее", "the fire burns half as fast"],
  buffInfo_double: ["двойное сияние у костра", "double glow at the campfire"],
  shrineGot: ["{name}: {info} {s} с", "{name}: {info} for {s} s"],
  shrineBusy: ["Это место отдыхает. Загляни чуть позже", "This place is resting. Come back soon"],
  luckHit: ["Лунная вода сработала: {name}!", "Moon Water worked: {name}!"],

  // события ночи
  event_wind: ["ВЕТЕР", "WIND"],
  event_hungry: ["ГОЛОДНЫЕ ТЕНИ", "HUNGRY SHADOWS"],
  event_fog: ["ТУМАН", "FOG"],
  event_starfall: ["ЗВЕЗДОПАД", "STARFALL"],
  eventStart_wind: ["Порыв ветра! Костёр гаснет быстрее", "A gust of wind! The fire burns out faster"],
  eventStart_hungry: ["Голодные тени! Их больше, и они быстрее", "Hungry shadows! More of them, and they are faster"],
  eventStart_fog: ["Опустился туман. Тени замечают тебя издалека", "Fog rolls in. Shadows spot you from farther away"],
  eventStart_starfall: ["Звездопад! У края света сели редкие светлячки", "Starfall! Rare fireflies landed near the light"],
  eventEnd: ["Миновало. Держимся дальше!", "It passed. Keep going!"],

  // итоги
  resDawn: ["Рассвет!", "Dawn!"],
  resLost: ["Костёр погас", "The fire went out"],
  resNights: ["Ночей пройдено", "Nights survived"],
  resGlow: ["Сияние за забег", "Glow this run"],
  resCaught: ["Поймано светлячков", "Fireflies caught"],
  resNew: ["Новое в коллекции", "New in collection"],
  resRecord: ["Новый рекорд!", "New record!"],
  resRescues: ["Спасено друзей", "Friends rescued"],
  double: ["×2 сияния", "×2 glow"],
  doubled: ["Сияние удвоено!", "Glow doubled!"],

  // как играть
  h1t: ["Лови светлячков", "Catch fireflies"],
  h1: ["Беги в тёмный лес. У светлячка жми кнопку «Поймать» (или E). Чем дальше в лес, тем они реже и ценнее.", "Run into the dark forest. Near a firefly press Catch (or E). The deeper you go, the rarer they get."],
  h2t: ["Не дай костру погаснуть", "Keep the fire burning"],
  h2: ["Неси светлячков в круг света у костра — они отдадут ему свет. Погаснет костёр — забег окончен.", "Bring fireflies into the circle of light: they feed the fire. If it goes out, the run is over."],
  h3t: ["Или расти свой сад", "Or grow your garden"],
  h3: ["Построй домики в «Саду» и зайди на лужайку: светлячки поселятся там и будут приносить сияние даже без тебя.", "Build houses in Garden and step onto the lawn: fireflies move in and make glow even while you are away."],
  h4t: ["Жарь зефир", "Roast marshmallows"],
  h4: ["Подержи кнопку у костра. Если тебя поймает тень, она съест зефир, а тебя не заморозит.", "Hold the button at the campfire. A shadow that catches you eats it instead of freezing you."],
  h5t: ["Берегись теней", "Beware the shadows"],
  h5: ["Поймала тень — ты застыл, светлячки разлетелись. Друзья-помощники разморозят тебя, а ты — их своим фонарём.", "If a shadow catches you, you freeze and your fireflies escape. Your helpers thaw you, and you thaw them with your lantern."],
  h6t: ["Продержись 5 ночей", "Survive 5 nights"],
  h6: ["Каждую ночь костёр гаснет быстрее, а теней больше. В последнюю придёт Большая тень — стойте рядом с ней с фонарями.", "Each night the fire burns faster and more shadows come. On the last night stand by the Great Shadow with your lanterns."],
  hFoot: ["У пяти лесных мест за сияние дают усиления. Случайные события: ветер, туман, голодные тени, звездопад.", "Five forest places sell boosts for glow. Random events: wind, fog, hungry shadows, starfall."],
  go: ["Вперёд!", "Let's go!"],
};

// названия светлячков; g — род, чтобы мутация согласовалась: «Золотая искорка», «Золотой уголёк»
export const KINDS = {
  spark: { ru: "Искорка", en: "Spark", g: "f" },
  wisp: { ru: "Льдинка", en: "Frost Wisp", g: "f" },
  ember: { ru: "Уголёк", en: "Ember", g: "m" },
  rose: { ru: "Розочка", en: "Rosebud", g: "f" },
  moss: { ru: "Моховичок", en: "Moss Lantern", g: "m" },
  star: { ru: "Звёздный мотылёк", en: "Star Moth", g: "m" },
  moon: { ru: "Лунный мотылёк", en: "Moon Moth", g: "m" },
};
const MUT = {
  giant: { en: "Giant", ru: { m: "Гигантский", f: "Гигантская" } },
  golden: { en: "Golden", ru: { m: "Золотой", f: "Золотая" } },
  rainbow: { en: "Rainbow", ru: { m: "Радужный", f: "Радужная" } },
};

export function t(key, args) {
  const entry = S[key];
  let text = entry ? entry[lang === "en" ? 1 : 0] : key;
  if (args) text = text.replace(/\{(\w+)\}/g, (m, name) => (args[name] !== undefined ? String(args[name]) : m));
  return text;
}

// название светлячка с мутацией: rec = { k, m }
export function fireflyName(rec) {
  const kind = KINDS[rec.k] || KINDS.spark;
  const m = MUT[rec.m];
  if (lang === "en") return m ? m.en + " " + kind.en : kind.en;
  if (!m) return kind.ru;
  return m.ru[kind.g] + " " + kind.ru[0].toLowerCase() + kind.ru.slice(1);
}

// «3 домика», «5 светлячков»: формы для 1, 2–4, 5+
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
