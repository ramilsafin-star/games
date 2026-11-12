// Запуск: если модули не загрузились, вместо вечной крутилки — понятная надпись.
import("./main.js?v=8e3275de").catch((error) => {
  const box = document.getElementById("loading");
  if (box) {
    box.classList.add("failed");
    document.getElementById("load-text").textContent = "Игра не открылась. Обнови страницу или попробуй другой браузер.";
  }
  console.error(error);
});
