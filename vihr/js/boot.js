// Загрузка: если 3D не запустилось, вместо бесконечной крутилки — понятная надпись
import("./main.js?v=ae43a6e1").catch((error) => {
  const box = document.getElementById("load");
  box.classList.add("failed");
  document.getElementById("load-text").textContent = "Вихрь не запустился. Попробуй браузер с поддержкой WebGL.";
  console.error(error);
});
