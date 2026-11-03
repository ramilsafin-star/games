import { FIELD } from "./match.js?v=56e154f2";
const TAU = Math.PI * 2;
function img(src) {
  const i = new Image();
  i.src = "./art/" + src + ".webp";
  return i;
}
const loaded = (i) => i.complete && i.naturalWidth;
export class Field {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");
    this.yard = img("yard");
    this.teams = Object.fromEntries(
      ["fox", "raccoon"].map((t) => [
        t,
        ["idle", "run", "kick", "jump"].map((p) => img(t + "-" + p)),
      ]),
    );
    this.fx = [];
    this.trail = [];
    this.net = [0, 0];
    const patch = document.createElement("canvas");
    patch.width = 96;
    patch.height = 48;
    const brush = patch.getContext("2d");
    for (let i = 0; i < 124; i++) {
      const x = (i * 57.23) % 96,
        y = (i * i * 7.41) % 48;
      brush.strokeStyle = i % 3 ? "#39553228" : "#ffef9c4d";
      brush.beginPath();
      brush.moveTo(x, y);
      brush.lineTo(x + 1.7, y - 1.1);
      brush.stroke();
    }
    this.grass = this.g.createPattern(patch, "repeat");
    this.time = 0;
    this.hero = "fox";
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  burst(x, y, colors, n = 14) {
    if (this.reduced) return;
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) * TAU) / n;
      this.fx.push({
        x,
        y,
        vx: Math.cos(a) * (5 + (i % 5) * 2),
        vy: Math.sin(a) * 7 + 7,
        life: 0.36 + (i % 5) * 0.085,
        color: colors[i % colors.length],
      });
    }
  }
  event(name, m) {
    if (name === "kick")
      this.burst(m.ball.x, m.ball.y, ["#fff0ac", "#fffdf2"], 9);
    if (name === "bar")
      this.burst(m.ball.x, m.ball.y, ["#ffe16e", "#ffffff"], 7);
    if (name === "goal") {
      this.net[1 - m.lastScorer] = 1;
      this.burst(
        m.ball.x,
        12,
        ["#fff3a9", "#e78b75", "#51c7ba", "#a78be8"],
        34,
      );
    }
    if (name === "start") this.trail = [];
  }
  frame(m, dt) {
    const c = this.canvas,
      g = this.g,
      w = c.clientWidth,
      h = c.clientHeight;
    if (!w || !h) return;
    const d = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) {
      c.width = Math.round(w * d);
      c.height = Math.round(h * d);
    }
    g.setTransform(d, 0, 0, d, 0, 0);
    this.s = Math.min(w / 102, h / 46);
    this.cx = w / 2;
    this.floor = h * 0.83;
    this.time += dt;
    this.drawYard(w, h);
    this.drawGoal(0, false);
    this.drawGoal(1, false);
    for (const p of m.players) this.shadow(p.x, p.y, 4);
    this.shadow(m.ball.x, m.ball.y - FIELD.r, 1.8);
    for (const p of m.players)
      this.drawPlayer(
        p,
        p.side === 0 ? this.hero : this.hero === "fox" ? "raccoon" : "fox",
        m.phase === "end" && m.score[p.side] > m.score[1 - p.side],
      );
    const b = m.ball;
    if (dt) {
      if (!this.reduced && m.phase === "play" && Math.hypot(b.vx, b.vy) > 31)
        this.trail.push({ x: b.x, y: b.y, t: 0.13 });
      for (const p of this.trail) p.t -= dt;
      this.trail = this.trail.filter((p) => p.t > 0).slice(-12);
    }
    for (const p of this.trail) {
      g.globalAlpha = Math.min(0.18, p.t);
      this.disk(p.x, p.y, FIELD.r * 0.86, "#fff9d2");
    }
    g.globalAlpha = 1;
    this.drawBall(b);
    this.drawGoal(0, true);
    this.drawGoal(1, true);
    for (const p of this.fx) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 31 * dt;
      p.life -= dt;
      g.globalAlpha = Math.min(1, Math.max(0, p.life * 3));
      this.disk(p.x, p.y, 0.25 + Math.max(0, p.life) * 0.26, p.color);
    }
    g.globalAlpha = 1;
    this.fx = this.fx.filter((p) => p.life > 0);
    this.net = this.net.map((v) => Math.max(0, v - dt * 1.8));
  }
  X(x) {
    return this.cx + (x - 50) * this.s;
  }
  Y(y) {
    return this.floor - y * this.s;
  }
  disk(x, y, r, color) {
    const g = this.g;
    g.fillStyle = color;
    g.beginPath();
    g.arc(this.X(x), this.Y(y), this.s * r, 0, TAU);
    g.fill();
  }
  drawYard(w, h) {
    const g = this.g,
      far = this.floor - this.s * 6.2;
    g.fillStyle = "#d7e2cc";
    g.fillRect(0, 0, w, h);
    if (loaded(this.yard)) {
      const i = this.yard,
        sc = Math.max(w / i.width, far / i.height),
        dw = i.width * sc,
        dh = i.height * sc;
      g.save();
      g.beginPath();
      g.rect(0, 0, w, far + 1);
      g.clip();
      g.drawImage(i, (w - dw) / 2, far - dh, dw, dh);
      const rail = far - dh * 0.261;
      const cheer = Math.max(...this.net);
      for (const [index, team] of ["fox", "raccoon"].entries()) {
        const fan = this.teams[team][0];
        if (!loaded(fan)) continue;
        const tall = Math.min(dw * 0.071, this.s * 9),
          wide = (tall * fan.width) / fan.height;
        const x = w * (index ? 0.56 : 0.47),
          hop = this.reduced
            ? 0
            : Math.abs(Math.sin(cheer * 12)) * cheer * tall * 0.22;
        g.save();
        g.beginPath();
        g.rect(x - wide, rail - tall * 1.4, wide * 2, tall * 1.4);
        g.clip();
        g.translate(x, rail - tall * 0.52 - hop);
        g.scale(index ? -1 : 1, 1);
        g.drawImage(fan, -wide * 0.5, 0, wide, tall);
        g.restore();
      }
      g.restore();
    }
    const turf = g.createLinearGradient(0, far, 0, h);
    turf.addColorStop(0, "#a5c960");
    turf.addColorStop(0.45, "#7fb852");
    turf.addColorStop(1, "#548e47");
    g.fillStyle = turf;
    g.fillRect(0, far, w, h - far);
    for (let i = -1; i < 11; i += 2) {
      g.fillStyle = "#f2e28b25";
      g.beginPath();
      g.moveTo(this.X(50 + (i * 10 - 50) * 0.86), far);
      g.lineTo(this.X(50 + ((i + 1) * 10 - 50) * 0.86), far);
      g.lineTo(this.X(50 + ((i + 1) * 10 - 50) * 1.18), h);
      g.lineTo(this.X(50 + (i * 10 - 50) * 1.18), h);
      g.fill();
    }
    g.fillStyle = this.grass;
    g.fillRect(0, far, w, h - far);
    g.strokeStyle = "#fffadba8";
    g.lineWidth = Math.max(1, this.s * 0.24);
    g.beginPath();
    const f = this.floor,
      s = this.s;
    g.moveTo(this.X(10), far + 2);
    g.lineTo(this.X(90), far + 2);
    g.lineTo(this.X(98), f + s * 6);
    g.lineTo(this.X(2), f + s * 6);
    g.closePath();
    g.moveTo(this.X(50), far + 2);
    g.lineTo(this.X(50), f + s * 6);
    g.stroke();
    g.beginPath();
    g.ellipse(this.X(50), f, 8 * s, 2.25 * s, 0, 0, TAU);
    g.stroke();
    for (const sign of [-1, 1]) {
      g.beginPath();
      g.moveTo(this.X(50 + sign * 41), f - s * 3.1);
      g.lineTo(this.X(50 + sign * 32), f - s * 3.1);
      g.lineTo(this.X(50 + sign * 34), f + s * 3.7);
      g.lineTo(this.X(50 + sign * 46), f + s * 3.7);
      g.stroke();
    }
  }
  shadow(x, y, r) {
    const g = this.g,
      sh = Math.max(0.34, 1 - Math.max(0, y) * 0.027);
    g.fillStyle = "rgba(39,60,38," + 0.19 * sh + ")";
    g.beginPath();
    g.ellipse(
      this.X(x),
      this.floor + 1,
      r * this.s * sh,
      r * this.s * 0.23 * sh,
      0,
      0,
      TAU,
    );
    g.fill();
  }
  drawGoal(side, front) {
    const g = this.g,
      s = this.s,
      sign = side ? 1 : -1,
      x = this.X(side ? FIELD.right : FIELD.left),
      y = this.floor,
      h = FIELD.bar * s;
    const deep =
      (4 + Math.sin(this.net[side] * Math.PI * 3) * this.net[side] * 1.5) * s;
    g.save();
    g.translate(x, y);
    g.scale(sign, 1);
    g.lineCap = "round";
    if (!front) {
      g.fillStyle = "#f6f3e34a";
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(deep, -s);
      g.lineTo(deep, -h + s);
      g.lineTo(0, -h);
      g.closePath();
      g.fill();
      g.strokeStyle = "#f8f3dbb3";
      g.lineWidth = Math.max(1, s * 0.12);
      g.beginPath();
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        g.moveTo(0, -h * t);
        g.lineTo(deep, -s - (h - 2 * s) * t);
      }
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        g.moveTo(deep * t, -s * t);
        g.lineTo(deep * t, -h + s * t);
      }
      g.stroke();
      g.strokeStyle = "#9f8162";
      g.lineWidth = s * 0.45;
      g.beginPath();
      g.moveTo(deep, -s);
      g.lineTo(deep, -h + s);
      g.lineTo(0, -h);
      g.stroke();
    } else {
      g.strokeStyle = "#fffae3";
      g.lineWidth = s * 0.62;
      g.beginPath();
      g.moveTo(0, -h);
      g.lineTo(-s * 0.85, -h + s * 0.65);
      g.lineTo(-s * 0.85, s * 0.65);
      g.stroke();
      // The garden backpacks double as weights for the posts.
      g.fillStyle = side ? "#695588" : "#327b72";
      g.beginPath();
      g.roundRect(-s * 1.7, -s * 1.4, 2.7 * s, 2.7 * s, 0.7 * s);
      g.fill();
      g.strokeStyle = "#ffe0a3";
      g.lineWidth = 0.18 * s;
      g.strokeRect(-s * 1.25, -s * 0.18, 1.7 * s, 0.65 * s);
    }
    g.restore();
  }
  drawPlayer(p, team, winner) {
    const g = this.g,
      s = this.s,
      air = p.y > 0.15,
      run = Math.abs(p.vx) > 2 && !air,
      pose =
        p.kick > 0.025
          ? 2
          : air || winner
            ? 3
            : run && Math.cos(p.run) > -0.24
              ? 1
              : 0;
    const spr = this.teams[team][pose],
      bounce = run ? Math.abs(Math.sin(p.run)) * 0.65 : 0;
    const ht = s * (12.7 + (pose === 3 ? 0.45 : 0)),
      x = this.X(p.x),
      y = this.Y(p.y + bounce);
    g.save();
    g.translate(x, y);
    g.scale(p.side ? -1 : 1, 1);
    g.rotate(
      run
        ? Math.sin(p.run) * 0.067 + Math.sign(p.vx) * (p.side ? -1 : 1) * 0.03
        : 0,
    );
    if (loaded(spr)) {
      const width = (ht * spr.width) / spr.height;
      g.drawImage(spr, -width * 0.55, -ht, width, ht);
    } else {
      g.font = ht * 0.83 + "px system-ui";
      g.textAlign = "center";
      g.fillText(team === "fox" ? "🦊" : "🦝", 0, -s * 0.5);
    }
    g.restore();
    if (p.side === 0) {
      const t = y - ht - s * 0.9;
      g.fillStyle = "#ffeb84";
      g.strokeStyle = "#4d552c";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - (2.8 * s) / 2, t - 1.3 * s);
      g.lineTo(x + (2.8 * s) / 2, t - 1.3 * s);
      g.lineTo(x, t);
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  drawBall(b) {
    const g = this.g,
      r = FIELD.r * this.s,
      x = this.X(b.x),
      y = this.Y(b.y);
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.clip();
    g.fillStyle = "#fff5d9";
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.save();
    g.rotate(b.spin);
    for (const [dx, dy, size] of [
      [0, 0, 0.42],
      [0.97, 0, 0.4],
      [-0.89, 0.38, 0.43],
      [0.32, -0.92, 0.4],
      [0.24, 0.96, 0.42],
      [-0.66, -0.7, 0.26],
    ]) {
      g.fillStyle = "#233b48";
      g.beginPath();
      for (let j = 0; j < 5; j++) {
        const a = (j * TAU) / 5 - 0.5,
          xx = (dx + size * Math.cos(a)) * r,
          yy = (dy + size * Math.sin(a)) * r;
        if (!j) g.moveTo(xx, yy);
        else g.lineTo(xx, yy);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
    const shade = g.createRadialGradient(
      -r * 0.37,
      -r * 0.47,
      r * 0.1,
      r * 0.05,
      r * 0.15,
      r * 1.12,
    );
    shade.addColorStop(0, "#ffffff65");
    shade.addColorStop(0.47, "#ffffff00");
    shade.addColorStop(1, "#19303d99");
    g.fillStyle = shade;
    g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
    g.strokeStyle = "#2a454a";
    g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.stroke();
  }
}
