import("./main.js?v=ef8c7672").catch((error) => {
  document.getElementById("load").textContent = "Гонка не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
