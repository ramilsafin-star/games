// =====================================================
// ЛОКАЛИЗАЦИЯ. Английский обязателен по требованиям YouTube.
// Язык берём только из ytgame.system.getLanguage().
// =====================================================
const STRINGS = {
  en: {
    logo1: 'PUFF', logo2: 'SLINGERS', tagline: 'Fling the fluff. Smash the bots!',
    play: 'PLAY', continue: 'CONTINUE', levels: 'Levels', back: 'Back', resume: 'Resume', restart: 'Restart',
    level: 'LEVEL', score: 'SCORE', best: 'Best', totalBest: 'Total best', paused: 'Paused',
    music: 'Music', sfx: 'Sound effects', shake: 'Screen shake', on: 'On', off: 'Off',
    selectLevel: 'Choose a level', locked: 'Locked', next: 'Next', retry: 'Try again', finish: 'Finish',
    clear: 'CLEAR!', levelClear: 'Level cleared!', outOfPuffs: 'Out of puffs!', newBest: 'New record!',
    loseTip: 'Hit the boom crates and weak supports — bots hate falling.',
    loseTipExtra: 'Try again — you get an extra puff!',
    bonus: 'Unused puffs bonus', finalTitle: 'You did it!',
    finalText: 'Every bot is scrap. That was the final level — there are no more for now.',
    finalStars: 'Stars collected', playAgain: 'Replay level 1',
    finalAllStars: 'All the stars! A true master of the sling.',
    finalMoreStars: 'Go back for the stars and medals you missed!',
    keys: 'Keyboard: arrows aim · Space fires and uses powers · R restart · P pause',
    tutorial: 'Pull back and release!', tapNow: 'TAP!', dragHint: 'Pull further to fire',
    heroRocky: 'Rocky — tap in flight: ROAR shockwave',
    heroZip: 'Zip — tap in flight: TURBO dash',
    heroTrio: 'Trio — tap in flight: split into three',
    heroNimbus: 'Nimbus — tap in flight: drop a thunder orb',
    heroMagma: 'Magma — tap in flight: EXPLODE',
    heroDrill: 'Bore — tap in flight: DRILL through anything',
    heroFrost: 'Snowball — tap in flight: FREEZE walls, then smash them',
    heroDyna: 'Dyna — blows up on impact, tap in flight: drop dynamite',
    gems: 'Crystals', bossName: 'GIGABOT',
    wordDyna: 'DYNAMITE!', wordCollapse: 'COLLAPSE!', wordDrill: 'DRILL!', wordFrost: 'FREEZE!', wordShield: 'SHIELD DOWN!', wordRage: 'RAGE!',
    levelNames: ['Force Shields', 'Drones Above', 'Bounce House', 'Bore Time', 'Portal Hop', 'Gigabot', 'Deep Freeze', 'The Vortex', 'Bomb Bots', 'Sky Islands', 'Tricky Maze', 'Gigabot Returns',
      'Balloons', 'Sky Bridge', 'Canyon Cableway', 'Steel Weights', 'Neon Carnival', 'Gigabot Takes Flight'],
    wordRoar: 'ROAR!', wordTurbo: 'TURBO!', wordSplit: 'TRIPLE!', wordOrb: 'THUNDER!', wordBoom: 'BOOM!',
    wordBot: ['SMASH!', 'BZZZT!', 'CRUNCH!', 'SCRAP!'], wordCombo2: 'DOUBLE!', wordCombo3: 'TRIPLE!', wordComboN: 'MEGA COMBO!',
    biome: ['Sunny Meadow', 'Blossom Hills', 'Sunset Canyon', 'Glacier Pass', 'Neon Night', 'Volcano Core'],
    chapters: ['First Shots', 'Tricky Stuff', 'Trials', 'Balloon Parade'],
    wordPop: 'POP!', wordMedal: 'MEDAL!', wordBalloonsFirst: 'Pop the balloons!', wordFall: 'FALLING!', wordInflate: 'New balloons!', wordBossDown: 'GIGABOT DOWN!',
    bonusPuff: 'BONUS PUFF!', bonusPuffSub: 'The smash meter is full',
    goal_collapse: 'Medal: break {n} blocks with one shot', goal_combo: 'Medal: down {n} bots with one shot', goal_boom: 'Medal: blow up every boom crate',
    goal_score: 'Medal: score {n} points', goal_shots: 'Medal: clear it in {n} shots', goal_balloons: 'Medal: pop every balloon',
    goalShort_collapse: 'Collapse', goalShort_combo: 'Combo', goalShort_boom: 'Crates', goalShort_score: 'Score', goalShort_shots: 'Shots', goalShort_balloons: 'Balloons',
    medalGot: 'Medal earned!', medalHad: 'Medal', medalMissed: 'No medal', medals: 'Medals', meter: 'Smash meter',
    trails: 'Trails', trailsTitle: 'Puff trails', trailsNote: 'Stars and medals: {n}. Collect more to open new trails.',
    trailNames: ['Classic', 'Rainbow', 'Starry', 'Bubbles', 'Fire', 'Gold'], trailNeed: '{n} to open', trailOn: 'On', newTrail: 'New trail: {name}! Pick it in «Trails».',
    balloonHint: 'Fly through a balloon to pop it — whatever it holds will fall!',
    graphics: 'Graphics', gfxAuto: 'Auto', gfx: ['Low', 'Medium', 'High']
  },
  ru: {
    logo1: 'ПУШИСТЫЙ', logo2: 'ЗАЛП', tagline: 'Заряжай пуфов. Круши роботов!',
    play: 'ИГРАТЬ', continue: 'ПРОДОЛЖИТЬ', levels: 'Уровни', back: 'Назад', resume: 'Продолжить', restart: 'Заново',
    level: 'УРОВЕНЬ', score: 'ОЧКИ', best: 'Рекорд', totalBest: 'Лучший итог', paused: 'Пауза',
    music: 'Музыка', sfx: 'Звуковые эффекты', shake: 'Тряска экрана', on: 'Вкл', off: 'Выкл',
    selectLevel: 'Выбери уровень', locked: 'Закрыт', next: 'Дальше', retry: 'Ещё раз', finish: 'Финиш',
    clear: 'ЗАЧИЩЕНО!', levelClear: 'Уровень пройден!', outOfPuffs: 'Пуфы закончились!', newBest: 'Новый рекорд!',
    loseTip: 'Целься в ящики-бум и слабые опоры — боты не любят падать.',
    loseTipExtra: 'Попробуй ещё раз — будет дополнительный пуф!',
    bonus: 'Бонус за оставшихся пуфов', finalTitle: 'Победа!',
    finalText: 'Все боты пущены на металлолом. Это был последний уровень — больше пока нет.',
    finalStars: 'Собрано звёзд', playAgain: 'Сыграть уровень 1',
    finalAllStars: 'Все звёзды! Настоящий мастер рогатки.',
    finalMoreStars: 'Вернись за пропущенными звёздами и медалями!',
    keys: 'Клавиатура: стрелки — прицел · Пробел — выстрел и сила · R — заново · P — пауза',
    tutorial: 'Оттяни и отпусти!', tapNow: 'ЖМИ!', dragHint: 'Оттяни сильнее для выстрела',
    heroRocky: 'Рокки — тап в полёте: ударная волна РЫК',
    heroZip: 'Зип — тап в полёте: ТУРБО-рывок',
    heroTrio: 'Трио — тап в полёте: делится на троих',
    heroNimbus: 'Нимбус — тап в полёте: сброс шаровой молнии',
    heroMagma: 'Магма — тап в полёте: ВЗРЫВ',
    heroDrill: 'Бур — тап в полёте: сверлит всё насквозь',
    heroFrost: 'Снежок — тап в полёте: ЗАМОРОЗКА, потом стены легко разбить',
    heroDyna: 'Динамит — взрывается от удара, тап в полёте: сбрасывает шашки',
    gems: 'Кристаллы', bossName: 'ГИГАБОТ',
    wordDyna: 'ДИНАМИТ!', wordCollapse: 'ОБВАЛ!', wordDrill: 'БУР!', wordFrost: 'МОРОЗ!', wordShield: 'ЩИТ СБИТ!', wordRage: 'ЯРОСТЬ!',
    levelNames: ['Силовые щиты', 'Дроны в небе', 'Батут', 'Бур идёт', 'Портал', 'Гигабот', 'Снежок', 'Вихрь', 'Бомботы', 'Небесные острова', 'Хитрый лабиринт', 'Гигабот возвращается',
      'Шарики', 'Воздушный мост', 'Канатка', 'Стальные гири', 'Неоновый карнавал', 'Гигабот-воздухоплаватель'],
    wordRoar: 'РЫК!', wordTurbo: 'ТУРБО!', wordSplit: 'ТРОЙКА!', wordOrb: 'ГРОМ!', wordBoom: 'БАБАХ!',
    wordBot: ['БАМ!', 'БЗЗЗТ!', 'ХРЯСЬ!', 'В УТИЛЬ!'], wordCombo2: 'ДУПЛЕТ!', wordCombo3: 'ТРИПЛЕТ!', wordComboN: 'МЕГА-КОМБО!',
    biome: ['Солнечный луг', 'Цветущие холмы', 'Закатный каньон', 'Ледяной перевал', 'Неоновая ночь', 'Сердце вулкана'],
    chapters: ['Первые залпы', 'Хитрые штуки', 'Испытания', 'Воздушный парад'],
    wordPop: 'ХЛОП!', wordMedal: 'МЕДАЛЬ!', wordBalloonsFirst: 'Лопни шарики!', wordFall: 'ПАДАЕТ!', wordInflate: 'Новые шарики!', wordBossDown: 'ГИГАБОТ ПОВЕРЖЕН!',
    bonusPuff: 'БОНУС-ПУФ!', bonusPuffSub: 'Разрушомер заполнен',
    goal_collapse: 'Медаль: сломай {n} {блок|блока|блоков} одним выстрелом', goal_combo: 'Медаль: сбей {n} {бота|бота|ботов} одним выстрелом', goal_boom: 'Медаль: взорви все ящики-бум',
    goal_score: 'Медаль: набери {n} очков', goal_shots: 'Медаль: пройди за {n} {выстрел|выстрела|выстрелов}', goal_balloons: 'Медаль: лопни все шарики',
    goalShort_collapse: 'Обвал', goalShort_combo: 'Комбо', goalShort_boom: 'Ящики', goalShort_score: 'Очки', goalShort_shots: 'Выстрелы', goalShort_balloons: 'Шарики',
    medalGot: 'Медаль получена!', medalHad: 'Медаль', medalMissed: 'Без медали', medals: 'Медали', meter: 'Разрушомер',
    trails: 'Следы', trailsTitle: 'Следы за пуфом', trailsNote: 'Звёзд и медалей: {n}. Собирай больше — откроются новые следы.',
    trailNames: ['Обычный', 'Радуга', 'Звёздный', 'Пузыри', 'Огонёк', 'Золотой'], trailNeed: 'Нужно {n}', trailOn: 'Выбран', newTrail: 'Новый след: {name}! Выбери его в «Следах».',
    balloonHint: 'Пролети сквозь шарик — он лопнет, и то, что он держит, упадёт!',
    graphics: 'Графика', gfxAuto: 'Авто', gfx: ['Низкая', 'Средняя', 'Высокая']
  }
};

let LANG = 'en';

function t(key) {
  const v = STRINGS[LANG][key];
  return v !== undefined ? v : STRINGS.en[key];
}

function setLanguage(tag) {
  LANG = /^ru\b/i.test(tag || '') ? 'ru' : 'en';
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

function formatNumber(n) {
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
