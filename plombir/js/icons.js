// Small illustrated recipe cards share the colors and markings of the 3D scoops.
const drawings = {
  berry:
    '<path d="M16 25Q18 17 29 22Q41 15 46 25Q49 36 32 49Q27 50 19 40Q13 31 16 25Z" fill="#f46f80" stroke="#8d4456"/><path d="m21 21 7 1-3-7 7 5 4-8 1 9 7 1-8 4-5-3-7 4 3-6z" fill="#56a577"/><path d="m22 29 1 3m9-4-1 3m9-2-1 3m-12 5 1 3m7-3-1 3" stroke="#ffe6a2" stroke-width="2.5"/>',
  vanilla:
    '<path d="M17 48Q32 37 45 15M23 49Q37 39 47 23" fill="none" stroke="#95573e" stroke-width="4"/><g fill="#fff5ce" stroke="#b98c55"><ellipse cx="26" cy="22" rx="5" ry="10"/><ellipse cx="26" cy="22" rx="5" ry="10" transform="rotate(72 26 28)"/><ellipse cx="26" cy="22" rx="5" ry="10" transform="rotate(144 26 28)"/><ellipse cx="26" cy="22" rx="5" ry="10" transform="rotate(216 26 28)"/><ellipse cx="26" cy="22" rx="5" ry="10" transform="rotate(288 26 28)"/></g><circle cx="26" cy="28" r="5" fill="#f3ac47"/>',
  choco:
    '<g transform="rotate(17 31 31)"><rect x="17" y="13" width="29" height="37" rx="4" fill="#774b47" stroke="#633f41"/><g fill="#b67a5b" stroke="#794f44"><rect x="20" y="16" width="10" height="12" rx="2"/><rect x="33" y="16" width="10" height="12" rx="2"/><rect x="20" y="31" width="10" height="12" rx="2"/><rect x="33" y="31" width="10" height="12" rx="2"/></g><path d="M16 36l8 3 8-5 8 4 7-5v15q0 3-3 3H20q-4 0-4-4z" fill="#e8aa8e" stroke="#965d58"/></g>',
  mint: '<path d="M28 37Q23 16 48 13Q50 34 28 37Z" fill="#5cbd90" stroke="#357c67"/><path d="M29 39Q10 39 13 22Q28 22 29 39Z" fill="#98d78e" stroke="#4a896d"/><path d="m24 48 5-12 14-17M27 37l-10-10m18 2 6-1m-6 0 0-5" fill="none" stroke="#467b61" stroke-width="2"/>',
  blueberry: '<g fill="#a792f5" stroke="#7157b0"><circle cx="25" cy="28" r="10"/><circle cx="40" cy="32" r="10"/><circle cx="30" cy="42" r="10"/></g>',
  banana: '<path d="M15 22Q28 46 48 17Q49 44 32 49Q20 47 13 29Z" fill="#ffe66d" stroke="#b48938"/>',
  wafer: '<rect x="25" y="9" width="12" height="44" rx="5" fill="#e6ad6f" stroke="#9f6542" transform="rotate(24 31 31)"/><path d="m31 20 9 4m-13 4 9 4m-13 4 9 4" stroke="#9f6542"/>',
  syrup:
    '<path d="M15 39q9-17 18-7t14-14M15 45q9-13 18-6t17-10" fill="none" stroke="#ab4568" stroke-width="5"/>',
  stars:
    '<path d="m27 14 4 10 11 1-8 7 2 11-9-6-10 5 3-11-8-7 11-1z" fill="#ffc255" stroke="#bc813a"/><path d="m43 35 2 5 6 1-5 3 1 6-5-3-4 2 1-5-4-4 6-1z" fill="#eb8396"/>',
  cherry:
    '<path d="M29 36q1-14 14-22" fill="none" stroke="#557d52" stroke-width="3"/><path d="M42 16q-12 1-13-9 11-1 13 9" fill="#72aa6e"/><path d="M17 31q5-6 12-2 9-4 14 4 5 13-8 17-13 4-18-7-4-7 0-12" fill="#e76574" stroke="#9e415d"/><path d="M21 35q0-3 4-3" fill="none" stroke="#ffd7b9" stroke-width="3"/>',
};
export const icon = (id) =>
  '<svg viewBox="0 0 62 62" aria-hidden="true" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  drawings[id] +
  "</svg>";
// Нота: музыка играет; перечёркнутая нота — музыка выключена
export const tune = (on) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17.5V5.5l10-2v12"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.6" r="2.4"/>' +
  (on ? "" : '<path d="M3.5 3.5l17 17"/>') +
  "</svg>";
export const speaker = (on) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/>' +
  (on
    ? '<path d="M16 8q4 4 0 8m3-11q7 7 0 14"/>'
    : '<path d="m16 9 5 6m0-6-5 6"/>') +
  "</svg>";
// Картинки на кнопках, чтобы играть без чтения
const glyph = (body) =>
  '<svg class="picto" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  body +
  "</svg>";
export const picto = {
  // Шарик над рожком и плюсик
  more: glyph(
    '<path d="M7 16.5 12.5 29 18 16.5" fill="#f1b263"/><path d="M9.5 21h6M10.8 24.5h3.5" stroke-width="1.2"/><circle cx="12.5" cy="12" r="6.3" fill="#ff8fa3"/><circle cx="24.5" cy="8.5" r="5.6" fill="#fffaf0"/><path d="M24.5 6v5M22 8.5h5"/>',
  ),
  // Рожок и сердечко: отдать гостю
  serve: glyph(
    '<path d="M5 15.5 10.5 29 16 15.5" fill="#f1b263"/><circle cx="10.5" cy="11.5" r="6.2" fill="#ffe08f"/><path d="M24 25.5s-6-3.7-6-8a3.2 3.2 0 0 1 6-1.6 3.2 3.2 0 0 1 6 1.6c0 4.3-6 8-6 8z" fill="#ff6f8a"/>',
  ),
  // Колокольчик: позвать следующего гостя
  bell: glyph(
    '<path d="M6.5 23.5h19l-2.6-3.6v-6.4a6.9 6.9 0 0 0-13.8 0v6.4z" fill="#ffd66b"/><path d="M13.3 26.3a2.8 2.8 0 0 0 5.4 0M16 4.5v2"/><path d="M27 9.5q2 3 0 6M5 9.5q-2 3 0 6" stroke-width="1.4"/>',
  ),
};
