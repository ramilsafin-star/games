// Общий «сок»: искорки-звёздочки под пальцем и пружинящие кнопки.
// Работает поверх любой игры, касания не перехватывает.
(() => {
  const css = document.createElement("style");
  css.textContent =
    "button,[role=button]{transition:scale .22s cubic-bezier(.3,1.7,.5,1)}" +
    "button:active,[role=button]:active{scale:.9;transition-duration:.06s}" +
    "#juice-fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000}";
  document.head.appendChild(css);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = document.createElement("canvas");
  cv.id = "juice-fx";
  cv.setAttribute("aria-hidden", "true");
  const ctx = cv.getContext("2d");
  const COLORS = ["#fff7b0", "#ffd84a", "#ff9ecb", "#9be7ff", "#ffffff", "#b8ffb0"];
  let parts = [], running = false, last = 0, down = false, lastTrail = 0, dpr = 1;
  const fit = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
  };
  const star = (x, y, r, rot) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4, k = i % 2 ? r * 0.42 : r;
      ctx.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
    }
    ctx.closePath();
    ctx.fill();
  };
  const spawn = (x, y, n, power) => {
    if (parts.length > 140) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 180) * power;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * power, r: 4 + Math.random() * 7, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 8, life: 0, ttl: 0.45 + Math.random() * 0.35, c: COLORS[(Math.random() * COLORS.length) | 0] });
    }
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(tick);
    }
  };
  const tick = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => (p.life += dt) < p.ttl);
    for (const p of parts) {
      p.vy += 420 * dt;
      p.vx *= 1 - 2.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const k = p.life / p.ttl;
      ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      ctx.fillStyle = p.c;
      star(p.x, p.y, p.r * (k < 0.15 ? k / 0.15 : 1 - k * 0.5), p.rot);
    }
    ctx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(tick);
    else running = false;
  };
  const start = () => {
    document.body.appendChild(cv);
    fit();
    addEventListener("resize", fit);
    addEventListener("pointerdown", (e) => { down = true; spawn(e.clientX, e.clientY, 9, 1); }, { capture: true, passive: true });
    addEventListener("pointermove", (e) => {
      if (!down || e.timeStamp - lastTrail < 45) return;
      lastTrail = e.timeStamp;
      spawn(e.clientX, e.clientY, 1, 0.35);
    }, { capture: true, passive: true });
    const up = () => (down = false);
    addEventListener("pointerup", up, { capture: true, passive: true });
    addEventListener("pointercancel", up, { capture: true, passive: true });
  };
  document.body ? start() : addEventListener("DOMContentLoaded", start);
})();
