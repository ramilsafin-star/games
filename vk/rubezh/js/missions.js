// Кампания «Рубежа»: 4 карты × 3 задания. У задания 1–2 раунда; между раундами — снаряжение.
// Роботы: [тип, точка, {route — маршрут патруля, face — куда смотрит, wake — сразу в бою}]
// Волны: when — "t:секунды" от начала раунда, "left:N" (осталось N роботов), "alarm", "plant", "hack",
// "rescue", "hold:доля" (доля удержания), "boss:доля" (доля прочности босса); hunt — сразу идут на игрока.
// Условия третьей звезды: fast — не дольше нормы и точность от 35%; ghost — без тревоги.

export const MISSIONS = [
  // ===================== Северный порт =====================
  {
    id: 0, map: "port", name: "Высадка", time: "dusk", weather: "drizzle",
    brief: "ГОРН — заводской искусственный интеллект — вышел из-под контроля и выпустил боевых роботов. Первым он занял Северный порт. Высаживаемся на южном причале и очищаем контейнерный двор: без этого не пройти к кранам.",
    goal: "Отключить всех роботов в контейнерном дворе",
    par: 210, reward: 1500, mates: 0, star3: "fast",
    tips: ["Светится ядро — попадание в него наносит двойной урон.", "Присядь за контейнером: так тебя труднее заметить и задеть."],
    rounds: [
      {
        kind: "clear", spawn: "S",
        robots: [
          ["zhuk", "s2", { route: "south" }], ["zhuk", "y2", { route: "yardLoop" }], ["zhuk", "y9", { route: "yardCross" }],
          ["zhuk", "y12"], ["strelok", "y6"], ["strelok", "y11", { face: Math.PI }], ["zhuk", "q2", { route: "quay" }],
        ],
        waves: [{ when: "left:2", hunt: true, list: [["strelok", "n2"], ["zhuk", "n3"], ["zhuk", "y14"]], say: "Из-за складов выходят новые роботы!" }],
      },
    ],
  },
  {
    id: 1, map: "port", name: "Тихий причал", time: "night", weather: "rain", sight: 0.75,
    brief: "Ночь и ливень — лучшее прикрытие. Камеры и патрули ГОРНа следят за причалом. Нужно незаметно добраться до пульта кранов, скачать карту завода и уйти к северным воротам. Поднимешь тревогу — роботы сбегутся со всего порта.",
    goal: "Скачать данные с пульта кранов и уйти к воротам",
    par: 240, reward: 1700, mates: 0, star3: "ghost", stealth: true,
    tips: ["Иди шагом или пригнувшись: так роботы тебя не слышат.", "Удар ножом со спины отключает робота бесшумно.", "Красный луч камеры — её поле зрения."],
    rounds: [
      {
        kind: "stealth", spawn: "S", target: "B", hack: 4, exit: "X",
        robots: [
          ["glaz", "cam1"], ["glaz", "cam2"], ["glaz", "cam3"], ["glaz", "cam4"],
          ["zhuk", "s3", { route: "south" }], ["zhuk", "y5", { route: "yardLoop" }], ["zhuk", "q1", { route: "quay" }],
          ["strelok", "q4", { face: Math.PI }], ["strelok", "y10", { face: Math.PI / 2 }], ["zhuk", "n3", { route: "north" }],
        ],
        waves: [
          { when: "alarm", hunt: true, list: [["strelok", "n4"], ["strelok", "q5"], ["zhuk", "n2"], ["zhuk", "y15"], ["kolobok", "y14"]], say: "Тревога! Роботы стягиваются к пульту!" },
          { when: "hack", list: [["zhuk", "n5"], ["zhuk", "n1"]], say: "Данные у нас. Уходим к воротам!" },
        ],
      },
    ],
  },
  {
    id: 2, map: "port", name: "Ретранслятор", time: "dawn", weather: "fog",
    brief: "Через ретрансляторы в порту ГОРН управляет роботами на всём побережье. Сначала зачищаем подходы, потом ставим заряд у ретранслятора на складе (А) или у пульта кранов (Б) и удерживаем позицию, пока заряд не сработает. Появились «Бастионы» со щитом — заходи им сбоку.",
    goal: "Зачистить подходы и отключить ретранслятор зарядом",
    par: 330, reward: 2100, mates: 0, star3: "fast",
    tips: ["Щит «Бастиона» держит пули спереди — ядро у него на спине.", "ЭМИ-граната снимает щиты и оглушает роботов."],
    rounds: [
      {
        kind: "clear", spawn: "S",
        robots: [
          ["zhuk", "s1", { route: "south" }], ["zhuk", "s4"], ["strelok", "y1"], ["strelok", "y3", { face: Math.PI }],
          ["bastion", "y6"], ["zhuk", "y8", { route: "yardLoop" }], ["strelok", "y7"],
        ],
        waves: [{ when: "left:2", hunt: true, list: [["zhuk", "y12"], ["kolobok", "y14"]] }],
      },
      {
        kind: "plant", spawn: "yard", sites: ["A", "B"], plant: 3, defend: 35,
        robots: [
          ["strelok", "w4"], ["zhuk", "w2", { route: "wh" }],
          ["strelok", "q4"], ["bastion", "q3"], ["zhuk", "q2", { route: "quay" }], ["osa", "perch"],
        ],
        waves: [
          { when: "plant", hunt: true, list: [["strelok", "n2"], ["kolobok", "n1"], ["kolobok", "y14"], ["zhuk", "n4"]], say: "Заряд установлен! Роботы идут его снимать!" },
          { when: "plant:18", hunt: true, list: [["strelok", "s2"], ["zhuk", "s3"]] },
        ],
      },
    ],
  },
  // ===================== Станция «Купол» =====================
  {
    id: 3, map: "dome", name: "Песчаная буря", time: "day", weather: "haze",
    brief: "На исследовательской станции «Купол» роботы ГОРНа держат в лаборатории инженера Веру Лапину — она знает, как устроено ядро завода. Пробиваемся в купол, освобождаем Веру и ведём её к вездеходам в гараже.",
    goal: "Освободить инженера и довести её до гаража",
    par: 300, reward: 2300, mates: 0, star3: "fast",
    tips: ["Инженер идёт за тобой. Если её оглушат — подойди и подними её.", "«Оса» висит в небе и целится красным лучом: уйди с линии луча!"],
    rounds: [
      {
        kind: "rescue", spawn: "S", hostage: "H", exit: "X",
        robots: [
          ["zhuk", "p1", { route: "south" }], ["zhuk", "p5"], ["strelok", "d1"], ["strelok", "d4", { route: "domeLoop" }],
          ["bastion", "d2"], ["strelok", "d7"], ["zhuk", "s2", { route: "solar" }], ["osa", "perch"], ["zhuk", "e6", { route: "garage" }],
        ],
        waves: [
          { when: "rescue", hunt: true, list: [["strelok", "n1"], ["strelok", "n3"], ["zhuk", "n2"], ["zhuk", "e5"], ["osa", "perch"]], say: "Вера с нами! Роботы перекрывают путь к гаражу!" },
          { when: "rescue:25", hunt: true, list: [["kolobok", "e1"], ["kolobok", "e2"], ["strelok", "g3"]] },
        ],
      },
    ],
  },
  {
    id: 4, map: "dome", name: "Солнечное поле", time: "sunset", weather: "haze",
    brief: "Вера перенастраивает солнечную станцию, чтобы обесточить завод. Ей нужно время: удерживай щитовую посреди солнечного поля, пока идёт перенастройка. Ряды панелей — низкое укрытие, приседай за ними.",
    goal: "Удержать щитовую до конца перенастройки",
    par: 190, reward: 2400, mates: 0, star3: "fast",
    tips: ["Таймер идёт, только пока ты в круге.", "«Колобки» взрываются рядом — стреляй в них издалека."],
    rounds: [
      {
        kind: "hold", spawn: "S", zone: "hold", time: 70,
        robots: [["zhuk", "s1", { route: "solar" }], ["zhuk", "s5"], ["strelok", "s3"]],
        waves: [
          { when: "hold:0", hunt: true, list: [["zhuk", "s6"], ["strelok", "d2"], ["zhuk", "p1"], ["strelok", "s4"]], say: "Перенастройка пошла! Держим щитовую!" },
          { when: "hold:0.3", hunt: true, list: [["kolobok", "s6"], ["kolobok", "p4"], ["strelok", "d3"], ["zhuk", "n1"]] },
          { when: "hold:0.6", hunt: true, list: [["bastion", "d2"], ["osa", "perch"], ["zhuk", "p1"]] },
          { when: "hold:0.85", hunt: true, list: [["kolobok", "s6"], ["kolobok", "s1"], ["zhuk", "p3"]] },
        ],
      },
    ],
  },
  {
    id: 5, map: "dome", name: "Пульт купола", time: "night", weather: "haze", sight: 0.85,
    brief: "ГОРН не сдаётся: роботы заложили вирусную бомбу, чтобы стереть данные станции. Она стоит у вышки связи (А) или у реактора (Б) — где именно, неизвестно. Найди и обезвредь её до взрыва. Здесь впервые появляется тяжёлый шагоход «Молот».",
    goal: "Найти и обезвредить бомбу ГОРНа",
    par: 150, reward: 2700, mates: 0, star3: "fast", timer: 160,
    tips: ["У «Молота» два ядра по бокам. ЭМИ останавливает его на несколько секунд.", "Сапёрный набор обезвреживает бомбу вдвое быстрее."],
    rounds: [
      {
        kind: "defuse", spawn: "S", sites: ["A", "B"], defuse: 5, time: 160,
        robots: [
          ["strelok", "e1"], ["strelok", "e3"], ["zhuk", "e2", { route: "east" }], ["molot", "d6"],
          ["strelok", "d4"], ["bastion", "d1"], ["zhuk", "p2", { route: "south" }], ["zhuk", "p4"], ["osa", "perch"],
        ],
        waves: [
          { when: "t:45", hunt: true, list: [["strelok", "n2"], ["zhuk", "n1"], ["zhuk", "n3"]] },
          { when: "t:90", hunt: true, list: [["kolobok", "p3"], ["kolobok", "e6"], ["strelok", "s2"]] },
        ],
      },
    ],
  },
  // ===================== Небоскрёб «Шпиль» =====================
  {
    id: 6, map: "tower", name: "Этаж 52", time: "day", mates: 2,
    brief: "Следы ГОРНа ведут в небоскрёб «Шпиль»: на 52 этаже он собрал свой узел связи. С тобой двое бойцов — Лис и Гроза. Сначала зачищаем офисы на западе, затем лобби и кафе.",
    goal: "Зачистить офисы, затем лобби и кафе",
    par: 330, reward: 2900, star3: "fast",
    tips: ["Стеклянные перегородки бьются от выстрелов.", "Кнопка «Отряд» — бойцы держат позицию или идут за тобой."],
    rounds: [
      {
        kind: "clear", spawn: "S",
        robots: [
          ["zhuk", "o2", { route: "offices" }], ["strelok", "o3"], ["strelok", "o4", { face: Math.PI }], ["zhuk", "o5"],
          ["strelok", "o6"], ["bastion", "o7"], ["zhuk", "a1", { route: "server" }], ["strelok", "a4"],
        ],
        waves: [{ when: "left:2", hunt: true, list: [["kolobok", "l1"], ["kolobok", "l6"], ["zhuk", "o8"]] }],
      },
      {
        kind: "clear", spawn: "S2",
        robots: [
          ["strelok", "l2"], ["strelok", "l4"], ["bastion", "l3"], ["zhuk", "l7", { route: "lobby" }], ["strelok", "c2"],
          ["zhuk", "c4", { route: "cafe" }], ["strelok", "e1"], ["bastion", "e3"], ["zhuk", "t1"],
        ],
        waves: [{ when: "left:3", hunt: true, list: [["kolobok", "t2"], ["kolobok", "t5"], ["strelok", "t6"], ["zhuk", "c1"]] }],
      },
    ],
  },
  {
    id: 7, map: "tower", name: "Серверная", time: "sunset", mates: 2,
    brief: "Узел связи ГОРНа — в серверной (А) и кабинете директора (Б). Достаточно заряда у одного из них. Ставим заряд и держимся, пока он не сработает: роботы бросятся его снимать.",
    goal: "Заложить заряд у серверной или кабинета и удержать его",
    par: 240, reward: 3100, star3: "fast",
    tips: ["Пока ставишь заряд, бойцы прикрывают.", "Защищай заряд: робот, добравшийся до него, снимет его за 5 секунд."],
    rounds: [
      {
        kind: "plant", spawn: "S", sites: ["A", "B"], plant: 3, defend: 40,
        robots: [
          ["strelok", "a2"], ["strelok", "a4"], ["zhuk", "o6", { route: "offices" }], ["strelok", "e1"], ["bastion", "e2"],
          ["zhuk", "l2", { route: "lobby" }], ["strelok", "o3"], ["zhuk", "c3"],
        ],
        waves: [
          { when: "plant", hunt: true, list: [["strelok", "l1"], ["strelok", "l5"], ["bastion", "l3"], ["kolobok", "c1"], ["kolobok", "t1"], ["zhuk", "l4"]], say: "Заряд стоит! Держим!" },
          { when: "plant:20", hunt: true, list: [["strelok", "c4"], ["zhuk", "o5"], ["kolobok", "l6"]] },
        ],
      },
    ],
  },
  {
    id: 8, map: "tower", name: "Вертолётная площадка", time: "night", mates: 3,
    brief: "Узел связи взорван, но ГОРН поднял весь этаж. Вертолёт заберёт отряд с террасы — держим площадку до его прилёта. Снаружи висят «Осы», изнутри лезут роботы.",
    goal: "Удержать вертолётную площадку до прилёта вертолёта",
    par: 220, reward: 3300, star3: "fast",
    tips: ["Боевая винтовка с прицелом снимает «Ос» с одного-двух выстрелов в линзу."],
    rounds: [
      {
        kind: "hold", spawn: "S2", zone: "pad", time: 80,
        robots: [["strelok", "l2"], ["strelok", "l4"], ["zhuk", "l3"], ["zhuk", "t1"], ["osa", "perch"]],
        waves: [
          { when: "hold:0", hunt: true, list: [["strelok", "l1"], ["strelok", "l5"], ["zhuk", "l6"], ["zhuk", "c3"]], say: "Вертолёт будет через полторы минуты!" },
          { when: "hold:0.35", hunt: true, list: [["osa", "perch"], ["kolobok", "l4"], ["kolobok", "c3"], ["kolobok", "e1"], ["strelok", "l7"]] },
          { when: "hold:0.65", hunt: true, list: [["molot", "l3"], ["strelok", "e1"], ["strelok", "c2"]] },
        ],
      },
    ],
  },
  // ===================== Метро «Глубина» =====================
  {
    id: 9, map: "metro", name: "Спуск", time: "metro",
    brief: "Вера рассчитала: питание завода идёт через старое метро «Глубина». Там в насосной роботы держат её коллегу, механика Тимура Белова — без него к ядру не пройти. Освобождаем Тимура и выводим его на платформу.",
    goal: "Освободить механика в насосной и вывести на платформу",
    par: 330, reward: 3500, mates: 0, star3: "fast",
    tips: ["Пути ниже платформы — спуститься можно по лестницам с краёв и посередине."],
    rounds: [
      {
        kind: "rescue", spawn: "S", hostage: "H", exit: "X",
        robots: [
          ["strelok", "p2"], ["zhuk", "p3", { route: "platform" }], ["strelok", "p4"], ["zhuk", "tr1", { route: "tracks" }],
          ["strelok", "tr4"], ["zhuk", "c2", { route: "corridor" }], ["strelok", "c4"], ["bastion", "c3"], ["zhuk", "dp1"],
        ],
        waves: [
          { when: "rescue", hunt: true, list: [["kolobok", "dp1"], ["kolobok", "dp6"], ["strelok", "dp2"], ["strelok", "tr5"], ["zhuk", "tr3"]], say: "Тимур с нами! Из депо идут роботы!" },
          { when: "rescue:30", hunt: true, list: [["zhuk", "tn2"], ["zhuk", "tn6"], ["strelok", "tn3"]] },
        ],
      },
    ],
  },
  {
    id: 10, map: "metro", name: "Затопленный тоннель", time: "emergency", sight: 0.8,
    brief: "В затопленных тоннелях на западе — пульт насосов. Тимур просит тихо подключиться к нему: через пульт мы увидим схему завода. Камеры и патрули слышат каждый шаг по воде. А потом — обезвредить бомбу, которой ГОРН хочет обрушить тоннель.",
    goal: "Тихо подключиться к пульту насосов, затем обезвредить бомбу",
    par: 300, reward: 3800, mates: 0, star3: "ghost", stealth: true,
    tips: ["В воде шаги громче — иди медленно.", "Бомба у насосной (А) или у входа в депо (Б)."],
    rounds: [
      {
        kind: "stealth", spawn: "S", target: "A", hack: 4,
        robots: [
          ["glaz", "cam1"], ["glaz", "cam2"], ["glaz", "cam3"], ["zhuk", "tn1", { route: "tunnelN" }], ["zhuk", "tn5", { route: "tunnelS" }],
          ["zhuk", "tn4", { route: "cross" }], ["strelok", "tn3", { face: -Math.PI / 2 }], ["strelok", "tn7", { face: -Math.PI / 2 }], ["zhuk", "p2", { route: "platform" }],
        ],
        waves: [{ when: "alarm", hunt: true, list: [["strelok", "p1"], ["strelok", "tr1"], ["kolobok", "tr2"], ["kolobok", "c1"], ["zhuk", "tn2"]], say: "Тревога! Нас засекли в тоннеле!" }],
      },
      {
        kind: "defuse", spawn: "tn4", sites: ["B", "X2"], defuse: 5, time: 150,
        robots: [
          ["strelok", "tr2"], ["strelok", "p4"], ["zhuk", "c3", { route: "corridor" }], ["bastion", "dp1"], ["strelok", "c5"],
          ["zhuk", "tr5"], ["molot", "dp6"], ["osa", "perch"],
        ],
        waves: [
          { when: "t:40", hunt: true, list: [["kolobok", "tr3"], ["kolobok", "c4"], ["zhuk", "p5"]] },
          { when: "t:85", hunt: true, list: [["strelok", "dp2"], ["strelok", "dp4"], ["zhuk", "tr4"]] },
        ],
      },
    ],
  },
  {
    id: 11, map: "metro", name: "Сердце завода", time: "forge", mates: 2,
    brief: "Финал. Схема из насосной показала: ядро ГОРНа спряталось в депо и собрало себе тело — гигантский шагоход «Наковальня». Лис и Гроза идут с тобой. Пробиваемся в депо и разбиваем «Наковальню». Её ядро открывается, когда она остывает, — стреляй в светящееся сердце!",
    goal: "Прорваться в депо и победить «Наковальню»",
    par: 420, reward: 5000, star3: "fast",
    tips: ["Ядро «Наковальни» уязвимо, только когда открыто и светится.", "ЭМИ открывает ядро и останавливает её огонь.", "Красные круги на полу — сюда летят ракеты."],
    rounds: [
      {
        kind: "clear", spawn: "S",
        robots: [
          ["strelok", "p2"], ["strelok", "p4"], ["zhuk", "p3", { route: "platform" }], ["bastion", "p5"], ["zhuk", "tr2", { route: "tracks" }],
          ["strelok", "tr4"], ["strelok", "tr5"], ["osa", "perch"], ["molot", "dp1"], ["zhuk", "c3"],
        ],
        waves: [{ when: "left:3", hunt: true, list: [["kolobok", "dp2"], ["kolobok", "dp5"], ["strelok", "dp6"], ["bastion", "dp3"]] }],
      },
      {
        kind: "boss", spawn: "S2", boss: "dp6",
        robots: [["zhuk", "dp2"], ["zhuk", "dp5"]],
        waves: [],
      },
    ],
  },
];

// Время суток и погода для сцены: небо, солнце, туман, фонари
export const TIMES = {
  dusk: { sky: ["#1d2b4d", "#e0764a", "#ffb36b"], sun: [-0.6, 0.22, -0.4], sunColor: "#ffc49a", sunI: 1.25, hemi: ["#a8b8e0", "#5a4a44", 1.15], fog: ["#6b5a66", 18, 120], lamps: 1, exposure: 1.05 },
  night: { sky: ["#03060f", "#0b1730", "#1c2c4a"], sun: [0.4, 0.6, 0.5], sunColor: "#9db8ff", sunI: 0.75, hemi: ["#5a78b0", "#2a3040", 1.0], fog: ["#0d1626", 10, 85], lamps: 1.25, exposure: 1.15, stars: true },
  dawn: { sky: ["#6e8fb8", "#e8b0a0", "#ffe0c0"], sun: [0.7, 0.16, 0.5], sunColor: "#ffd2ac", sunI: 1.5, hemi: ["#b9c8e6", "#5d5248", 0.95], fog: ["#b8bcc8", 8, 70], lamps: 0.6, exposure: 1.0 },
  day: { sky: ["#3d7fd1", "#9fd0ff", "#fff1d6"], sun: [0.45, 0.8, 0.3], sunColor: "#fff3e0", sunI: 2.6, hemi: ["#cfe6ff", "#b08a5e", 0.9], fog: ["#e9d2ab", 30, 190], lamps: 0.5, exposure: 0.9 },
  sunset: { sky: ["#2a2c5a", "#ff7a4a", "#ffd07a"], sun: [-0.8, 0.12, 0.2], sunColor: "#ff9a5a", sunI: 2.0, hemi: ["#a08ac8", "#6a4636", 0.85], fog: ["#c67e62", 25, 160], lamps: 0.8, exposure: 1.02 },
  metro: { sky: ["#05070a", "#0b0f14", "#10151c"], sun: [0.2, 1, 0.1], sunColor: "#b8c8e0", sunI: 0.25, hemi: ["#7a8da6", "#30343b", 1.05], fog: ["#141a22", 12, 70], lamps: 1.3, exposure: 1.2, indoor: true },
  emergency: { sky: ["#05070a", "#0b0f14", "#10151c"], sun: [0.2, 1, 0.1], sunColor: "#ff8a6a", sunI: 0.18, hemi: ["#8a5a62", "#2a1a1c", 0.9], fog: ["#1e0e10", 9, 58], lamps: 1.4, exposure: 1.2, indoor: true, emergency: true },
  forge: { sky: ["#05070a", "#120b08", "#1c120c"], sun: [0.2, 1, 0.1], sunColor: "#ffb080", sunI: 0.3, hemi: ["#9d8a80", "#3a2a22", 1.1], fog: ["#24140c", 14, 80], lamps: 1.4, exposure: 1.25, indoor: true },
  range: { sky: ["#05070a", "#0b0f14", "#10151c"], sun: [0.3, 1, 0.2], sunColor: "#ffffff", sunI: 0.6, hemi: ["#c8d8f0", "#40464e", 1.1], fog: ["#1a2028", 30, 120], lamps: 1.1, exposure: 1.0, indoor: true },
};

export const MISSION_COUNT = MISSIONS.length;
