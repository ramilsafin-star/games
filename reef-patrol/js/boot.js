import("./main.js?v=f98bc4f8").catch((error) => {
  document.getElementById("load").textContent =
    "Подводная сцена не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
