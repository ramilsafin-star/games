// Рисунки персонажей и предметов на canvas 2D. Всё векторное, без картинок.
// Координаты — мировые (вызывающий уже применил масштаб).
export const TAU = Math.PI * 2;

// Тоша, Мята, Черничка
export const FOLK = [
  { name: "Тоша", col: "#ff9a3c", hi: "#ffd08a", dark: "#b8561a", belly: "#ffe3b8" },
  { name: "Мята", col: "#35c99a", hi: "#9ff0cf", dark: "#167a5b", belly: "#d4fbe9" },
  { name: "Черничка", col: "#7b84ff", hi: "#c4c8ff", dark: "#3d3fae", belly: "#e3e4ff" },
];

export function shade(hex, k) {
  // k > 0 — светлее, k < 0 — темнее
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  if (k > 0) (r += (255 - r) * k), (g += (255 - g) * k), (b += (255 - b) * k);
  else (r *= 1 + k), (g *= 1 + k), (b *= 1 + k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function ellipse(c, x, y, rx, ry, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

// Пушистое тело: окружность с мягкими «зубчиками» шерсти
function furPath(c, x, y, r, n = 20, amp = 0.09, ph = 0) {
  c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a0 = (i / n) * TAU + ph,
      a1 = ((i + 0.5) / n) * TAU + ph;
    const px = x + Math.cos(a0) * r,
      py = y + Math.sin(a0) * r;
    if (i === 0) c.moveTo(px, py);
    else {
      const ax = x + Math.cos(a1 - TAU / n) * r * (1 + amp),
        ay = y + Math.sin(a1 - TAU / n) * r * (1 + amp);
      c.quadraticCurveTo(ax, ay, px, py);
    }
  }
  c.closePath();
}

export function groundShadow(c, x, y, r, k = 1) {
  c.fillStyle = `rgba(30,20,40,${0.2 * k})`;
  ellipse(c, x, y, r * 0.95, r * 0.22);
  c.fill();
}

// o: { t, mood: idle|fear|hurt|joy|eat|sleep|walk, look: [dx, dy], blink: 0..1, squash, angle (катится), step }
export function critter(c, x, y, r, kind, o = {}) {
  const f = FOLK[kind] || FOLK[0];
  const t = o.t || 0;
  const mood = o.mood || "idle";
  c.save();
  c.translate(x, y);
  if (o.angle != null) {
    // свернулся клубком: шар с полосками шерсти и зажмуренными глазами
    c.rotate(o.angle);
    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, f.hi);
    g.addColorStop(0.55, f.col);
    g.addColorStop(1, f.dark);
    furPath(c, 0, 0, r, 18, 0.1);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = r * 0.08;
    c.strokeStyle = f.dark;
    c.stroke();
    c.strokeStyle = shade(f.col, -0.25);
    c.lineWidth = r * 0.07;
    c.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(0, 0, r * (0.35 + i * 0.2), -0.6 + i, 0.5 + i);
      c.stroke();
    }
    c.strokeStyle = "#3a2030";
    c.lineWidth = r * 0.07;
    c.beginPath();
    c.arc(-r * 0.25, -r * 0.05, r * 0.12, Math.PI * 1.1, Math.PI * 1.9);
    c.moveTo(r * 0.38, -r * 0.05);
    c.arc(r * 0.25, -r * 0.05, r * 0.12, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.restore();
    return;
  }
  const breath = Math.sin(t * 2.6 + kind) * 0.025;
  const sq = (o.squash || 0) + breath;
  c.scale(1 + sq, 1 - sq);
  // лапки
  const step = o.step != null ? Math.sin(o.step) * r * 0.12 : 0;
  c.fillStyle = f.dark;
  ellipse(c, -r * 0.38, r * 0.86 - Math.max(0, step), r * 0.26, r * 0.17);
  c.fill();
  ellipse(c, r * 0.38, r * 0.86 - Math.max(0, -step), r * 0.26, r * 0.17);
  c.fill();
  // ушки
  const earWag = mood === "fear" ? -0.35 : Math.sin(t * 1.7 + kind * 2) * 0.06;
  for (const s of [-1, 1]) {
    c.save();
    c.translate(s * r * 0.5, -r * 0.72);
    c.rotate(s * (0.35 + earWag));
    c.fillStyle = f.col;
    c.strokeStyle = f.dark;
    c.lineWidth = r * 0.07;
    c.beginPath();
    c.moveTo(-r * 0.22, r * 0.12);
    c.quadraticCurveTo(-r * 0.1, -r * 0.5, 0, -r * 0.5);
    c.quadraticCurveTo(r * 0.1, -r * 0.5, r * 0.22, r * 0.12);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#ffb2c4";
    ellipse(c, 0, -r * 0.08, r * 0.08, r * 0.2);
    c.fill();
    c.restore();
  }
  // тело
  const g = c.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.15);
  g.addColorStop(0, f.hi);
  g.addColorStop(0.5, f.col);
  g.addColorStop(1, shade(f.col, -0.25));
  furPath(c, 0, 0, r, 28, 0.075, t * 0.2);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = r * 0.075;
  c.strokeStyle = f.dark;
  c.stroke();
  // чёлка
  c.fillStyle = f.hi;
  c.beginPath();
  c.moveTo(-r * 0.2, -r * 0.92);
  c.quadraticCurveTo(-r * 0.05, -r * 1.25, r * 0.02, -r * 0.88);
  c.quadraticCurveTo(r * 0.12, -r * 1.18, r * 0.24, -r * 0.88);
  c.closePath();
  c.fill();
  // животик
  c.fillStyle = f.belly;
  c.globalAlpha = 0.85;
  ellipse(c, 0, r * 0.38, r * 0.5, r * 0.4);
  c.fill();
  c.globalAlpha = 1;
  // щёчки
  c.fillStyle = "rgba(255,110,140,0.45)";
  ellipse(c, -r * 0.58, r * 0.16, r * 0.15, r * 0.09);
  c.fill();
  ellipse(c, r * 0.58, r * 0.16, r * 0.15, r * 0.09);
  c.fill();
  // глаза
  const look = o.look || [0, 0];
  const ex = r * 0.31,
    ey = -r * 0.14;
  c.lineCap = "round";
  if (mood === "hurt") {
    c.strokeStyle = "#2a1626";
    c.lineWidth = r * 0.09;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * ex - r * 0.13 * s, ey - r * 0.1);
      c.lineTo(s * ex + r * 0.08 * s, ey);
      c.lineTo(s * ex - r * 0.13 * s, ey + r * 0.1);
      c.stroke();
    }
  } else if (mood === "joy" || mood === "eat" || mood === "sleep") {
    c.strokeStyle = "#2a1626";
    c.lineWidth = r * 0.09;
    for (const s of [-1, 1]) {
      c.beginPath();
      if (mood === "sleep") c.arc(s * ex, ey - r * 0.02, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
      else c.arc(s * ex, ey + r * 0.06, r * 0.14, 1.1 * Math.PI, 1.9 * Math.PI);
      c.stroke();
    }
  } else {
    const big = mood === "fear" ? 1.18 : 1;
    const blink = o.blink || 0;
    for (const s of [-1, 1]) {
      c.fillStyle = "#fff";
      ellipse(c, s * ex, ey, r * 0.21 * big, r * 0.25 * big * (1 - blink * 0.9));
      c.fill();
      c.strokeStyle = "rgba(60,30,40,.35)";
      c.lineWidth = r * 0.03;
      c.stroke();
      if (blink < 0.6) {
        const pr = mood === "fear" ? r * 0.08 : r * 0.12;
        c.fillStyle = "#2a1626";
        ellipse(c, s * ex + look[0] * r * 0.07, ey + look[1] * r * 0.07 + r * 0.02, pr, pr * 1.1 * (1 - blink));
        c.fill();
        c.fillStyle = "#fff";
        ellipse(c, s * ex + look[0] * r * 0.07 - pr * 0.35, ey + look[1] * r * 0.07 - pr * 0.4, pr * 0.38, pr * 0.38);
        c.fill();
      }
    }
    if (mood === "fear") {
      c.strokeStyle = f.dark;
      c.lineWidth = r * 0.06;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * (ex - r * 0.16), ey - r * 0.36);
        c.lineTo(s * (ex + r * 0.12), ey - r * 0.44);
        c.stroke();
      }
    }
  }
  // ротик
  c.strokeStyle = "#5a2030";
  c.fillStyle = "#7a2838";
  c.lineWidth = r * 0.06;
  const my = r * 0.18;
  if (mood === "fear" || mood === "hurt") {
    ellipse(c, 0, my + r * 0.04, r * 0.09, r * 0.12);
    c.fill();
  } else if (mood === "joy") {
    c.beginPath();
    c.moveTo(-r * 0.2, my);
    c.quadraticCurveTo(0, my + r * 0.32, r * 0.2, my);
    c.closePath();
    c.fill();
    c.fillStyle = "#ff8aa0";
    ellipse(c, 0, my + r * 0.13, r * 0.08, r * 0.05);
    c.fill();
  } else if (mood === "eat") {
    const k = Math.abs(Math.sin(t * 14));
    ellipse(c, 0, my + r * 0.04, r * 0.14, r * (0.04 + 0.1 * k));
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(-r * 0.12, my);
    c.quadraticCurveTo(-r * 0.06, my + r * 0.08, 0, my);
    c.quadraticCurveTo(r * 0.06, my + r * 0.08, r * 0.12, my);
    c.stroke();
  }
  if (o.hat) hat(c, o.hat, r, t);
  c.restore();
}

// Злой жук: тёмный блестящий панцирь, сердитые брови, жужжащие крылья
export function bug(c, x, y, r, t, phase, dir = 1) {
  c.save();
  c.translate(x, y);
  c.scale(dir, 1);
  const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 46 + phase));
  c.fillStyle = "rgba(220,240,255,0.55)";
  c.strokeStyle = "rgba(120,140,190,0.6)";
  c.lineWidth = 1;
  for (const s of [-0.5, 0.25]) {
    ellipse(c, s * r, -r * 0.95, r * 0.55, r * 0.95 * flap, s * 0.8);
    c.fill();
    c.stroke();
  }
  // жало
  c.fillStyle = "#1c0a2a";
  c.beginPath();
  c.moveTo(-r * 1.05, -r * 0.1);
  c.lineTo(-r * 1.55, r * 0.15);
  c.lineTo(-r * 1.0, r * 0.3);
  c.fill();
  const g = c.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.3);
  g.addColorStop(0, "#b46cf0");
  g.addColorStop(0.55, "#6a2aa8");
  g.addColorStop(1, "#33115a");
  ellipse(c, 0, 0, r * 1.18, r);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = r * 0.14;
  c.strokeStyle = "#1c0a2a";
  c.stroke();
  c.strokeStyle = "rgba(255,255,255,0.35)";
  c.lineWidth = r * 0.12;
  c.beginPath();
  c.arc(-r * 0.2, -r * 0.1, r * 0.62, 3.6, 4.6);
  c.stroke();
  // глаза
  for (const s of [0.22, 0.72]) {
    c.fillStyle = "#fff";
    ellipse(c, s * r, -r * 0.18, r * 0.24, r * 0.27);
    c.fill();
    c.fillStyle = "#e0203a";
    ellipse(c, s * r + r * 0.07, -r * 0.14, r * 0.11, r * 0.13);
    c.fill();
  }
  c.strokeStyle = "#1c0a2a";
  c.lineWidth = r * 0.16;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(r * 0.0, -r * 0.55);
  c.lineTo(r * 0.42, -r * 0.36);
  c.moveTo(r * 0.52, -r * 0.36);
  c.lineTo(r * 0.95, -r * 0.55);
  c.stroke();
  // усики
  c.lineWidth = r * 0.08;
  c.beginPath();
  c.moveTo(r * 0.7, -r * 0.8);
  c.quadraticCurveTo(r * 1.0, -r * 1.4, r * 1.35, -r * 1.25);
  c.stroke();
  c.restore();
}

export function berry(c, x, y, r, angle = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, "#ff8a9a");
  g.addColorStop(0.5, "#e8304c");
  g.addColorStop(1, "#9a1030");
  c.fillStyle = g;
  ellipse(c, 0, 0, r, r);
  c.fill();
  c.lineWidth = r * 0.1;
  c.strokeStyle = "#6a0a22";
  c.stroke();
  c.fillStyle = "#ffe58a";
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4,
      d = r * (0.3 + (i % 3) * 0.18);
    ellipse(c, Math.cos(a) * d, Math.sin(a) * d + r * 0.1, r * 0.06, r * 0.09, a);
    c.fill();
  }
  c.fillStyle = "#fff";
  c.globalAlpha = 0.7;
  ellipse(c, -r * 0.4, -r * 0.42, r * 0.2, r * 0.12, -0.6);
  c.fill();
  c.globalAlpha = 1;
  c.fillStyle = "#3fae3a";
  c.strokeStyle = "#1f6a22";
  c.lineWidth = r * 0.07;
  c.beginPath();
  c.moveTo(0, -r * 0.85);
  c.quadraticCurveTo(r * 0.6, -r * 1.5, r * 0.95, -r * 1.05);
  c.quadraticCurveTo(r * 0.5, -r * 0.7, 0, -r * 0.85);
  c.fill();
  c.stroke();
  c.restore();
}

export function starKey(c, x, y, r, angle = 0, t = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  g.addColorStop(0, "#fff6b0");
  g.addColorStop(0.5, "#ffc531");
  g.addColorStop(1, "#c07a0a");
  c.fillStyle = g;
  ellipse(c, 0, 0, r, r);
  c.fill();
  c.lineWidth = r * 0.12;
  c.strokeStyle = "#8a5004";
  c.stroke();
  c.fillStyle = "#ffe36a";
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2,
      k = i % 2 ? r * 0.32 : r * 0.72;
    c.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = "#b8700a";
  c.lineWidth = r * 0.06;
  c.stroke();
  c.fillStyle = "#6a3a04";
  ellipse(c, 0, -r * 0.08, r * 0.13, r * 0.13);
  c.fill();
  c.beginPath();
  c.moveTo(-r * 0.08, -r * 0.02);
  c.lineTo(r * 0.08, -r * 0.02);
  c.lineTo(r * 0.04, r * 0.26);
  c.lineTo(-r * 0.04, r * 0.26);
  c.fill();
  c.restore();
  // искорка
  const s = (Math.sin(t * 3) + 1) / 2;
  sparkle(c, x + r * 0.6, y - r * 0.7, r * 0.35 * s, "#fffbe0");
}

export function sparkle(c, x, y, r, col = "#fff") {
  if (r < 0.5) return;
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
}

export function polyFill(c, verts) {
  c.beginPath();
  verts.forEach((v, i) => (i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)));
  c.closePath();
}

export function rock(c, b, snow) {
  const v = b.vertices;
  const g = c.createLinearGradient(b.position.x - 20, b.position.y - 24, b.position.x + 16, b.position.y + 24);
  if (snow) {
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#b9cff2");
  } else {
    g.addColorStop(0, "#b7aca3");
    g.addColorStop(1, "#6a5f58");
  }
  polyFill(c, v);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 3;
  c.lineJoin = "round";
  c.strokeStyle = snow ? "#7b93c4" : "#3a312c";
  c.stroke();
  c.strokeStyle = snow ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.35)";
  c.lineWidth = 2.5;
  c.beginPath();
  const p = b.position;
  for (let i = 0; i < v.length; i++) {
    const a = v[i],
      n = v[(i + 1) % v.length];
    if ((a.y + n.y) / 2 < p.y - 4) {
      c.moveTo(a.x + (p.x - a.x) * 0.18, a.y + (p.y - a.y) * 0.18);
      c.lineTo(n.x + (p.x - n.x) * 0.18, n.y + (p.y - n.y) * 0.18);
    }
  }
  c.stroke();
}

export function ball(c, x, y, r, kind, t) {
  if (kind === "fireball") {
    const g = c.createRadialGradient(x, y, 1, x, y, r * 1.9);
    g.addColorStop(0, "rgba(255,240,170,1)");
    g.addColorStop(0.35, "rgba(255,150,40,0.95)");
    g.addColorStop(1, "rgba(255,60,20,0)");
    c.fillStyle = g;
    ellipse(c, x, y, r * 1.9, r * 1.9);
    c.fill();
    c.fillStyle = "#ffd34a";
    ellipse(c, x, y, r * 0.8, r * 0.8);
    c.fill();
    return;
  }
  const snow = kind === "snowball";
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, snow ? "#ffffff" : "#8a8aa0");
  g.addColorStop(0.6, snow ? "#e6efff" : "#3a3a4c");
  g.addColorStop(1, snow ? "#9fb6e0" : "#14141e");
  c.fillStyle = g;
  ellipse(c, x, y, r, r);
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = snow ? "#7b93c4" : "#0a0a12";
  c.stroke();
}

export function spikeBall(c, x, y, r, a) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.fillStyle = "#cfd3dc";
  c.strokeStyle = "#3a3d48";
  c.lineWidth = 2.5;
  for (let i = 0; i < 10; i++) {
    const q = (i / 10) * TAU;
    c.beginPath();
    c.moveTo(Math.cos(q - 0.22) * r * 0.85, Math.sin(q - 0.22) * r * 0.85);
    c.lineTo(Math.cos(q) * r * 1.38, Math.sin(q) * r * 1.38);
    c.lineTo(Math.cos(q + 0.22) * r * 0.85, Math.sin(q + 0.22) * r * 0.85);
    c.fill();
    c.stroke();
  }
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
  g.addColorStop(0, "#9aa0b4");
  g.addColorStop(1, "#3a3d50");
  c.fillStyle = g;
  ellipse(c, 0, 0, r, r);
  c.fill();
  c.stroke();
  c.restore();
}

export function drop(c, x, y, r, lava, vx = 0, vy = 1) {
  const a = Math.atan2(vy, vx) - Math.PI / 2;
  c.save();
  c.translate(x, y);
  c.rotate(a);
  if (lava) {
    c.fillStyle = "rgba(255,120,30,0.35)";
    ellipse(c, 0, 0, r * 2, r * 2);
    c.fill();
  }
  c.fillStyle = lava ? "#ff8a2a" : "#4fb3ff";
  c.beginPath();
  c.moveTo(0, -r * 2);
  c.quadraticCurveTo(r * 1.1, -r * 0.2, r, r * 0.2);
  c.arc(0, r * 0.2, r, 0, Math.PI);
  c.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r * 2);
  c.fill();
  c.fillStyle = lava ? "#ffe08a" : "#d8f0ff";
  ellipse(c, -r * 0.3, 0, r * 0.3, r * 0.45);
  c.fill();
  c.restore();
}

export function icicle(c, verts) {
  const g = c.createLinearGradient(verts[0].x, verts[0].y, verts[2].x, verts[2].y);
  g.addColorStop(0, "#f4fdff");
  g.addColorStop(1, "#8fd8f2");
  polyFill(c, verts);
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = "#5a9ec4";
  c.lineWidth = 2;
  c.stroke();
}

// Гнездо злых жуков: шишковатый улей
export function nest(c, x, y, t, rage = 0) {
  c.save();
  c.translate(x + Math.sin(t * 30) * rage * 2, y);
  c.strokeStyle = "#5a3a2a";
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(0, -46);
  c.lineTo(0, -400);
  c.stroke();
  const rows = [
    [-30, 26],
    [-8, 40],
    [16, 44],
    [38, 34],
  ];
  for (const [dy, w] of rows) {
    const g = c.createLinearGradient(0, dy - 14, 0, dy + 14);
    g.addColorStop(0, "#8a5a8a");
    g.addColorStop(1, "#4a2a52");
    c.fillStyle = g;
    ellipse(c, 0, dy, w, 15);
    c.fill();
    c.strokeStyle = "#2a1430";
    c.lineWidth = 3;
    c.stroke();
  }
  c.fillStyle = "#1a0a1e";
  ellipse(c, 0, 18, 12, 10);
  c.fill();
  c.restore();
}

export function cannon(c, s, t) {
  const a = (s.angle * Math.PI) / 180;
  c.save();
  c.translate(s.x, s.y);
  // лафет
  c.fillStyle = s.snow ? "#6a8ab8" : s.fire ? "#5a2a24" : "#7a4a2a";
  c.strokeStyle = "#241410";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-30, 30);
  c.lineTo(-18, -4);
  c.lineTo(18, -4);
  c.lineTo(30, 30);
  c.closePath();
  c.fill();
  c.stroke();
  c.save();
  c.rotate(a);
  const k = 1 - s.flash * 0.25;
  const g = c.createLinearGradient(0, -18, 0, 18);
  g.addColorStop(0, s.fire ? "#8a3a2a" : "#6a6a7e");
  g.addColorStop(1, s.fire ? "#3a1410" : "#24242e");
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(-22 * k, -17, 66 * k, 34, 10);
  c.fill();
  c.stroke();
  c.fillStyle = "#14141c";
  ellipse(c, 44 * k, 0, 6, 13);
  c.fill();
  c.restore();
  c.fillStyle = "#3a2a20";
  ellipse(c, 0, 4, 14, 14);
  c.fill();
  c.stroke();
  c.restore();
}

export function pipe(c, s, lava) {
  const top = -60;
  const g = c.createLinearGradient(s.x - 22, 0, s.x + 22, 0);
  g.addColorStop(0, lava ? "#4a2a2a" : "#3a8a5a");
  g.addColorStop(0.4, lava ? "#8a4a3a" : "#7ad08a");
  g.addColorStop(1, lava ? "#2a1414" : "#226040");
  c.fillStyle = g;
  c.strokeStyle = "#1a2a20";
  c.lineWidth = 3;
  c.beginPath();
  c.rect(s.x - 18, top, 36, s.y - top - 6);
  c.fill();
  c.stroke();
  c.beginPath();
  c.roundRect(s.x - 24, s.y - 26, 48, 22, 6);
  c.fill();
  c.stroke();
  c.fillStyle = lava ? "#ff7a2a" : "#1a3a5a";
  ellipse(c, s.x, s.y - 4, 13, 5);
  c.fill();
}

export function peg(c, x, y) {
  c.fillStyle = "rgba(0,0,0,.18)";
  ellipse(c, x + 3, y + 4, 10, 10);
  c.fill();
  const g = c.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
  g.addColorStop(0, "#e2b07a");
  g.addColorStop(1, "#8a5428");
  c.fillStyle = g;
  ellipse(c, x, y, 9, 9);
  c.fill();
  c.strokeStyle = "#4a2810";
  c.lineWidth = 2.5;
  c.stroke();
}

export function nail(c, x, y, used, t) {
  if (!used) {
    c.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 4)})`;
    c.lineWidth = 2;
    c.setLineDash([4, 5]);
    ellipse(c, x, y, 16, 16);
    c.stroke();
    c.setLineDash([]);
  }
  const g = c.createRadialGradient(x - 2, y - 2, 1, x, y, 8);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#7a8496");
  c.fillStyle = g;
  ellipse(c, x, y, 7, 7);
  c.fill();
  c.strokeStyle = "#2a3040";
  c.lineWidth = 2;
  c.stroke();
}

export function house(c, x, foot, kind, open = 0, scale = 1) {
  const f = FOLK[kind] || FOLK[0];
  c.save();
  c.translate(x, foot);
  c.scale(scale, scale);
  c.fillStyle = "rgba(30,20,40,.18)";
  ellipse(c, 0, 0, 60, 10);
  c.fill();
  // стены
  const g = c.createLinearGradient(0, -80, 0, 0);
  g.addColorStop(0, "#fff4dc");
  g.addColorStop(1, "#e8c99a");
  c.fillStyle = g;
  c.strokeStyle = "#5a3a22";
  c.lineWidth = 3.5;
  c.beginPath();
  c.roundRect(-44, -70, 88, 70, 10);
  c.fill();
  c.stroke();
  // крыша
  c.fillStyle = f.col;
  c.beginPath();
  c.moveTo(-58, -62);
  c.quadraticCurveTo(0, -132, 58, -62);
  c.quadraticCurveTo(0, -78, -58, -62);
  c.fill();
  c.strokeStyle = f.dark;
  c.stroke();
  c.fillStyle = f.hi;
  ellipse(c, -14, -96, 16, 6, -0.4);
  c.fill();
  // дверь
  c.fillStyle = open ? "#2a1a14" : "#8a5428";
  c.strokeStyle = "#4a2810";
  c.beginPath();
  c.moveTo(-17, 0);
  c.lineTo(-17, -30);
  c.arc(0, -30, 17, Math.PI, 0);
  c.lineTo(17, 0);
  c.fill();
  c.stroke();
  // окошко
  c.fillStyle = "#ffe9a0";
  c.beginPath();
  c.arc(28, -42, 8, 0, TAU);
  c.fill();
  c.stroke();
  c.restore();
}

export function cage(c, x, y, open, t) {
  // клетка: верх на y - 20, низ на y + 90
  const lift = open * 120;
  c.save();
  c.strokeStyle = "#5a3a1a";
  c.lineWidth = 6;
  c.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const bx = x - 42 + i * 16.8;
    c.beginPath();
    c.moveTo(bx, y - 16 - lift);
    c.lineTo(bx, y + 88 - lift);
    c.stroke();
  }
  c.fillStyle = "#8a5428";
  c.strokeStyle = "#3a2010";
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(x - 52, y - 24 - lift, 104, 14, 5);
  c.fill();
  c.stroke();
  c.beginPath();
  c.roundRect(x - 52, y + 84, 104, 8, 4);
  c.fill();
  c.stroke();
  // замок на крыше
  if (open < 1) {
    c.save();
    c.translate(x, y - 36 - lift);
    c.globalAlpha = 1 - open;
    c.strokeStyle = "#7a5a10";
    c.lineWidth = 5;
    c.beginPath();
    c.arc(0, -6, 9, Math.PI, 0);
    c.stroke();
    c.fillStyle = "#ffcf3a";
    c.strokeStyle = "#7a5a10";
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(-14, -6, 28, 22, 5);
    c.fill();
    c.stroke();
    c.fillStyle = "#5a3a04";
    ellipse(c, 0, 3, 3.5, 3.5);
    c.fill();
    c.restore();
  }
  c.restore();
}

export function spring(c, verts, a, squash) {
  // площадка-батут: верх площадки по верхнему ребру
  const [p0, p1, p2, p3] = verts;
  c.save();
  const cx = (p0[0] + p2[0]) / 2,
    cy = (p0[1] + p2[1]) / 2;
  const w = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
    h = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  c.translate(cx, cy);
  c.rotate((a * Math.PI) / 180);
  c.strokeStyle = "#5a5a6a";
  c.lineWidth = 4;
  c.beginPath();
  const top = -h / 2 + squash * 6;
  for (let i = 0; i <= 6; i++) c.lineTo((i % 2 ? 1 : -1) * w * 0.28, top + 6 + ((h / 2 + 4 - top - 6) * i) / 6);
  c.stroke();
  const g = c.createLinearGradient(0, top - 8, 0, top + 6);
  g.addColorStop(0, "#ff8ac0");
  g.addColorStop(1, "#d8307a");
  c.fillStyle = g;
  c.strokeStyle = "#7a1040";
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(-w / 2, top - 8, w, 14, 7);
  c.fill();
  c.stroke();
  c.restore();
}

export function fan(c, s, t) {
  const h = s.h || 300;
  // потоки воздуха
  c.save();
  c.strokeStyle = "rgba(255,255,255,0.45)";
  c.lineWidth = 3;
  c.lineCap = "round";
  for (let i = 0; i < 7; i++) {
    const fx = s.x - s.w / 2 + ((i + 0.5) / 7) * s.w;
    const k = (t * 1.3 + i * 0.37) % 1;
    const y0 = s.y - 20 - k * (h - 40);
    const tilt = Math.tan(((s.dir || 0) * Math.PI) / 180);
    c.globalAlpha = 0.6 * Math.sin(k * Math.PI);
    c.beginPath();
    c.moveTo(fx + Math.sin(t * 3 + i) * 4 + tilt * k * 60, y0);
    c.lineTo(fx + Math.sin(t * 3 + i + 1) * 4 + tilt * (k * 60 + 34), y0 - 34);
    c.stroke();
  }
  c.restore();
  c.fillStyle = "#5a6a8a";
  c.strokeStyle = "#1e2638";
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(s.x - s.w / 2, s.y - 6, s.w, 26, 6);
  c.fill();
  c.stroke();
  c.fillStyle = "#9fb0d0";
  const n = Math.max(2, Math.round(s.w / 50));
  for (let i = 0; i < n; i++) {
    const fx = s.x - s.w / 2 + ((i + 0.5) / n) * s.w;
    const k = Math.abs(Math.sin(t * 20 + i));
    ellipse(c, fx, s.y + 2, 18 * k + 3, 5);
    c.fill();
  }
}

export function button(c, b) {
  c.fillStyle = "#4a4a5a";
  c.strokeStyle = "#1e1e28";
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(b.x - b.w / 2 - 4, b.y - 6, b.w + 8, 8, 3);
  c.fill();
  c.stroke();
  c.fillStyle = b.down ? "#3fd07a" : "#ff4a5a";
  c.beginPath();
  c.roundRect(b.x - b.w / 2, b.y - (b.down ? 9 : 16), b.w, b.down ? 5 : 12, 6);
  c.fill();
  c.stroke();
}

// Жук-дозорный на карте «Домой» (вид сверху)
export function beetle(c, x, y, r, a, t) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.strokeStyle = "#1a1020";
  c.lineWidth = 3.5;
  c.lineCap = "round";
  for (let i = -1; i <= 1; i++)
    for (const s of [-1, 1]) {
      const w = Math.sin(t * 16 + i * 2 + (s > 0 ? 1.5 : 0)) * 0.35;
      c.beginPath();
      c.moveTo(i * r * 0.45, s * r * 0.5);
      c.lineTo(i * r * 0.45 + Math.cos(w) * r * 0.2, s * r * 1.15);
      c.stroke();
    }
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r * 1.2);
  g.addColorStop(0, "#d46a5a");
  g.addColorStop(1, "#7a1a2a");
  c.fillStyle = g;
  ellipse(c, 0, 0, r * 1.05, r * 0.85);
  c.fill();
  c.stroke();
  c.beginPath();
  c.moveTo(-r * 0.6, 0);
  c.lineTo(r * 0.6, 0);
  c.stroke();
  c.fillStyle = "#1a1020";
  ellipse(c, r * 0.95, 0, r * 0.38, r * 0.45);
  c.fill();
  c.fillStyle = "#fff";
  for (const s of [-1, 1]) {
    ellipse(c, r * 1.12, s * r * 0.2, r * 0.12, r * 0.12);
    c.fill();
  }
  c.fillStyle = "rgba(255,255,255,.4)";
  for (const [px, py] of [
    [-0.3, -0.4],
    [0.1, 0.45],
    [-0.5, 0.3],
  ]) {
    ellipse(c, px * r, py * r, r * 0.12, r * 0.12);
    c.fill();
  }
  c.restore();
}

// Палец-указка для обучения
export function finger(c, x, y) {
  c.save();
  c.translate(x, y);
  c.rotate(-0.35);
  c.fillStyle = "#fff";
  c.strokeStyle = "#2b2560";
  c.lineWidth = 3.5;
  c.lineJoin = "round";
  c.beginPath();
  c.moveTo(-7, 2);
  c.lineTo(-7, 34);
  c.quadraticCurveTo(-18, 30, -20, 40);
  c.quadraticCurveTo(-14, 56, 0, 66);
  c.lineTo(22, 66);
  c.quadraticCurveTo(30, 52, 28, 38);
  c.lineTo(28, 30);
  c.quadraticCurveTo(22, 24, 16, 30);
  c.quadraticCurveTo(10, 24, 4, 30);
  c.lineTo(5, 2);
  c.quadraticCurveTo(-1, -6, -7, 2);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}

// ---------- Лунная роща ----------
// Привиденька: белое полупрозрачное облачко с волнистым низом, румянцем и круглым ротиком «у-у».
// Милое, а не страшное: большие глаза-бусинки, щёчки. dir — куда смотрит.
export function ghost(c, x, y, r, t, phase = 0, dir = 1, fade = 1, glow = true) {
  c.save();
  c.translate(x, y + Math.sin(t * 3 + phase) * r * 0.12);
  c.globalAlpha = 0.92 * fade;
  if (glow) {
    const g = c.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.1);
    g.addColorStop(0, "rgba(200,230,255,.45)");
    g.addColorStop(1, "rgba(200,230,255,0)");
    c.fillStyle = g;
    ellipse(c, 0, 0, r * 2.1, r * 2.1);
    c.fill();
  }
  // тело с волнами снизу
  c.beginPath();
  c.moveTo(-r, r * 0.1);
  c.bezierCurveTo(-r, -r * 1.25, r, -r * 1.25, r, r * 0.1);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x0 = r - (2 * r * i) / n,
      x1 = r - (2 * r * (i + 0.5)) / n,
      x2 = r - (2 * r * (i + 1)) / n;
    const w = Math.sin(t * 6 + phase + i) * r * 0.12;
    c.quadraticCurveTo(x0 - r * 0.1, r * 0.95 + w, x1, r * 0.75 + w);
    c.quadraticCurveTo(x2 + r * 0.1, r * 0.55 - w, x2, r * 0.85 - w);
  }
  c.closePath();
  const body = c.createLinearGradient(0, -r, 0, r);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(1, "#dbe6ff");
  c.fillStyle = body;
  c.fill();
  c.strokeStyle = "rgba(120,140,200,.7)";
  c.lineWidth = r * 0.1;
  c.stroke();
  // глаза и ротик
  const ex = r * 0.34 * dir;
  c.fillStyle = "#2a2a52";
  ellipse(c, -r * 0.3 + ex * 0.4, -r * 0.25, r * 0.13, r * 0.17);
  c.fill();
  ellipse(c, r * 0.3 + ex * 0.4, -r * 0.25, r * 0.13, r * 0.17);
  c.fill();
  c.fillStyle = "#fff";
  ellipse(c, -r * 0.34 + ex * 0.4, -r * 0.31, r * 0.05, r * 0.05);
  c.fill();
  ellipse(c, r * 0.26 + ex * 0.4, -r * 0.31, r * 0.05, r * 0.05);
  c.fill();
  c.fillStyle = "rgba(255,120,160,.55)";
  ellipse(c, -r * 0.55 + ex * 0.3, r * 0.02, r * 0.14, r * 0.08);
  c.fill();
  ellipse(c, r * 0.55 + ex * 0.3, r * 0.02, r * 0.14, r * 0.08);
  c.fill();
  c.fillStyle = "#4a3a6a";
  ellipse(c, ex * 0.4, r * 0.08, r * 0.1, r * 0.13 + Math.sin(t * 5 + phase) * r * 0.03);
  c.fill();
  c.restore();
}

// Огонёк: голубое пламя с глазками (поджигает линию)
export function wisp(c, x, y, r, t, phase = 0, glow = true) {
  c.save();
  c.translate(x, y);
  if (glow) {
    const g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.6);
    g.addColorStop(0, "rgba(120,220,255,.7)");
    g.addColorStop(1, "rgba(80,160,255,0)");
    c.fillStyle = g;
    ellipse(c, 0, 0, r * 2.6, r * 2.6);
    c.fill();
  }
  const fl = (k, col, s) => {
    c.fillStyle = col;
    c.beginPath();
    const tip = -r * (1.7 + Math.sin(t * 13 + phase + k) * 0.25) * s;
    c.moveTo(0, tip);
    c.bezierCurveTo(r * 0.9 * s, -r * 0.6 * s, r * 1.05 * s, r * 0.9 * s, 0, r * 0.95 * s);
    c.bezierCurveTo(-r * 1.05 * s, r * 0.9 * s, -r * 0.9 * s, -r * 0.6 * s, 0, tip);
    c.fill();
  };
  fl(0, "#2f8cff", 1);
  fl(1, "#6fd8ff", 0.78);
  fl(2, "#e6fbff", 0.5);
  c.fillStyle = "#16306a";
  ellipse(c, -r * 0.28, r * 0.15, r * 0.1, r * 0.14);
  c.fill();
  ellipse(c, r * 0.28, r * 0.15, r * 0.1, r * 0.14);
  c.fill();
  c.restore();
}

// Лунный туман: клубящийся сиреневый вихорёк, из которого вылетают привидения
export function mist(c, x, y, t, fire = false, live = 1) {
  c.save();
  c.translate(x, y);
  const base = fire ? [90, 170, 255] : [190, 170, 255];
  for (let i = 0; i < 5; i++) {
    const a = t * (0.8 + i * 0.25) + i * 1.3;
    const rr = 30 + i * 6 + Math.sin(t * 2 + i) * 4;
    c.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${(0.16 + 0.08 * live) * (1 - i * 0.12)})`;
    ellipse(c, Math.cos(a) * 8, Math.sin(a) * 5, rr, rr * 0.62, a * 0.3);
    c.fill();
  }
  c.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * live})`;
  c.lineWidth = 3;
  c.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a = t * 2.2 + (i * TAU) / 3;
    c.beginPath();
    c.arc(0, 0, 18 + i * 6, a, a + 1.4);
    c.stroke();
  }
  c.restore();
}

// Светлячок: тёплый огонёк с крылышками. caught — уже пойман раньше (бледный контур)
export function firefly(c, x, y, t, caught = false, glow = true) {
  c.save();
  c.translate(x + Math.sin(t * 1.7) * 3, y + Math.sin(t * 2.3) * 4);
  if (caught) {
    c.globalAlpha = 0.35;
    c.strokeStyle = "#fff6b0";
    c.lineWidth = 2;
    c.setLineDash([4, 4]);
    ellipse(c, 0, 0, 13, 13);
    c.stroke();
    c.setLineDash([]);
    c.restore();
    return;
  }
  const pulse = 0.75 + 0.25 * Math.sin(t * 5);
  if (glow) {
    const g = c.createRadialGradient(0, 4, 2, 0, 4, 34);
    g.addColorStop(0, `rgba(255,250,150,${0.75 * pulse})`);
    g.addColorStop(1, "rgba(255,240,120,0)");
    c.fillStyle = g;
    ellipse(c, 0, 4, 34, 34);
    c.fill();
  }
  // крылышки
  const fl = Math.sin(t * 30) * 0.4;
  c.fillStyle = "rgba(255,255,255,.75)";
  ellipse(c, -7, -6, 8, 4.5, -0.5 - fl);
  c.fill();
  ellipse(c, 7, -6, 8, 4.5, 0.5 + fl);
  c.fill();
  // тельце и светящееся брюшко
  c.fillStyle = "#4a3a2a";
  ellipse(c, 0, -2, 5, 6);
  c.fill();
  c.fillStyle = "#fff36a";
  ellipse(c, 0, 7, 6.5 * pulse + 1, 7 * pulse + 1);
  c.fill();
  c.fillStyle = "#ffffff";
  ellipse(c, -1.5, 5, 2, 2);
  c.fill();
  c.restore();
}

// Шапки Тоши (рисуются в системе координат героя: центр — (0,0), радиус r)
export function hat(c, kind, r, t = 0) {
  if (!kind || kind === "none") return;
  c.save();
  c.lineJoin = c.lineCap = "round";
  const top = -r * 0.92;
  if (kind === "cap") {
    c.fillStyle = "#e8433a";
    c.strokeStyle = "#7a1a16";
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.ellipse(0, top + r * 0.12, r * 0.62, r * 0.48, 0, Math.PI, 0);
    c.closePath();
    c.fill();
    c.stroke();
    c.beginPath();
    c.ellipse(r * 0.42, top + r * 0.12, r * 0.42, r * 0.11, 0.06, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = "#fff";
    ellipse(c, 0, top - r * 0.36, r * 0.08, r * 0.08);
    c.fill();
  } else if (kind === "bow") {
    c.fillStyle = "#ff5aa0";
    c.strokeStyle = "#8a1a4a";
    c.lineWidth = r * 0.05;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(r * 0.3, top);
      c.quadraticCurveTo(r * 0.3 + s * r * 0.5, top - r * 0.4, r * 0.3 + s * r * 0.45, top + r * 0.18);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.fillStyle = "#ffd0e6";
    ellipse(c, r * 0.3, top, r * 0.1, r * 0.1);
    c.fill();
    c.stroke();
  } else if (kind === "flower") {
    const fx = -r * 0.25,
      fy = top - r * 0.08;
    c.fillStyle = "#ffffff";
    c.strokeStyle = "#c0a0d0";
    c.lineWidth = r * 0.03;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.sin(t) * 0.1;
      ellipse(c, fx + Math.cos(a) * r * 0.18, fy + Math.sin(a) * r * 0.18, r * 0.13, r * 0.09, a);
      c.fill();
      c.stroke();
    }
    c.fillStyle = "#ffd23a";
    ellipse(c, fx, fy, r * 0.1, r * 0.1);
    c.fill();
  } else if (kind === "phones") {
    c.strokeStyle = "#2a2a3a";
    c.lineWidth = r * 0.12;
    c.beginPath();
    c.arc(0, -r * 0.2, r * 0.86, Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
    for (const s of [-1, 1]) {
      c.fillStyle = "#4fd0ff";
      c.strokeStyle = "#1a3a5a";
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.roundRect(s * r * 0.88 - r * 0.14, -r * 0.42, r * 0.28, r * 0.42, r * 0.1);
      c.fill();
      c.stroke();
    }
  } else if (kind === "ushanka") {
    c.fillStyle = "#8a5a3a";
    c.strokeStyle = "#3a2010";
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.ellipse(0, top + r * 0.1, r * 0.66, r * 0.52, 0, Math.PI, 0);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#f2e6d6";
    c.beginPath();
    c.roundRect(-r * 0.72, top + r * 0.02, r * 1.44, r * 0.22, r * 0.1);
    c.fill();
    c.stroke();
    c.fillStyle = "#ffd23a";
    ellipse(c, 0, top - r * 0.2, r * 0.09, r * 0.09);
    c.fill();
  } else if (kind === "wizard") {
    c.fillStyle = "#5a46c8";
    c.strokeStyle = "#221a5a";
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.moveTo(-r * 0.5, top + r * 0.12);
    c.quadraticCurveTo(-r * 0.05, top - r * 0.9, r * 0.32 + Math.sin(t * 2) * r * 0.06, top - r * 1.05);
    c.quadraticCurveTo(r * 0.12, top - r * 0.45, r * 0.5, top + r * 0.12);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#ffe35a";
    for (const [sx, sy] of [
      [-0.15, -0.3],
      [0.12, -0.6],
      [0.2, -0.05],
    ]) sparkle(c, sx * r, top + sy * r, r * 0.1, "#ffe35a");
    c.fillStyle = "#7a66e8";
    c.beginPath();
    c.ellipse(0, top + r * 0.12, r * 0.6, r * 0.12, 0, 0, TAU);
    c.fill();
    c.stroke();
  } else if (kind === "crown") {
    c.fillStyle = "#ffcf2a";
    c.strokeStyle = "#8a5a06";
    c.lineWidth = r * 0.06;
    c.beginPath();
    const y0 = top + r * 0.12,
      y1 = top - r * 0.38;
    c.moveTo(-r * 0.42, y0);
    c.lineTo(-r * 0.46, y1);
    c.lineTo(-r * 0.22, y0 - r * 0.24);
    c.lineTo(0, y1 - r * 0.08);
    c.lineTo(r * 0.22, y0 - r * 0.24);
    c.lineTo(r * 0.46, y1);
    c.lineTo(r * 0.42, y0);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#ff4a6a";
    ellipse(c, 0, y0 - r * 0.12, r * 0.07, r * 0.07);
    c.fill();
    sparkle(c, r * 0.25, y1, r * 0.08 * (1 + Math.sin(t * 4)), "#fff");
  }
  c.restore();
}
