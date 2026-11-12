import("./main.js?v=81afe732").catch((error) => {
  document.getElementById("load").textContent = "Гонка не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
