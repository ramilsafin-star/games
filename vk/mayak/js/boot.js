import("./main.js?v=cd4dd037").catch((error) => {
  document.getElementById("load").textContent = "Маяк не зажёгся. Попробуй браузер с поддержкой WebGL 2.";
  console.error(error);
});
