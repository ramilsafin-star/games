// Управление. Телефон: левая половина — джойстик (появляется под пальцем), правая — камера,
// большая кнопка действия справа внизу. Компьютер: WASD/стрелки, мышь с зажатой кнопкой — камера,
// колесо — приближение, E или пробел — действие, Esc — пауза.
export class Input {
  constructor(canvas, stickEl, knobEl) {
    this.canvas = canvas;
    this.stickEl = stickEl;
    this.knobEl = knobEl;
    this.move = { x: 0, y: 0 }; // x — вправо, y — вперёд (от камеры)
    this.look = { dx: 0, dy: 0, zoom: 0 };
    this.keys = new Set();
    this.act = false;
    this.pressed = false;
    this.stick = null; // { id, ox, oy }
    this.cam = null; // { id, x, y }
    this.enabled = false;
    this.onPause = null;
    this.touchUsed = matchMedia("(pointer: coarse)").matches;
    const down = (e) => this.down(e);
    canvas.addEventListener("pointerdown", down);
    addEventListener("pointermove", (e) => this.moveP(e), { passive: true });
    addEventListener("pointerup", (e) => this.up(e));
    addEventListener("pointercancel", (e) => this.up(e));
    canvas.addEventListener("wheel", (e) => {
      this.look.zoom += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("keydown", (e) => {
      if (e.repeat && (e.code === "KeyE" || e.code === "Space")) return;
      if (e.code === "Escape" || e.code === "KeyP") return this.onPause?.();
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") {
        if (!this.act) this.pressed = true;
        this.act = true;
        e.preventDefault();
      }
      if (e.code.startsWith("Arrow")) e.preventDefault();
    });
    addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyE" || e.code === "Space" || e.code === "Enter") this.actKey = false, (this.act = this.actButton || false);
    });
    addEventListener("blur", () => this.reset());
  }
  reset() {
    this.keys.clear();
    this.stick = this.cam = null;
    this.move.x = this.move.y = 0;
    this.act = this.actButton = false;
    this.stickEl.hidden = true;
  }
  down(e) {
    if (!this.enabled) return;
    const left = e.clientX < innerWidth * 0.45;
    if (e.pointerType === "touch") this.touchUsed = true;
    if (e.pointerType === "touch" && left && !this.stick) {
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this.stickEl.hidden = false;
      this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.knobEl.style.transform = "translate(0px, 0px)";
    } else if (!this.cam) {
      this.cam = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {}
  }
  moveP(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      const R = 56;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        // джойстик тянется за пальцем
        this.stick.ox += (dx / l) * (l - R);
        this.stick.oy += (dy / l) * (l - R);
        this.stickEl.style.transform = `translate(${this.stick.ox}px, ${this.stick.oy}px)`;
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, l / R);
      const dead = k < 0.12 ? 0 : (k - 0.12) / 0.88;
      this.move.x = l > 0 ? (dx / Math.max(l, 1)) * dead : 0;
      this.move.y = l > 0 ? (-dy / Math.max(l, 1)) * dead : 0;
    } else if (this.cam && e.pointerId === this.cam.id) {
      this.look.dx += e.clientX - this.cam.x;
      this.look.dy += e.clientY - this.cam.y;
      this.cam.x = e.clientX;
      this.cam.y = e.clientY;
    }
  }
  up(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.move.x = this.move.y = 0;
      this.stickEl.hidden = true;
    }
    if (this.cam && e.pointerId === this.cam.id) this.cam = null;
  }
  // кнопка действия на экране
  bindButton(btn) {
    const on = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      this.actButton = true;
      if (!this.act) this.pressed = true;
      this.act = true;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {}
    };
    const off = () => {
      this.actButton = false;
      this.act = this.keys.has("KeyE") || this.keys.has("Space");
    };
    btn.addEventListener("pointerdown", on);
    btn.addEventListener("pointerup", off);
    btn.addEventListener("pointercancel", off);
    btn.addEventListener("lostpointercapture", off);
  }
  // клавиатура + джойстик → вектор
  axes() {
    let x = this.move.x, y = this.move.y;
    const k = this.keys;
    if (k.has("KeyW") || k.has("ArrowUp")) y += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    return { x, y };
  }
  takePress() {
    const p = this.pressed;
    this.pressed = false;
    return p;
  }
  takeLook() {
    const l = { ...this.look };
    this.look.dx = this.look.dy = this.look.zoom = 0;
    return l;
  }
}
