// Картинки для подсказок и плашек: монстры, подборы, лавина — маленькие SVG в стиле игры.
const svg = (body) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
const eyes = (y = 18, dx = 5, r = 3) =>
  `<circle cx="${20 - dx}" cy="${y}" r="${r}" fill="#fff" stroke="#1b2246" stroke-width="1.4"/><circle cx="${20 + dx}" cy="${y}" r="${r}" fill="#fff" stroke="#1b2246" stroke-width="1.4"/>` +
  `<circle cx="${20 - dx + 0.6}" cy="${y + 0.6}" r="${r * 0.5}" fill="#1b2246"/><circle cx="${20 + dx - 0.6}" cy="${y + 0.6}" r="${r * 0.5}" fill="#1b2246"/>`;

export const FOE_ICONS = {
  imps: svg(
    `<path d="M12 12l-2-7 6 5M28 12l2-7-6 5" fill="#bff4ff"/><circle cx="20" cy="22" r="12" fill="#5fd0ff" stroke="#1f7ec8" stroke-width="2"/>` +
      eyes(20, 5, 3.6) +
      `<path d="M13 27q7 6 14 0" fill="none" stroke="#0b3a66" stroke-width="2" stroke-linecap="round"/>`,
  ),
  yeti: svg(
    `<path d="M8 12l-3-6 7 3M32 12l3-6-7 3" fill="#fff1d2"/><circle cx="20" cy="21" r="14" fill="#f4f8ff" stroke="#9ab4d8" stroke-width="2"/>` +
      `<ellipse cx="20" cy="23" rx="9" ry="8" fill="#7fb8f0"/>` +
      eyes(20, 4.4, 2.8) +
      `<path d="M15 27h10" stroke="#3a1830" stroke-width="2.6" stroke-linecap="round"/><path d="M17 27l1 2 1-2M21 27l1 2 1-2" fill="#fff"/>`,
  ),
  bigyeti: svg(
    `<path d="M7 11l-4-7 8 4M33 11l4-7-8 4" fill="#fff1d2"/><circle cx="20" cy="22" r="16" fill="#f4f8ff" stroke="#ff5a6a" stroke-width="2.4"/>` +
      `<ellipse cx="20" cy="24" rx="10" ry="9" fill="#7fb8f0"/>` +
      eyes(21, 4.8, 3) +
      `<path d="M13 15l5 3M27 15l-5 3" stroke="#1b2246" stroke-width="2.2" stroke-linecap="round"/><path d="M14 29q6-4 12 0" fill="#3a1830"/>`,
  ),
  thrower: svg(
    `<circle cx="17" cy="29" r="9" fill="#fff" stroke="#9ab4d8" stroke-width="1.6"/><circle cx="17" cy="15" r="7" fill="#fff" stroke="#9ab4d8" stroke-width="1.6"/>` +
      `<rect x="11" y="4" width="12" height="6" rx="1.5" fill="#7a6ea8"/><circle cx="14.5" cy="14" r="1.6" fill="#1d1f26"/><circle cx="19.5" cy="13" r="2" fill="#1d1f26"/>` +
      `<path d="M17 16l7 2-7 1z" fill="#ff8a1e"/><path d="M25 21l7-9" stroke="#6b4a32" stroke-width="2"/><circle cx="33" cy="10" r="4" fill="#fff" stroke="#9ab4d8" stroke-width="1.4"/>`,
  ),
  spirit: svg(
    `<path d="M9 20a11 11 0 0 1 22 0v13l-4-3-3 3-4-3-4 3-3-3-4 3z" fill="#d8f2ff" stroke="#7fc8ff" stroke-width="2"/>` +
      `<ellipse cx="15.5" cy="19" rx="2.6" ry="3.6" fill="#1d3a7a"/><ellipse cx="24.5" cy="19" rx="2.6" ry="3.6" fill="#1d3a7a"/><ellipse cx="20" cy="26" rx="2.2" ry="2.8" fill="#1d3a7a"/>`,
  ),
  gun: svg(
    `<path d="M6 25l20-11 4 7-20 11z" fill="#2f7cff" stroke="#123a8a" stroke-width="1.6"/><rect x="25" y="11" width="6" height="11" rx="2" transform="rotate(-29 28 16)" fill="#ffd23a"/>` +
      `<circle cx="11" cy="31" r="4" fill="#ff5a6a" stroke="#8a1424" stroke-width="1.4"/><circle cx="34" cy="8" r="3.4" fill="#fff" stroke="#9ab4d8" stroke-width="1.4"/>`,
  ),
  spike: svg(
    `<path d="M20 2l3 9 8-5-3 9 10 2-9 4 6 8-10-2 1 10-6-8-6 8 1-10-10 2 6-8-9-4 10-2-3-9 8 5z" fill="#bff4ff" stroke="#3aa8e0" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<circle cx="20" cy="20" r="7" fill="#fff" stroke="#7fd6ff" stroke-width="1.6"/>`,
  ),
  wave: svg(
    `<circle cx="20" cy="20" r="16" fill="none" stroke="#7fd0ff" stroke-width="3"/><circle cx="20" cy="20" r="10" fill="none" stroke="#bff4ff" stroke-width="3"/><circle cx="20" cy="20" r="4" fill="#fff"/>`,
  ),
  chase: svg(
    `<path d="M2 34q4-14 12-16t12-10q8-4 12 4v22z" fill="#fff" stroke="#9ab4d8" stroke-width="1.6"/>` +
      `<circle cx="27" cy="20" r="7" fill="#7fb8f0"/><circle cx="24.5" cy="19" r="1.8" fill="#1b2246"/><circle cx="29.5" cy="19" r="1.8" fill="#1b2246"/><path d="M24 24h6" stroke="#3a1830" stroke-width="2" stroke-linecap="round"/>`,
  ),
};
FOE_ICONS.boost = svg(`<path d="M20 4l12 12h-7v8h-10v-8h-7zM20 20l12 12h-7v6h-10v-6h-7z" fill="#ffd23a" stroke="#b07a00" stroke-width="1.4" stroke-linejoin="round"/>`);

// конфетти на экране итога: снежинки и звёздочки разных цветов
const COLORS = ["#ff5a6a", "#ffd23a", "#5ab8ff", "#7ce06a", "#e84aff", "#ffffff"];
export const CONFETTI = COLORS.flatMap((c) => [
  `<svg viewBox="0 0 20 20"><path d="M10 0v20M1.3 5l17.4 10M1.3 15L18.7 5" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 20 20"><path d="M10 0l3 7 7 .5-5.5 4.5 2 7.5L10 15l-6.5 4.5 2-7.5L0 7.5 7 7z" fill="${c}"/></svg>`,
]);
