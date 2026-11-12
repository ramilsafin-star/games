// Запуск: если модули не загрузились, вместо вечной крутилки — понятная надпись.
import("./main.js?v=b97d5aa8").catch((error) => {
  const box = document.getElementById("loading");
  if (box) {
    box.classList.add("failed");
    document.getElementById("load-text").textContent = "Игра не открылась. Обнови страницу или попробуй другой браузер.";
  }
  console.error(error);
});
