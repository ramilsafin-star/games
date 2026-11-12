import("./main.js?v=f774c88c").catch((error) => {
  document.getElementById("load").textContent = "Гонка не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
