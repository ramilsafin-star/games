// Какие готовые картинки лежат в assets/ (id → путь внутри assets/). Пустой список — все карты
// рисуются кодом. Список обновляет команда `node tests/art-list.mjs`: она смотрит, какие файлы
// есть в assets/tarot (<id>.webp или <id>.jpg, рубашка — back.webp/.jpg) и фон истории
// (assets/story-bg.webp/.jpg), и переписывает этот файл. Так браузер не запрашивает
// несуществующие файлы (в консоли нет ошибок 404).
export const ART = {
  "major-00-fool": "tarot/major-00-fool.jpg",
  "major-01-magician": "tarot/major-01-magician.jpg",
  "major-02-high-priestess": "tarot/major-02-high-priestess.jpg",
  "major-03-empress": "tarot/major-03-empress.jpg",
  "major-04-emperor": "tarot/major-04-emperor.jpg",
  "major-05-hierophant": "tarot/major-05-hierophant.jpg",
  "major-06-lovers": "tarot/major-06-lovers.jpg",
  "major-07-chariot": "tarot/major-07-chariot.jpg",
  "major-08-strength": "tarot/major-08-strength.jpg",
  "major-09-hermit": "tarot/major-09-hermit.jpg",
  "major-10-wheel": "tarot/major-10-wheel.jpg",
  "major-11-justice": "tarot/major-11-justice.jpg",
  "major-12-hanged-man": "tarot/major-12-hanged-man.jpg",
  "major-13-death": "tarot/major-13-death.jpg",
  "major-14-temperance": "tarot/major-14-temperance.jpg",
  "major-15-devil": "tarot/major-15-devil.jpg",
  "major-16-tower": "tarot/major-16-tower.jpg",
  "major-17-star": "tarot/major-17-star.jpg",
  "major-18-moon": "tarot/major-18-moon.jpg",
  "major-19-sun": "tarot/major-19-sun.jpg",
  "major-20-judgement": "tarot/major-20-judgement.jpg",
  "major-21-world": "tarot/major-21-world.jpg",
  "back": "tarot/back.jpg",
  "story-bg": "story-bg.jpg",
};
