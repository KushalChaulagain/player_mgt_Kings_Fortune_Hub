# Kings Fortune Hub Web

Intuitive admin dashboard for sweepstakes gaming platform player management.

## Features

- Player profile registration (Facebook name & link)
- Smart username generator with platform-specific suffix logic
- Support for 12 gaming platforms
- Referral tracking system
- Clean, minimalist UI with dark mode support
- Responsive design

## Tech Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS v4
- Geist Fonts
- Phosphor Icons
- Motion (Framer Motion)

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Google Sheets Sync

Every "Complete Registration" writes one row to the Master Sheet via the
Google Sheets API (service account). One-time setup:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **APIs & Services → Credentials → Create Credentials → Service account**.
   Any name, no roles needed. Finish.
4. Open the service account → **Keys → Add key → Create new key → JSON**. Download it.
5. Open your spreadsheet → **Share** → paste the service account's `client_email`
   (looks like `name@project.iam.gserviceaccount.com`) → **Editor** → uncheck "Notify".
6. Copy `.env.example` to `.env.local` and fill in:
   - `GOOGLE_SHEET_ID` — the long ID in the spreadsheet URL
   - `GOOGLE_SHEET_TAB` — tab name (default `Master Sheet`)
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` — `client_email` from the JSON
   - `GOOGLE_PRIVATE_KEY` — `private_key` from the JSON, in quotes, keep the `\n`
7. Restart `npm run dev`.

How rows are written:

- Columns are matched by **header text** (emojis/spaces ignored), so
  `Firekirin 🔥`, `Juwa 2.0`, `CashMachine`, `FB Name`, `Facebook Link`,
  `Referred By` all resolve automatically. Reordering columns is safe.
- Data goes into the **first row whose `FB Name` cell is empty**, so your
  pre-numbered rows are respected and cleared rows get reused.
- `Referral Bonus` is left for manual entry.
- The success modal shows IDs instantly and a "Saving to sheet" badge that
  turns into "Saved · row N". If Google is unreachable there's a **Retry** button.

## Platform Username Rules

- **With underscore**: FK, JW, GV, OS, MW, JW2 (e.g., `mathew43_fk`)
- **Without underscore**: GR, CM, UP, YO, EG, PM (e.g., `mathew43gr`)

## Design Principles

- Premium utilitarian minimalism
- Warm monochrome palette
- Editorial typography (Geist Sans + Newsreader)
- Bento grid layouts
- Generous whitespace
- 1px borders (#EAEAEA)
- Muted pastel accents
- Reduced motion support
