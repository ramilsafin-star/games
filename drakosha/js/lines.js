// Все фразы Дракоши. Их записывает скрипт озвучки games-portal/tools/voices.mjs голосом Gemini:
// lines → voices/<имя>.mp3, слова → voices/w-<asset>.mp3 («Это ёжик!»), загадки → voices/h-<asset>.mp3.
import { CARDS } from "./words.js?v=c14a4128";

export const lines = {
  hello: "Привет! Я Дракоша, почтальон волшебной почты! На письмах стёрлись слова. Поможешь их угадать?",
  pick: "Выбери конверт!",
  how: "Нажимай на буквы. Если буква есть в слове, она появится!",
  stamps: "Ошибёшься — улетит марка. У нас их четыре.",
  yes1: "Есть такая буква!",
  yes2: "Правильно!",
  yes3: "Ура!",
  no1: "Такой буквы нет.",
  no2: "Ой, нет такой.",
  repeat: "Эту букву мы уже пробовали!",
  last: "Осталась последняя марка!",
  helpme: "Трудно? Нажми на лампочку — я открою букву!",
  won: "Письмо готово! Отправляю!",
  lost: "Ничего страшного! Вот какое было слово.",
  pack: "Все письма доставлены! Спасибо, помощник!",
  album: "Новые открытки в альбоме!",
};
// «Это ёжик!» — слово с маленькой буквы, как говорят
const spoken = (w) => w.toLowerCase().replace(/ё/g, "ё");
export const words = Object.fromEntries(CARDS.map((c) => [c.asset, `Это ${spoken(c.word)}!`]));
export const hints = Object.fromEntries(CARDS.map((c) => [c.asset, c.hint]));
