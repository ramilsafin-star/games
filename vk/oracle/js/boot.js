// Запуск: если модули не загрузились, вместо вечной крутилки — понятная надпись.
import("./main.js?v=3f732425").catch((error) => {
  const box = document.getElementById("loading");
  if (box) {
    box.classList.add("failed");
    document.getElementById("load-text").textContent = "Оракул не открылся. Обнови страницу или попробуй другой браузер.";
  }
  console.error(error);
});
