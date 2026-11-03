import { CARDS, THEMES } from "./words.js?v=429ae180";
import { ALPHABET, Round, Deck } from "./rules.js?v=429ae180";

export const SAVE_KEY = "drakosha.post.v1";
const byId = new Map(CARDS.map((card) => [card.id, card]));
const ids = (value, test) => [
  ...new Set(Array.isArray(value) ? value.filter(test) : []),
];
const knownTheme = (id) => THEMES.some((theme) => theme.id === id);

export class Mailbag {
  constructor(saved = {}) {
    this.album = new Set(ids(saved?.album, (id) => byId.has(id)));
    this.sound = saved?.sound !== false;
    this.riddleFirst = saved?.riddleFirst === true;
    this.routes = {};
    this.seen = {};
    this.active = null;
    for (const { id } of THEMES) {
      const inTheme = (word) => byId.get(word)?.theme === id;
      this.seen[id] = ids(saved?.seen?.[id], inTheme);
      const s = saved?.routes?.[id];
      const pack = ids(s?.pack, inTheme);
      if (
        pack.length !== 6 ||
        !Number.isInteger(s.index) ||
        s.index < 0 ||
        s.index > 6
      )
        continue;
      const wins = ids(
        s.wins,
        (word) => pack.indexOf(word) >= 0 && pack.indexOf(word) <= s.index,
      );
      this.routes[id] = {
        pack,
        index: s.index,
        wins,
        tried: ids(s.tried, (ch) => ALPHABET.includes(ch)),
        helped: !!s.helped,
        peeked: !!s.peeked,
      };
    }
  }
  open(theme) {
    if (!knownTheme(theme)) return;
    let route = this.routes[theme];
    if (!route || route.index === 6) {
      const deck = new Deck(
        CARDS.filter((c) => c.theme === theme),
        Math.random,
        this.seen[theme],
      );
      const pack = deck.pack().map((card) => card.id);
      this.seen[theme] = [...deck.seen];
      route = this.routes[theme] = {
        pack,
        index: 0,
        wins: [],
        tried: [],
        helped: false,
        peeked: false,
      };
    }
    this.active = theme;
    this.restoreRound();
  }
  get route() {
    return this.routes[this.active];
  }
  restoreRound() {
    const r = this.route;
    this.round = new Round(byId.get(r.pack[r.index]));
    for (const key of r.tried) this.round.guess(key);
  }
  play(key, help = false) {
    const route = this.route;
    if (!route || route.index === 6 || (help && route.helped))
      return { type: "ignored" };
    const event = help ? this.round.hint() : this.round.guess(key);
    if (!event || !["hit", "miss"].includes(event.type))
      return event || { type: "ignored" };
    if (help) route.helped = true;
    route.tried = [...this.round.tried];
    if (event.won) {
      const id = this.round.card.id;
      this.album.add(id);
      if (!route.wins.includes(id)) route.wins.push(id);
    }
    return event;
  }
  advance() {
    if (!this.route || this.route.index >= 6 || this.round.state === "play")
      return false;
    this.route.index++;
    this.resetLetter();
    return true;
  }
  retry() {
    if (!this.route || this.route.index >= 6 || this.round.state !== "lost")
      return false;
    this.resetLetter();
    return true;
  }
  resetLetter() {
    Object.assign(this.route, { tried: [], helped: false, peeked: false });
    this.round = null;
    if (this.route.index < 6) this.restoreRound();
  }
  toJSON() {
    const { sound, riddleFirst, seen, routes } = this;
    return { sound, riddleFirst, seen, routes, album: [...this.album] };
  }
}
