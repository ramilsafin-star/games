import("./main.js?v=fe1036fe").catch((error) => {
  document.getElementById("load").textContent = "Маяк не зажёгся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
