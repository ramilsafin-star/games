// Загрузка: если 3D не запустилось, вместо бесконечной крутилки — понятная надпись
import("./main.js?v=aa0c23d8").catch((error) => {
  const box = document.getElementById("load");
  box.classList.add("failed");
  document.getElementById("load-text").textContent = "Вихрь не запустился. Попробуй браузер с поддержкой WebGL.";
  console.error(error);
});
