// Картинки инструментов и украшений: крупные и понятные без слов
const svg = (body, view = "0 0 64 64") => `<svg viewBox="${view}" aria-hidden="true">${body}</svg>`;
export const tools = {
  tweezers: svg('<path d="M14 6 30 50l3-1L19 5z" fill="#c9d3de" stroke="#5a6478" stroke-width="2"/><path d="M50 6 34 50l-3-1L45 5z" fill="#dfe6ee" stroke="#5a6478" stroke-width="2"/><circle cx="32" cy="52" r="5" fill="#ff7aa2"/>'),
  floss: svg('<rect x="10" y="14" width="30" height="36" rx="10" fill="#7fd8ff" stroke="#2f7fb8" stroke-width="2"/><circle cx="25" cy="32" r="8" fill="#fff"/><path d="M38 24 C48 20 52 30 58 44" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M38 24 C48 20 52 30 58 44" stroke="#2f7fb8" stroke-width="1" fill="none"/>'),
  brush: svg('<rect x="6" y="38" width="40" height="9" rx="4.5" fill="#ff7aa2" transform="rotate(-30 26 42)"/><rect x="36" y="10" width="20" height="12" rx="3" fill="#fff" stroke="#5a6478" stroke-width="2" transform="rotate(-30 46 16)"/><path d="M38 12q4-8 8-2q4-8 8 0" fill="#7fe0c8" transform="rotate(-30 46 12)"/>'),
  water: svg('<path d="M20 34h22l6-10h8v8h-6l-6 10H20z" fill="#9fdcff" stroke="#2f7fb8" stroke-width="2"/><rect x="14" y="30" width="10" height="26" rx="4" fill="#5ab8ff"/><path d="M58 40q-3 6 0 9q3-3 0-9zm-6 6q-2 4 0 6q2-2 0-6z" fill="#3fa9ff"/>'),
  drill: svg('<rect x="8" y="26" width="34" height="14" rx="7" fill="#b9c4d4" stroke="#5a6478" stroke-width="2"/><rect x="40" y="29" width="12" height="8" rx="3" fill="#ffd23f"/><path d="M52 33h8" stroke="#5a6478" stroke-width="3" stroke-linecap="round"/><path d="M16 22q4-6 8 0M20 18q4-6 8 0" stroke="#ff7aa2" stroke-width="2.5" fill="none"/>'),
  paste: svg('<path d="M12 22h28l10 6v8l-10 6H12z" fill="#fff" stroke="#5a6478" stroke-width="2"/><rect x="12" y="22" width="12" height="20" fill="#7fe8ff"/><circle cx="56" cy="32" r="6" fill="#bdf0ff" stroke="#4fd8ff" stroke-width="2"/>'),
  lamp: svg('<path d="M18 18h28l-6 16H24z" fill="#7a5cff" stroke="#3a2a8a" stroke-width="2"/><rect x="28" y="6" width="8" height="14" rx="3" fill="#b9c4d4"/><path d="M24 34 14 58h36L40 34z" fill="#7fe0ff" opacity=".55"/>'),
  done: svg('<circle cx="32" cy="32" r="26" fill="#3fcf7f"/><path d="m20 33 8 8 16-18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
};
export const gems = {
  diamond: svg('<path d="M16 22h32l8 10-24 24L8 32z" fill="#e8f6ff" stroke="#7fb8e0" stroke-width="2"/><path d="M16 22l8 10h16l8-10M24 32l8 24 8-24" fill="none" stroke="#7fb8e0" stroke-width="1.5"/>'),
  ruby: svg('<path d="M16 22h32l8 10-24 24L8 32z" fill="#ff2d55" stroke="#a0002a" stroke-width="2"/><path d="M16 22l8 10h16l8-10" fill="none" stroke="#ffd0dc" stroke-width="1.5"/>'),
  emerald: svg('<path d="M16 22h32l8 10-24 24L8 32z" fill="#1fd47a" stroke="#0a7a42" stroke-width="2"/><path d="M16 22l8 10h16l8-10" fill="none" stroke="#c8ffe0" stroke-width="1.5"/>'),
  sapphire: svg('<path d="M16 22h32l8 10-24 24L8 32z" fill="#2f6bff" stroke="#123a9a" stroke-width="2"/><path d="M16 22l8 10h16l8-10" fill="none" stroke="#cfe0ff" stroke-width="1.5"/>'),
  star: svg('<path d="m32 8 7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2z" fill="#ffd23f" stroke="#c48a00" stroke-width="2"/>'),
  heart: svg('<path d="M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30z" fill="#ff5f8e" stroke="#c42a5a" stroke-width="2"/>'),
  gold: svg('<path d="M14 50V26l9 8 9-16 9 16 9-8v24z" fill="#ffc93c" stroke="#b07a00" stroke-width="2"/><circle cx="32" cy="40" r="4" fill="#ff2d55"/>'),
  braces: svg('<path d="M8 36q24 10 48 0" stroke="#9aa4b4" stroke-width="3" fill="none"/><g stroke="#5a6478" stroke-width="1.5"><rect x="10" y="30" width="8" height="8" rx="2" fill="#ff4f8e"/><rect x="22" y="33" width="8" height="8" rx="2" fill="#3fd6ff"/><rect x="34" y="33" width="8" height="8" rx="2" fill="#ffd23f"/><rect x="46" y="30" width="8" height="8" rx="2" fill="#7cff8f"/></g>'),
  glitter: svg('<g fill="#ffd23f"><path d="m20 12 3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="m44 30 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#ff9fd0"/><path d="m28 40 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#7fe8ff"/></g>'),
};
export const ui = {
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16 8q4 4 0 8m3-11q7 7 0 14"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17.5V5.5l10-2v12"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.6" r="2.4"/></svg>',
  noteOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17.5V5.5l10-2v12"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.6" r="2.4"/><path d="M3.5 3.5l17 17"/></svg>',
  photos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2.5h5L16 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12m0-12L6 18"/></svg>',
};
