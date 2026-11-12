// Загрузка: сперва ждём облачное сохранение VK (если игра внутри VK), потом сама игра.
// Если 3D не запустилось, крутилка останавливается и появляется понятная надпись.
const load = document.getElementById("load");
import("./main.js?v=8ae2940b").catch((error) => {
  load.classList.add("failed");
  load.lastElementChild.textContent = "Игра не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
