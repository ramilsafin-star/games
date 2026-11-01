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
    finalMoreStars: 'Go back and hunt for the stars you missed!',
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
    levelNames: ['Force Shields', 'Drones Above', 'Bounce House', 'Bore Time', 'Portal Hop', 'Gigabot', 'Deep Freeze', 'The Vortex', 'Bomb Bots', 'Sky Islands', 'Tricky Maze', 'Gigabot Returns'],
    wordRoar: 'ROAR!', wordTurbo: 'TURBO!', wordSplit: 'TRIPLE!', wordOrb: 'THUNDER!', wordBoom: 'BOOM!',
    wordBot: ['SMASH!', 'BZZZT!', 'CRUNCH!', 'SCRAP!'], wordCombo2: 'DOUBLE!', wordCombo3: 'TRIPLE!', wordComboN: 'MEGA COMBO!',
    biome: ['Sunny Meadow', 'Blossom Hills', 'Sunset Canyon', 'Glacier Pass', 'Neon Night', 'Volcano Core']
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
    finalMoreStars: 'Вернись за пропущенными звёздами!',
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
    levelNames: ['Силовые щиты', 'Дроны в небе', 'Батут', 'Бур идёт', 'Портал', 'Гигабот', 'Снежок', 'Вихрь', 'Бомботы', 'Небесные острова', 'Хитрый лабиринт', 'Гигабот возвращается'],
    wordRoar: 'РЫК!', wordTurbo: 'ТУРБО!', wordSplit: 'ТРОЙКА!', wordOrb: 'ГРОМ!', wordBoom: 'БАБАХ!',
    wordBot: ['БАМ!', 'БЗЗЗТ!', 'ХРЯСЬ!', 'В УТИЛЬ!'], wordCombo2: 'ДУПЛЕТ!', wordCombo3: 'ТРИПЛЕТ!', wordComboN: 'МЕГА-КОМБО!',
    biome: ['Солнечный луг', 'Цветущие холмы', 'Закатный каньон', 'Ледяной перевал', 'Неоновая ночь', 'Сердце вулкана']
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
