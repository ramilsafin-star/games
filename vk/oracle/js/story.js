// Картинка для истории ВКонтакте (1080×1920) и всё, что связано с «Поделиться»:
// VKWebAppShowStoryBox (с проверкой поддержки), VKWebAppShare, а вне VK — системное меню
// «Поделиться» или сохранение файла.
import { drawFace, CW, CH, FONT, artImage, svgImage, runeSVG, roundRect, gold, sparkle, dust, corner } from "./art.js?v=3f732425";
import { APP } from "./config.js?v=3f732425";

const W = 1080,
  H = 1920;
const NUMFONT = '"Times New Roman", "Noto Serif", "DejaVu Serif", Georgia, serif';
const SANS = '-apple-system, system-ui, "Segoe UI", Roboto, Arial, sans-serif';

// Перенос текста по ширине; не больше max строк, лишнее — многоточием
function wrap(c, text, width, max) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (c.measureText(t).width <= width) line = t;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    let last = lines[max - 1];
    while (c.measureText(last + "…").width > width && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
    lines[max - 1] = last.replace(/[,.;:—\s]+$/, "") + "…";
  }
  return lines;
}

// Фон истории: готовая картинка (assets/story-bg.*) или рисунок кодом. true — если картинка.
async function background(c) {
  const img = await artImage("story-bg");
  if (img) {
    const s = Math.max(W / img.width, H / img.height);
    c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    return true;
  }
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#130c2e");
  g.addColorStop(0.5, "#271852");
  g.addColorStop(1, "#47286f");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  const r = c.createRadialGradient(W / 2, 760, 40, W / 2, 760, 760);
  r.addColorStop(0, "rgba(255,214,150,.26)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = r;
  c.fillRect(0, 0, W, H);
  dust(c, 1234, 260, 40, 40, W - 80, H - 80);
  // рамка с завитками, как на картах
  c.save();
  c.strokeStyle = gold(c, 0, 0, W, H);
  c.lineCap = "round";
  c.lineWidth = 3;
  roundRect(c, 36, 36, W - 72, H - 72, 30);
  c.stroke();
  c.lineWidth = 1.5;
  c.globalAlpha = 0.7;
  roundRect(c, 54, 54, W - 108, H - 108, 22);
  c.stroke();
  c.globalAlpha = 1;
  c.lineWidth = 2.4;
  for (const [x, y, sx, sy] of [[54, 54, 1, 1], [W - 54, 54, -1, 1], [54, H - 54, 1, -1], [W - 54, H - 54, -1, -1]]) {
    c.save();
    c.translate(x, y);
    c.scale(2.2, 2.2);
    c.lineWidth = 1.1;
    corner(c, 0, 0, sx, sy);
    c.restore();
  }
  c.restore();
  return false;
}

// Полумесяц со звёздочкой над названием (на готовом фоне он уже нарисован)
function drawMoon(c) {
  c.save();
  c.strokeStyle = gold(c, 500, 110, 580, 190);
  c.fillStyle = c.strokeStyle;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(W / 2 - 4, 150, 30, 0.9 - 0.4, 0.9 - 0.4 + Math.PI * 2 - 1.8);
  c.arc(W / 2 + 10, 141, 25, -0.4 + Math.PI * 2 - 1.55, -0.4 + 1.55, true);
  c.closePath();
  c.stroke();
  sparkle(c, W / 2 + 12, 152, 10);
  c.restore();
}
function header(c, title, sub, art) {
  if (!art) drawMoon(c);
  headerText(c, title, sub);
}
function headerText(c, title, sub) {
  c.save();
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  c.font = `600 40px ${FONT}`;
  c.fillStyle = "#e9cf91";
  c.letterSpacing = "10px";
  c.fillText(APP.name.toUpperCase(), W / 2 + 5, 240);
  c.letterSpacing = "0px";
  c.font = `600 76px ${FONT}`;
  c.fillStyle = "#fbf3ff";
  c.fillText(title, W / 2, 340);
  if (sub) {
    c.font = `400 34px ${SANS}`;
    c.fillStyle = "rgba(225,212,255,.8)";
    c.fillText(sub, W / 2, 396);
  }
  c.restore();
}

function glowBox(c, x, y, w, h) {
  c.save();
  c.shadowColor = "rgba(255,214,150,.45)";
  c.shadowBlur = 60;
  c.fillStyle = "rgba(20,12,44,.9)";
  roundRect(c, x, y, w, h, w * 0.05);
  c.fill();
  c.restore();
}

// Карты в ряд: одна большая или до трёх поменьше
async function drawCards(c, items, top, bottom) {
  const n = items.length;
  const gap = 34;
  const maxW = n === 1 ? 560 : n === 2 ? 400 : 300;
  const w = Math.min(maxW, (W - 160 - gap * (n - 1)) / n, ((bottom - top) * CW) / CH);
  const h = (w * CH) / CW;
  const x0 = (W - (w * n + gap * (n - 1))) / 2;
  const y = top + (bottom - top - h) / 2;
  for (let i = 0; i < n; i++) {
    const { card, reversed } = items[i];
    const x = x0 + i * (w + gap);
    glowBox(c, x, y, w, h);
    const img = await artImage(card.id);
    c.save();
    c.translate(x + w / 2, y + h / 2);
    if (reversed) c.rotate(Math.PI);
    c.translate(-w / 2, -h / 2);
    c.scale(w / CW, w / CW);
    drawFace(c, card, img, w / CW);
    c.restore();
  }
}
async function drawRunes(c, items, top, bottom) {
  const n = items.length;
  const w = n === 1 ? 420 : 270;
  const h = (w * 160) / 120;
  const gap = 40;
  const x0 = (W - (w * n + gap * (n - 1))) / 2;
  const y = top + (bottom - top - h) / 2;
  for (let i = 0; i < n; i++) {
    const img = await svgImage(runeSVG(items[i].rune, { reversed: items[i].reversed }));
    c.save();
    c.shadowColor = "rgba(255,214,150,.35)";
    c.shadowBlur = 50;
    if (img) c.drawImage(img, x0 + i * (w + gap), y, w, h);
    c.restore();
  }
}
function drawNumbers(c, nums, top, bottom) {
  const n = nums.length;
  const r = n === 1 ? 230 : 170;
  const gap = 60;
  const x0 = (W - (r * 2 * n + gap * (n - 1))) / 2 + r;
  const cy = (top + bottom) / 2 - (n > 1 ? 20 : 0);
  nums.forEach(({ n: num, label }, i) => {
    const cx = x0 + i * (2 * r + gap);
    c.save();
    c.shadowColor = "rgba(255,214,150,.5)";
    c.shadowBlur = 60;
    c.fillStyle = "rgba(24,14,52,.92)";
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.strokeStyle = gold(c, cx - r, cy - r, cx + r, cy + r);
    c.lineWidth = 5;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(cx, cy, r - 18, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#f6e2a8";
    c.textAlign = "center";
    c.textBaseline = "middle";
    // у Cormorant «старинные» цифры (11 похоже на II), поэтому числа — шрифтом с обычными цифрами
    c.font = `700 ${Math.round(r * (String(num).length > 1 ? 0.8 : 0.95))}px ${NUMFONT}`;
    c.fillText(String(num), cx, cy + r * 0.05);
    if (label) {
      c.font = `500 ${n === 1 ? 40 : 34}px ${SANS}`;
      c.fillStyle = "rgba(235,224,255,.85)";
      c.fillText(label, cx, cy + r + 50);
    }
  });
}

// spec: { title, sub, cards?: [{card, reversed}], runes?: [{rune, reversed}], numbers?: [{n, label}], name, keys, text }
export async function storyCanvas(spec) {
  try {
    await document.fonts?.load(`600 40px ${FONT}`);
  } catch {}
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d");
  const art = await background(c);
  header(c, spec.title, spec.sub, art);
  // Низ картинки (ниже 1660) оставлен свободным: там VK рисует кнопку-ссылку истории
  const top = 440,
    bottom = spec.numbers ? 1100 : 1150;
  if (spec.cards) await drawCards(c, spec.cards, top, bottom);
  else if (spec.runes) await drawRunes(c, spec.runes, top, bottom);
  else if (spec.numbers) drawNumbers(c, spec.numbers, top, bottom);
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  let y = 1250;
  if (spec.name) {
    c.font = `700 84px ${FONT}`;
    let size = 84;
    while (c.measureText(spec.name).width > W - 180 && size > 50) c.font = `700 ${(size -= 4)}px ${FONT}`;
    c.fillStyle = "#f7e4ad";
    c.fillText(spec.name, W / 2, y);
    y += 66;
  }
  if (spec.keys) {
    c.font = `500 italic 44px ${FONT}`;
    c.fillStyle = "#d9b779";
    c.fillText(spec.keys, W / 2, y);
    y += 74;
  }
  if (spec.text) {
    c.font = `400 40px ${SANS}`;
    c.fillStyle = "#f2ebff";
    for (const line of wrap(c, spec.text, W - 220, 4)) {
      c.fillText(line, W / 2, y);
      y += 56;
    }
  }
  c.font = `600 38px ${FONT}`;
  c.fillStyle = "rgba(233,207,145,.9)";
  c.fillText("Узнай своё — «" + APP.name + "» во ВКонтакте", W / 2, 1640);
  return cv;
}

// ---------- Поделиться ----------
const bridge = () => window.vkBridge;
const inVk = () => !!window.vkGameHost?.inVk && !!bridge();
export function appLink() {
  const id = new URLSearchParams(location.search).get("vk_app_id");
  return /^\d+$/.test(id || "") ? `https://vk.com/app${id}` : location.origin + location.pathname;
}
async function supports(method) {
  const b = bridge();
  try {
    if (b.supportsAsync) return !!(await b.supportsAsync(method));
    if (b.supports) return !!b.supports(method);
  } catch {}
  return false;
}
// Можно ли выложить историю: только внутри VK и если клиент умеет (на iPad, например, нет)
export async function canStory() {
  return inVk() && (await supports("VKWebAppShowStoryBox"));
}
export async function postStory(dataURL) {
  return bridge().send("VKWebAppShowStoryBox", {
    background_type: "image",
    blob: dataURL,
    attachment: { text: "open", type: "url", url: appLink() },
  });
}
export async function canFriend() {
  if (inVk()) return supports("VKWebAppShare");
  return !!navigator.share || !!navigator.clipboard;
}
// «Поделиться с другом»: в VK — окно отправки ссылки на приложение, вне VK — системное меню или копия ссылки
export async function shareFriend(text) {
  if (inVk()) return bridge().send("VKWebAppShare", { link: appLink() });
  if (navigator.share) return navigator.share({ title: APP.name, text, url: appLink() });
  await navigator.clipboard.writeText(text + " " + appLink());
  return { copied: true };
}
// Вне VK: системное «Поделиться» с файлом, если можно, иначе — скачивание картинки
export async function shareFile(dataURL, name = "oracle.jpg") {
  const blob = await (await fetch(dataURL)).blob();
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: APP.name });
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { saved: true };
}
