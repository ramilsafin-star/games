import("./main.js?v=b8d55922").catch((error) => {
  document.getElementById("load").textContent = "Гонка не открылась. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
