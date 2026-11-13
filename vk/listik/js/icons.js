// Значки интерфейса: шаги покупки и кнопки
const lines = {
  scan: '<path d="M3 8V4h5m8 0h5v4m0 8v4h-5m-8 0H3v-4M7 8v8m3-8v8m4-8v8m3-8v8"/>',
  bag: '<path d="m5 9-1 12h16L19 9zM8 10V7a4 4 0 0 1 8 0v3"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8m-2-6.5 2-1.5"/>',
  receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h8m-8 4h4"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  book: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 3v18m4-13 2 1 2-1v5l-2-1-2 1Z"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4zM16 8q4 4 0 8m3-11q7 7 0 14"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',
  note: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.6" r="2.4"/>',
  "note-off": '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.6" cy="17.6" r="2.4"/><circle cx="16.6" cy="15.6" r="2.4"/><path d="M3.5 3.5l17 17"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>',
  leaf: '<path d="M5 20C1 9 12 3 22 2c1 11-4 20-14 18l9-12Z" fill="currentColor" stroke="none"/><path d="m4 23 12-13" stroke-width="2.4"/>',
};
export function icon(id) {
  return (
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
    lines[id] +
    "</svg>"
  );
}
