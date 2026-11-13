// Загрузка: если 3D не запустилось, вместо бесконечной полоски — понятная надпись
import("./main.js?v=cb8e2b87").catch((error) => {
  const box = document.getElementById("boot");
  box.classList.add("failed");
  document.getElementById("boot-text").textContent = "Игра не запустилась. Нужен браузер с поддержкой WebGL 2 — например, свежий Chrome или Safari.";
  console.error(error);
});
