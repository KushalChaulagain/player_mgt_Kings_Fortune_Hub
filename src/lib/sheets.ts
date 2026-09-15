import { JWT } from "google-auth-library";

/**
 * Google Sheets sync for player registrations.
 *
 * Auth: service account (JWT). The access token is cached by google-auth-library
 * and refreshed automatically, so steady-state cost is 1 read + 1 write (~300-500ms).
 *
 * Column mapping is resolved from the header row by normalized text
 * ("Firekirin 🔥" -> "firekirin"), so emojis / spacing / column order in the
 * sheet don't matter. Data is written to the first row whose "FB Name" cell is
 * empty (this respects your pre-numbered rows and fills gaps).
 */

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export interface RegistrationAccount {
  platform: string;
  code: string;
  generatedID: string;
}

export interface RegistrationPayload {
  facebookName: string;
  facebookLink: string;
  referralName: string | null;
  accounts: RegistrationAccount[];
}

export interface AppendResult {
  row: number;
  unmappedPlatforms: string[];
}

interface SheetsConfig {
  spreadsheetId: string;
  tab: string;
}

let jwtClient: JWT | null = null;

function getConfig(): SheetsConfig {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID env var");
  }
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

/** "Orion Stars 🌟" -> "orionstars", "Juwa 2.0" -> "juwa20" */
export const normalizeHeader = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

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

const quoteTab = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

// Serialize writes within this server instance so two simultaneous
// registrations can't both resolve the same "next empty row".
let writeQueue: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function appendRegistrationUnlocked(
  payload: RegistrationPayload,
): Promise<AppendResult> {
  const { spreadsheetId, tab } = getConfig();

  // 1. Read the used range (header + data) in one call.
  const readRange = `${quoteTab(tab)}!A1:Z`;
  const data = await sheetsFetch<{ values?: string[][] }>(
    `/${spreadsheetId}/values/${encodeURIComponent(readRange)}?majorDimension=ROWS`,
  );
  const rows = data.values ?? [];

  // 2. Build column map from the first few rows. Your sheet uses a split header:
  // row 1 = FB Name / Facebook Link / …, row 2 = game platform names.
  const columnMap = new Map<string, number>();
  let lastHeaderRow = -1;

  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const key = normalizeHeader(row[c] ?? "");
      if (!key) continue;
      if (!columnMap.has(key)) columnMap.set(key, c);
      lastHeaderRow = Math.max(lastHeaderRow, r);
    }
  }

  const colOf = (key: string) => columnMap.get(key) ?? -1;

  const fbNameCol = colOf("fbname");
  const fbLinkCol = colOf("facebooklink");
  const referredByCol = colOf("referredby");

  if (fbNameCol === -1) {
    throw new Error(
      `Could not find an "FB Name" header in tab "${tab}". Check GOOGLE_SHEET_TAB.`,
    );
  }
  if (fbLinkCol === -1) {
    throw new Error(`Could not find a "Facebook Link" header in tab "${tab}".`);
  }

  // 3. Check if player already exists (by FB Name match)
  const dataStartRow = lastHeaderRow + 1;
  const targetName = payload.facebookName.trim().toLowerCase();
  let existingRowIdx = -1;

  for (let r = dataStartRow; r < rows.length; r++) {
    const existingName = (rows[r]?.[fbNameCol] ?? "").trim().toLowerCase();
    if (existingName === targetName) {
      existingRowIdx = r;
      break;
    }
  }

  // If player exists, update that row. Otherwise, find first empty row.
  let rowIdx: number;
  if (existingRowIdx !== -1) {
    rowIdx = existingRowIdx;
  } else {
    rowIdx = dataStartRow;
    while (
      rowIdx < rows.length &&
      (rows[rowIdx][fbNameCol] ?? "").trim() !== ""
    ) {
      rowIdx++;
    }
  }
  const sheetRow = rowIdx + 1; // 1-based

  // 4. Build the row. `null` = leave cell untouched.
  const width =
    Math.max(...columnMap.values(), fbNameCol, fbLinkCol, referredByCol) + 1;
  const out: (string | number | null)[] = new Array(width).fill(null);

  // If updating existing row, preserve existing data
  if (existingRowIdx !== -1 && rows[existingRowIdx]) {
    for (let c = 0; c < width; c++) {
      out[c] = rows[existingRowIdx][c] ?? null;
    }
  }

  // Column A numbering (1, 2, 3, …) when A has no header label.
  if (!columnMap.has(normalizeHeader(rows[dataStartRow]?.[0] ?? ""))) {
    out[0] = sheetRow - dataStartRow;
  }

  out[fbNameCol] = payload.facebookName.trim();
  out[fbLinkCol] = payload.facebookLink.trim();
  if (referredByCol !== -1 && payload.referralName) {
    out[referredByCol] = payload.referralName.trim();
  }

  const unmappedPlatforms: string[] = [];
  for (const account of payload.accounts) {
    const col = colOf(normalizeHeader(account.platform));
    if (col === -1) {
      unmappedPlatforms.push(account.platform);
      continue;
    }
    // Only write if cell is empty (preserve existing IDs, add new ones)
    if (!out[col] || (out[col] as string).trim() === "") {
      out[col] = account.generatedID;
    }
  }

  // 5. Write the single row.
  const writeRange = `${quoteTab(tab)}!A${sheetRow}:${columnLetter(width - 1)}${sheetRow}`;
  await sheetsFetch(
    `/${spreadsheetId}/values/${encodeURIComponent(writeRange)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({
        range: writeRange,
        majorDimension: "ROWS",
        values: [out],
      }),
    },
  );

  return { row: sheetRow, unmappedPlatforms };
}

export function appendRegistration(
  payload: RegistrationPayload,
): Promise<AppendResult> {
  return withWriteLock(() => appendRegistrationUnlocked(payload));
}
