/**
 * Single source of truth for the 12 platforms and the username rules.
 * Imported by both the client form (display) and the server (ID generation),
 * so the two can never drift apart.
 */

export type GameCode =
  | "FK"
  | "JW"
  | "GV"
  | "OS"
  | "MW"
  | "JW2"
  | "GR"
  | "CM"
  | "UP"
  | "YO"
  | "EG"
  | "PM";

export interface Game {
  code: GameCode;
  name: string;
  emoji: string;
  suffix: string;
  needsUnderscore: boolean;
}

export const GAMES: readonly Game[] = [
  { code: "FK", name: "Firekirin", emoji: "🔥", suffix: "fk", needsUnderscore: true },
  { code: "JW", name: "Juwa", emoji: "🎲", suffix: "jw", needsUnderscore: true },
  { code: "GV", name: "Gamevault", emoji: "🎮", suffix: "gv", needsUnderscore: true },
  { code: "OS", name: "Orion Stars", emoji: "🌟", suffix: "os", needsUnderscore: true },
  { code: "MW", name: "Milkyway", emoji: "🌌", suffix: "mw", needsUnderscore: true },
  { code: "JW2", name: "Juwa 2.0", emoji: "🤑", suffix: "jw2", needsUnderscore: true },
  { code: "GR", name: "Gameroom", emoji: "🕹️", suffix: "gr", needsUnderscore: false },
  { code: "CM", name: "Cash Machine", emoji: "💸", suffix: "cm", needsUnderscore: false },
  { code: "UP", name: "Ultra Panda", emoji: "🐼", suffix: "up", needsUnderscore: false },
  { code: "YO", name: "YOLO", emoji: "🎯", suffix: "yo", needsUnderscore: false },
  { code: "EG", name: "Egame", emoji: "🎰", suffix: "eg", needsUnderscore: false },
  { code: "PM", name: "PandaMasters", emoji: "🐼", suffix: "pm", needsUnderscore: false },
];

export const GAME_BY_CODE: ReadonlyMap<GameCode, Game> = new Map(
  GAMES.map((g) => [g.code, g]),
);

export function isGameCode(v: unknown): v is GameCode {
  return typeof v === "string" && GAME_BY_CODE.has(v as GameCode);
}

/** "Orion Stars 🌟" -> "orionstars", "Juwa 2.0" -> "juwa20" */
export const normalizeHeader = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header key ("orionstars") -> Game, used to map sheet columns to platforms. */
export const GAME_BY_HEADER_KEY: ReadonlyMap<string, Game> = new Map(
  GAMES.map((g) => [normalizeHeader(g.name), g]),
);

/** "Kerry Romero" -> "kerry" */
export const deriveBaseUsername = (name: string): string =>
  name
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export const MIN_ID_NUMBER = 100;
export const MAX_ID_NUMBER = 999;

export function randomIdNumber(): number {
  return (
    Math.floor(Math.random() * (MAX_ID_NUMBER - MIN_ID_NUMBER + 1)) +
    MIN_ID_NUMBER
  );
}

/** ("kerry", 605, OrionStars) -> "kerry605_os"; ("kerry", 605, Gameroom) -> "kerry605gr" */
export function buildId(base: string, num: number, game: Game): string {
  const connector = game.needsUnderscore ? "_" : "";
  return `${base}${num}${connector}${game.suffix}`;
}

export interface ParsedId {
  base: string;
  num: number;
  game: Game;
}

/**
 * Reverse of buildId. Used to recover the player's number suffix from IDs
 * already in the sheet so newly added platforms share the same number
 * (kerry605_os + kerry605_mw, not kerry605_os + kerry223_mw).
 */
export function parseId(id: string): ParsedId | null {
  const s = id.trim().toLowerCase();
  // Longer suffixes first so "jw2" wins over "jw".
  const games = [...GAMES].sort((a, b) => b.suffix.length - a.suffix.length);
  for (const game of games) {
    const tail = (game.needsUnderscore ? "_" : "") + game.suffix;
    if (!s.endsWith(tail)) continue;
    const head = s.slice(0, -tail.length);
    const m = /^([a-z0-9]*?)(\d{3})$/.exec(head);
    if (!m) continue;
    return { base: m[1], num: Number(m[2]), game };
  }
  return null;
}
