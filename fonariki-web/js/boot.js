// Загрузка: если 3D не запустилось, вместо бесконечной крутилки — понятная надпись
import("./main.js?v=16ea7301").catch((error) => {
  const box = document.getElementById("load");
  box.classList.add("failed");
  document.getElementById("load-text").textContent = "Игра не запустилась. Нужен браузер с поддержкой WebGL 2.";
  console.error(error);
});
