// Снимок хранит рисунок пациента и подлинный крупный план его зубов.
export function postcard(portrait, detail, patient, after, marks) {
  const c = document.createElement("canvas");
  c.width = 500;
  c.height = 460;
  const ctx = c.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 500, 460);
  bg.addColorStop(0, "#fff5d9");
  bg.addColorStop(1, patient.color);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#ffffff70";
  for (let x = 14; x < 500; x += 25)
    for (let y = 12; y < 460; y += 25) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  // Кресло с мягкой спинкой видно из-за лап и ушек.
  ctx.fillStyle = "#9acfc0";
  ctx.beginPath();
  ctx.roundRect(36, 158, 299, 250, 68);
  ctx.fill();
  ctx.fillStyle = "#6fae9e";
  ctx.beginPath();
  ctx.roundRect(41, 345, 292, 67, 33);
  ctx.fill();
  ctx.drawImage(portrait, -12, 20, 407, 407);
  if (marks) {
    // Метки повторяют сторону челюсти и положение украшения на настоящей модели.
    const [mx, my] = patient.smile;
    ctx.save();
    ctx.translate(-12 + (mx * 407) / 512, 20 + (my * 407) / 512);
    ctx.rotate(-0.1);
    if (marks.braces) {
      ctx.strokeStyle = marks.braces === "gold" ? "#c99a3c" : "#889ba5";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-12, -1);
      ctx.quadraticCurveTo(0, 3, 12, -1);
      ctx.stroke();
      const colors = ["#e58e9f", "#81b5dc", "#e2bb6f", "#81bdab"];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = marks.braces === "gold" ? "#e5bc56" : colors[i % colors.length];
        ctx.fillRect(-11 + i * 4, Math.abs(i - 2.5) < 2 ? -0.4 : -1.5, 2, 1.8);
      }
    }
    const colors = {
      diamond: "#78bee0",
      star: "#efa929",
      heart: "#e75275",
      ruby: "#d83b52",
      emerald: "#2e9c77",
      sapphire: "#4976cb",
      gold: "#cfa32e",
      glitter: "#e5ae56",
    };
    for (const gem of marks.gems) {
      ctx.fillStyle = colors[gem.id];
      ctx.beginPath();
      ctx.arc((gem.x - 0.5) * 23, (gem.lower ? 1.7 : -0.8) - Math.abs(gem.x - 0.5) * 3, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (after) {
    ctx.fillStyle = "#dd9437";
    ctx.font = "bold 31px system-ui";
    ctx.fillText("✦", 362, 91);
    ctx.fillText("✧", 409, 136);
  }
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(377, 330, 112, 82, -0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#fffaf0";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(377, 330, 105, 75, -0.1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#cdece1";
  ctx.fillRect(260, 240, 240, 182);
  ctx.drawImage(detail, 268, 262, 218, 136);
  ctx.restore();
  ctx.fillStyle = "#264e4a";
  ctx.font = "bold 17px system-ui";
  ctx.fillText(after ? "✦  После приёма" : "○  До приёма", 20, 442);
  return c.toDataURL("image/jpeg", 0.82);
}
