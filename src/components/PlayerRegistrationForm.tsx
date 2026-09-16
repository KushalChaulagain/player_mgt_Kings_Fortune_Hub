"use client";

import { useEffect, useRef, useState } from "react";
import { GAMES, GAME_BY_CODE, deriveBaseUsername, type GameCode } from "@/lib/games";

interface ResultAccount {
  platform: string;
  code: GameCode;
  generatedID: string;
  status: "created" | "existing";
}

interface RegisterResult {
  row: number;
  isExisting: boolean;
  matchedBy: "link" | "name" | null;
  accounts: ResultAccount[];
  unmappedPlatforms: string[];
}

interface PlayerRecord {
  row: number;
  facebookName: string;
  facebookLink: string;
  referredBy: string;
  accounts: { platform: string; code: GameCode; id: string }[];
  matchedBy: "link" | "name";
}

interface RegistrationPayload {
  facebookName: string;
  facebookLink: string;
  referralName: string | null;
  platforms: GameCode[];
  forceNew: boolean;
}

type LookupState =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "none" }
  | { state: "found"; player: PlayerRecord }
  | { state: "error"; message: string };

type SubmitState =
  | { state: "idle" }
  | { state: "saving"; payload: RegistrationPayload }
  | { state: "saved"; result: RegisterResult }
  | { state: "error"; message: string; payload: RegistrationPayload };

const LOOKUP_DEBOUNCE_MS = 500;

export function PlayerRegistrationForm() {
  const [facebookName, setFacebookName] = useState("");
  const [facebookLink, setFacebookLink] = useState("");
  const [referralName, setReferralName] = useState("");
  const [selectedGames, setSelectedGames] = useState<Set<GameCode>>(new Set());
  const [forceNew, setForceNew] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [lookup, setLookup] = useState<LookupState>({ state: "idle" });
  const [submit, setSubmit] = useState<SubmitState>({ state: "idle" });
  const lookupAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Live "does this player already exist?" lookup, debounced.
  useEffect(() => {
    const name = facebookName.trim();
    const link = facebookLink.trim();
    setForceNew(false);

    if (name.length < 2 && link.length < 8) {
      lookupAbort.current?.abort();
      setLookup({ state: "idle" });
      return;
    }

    const timer = setTimeout(async () => {
      lookupAbort.current?.abort();
      const ctrl = new AbortController();
      lookupAbort.current = ctrl;
      setLookup({ state: "searching" });
      try {
        const qs = new URLSearchParams({ name, link });
        const res = await fetch(`/api/player?${qs}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        if (ctrl.signal.aborted) return;
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Lookup failed (${res.status})`);
        }
        setLookup(
          data.found
            ? { state: "found", player: data.player as PlayerRecord }
            : { state: "none" },
        );
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setLookup({
          state: "error",
          message: err instanceof Error ? err.message : "Lookup failed",
        });
      }
    }, LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [facebookName, facebookLink]);

  const existingPlayer =
    lookup.state === "found" && !forceNew ? lookup.player : null;
  const ownedCodes = new Set(existingPlayer?.accounts.map((a) => a.code) ?? []);

  const toggleGame = (code: GameCode) => {
    const next = new Set(selectedGames);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedGames(next);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const register = async (payload: RegistrationPayload) => {
    setSubmit({ state: "saving", payload });
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setSubmit({ state: "saved", result: data as RegisterResult });

      // Only clear the form once the sheet has confirmed the write.
      setFacebookName("");
      setFacebookLink("");
      setReferralName("");
      setSelectedGames(new Set());
      setForceNew(false);
      setLookup({ state: "idle" });
    } catch (err) {
      setSubmit({
        state: "error",
        message: err instanceof Error ? err.message : "Network error",
        payload,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submit.state === "saving") return;

    const payload: RegistrationPayload = {
      facebookName: facebookName.trim(),
      facebookLink: facebookLink.trim(),
      referralName: referralName.trim() || null,
      platforms: Array.from(selectedGames),
      forceNew,
    };
    setShowModal(true);
    void register(payload);
  };

  const isFormValid =
    facebookName.trim() &&
    facebookLink.trim() &&
    deriveBaseUsername(facebookName).length > 0 &&
    selectedGames.size > 0 &&
    submit.state !== "saving";

  const newSelectedCount = Array.from(selectedGames).filter(
    (c) => !ownedCodes.has(c),
  ).length;

  if (!isClient) return null;

  return (
    <>
      <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
        <div className="bg-[#161616] border border-[#2A2A2A] rounded-lg p-6 sm:p-8 space-y-6">
          <h2 className="text-xl font-medium text-[#D4AF37] tracking-wide">
            Player Registration
          </h2>

          {/* Facebook Account Name */}
          <div>
            <label
              htmlFor="facebookName"
              className="block text-sm font-medium text-[#C5A059] mb-2"
            >
              Facebook Account Name <span className="text-[#D4AF37]">*</span>
            </label>
            <input
              id="facebookName"
              type="text"
              value={facebookName}
              onChange={(e) => setFacebookName(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-3 border border-[#3A3A3A] rounded-md bg-[#0B0B0B] text-[#E5E5E5] placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
              placeholder="Enter Facebook name"
              required
            />
          </div>

          {/* Facebook Profile Link */}
          <div>
            <label
              htmlFor="facebookLink"
              className="block text-sm font-medium text-[#C5A059] mb-2"
            >
              Facebook Profile Link <span className="text-[#D4AF37]">*</span>
            </label>
            <input
              id="facebookLink"
              type="url"
              value={facebookLink}
              onChange={(e) => setFacebookLink(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-3 border border-[#3A3A3A] rounded-md bg-[#0B0B0B] text-[#E5E5E5] placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
              placeholder="https://facebook.com/username"
              required
            />
          </div>

          {/* Existing-player panel */}
          <LookupPanel
            lookup={lookup}
            forceNew={forceNew}
            onToggleForceNew={() => setForceNew((v) => !v)}
            copiedId={copiedId}
            onCopy={copyToClipboard}
          />

          {/* Referral Name */}
          <div>
            <label
              htmlFor="referralName"
              className="block text-sm font-medium text-[#C5A059] mb-2"
            >
              Referral Name{" "}
              <span className="text-[#888] text-xs">(Optional)</span>
            </label>
            <input
              id="referralName"
              type="text"
              value={referralName}
              onChange={(e) => setReferralName(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-3 border border-[#3A3A3A] rounded-md bg-[#0B0B0B] text-[#E5E5E5] placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
              placeholder={
                existingPlayer?.referredBy
                  ? `Already recorded: ${existingPlayer.referredBy}`
                  : "Who referred this player?"
              }
            />
          </div>

          {/* Game Selection */}
          <div>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <label className="text-sm font-medium text-[#C5A059]">
                Select Games <span className="text-[#D4AF37]">*</span>
              </label>
              {selectedGames.size > 0 && (
                <span className="text-xs text-[#888] shrink-0">
                  {selectedGames.size} selected
                  {existingPlayer && newSelectedCount !== selectedGames.size
                    ? ` · ${newSelectedCount} new`
                    : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-[#666] mb-3">
              Tap to toggle. IDs are generated on submit.
              {existingPlayer && <> Games marked ✓ already have an ID.</>}
            </p>
            <div className="flex flex-wrap gap-2">
              {GAMES.map((game) => {
                const isSelected = selectedGames.has(game.code);
                const owned = ownedCodes.has(game.code);
                return (
                  <button
                    key={game.code}
                    type="button"
                    onClick={() => toggleGame(game.code)}
                    aria-pressed={isSelected}
                    title={
                      owned
                        ? `Already has ${game.name} ID — selecting will show the existing ID`
                        : undefined
                    }
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all
                      ${
                        isSelected
                          ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                          : owned
                            ? "border-emerald-500/40 bg-emerald-500/5 text-[#9AA]"
                            : "border-[#2A2A2A] bg-[#0B0B0B] text-[#C5C5C5] hover:border-[#3A3A3A] hover:text-[#E5E5E5]"
                      }
                    `}
                  >
                    <span aria-hidden="true">{game.emoji}</span>
                    <span>{game.name}</span>
                    {owned && (
                      <span
                        aria-label="already has ID"
                        className="text-emerald-400 text-xs"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid}
            className={`
              w-full px-8 py-4 rounded-md font-semibold text-base tracking-wide transition-all
              ${
                isFormValid
                  ? "bg-[#D4AF37] text-[#0B0B0B] hover:bg-[#C5A059] shadow-xl shadow-[#D4AF37]/20 active:scale-[0.98]"
                  : "bg-[#2A2A2A] text-[#666] cursor-not-allowed"
              }
            `}
          >
            {existingPlayer
              ? `Add IDs to ${existingPlayer.facebookName}`
              : "Complete Registration & Get IDs"}
          </button>
          {existingPlayer && (
            <p className="text-[11px] text-[#666] text-center -mt-2">
              New IDs are added to this account. Existing IDs are never changed.
            </p>
          )}
        </div>
      </form>

      {showModal && (
        <ResultModal
          submit={submit}
          copiedId={copiedId}
          onCopy={copyToClipboard}
          onRetry={(p) => void register(p)}
          onClose={() => setShowModal(false)}
        />
      )}

      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------

function LookupPanel({
  lookup,
  forceNew,
  onToggleForceNew,
  copiedId,
  onCopy,
}: {
  lookup: LookupState;
  forceNew: boolean;
  onToggleForceNew: () => void;
  copiedId: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  if (lookup.state === "idle") return null;

  if (lookup.state === "searching") {
    return (
      <p className="text-xs text-[#888] inline-flex items-center gap-2">
        <span className="w-3 h-3 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
        Checking for an existing account…
      </p>
    );
  }

  if (lookup.state === "none") {
    return (
      <p className="text-xs text-[#888]">
        No existing account — a new player will be created.
      </p>
    );
  }

  if (lookup.state === "error") {
    return (
      <p className="text-xs text-amber-400/80">
        Couldn&apos;t check for an existing account. Duplicates are still
        prevented on submit.
      </p>
    );
  }

  const { player } = lookup;
  const canDismiss = player.matchedBy === "name";

  if (forceNew) {
    return (
      <div className="flex items-center justify-between gap-3 text-xs">
        <p className="text-[#888]">Registering as a new player.</p>
        <button
          type="button"
          onClick={onToggleForceNew}
          className="text-[#777] hover:text-[#D4AF37] transition-colors"
        >
          Undo
        </button>
      </div>
    );
  }

  return (
    <section aria-label="Verified account" className="space-y-2">
      <article className="rounded-md border border-[#2A2A2A] bg-[#0B0B0B] p-4 space-y-3">
        <header className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[#8A8A8A]">
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="w-3.5 h-3.5 text-[#D4AF37]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <circle cx="8" cy="8" r="6.25" />
              <path
                d="M5.25 8.25 7 10l3.75-4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Verified Account
          </p>
        </header>

        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm text-[#E5E5E5] font-medium truncate">
            {player.facebookName}
          </h3>
          {player.facebookLink && (
            <a
              href={player.facebookLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Facebook profile"
              title="Open Facebook profile"
              className="shrink-0 text-[#666] hover:text-[#D4AF37] transition-colors"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6.5 3.5H3.75A1.25 1.25 0 0 0 2.5 4.75v7.5a1.25 1.25 0 0 0 1.25 1.25h7.5a1.25 1.25 0 0 0 1.25-1.25V9.5" />
                <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5" />
              </svg>
            </a>
          )}
        </div>

        {player.accounts.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Active games">
            {player.accounts.map((a) => {
              const key = `lookup-${a.code}`;
              return (
                <li key={a.code}>
                  <button
                    type="button"
                    onClick={() => onCopy(a.id, key)}
                    title={`${a.id} — click to copy`}
                    className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#2A2A2A] text-[11px] leading-5 text-[#9A9A9A] hover:border-[#3A3A3A] hover:text-[#C5C5C5] transition-colors"
                  >
                    {copiedId === key ? "Copied" : a.platform}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-[#666]">No game IDs yet.</p>
        )}
      </article>

      {canDismiss && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onToggleForceNew}
            className="text-xs text-[#777] hover:text-[#C5C5C5] transition-colors"
          >
            Not this person? Register as new
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ResultModal({
  submit,
  copiedId,
  onCopy,
  onRetry,
  onClose,
}: {
  submit: SubmitState;
  copiedId: string | null;
  onCopy: (text: string, key: string) => void;
  onRetry: (payload: RegistrationPayload) => void;
  onClose: () => void;
}) {
  const saved = submit.state === "saved" ? submit.result : null;
  const title =
    submit.state === "saving"
      ? "Saving…"
      : submit.state === "error"
        ? "Could not save"
        : saved?.isExisting
          ? "Player Updated"
          : "Registration Complete!";
  const subtitle =
    submit.state === "saving"
      ? "Generating IDs"
      : submit.state === "error"
        ? "No IDs were issued. Fix the problem and retry."
        : saved?.isExisting
          ? "Existing account updated"
          : "Saved as a new player";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[#161616] border-2 border-[#D4AF37] rounded-2xl shadow-2xl shadow-[#D4AF37]/40 max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scale-in">
        <div className="bg-gradient-to-b from-[#D4AF37]/20 to-transparent p-6 border-b border-[#2A2A2A]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#D4AF37] flex items-center justify-center shrink-0">
              {submit.state === "saving" ? (
                <span className="w-7 h-7 rounded-full border-[3px] border-[#0B0B0B] border-t-transparent animate-spin" />
              ) : submit.state === "error" ? (
                <svg className="w-8 h-8 text-[#0B0B0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-8 h-8 text-[#0B0B0B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-2xl font-bold text-[#D4AF37]">{title}</h3>
              <p className="text-[#888] text-sm mt-1">{subtitle}</p>
            </div>
          </div>
          {submit.state === "error" && (
            <p className="mt-3 text-xs text-red-400 break-words">
              {submit.message}
            </p>
          )}
          {saved && saved.unmappedPlatforms.length > 0 && (
            <p className="mt-3 text-xs text-amber-400">
              No matching column in the sheet for:{" "}
              {saved.unmappedPlatforms.join(", ")}. Those IDs were generated but
              not saved — add the column and re-submit.
            </p>
          )}
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {submit.state === "saving" && (
            <div className="space-y-3">
              {submit.payload.platforms.map((code) => (
                <div
                  key={code}
                  className="bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg p-4 animate-pulse"
                >
                  <p className="text-xs text-[#888] mb-2">
                    {GAME_BY_CODE.get(code)?.emoji} {GAME_BY_CODE.get(code)?.name}
                  </p>
                  <div className="h-5 w-40 rounded bg-[#2A2A2A]" />
                </div>
              ))}
            </div>
          )}

          {saved && (
            <>
              <p className="text-sm font-medium text-[#C5A059] mb-4">
                {saved.isExisting ? "IDs for this player:" : "Your Generated IDs:"}
              </p>
              <div className="space-y-3">
                {saved.accounts.map((account) => (
                  <div
                    key={account.code}
                    className="bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg p-4 hover:border-[#D4AF37]/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#888] mb-1.5 flex items-center gap-2">
                          <span aria-hidden="true">
                            {GAME_BY_CODE.get(account.code)?.emoji}
                          </span>
                          <span>{account.platform}</span>
                          <span
                            className={`ml-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide border ${
                              account.status === "created"
                                ? "border-[#D4AF37]/40 text-[#D4AF37]"
                                : "border-emerald-500/40 text-emerald-400"
                            }`}
                          >
                            {account.status === "created" ? "new" : "existing"}
                          </span>
                        </p>
                        <p className="text-base font-mono text-[#D4AF37] break-all font-semibold">
                          {account.generatedID}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCopy(account.generatedID, account.code)}
                        className="shrink-0 p-3 rounded-lg border border-[#2A2A2A] hover:border-[#D4AF37] hover:bg-[#161616] transition-all group"
                        title="Copy ID"
                      >
                        {copiedId === account.code ? (
                          <svg className="w-5 h-5 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-[#888] group-hover:text-[#D4AF37] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {saved.accounts.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    onCopy(
                      saved.accounts
                        .map((a) => `${a.platform}: ${a.generatedID}`)
                        .join("\n"),
                      "all",
                    )
                  }
                  className="mt-4 text-xs text-[#C5A059] hover:text-[#D4AF37] underline underline-offset-2"
                >
                  {copiedId === "all" ? "Copied all IDs" : "Copy all IDs as text"}
                </button>
              )}
            </>
          )}

          {submit.state === "error" && (
            <p className="text-sm text-[#AAA]">
              Your form entries are still filled in. Retry or close.
            </p>
          )}
        </div>

        <div className="p-6 border-t border-[#2A2A2A] bg-[#0B0B0B] flex gap-3">
          {submit.state === "error" && (
            <button
              type="button"
              onClick={() => onRetry(submit.payload)}
              className="flex-1 px-6 py-3 border border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10 font-semibold rounded-lg transition-all active:scale-[0.98]"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={submit.state === "saving"}
            className="flex-1 px-6 py-3 bg-[#D4AF37] hover:bg-[#C5A059] disabled:opacity-50 disabled:cursor-wait text-[#0B0B0B] font-semibold rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-[#D4AF37]/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
