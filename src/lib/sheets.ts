import { JWT } from "google-auth-library";
import {
    GAME_BY_CODE,
    GAME_BY_HEADER_KEY,
    buildId,
    deriveBaseUsername,
    normalizeHeader,
    parseId,
    randomIdNumber,
    type Game,
    type GameCode,
} from "./games";

/**
 * Google Sheets sync for player registrations.
 *
 * The sheet is the source of truth. The server:
 *   1. reads the tab,
 *   2. finds the player (Facebook link first, then FB name),
 *   3. generates IDs that reuse the player's existing number suffix and are
 *      unique across the whole sheet,
 *   4. writes exactly one row (updating in place for returning players).
 *
 * Everything between read and write is pure (`parseLayout`, `findPlayer`,
 * `planRegistration`) so it can be unit-tested against a rows snapshot.
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationPayload {
  facebookName: string;
  facebookLink: string;
  referralName: string | null;
  platforms: GameCode[];
  /** Admin explicitly says "this is a different person" -> always new row. */
  forceNew?: boolean;
}

export type AccountStatus = "created" | "existing";

export interface ResultAccount {
  platform: string;
  code: GameCode;
  generatedID: string;
  status: AccountStatus;
}

export type MatchedBy = "link" | "name";

export interface RegisterResult {
  row: number;
  isExisting: boolean;
  matchedBy: MatchedBy | null;
  accounts: ResultAccount[];
  unmappedPlatforms: string[];
}

export interface PlayerRecord {
  row: number;
  facebookName: string;
  facebookLink: string;
  referredBy: string;
  accounts: { platform: string; code: GameCode; id: string }[];
  matchedBy: MatchedBy;
}

export interface SheetLayout {
  fbNameCol: number;
  fbLinkCol: number;
  referredByCol: number;
  /** column index -> Game for every recognised platform header */
  platformCols: Map<number, Game>;
  /** GameCode -> column index */
  colByCode: Map<GameCode, number>;
  /** first 0-based row index that holds player data */
  dataStartRow: number;
  /** number of columns we read/write (max mapped col + 1) */
  width: number;
  /** whether column A is a bare running number with no header label */
  numberColumnA: boolean;
}

type Rows = string[][];

// ---------------------------------------------------------------------------
// Auth / HTTP
// ---------------------------------------------------------------------------

interface SheetsConfig {
  spreadsheetId: string;
  tab: string;
}

let jwtClient: JWT | null = null;

function getConfig(): SheetsConfig {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID env var");
  return {
    spreadsheetId,
    tab: process.env.GOOGLE_SHEET_TAB || "Master Sheet",
  };
}

function getClient(): JWT {
  if (jwtClient) return jwtClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Vercel / .env files store the PEM with literal "\n" sequences.
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env var",
    );
  }
  jwtClient = new JWT({ email, key, scopes: SCOPES });
  return jwtClient;
}

async function sheetsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = await getClient().getAccessToken();
  if (!token) throw new Error("Failed to obtain Google access token");

  const res = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sheets API ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

async function readRows(): Promise<Rows> {
  const { spreadsheetId, tab } = getConfig();
  const range = `${quoteTab(tab)}!A1:Z`;
  const data = await sheetsFetch<{ values?: string[][] }>(
    `/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
  );
  return data.values ?? [];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const KNOWN_HEADER_KEYS = new Set([
  "fbname",
  "facebookname",
  "facebooklink",
  "fblink",
  "referredby",
  "referral",
  "referralname",
  "referralbonus",
  ...GAME_BY_HEADER_KEY.keys(),
]);

const cell = (rows: Rows, r: number, c: number): string =>
  (rows[r]?.[c] ?? "").toString().trim();

/**
 * Resolve where things live in the sheet.
 *
 * Header rows are the leading rows (max 6) that contain at least one *known*
 * label (FB Name, Facebook Link, a platform name, …). This is what stops
 * player rows from being mistaken for headers — the previous implementation
 * treated any non-empty early row as a header, which is why duplicates
 * slipped through once real data reached row 3.
 */
export function parseLayout(rows: Rows, tab = "sheet"): SheetLayout {
  const columnMap = new Map<string, number>();
  let lastHeaderRow = -1;

  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r] ?? [];
    const keys = row.map((v) => normalizeHeader(v ?? ""));
    const isHeader = keys.some((k) => KNOWN_HEADER_KEYS.has(k));
    if (!isHeader) {
      // A blank/unknown row after we've already seen headers ends the block.
      if (lastHeaderRow !== -1) break;
      continue;
    }
    lastHeaderRow = r;
    keys.forEach((k, c) => {
      if (k && !columnMap.has(k)) columnMap.set(k, c);
    });
  }

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const c = columnMap.get(k);
      if (c !== undefined) return c;
    }
    return -1;
  };

  const fbNameCol = pick("fbname", "facebookname");
  const fbLinkCol = pick("facebooklink", "fblink");
  const referredByCol = pick("referredby", "referralname", "referral");

  if (fbNameCol === -1) {
    throw new Error(
      `Could not find an "FB Name" header in tab "${tab}". Check GOOGLE_SHEET_TAB.`,
    );
  }
  if (fbLinkCol === -1) {
    throw new Error(`Could not find a "Facebook Link" header in tab "${tab}".`);
  }

  const platformCols = new Map<number, Game>();
  const colByCode = new Map<GameCode, number>();
  for (const [key, c] of columnMap) {
    const game = GAME_BY_HEADER_KEY.get(key);
    if (game && !colByCode.has(game.code)) {
      platformCols.set(c, game);
      colByCode.set(game.code, c);
    }
  }

  const width =
    Math.max(...columnMap.values(), fbNameCol, fbLinkCol, referredByCol) + 1;

  // Column A is a running number if no header row labels it.
  const numberColumnA = ![...columnMap.values()].includes(0);

  return {
    fbNameCol,
    fbLinkCol,
    referredByCol,
    platformCols,
    colByCode,
    dataStartRow: lastHeaderRow + 1,
    width,
    numberColumnA,
  };
}

/**
 * Canonical form of a Facebook profile URL so trivial variations
 * (http/https, www/m/mbasic, trailing slash, tracking params, case) match.
 *
 *  https://www.facebook.com/kerry.romero/?mibextid=abc -> facebook.com/kerry.romero
 *  https://m.facebook.com/profile.php?id=1000123        -> facebook.com/profile.php?id=1000123
 *  fb.com/Kerry.Romero                                  -> facebook.com/kerry.romero
 */
export function normalizeFbLink(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return s.replace(/\/+$/, "");
  }

  let host = url.hostname.replace(
    /^(www|m|mbasic|web|touch|free|business)\./,
    "",
  );
  if (host === "fb.com" || host === "fb.me") host = "facebook.com";

  let path = url.pathname.replace(/\/+$/, "");
  if (path === "") path = "/";

  // profile.php?id=… is the only case where the query is the identity.
  const id = url.searchParams.get("id");
  if (path === "/profile.php" && id) return `${host}/profile.php?id=${id}`;

  return `${host}${path}`;
}

/** facebook.com/share/<token>/ links are per-share, not per-profile. */
export const isShareLink = (link: string): boolean =>
  /facebook\.com\/share\//i.test(normalizeFbLink(link));

const normalizeName = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ");

export interface PlayerMatch {
  rowIdx: number;
  matchedBy: MatchedBy;
}

/**
 * Locate a player. Link is the strong identity; name is the fallback
 * (Facebook "share" links are unique per share, so a returning player often
 * arrives with a different link and we still want to catch them by name).
 */
export function findPlayer(
  rows: Rows,
  layout: SheetLayout,
  query: { facebookName?: string; facebookLink?: string },
): PlayerMatch | null {
  const link = normalizeFbLink(query.facebookLink ?? "");
  const name = normalizeName(query.facebookName ?? "");

  if (link) {
    for (let r = layout.dataStartRow; r < rows.length; r++) {
      const existing = normalizeFbLink(cell(rows, r, layout.fbLinkCol));
      if (existing && existing === link)
        return { rowIdx: r, matchedBy: "link" };
    }
  }
  if (name) {
    for (let r = layout.dataStartRow; r < rows.length; r++) {
      if (normalizeName(cell(rows, r, layout.fbNameCol)) === name) {
        return { rowIdx: r, matchedBy: "name" };
      }
    }
  }
  return null;
}

export function toPlayerRecord(
  rows: Rows,
  layout: SheetLayout,
  match: PlayerMatch,
): PlayerRecord {
  const r = match.rowIdx;
  const accounts: PlayerRecord["accounts"] = [];
  for (const [c, game] of layout.platformCols) {
    const id = cell(rows, r, c);
    if (id) accounts.push({ platform: game.name, code: game.code, id });
  }
  return {
    row: r + 1,
    facebookName: cell(rows, r, layout.fbNameCol),
    facebookLink: cell(rows, r, layout.fbLinkCol),
    referredBy:
      layout.referredByCol === -1 ? "" : cell(rows, r, layout.referredByCol),
    accounts,
    matchedBy: match.matchedBy,
  };
}

/** Every platform ID currently in the sheet (lower-cased), for uniqueness checks. */
export function collectAllIds(rows: Rows, layout: SheetLayout): Set<string> {
  const ids = new Set<string>();
  for (let r = layout.dataStartRow; r < rows.length; r++) {
    for (const c of layout.platformCols.keys()) {
      const v = cell(rows, r, c).toLowerCase();
      if (v) ids.add(v);
    }
  }
  return ids;
}

export interface WritePlan {
  rowIdx: number;
  values: (string | number | null)[];
  result: RegisterResult;
}

/**
 * Decide what to write. Pure: no IO, deterministic given `rng`.
 *
 * - Returning player: update their row in place, keep IDs they already have,
 *   add IDs for new platforms using the *same* number suffix as their
 *   existing IDs (kerry605_os -> kerry605_mw).
 * - New player: first empty row; pick a number whose IDs collide with
 *   nothing already in the sheet.
 */
export function planRegistration(
  rows: Rows,
  layout: SheetLayout,
  payload: RegistrationPayload,
  rng: () => number = randomIdNumber,
): WritePlan {
  const match = payload.forceNew
    ? null
    : findPlayer(rows, layout, {
        facebookName: payload.facebookName,
        facebookLink: payload.facebookLink,
      });

  let rowIdx: number;
  if (match) {
    rowIdx = match.rowIdx;
  } else {
    rowIdx = layout.dataStartRow;
    while (
      rowIdx < rows.length &&
      cell(rows, rowIdx, layout.fbNameCol) !== ""
    ) {
      rowIdx++;
    }
  }

  const out: (string | number | null)[] = new Array(layout.width).fill(null);
  if (match) {
    for (let c = 0; c < layout.width; c++) {
      const v = rows[rowIdx]?.[c];
      out[c] = v === undefined || v === "" ? null : v;
    }
  }

  if (layout.numberColumnA) out[0] = rowIdx - layout.dataStartRow + 1;

  // Identity fields: for a returning player the sheet's version wins so a
  // sloppy re-entry ("kerry r.") can't clobber the canonical name, and a
  // throwaway /share/ link never replaces a real profile URL.
  const existingName = (out[layout.fbNameCol] ?? "").toString().trim();
  if (!existingName) out[layout.fbNameCol] = payload.facebookName.trim();

  const existingLink = (out[layout.fbLinkCol] ?? "").toString().trim();
  const newLink = payload.facebookLink.trim();
  if (
    !existingLink ||
    (isShareLink(existingLink) &&
      normalizeFbLink(existingLink) !== normalizeFbLink(newLink))
  ) {
    out[layout.fbLinkCol] = newLink;
  }

  if (layout.referredByCol !== -1) {
    const existingRef = (out[layout.referredByCol] ?? "").toString().trim();
    // Never blank out a referral that's already recorded.
    if (payload.referralName?.trim()) {
      out[layout.referredByCol] = payload.referralName.trim();
    } else if (!existingRef) {
      out[layout.referredByCol] = null;
    }
  }

  // Existing IDs on this row -> reuse their base + number.
  const existingIds: string[] = [];
  for (const c of layout.platformCols.keys()) {
    const v = (out[c] ?? "").toString().trim();
    if (v) existingIds.push(v);
  }
  const parsedExisting = existingIds.map(parseId).find((p) => p !== null);

  let base = deriveBaseUsername(payload.facebookName);
  if (!base) base = "player";
  let num: number;

  if (parsedExisting) {
    if (parsedExisting.base) base = parsedExisting.base;
    num = parsedExisting.num;
  } else {
    // Fresh number: avoid colliding with any ID anywhere in the sheet.
    const taken = collectAllIds(rows, layout);
    const wanted = payload.platforms
      .map((code) => GAME_BY_CODE.get(code))
      .filter((g): g is Game => !!g);
    num = rng();
    for (let attempt = 0; attempt < 50; attempt++) {
      const clash = wanted.some((g) => taken.has(buildId(base, num, g)));
      if (!clash) break;
      num = rng();
    }
  }

  const accounts: ResultAccount[] = [];
  const unmappedPlatforms: string[] = [];
  const seen = new Set<GameCode>();

  for (const code of payload.platforms) {
    if (seen.has(code)) continue;
    seen.add(code);
    const game = GAME_BY_CODE.get(code);
    if (!game) continue;

    const col = layout.colByCode.get(code);
    if (col === undefined) {
      unmappedPlatforms.push(game.name);
      accounts.push({
        platform: game.name,
        code,
        generatedID: buildId(base, num, game),
        status: "created",
      });
      continue;
    }

    const current = (out[col] ?? "").toString().trim();
    if (current) {
      accounts.push({
        platform: game.name,
        code,
        generatedID: current,
        status: "existing",
      });
    } else {
      const id = buildId(base, num, game);
      out[col] = id;
      accounts.push({
        platform: game.name,
        code,
        generatedID: id,
        status: "created",
      });
    }
  }

  return {
    rowIdx,
    values: out,
    result: {
      row: rowIdx + 1,
      isExisting: !!match,
      matchedBy: match?.matchedBy ?? null,
      accounts,
      unmappedPlatforms,
    },
  };
}

// ---------------------------------------------------------------------------
// IO entry points
// ---------------------------------------------------------------------------

// Serialize writes within this server instance so two simultaneous
// registrations can't both resolve the same "next empty row".
let writeQueue: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function registerPlayerUnlocked(
  payload: RegistrationPayload,
): Promise<RegisterResult> {
  const { spreadsheetId, tab } = getConfig();
  const rows = await readRows();
  const layout = parseLayout(rows, tab);
  const plan = planRegistration(rows, layout, payload);

  const sheetRow = plan.rowIdx + 1;
  const writeRange = `${quoteTab(tab)}!A${sheetRow}:${columnLetter(layout.width - 1)}${sheetRow}`;
  await sheetsFetch(
    `/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({
        range: writeRange,
        majorDimension: "ROWS",
        values: [plan.values],
      }),
    },
  );

  return plan.result;
}

export function registerPlayer(
  payload: RegistrationPayload,
): Promise<RegisterResult> {
  return withWriteLock(() => registerPlayerUnlocked(payload));
}

export async function lookupPlayer(query: {
  facebookName?: string;
  facebookLink?: string;
}): Promise<PlayerRecord | null> {
  const { tab } = getConfig();
  const rows = await readRows();
  const layout = parseLayout(rows, tab);
  const match = findPlayer(rows, layout, query);
  return match ? toPlayerRecord(rows, layout, match) : null;
}
