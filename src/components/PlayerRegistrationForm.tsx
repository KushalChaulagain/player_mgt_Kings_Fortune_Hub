"use client";

import {
  GAMES,
  GAME_BY_CODE,
  deriveBaseUsername,
  type GameCode,
} from "@/lib/games";
import { ArrowUpRight, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

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

type ReferralBonusToggleStatus = "Pending" | "Paid";

interface PlayerRecord {
  row: number;
  facebookName: string;
  facebookLink: string;
  referredBy: string;
  referralBonus: string | null;
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

type UIMode = "search" | "existing" | "new";

type SearchState =
  | { state: "idle" }
  | { state: "searching" }
  | { state: "ready"; players: PlayerRecord[] }
  | { state: "error"; message: string };

type SubmitState =
  | { state: "idle" }
  | { state: "saving"; payload: RegistrationPayload }
  | { state: "saved"; result: RegisterResult }
  | { state: "error"; message: string; payload: RegistrationPayload };

const SEARCH_DEBOUNCE_MS = 400;

const panelVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: "auto" as const,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.25, ease: [0.4, 0, 1, 1] },
  },
};

export function PlayerRegistrationForm() {
  const [searchQuery, setSearchQuery] = useState("");
  const [uiMode, setUIMode] = useState<UIMode>("search");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(
    null,
  );
  const [facebookLink, setFacebookLink] = useState("");
  const [referralName, setReferralName] = useState("");
  const [selectedGames, setSelectedGames] = useState<Set<GameCode>>(new Set());
  const [isClient, setIsClient] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState<SearchState>({ state: "idle" });
  const [submit, setSubmit] = useState<SubmitState>({ state: "idle" });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [addingGame, setAddingGame] = useState<GameCode | null>(null);
  const [inlineAddResult, setInlineAddResult] = useState<{
    code: GameCode;
    id: string;
  } | null>(null);
  const [inlineAddError, setInlineAddError] = useState<string | null>(null);

  const searchAbort = useRef<AbortController | null>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** True when user explicitly picked "Create New" from the dropdown (matches exist). */
  const newViaDropdownRef = useRef(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Debounced autocomplete search (name only — not tied to link field).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchAbort.current?.abort();
      setSearch({ state: "idle" });
      return;
    }

    const timer = setTimeout(async () => {
      searchAbort.current?.abort();
      const ctrl = new AbortController();
      searchAbort.current = ctrl;
      setSearch({ state: "searching" });
      try {
        const res = await fetch(
          `/api/players/search?q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        const data = await res.json().catch(() => ({}));
        if (ctrl.signal.aborted) return;
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Search failed (${res.status})`);
        }
        setSearch({
          state: "ready",
          players: (data.players ?? []) as PlayerRecord[],
        });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setSearch({
          state: "error",
          message: err instanceof Error ? err.message : "Search failed",
        });
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-open new-player form when search finds no matches (skip extra confirmation click).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2 || uiMode === "existing") return;

    const zeroMatches =
      search.state === "ready" && search.players.length === 0;
    const searchFailed = search.state === "error";

    if ((zeroMatches || searchFailed) && uiMode === "search") {
      newViaDropdownRef.current = false;
      setUIMode("new");
      setDropdownOpen(false);
      setSelectedPlayer(null);
      return;
    }

    if (
      search.state === "ready" &&
      search.players.length > 0 &&
      uiMode === "new" &&
      !newViaDropdownRef.current
    ) {
      setUIMode("search");
      setDropdownOpen(true);
    }
  }, [search, searchQuery, uiMode]);

  // Close dropdown on outside click.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!comboboxRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const resetToSearch = useCallback(
    (opts?: { clearQuery?: boolean; focusInput?: boolean }) => {
      const { clearQuery = true, focusInput = false } = opts ?? {};
      searchAbort.current?.abort();
      newViaDropdownRef.current = false;
      setUIMode("search");
      if (clearQuery) setSearchQuery("");
      setSelectedPlayer(null);
      setSearch({ state: "idle" });
      setInlineAddError(null);
      setDropdownOpen(false);
      setHighlightIndex(-1);
      setInlineAddResult(null);
      setFacebookLink("");
      setReferralName("");
      setSelectedGames(new Set());
      if (focusInput) {
        requestAnimationFrame(() => {
          const el = inputRef.current;
          if (!el) return;
          el.readOnly = false;
          el.focus();
        });
      }
    },
    [],
  );

  const handleSearchChange = (value: string) => {
    const trimmed = value.trim();
    setSearchQuery(value);
    setHighlightIndex(-1);

    if (trimmed.length < 2) {
      if (uiMode !== "search") {
        resetToSearch({ clearQuery: false, focusInput: true });
      } else {
        setDropdownOpen(false);
      }
      return;
    }

    if (uiMode === "search") {
      setDropdownOpen(true);
    }
  };

  const selectExistingPlayer = (player: PlayerRecord) => {
    setSelectedPlayer(player);
    setSearchQuery(player.facebookName);
    setUIMode("existing");
    setDropdownOpen(false);
    setHighlightIndex(-1);
    setSelectedGames(new Set());
    setInlineAddResult(null);
  };

  const selectNewPlayer = () => {
    newViaDropdownRef.current = true;
    setUIMode("new");
    setSelectedPlayer(null);
    setDropdownOpen(false);
    setHighlightIndex(-1);
    setFacebookLink("");
    setReferralName("");
    setSelectedGames(new Set());
  };

  const searchPlayers =
    search.state === "ready" ? search.players : [];
  const trimmedQuery = searchQuery.trim();

  const showCreateNew =
    trimmedQuery.length >= 2 &&
    (search.state === "ready" || search.state === "searching");
  const dropdownItems = showCreateNew
    ? searchPlayers.length + 1
    : searchPlayers.length;

  const toggleGame = (code: GameCode) => {
    const next = new Set(selectedGames);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelectedGames(next);
  };

  const mergePlayerAccounts = (
    player: PlayerRecord,
    result: RegisterResult,
  ): PlayerRecord => {
    const byCode = new Map(player.accounts.map((a) => [a.code, a]));
    for (const acc of result.accounts) {
      if (acc.status === "created" || !byCode.has(acc.code)) {
        byCode.set(acc.code, {
          platform: acc.platform,
          code: acc.code,
          id: acc.generatedID,
        });
      }
    }
    return { ...player, accounts: Array.from(byCode.values()) };
  };

  const handleBonusChange = (row: number, status: string) => {
    setSelectedPlayer((prev) =>
      prev && prev.row === row ? { ...prev, referralBonus: status } : prev,
    );
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

  const register = async (
    payload: RegistrationPayload,
    opts?: { inline?: boolean; showModalOnSuccess?: boolean },
  ) => {
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
      const result = data as RegisterResult;
      setSubmit({ state: "saved", result });

      if (opts?.inline && uiMode === "existing" && selectedPlayer) {
        const created = result.accounts.find((a) => a.status === "created");
        setSelectedPlayer(mergePlayerAccounts(selectedPlayer, result));
        if (created) {
          setInlineAddResult({ code: created.code, id: created.generatedID });
          setTimeout(() => setInlineAddResult(null), 4000);
        }
        setSubmit({ state: "idle" });
      } else if (opts?.showModalOnSuccess !== false) {
        setShowModal(true);
        resetToSearch();
      }
    } catch (err) {
      setSubmit({
        state: "error",
        message: err instanceof Error ? err.message : "Network error",
        payload,
      });
      if (!opts?.inline) setShowModal(true);
    } finally {
      setAddingGame(null);
    }
  };

  const mapInlineAddError = (message: string): string => {
    if (/row mismatch|shifted/i.test(message)) {
      return "Player data changed on the sheet. Please refresh your search.";
    }
    if (/Sheets API 429|Sheets API 503/.test(message)) {
      return "Google Sheets is currently busy. Please try again in a few seconds.";
    }
    if (message === "SHEET_WRITE_TIMEOUT") {
      return "The sheet write timed out. Please try again.";
    }
    return message || "Could not add game ID. Please try again.";
  };

  const quickAddGame = async (code: GameCode) => {
    if (!selectedPlayer || addingGame || submit.state === "saving") return;
    const owned = new Set(selectedPlayer.accounts.map((a) => a.code));
    if (owned.has(code)) return;

    setAddingGame(code);
    setInlineAddError(null);
    try {
      const res = await fetch("/api/players/add-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          row: selectedPlayer.row,
          facebookName: selectedPlayer.facebookName,
          facebookLink: selectedPlayer.facebookLink.trim(),
          gameCode: code,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      const game = GAME_BY_CODE.get(code);
      setSelectedPlayer((prev) => {
        if (!prev) return prev;
        const byCode = new Map(prev.accounts.map((a) => [a.code, a]));
        byCode.set(code, {
          platform: data.platform ?? game?.name ?? code,
          code,
          id: data.generatedID,
        });
        return { ...prev, accounts: Array.from(byCode.values()) };
      });

      if (data.status === "created") {
        setInlineAddResult({ code, id: data.generatedID });
        setTimeout(() => setInlineAddResult(null), 4000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error";
      setInlineAddError(mapInlineAddError(message));
    } finally {
      setAddingGame(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submit.state === "saving" || uiMode !== "new") return;

    const payload: RegistrationPayload = {
      facebookName: trimmedQuery,
      facebookLink: facebookLink.trim(),
      referralName: referralName.trim() || null,
      platforms: Array.from(selectedGames),
      forceNew: true,
    };
    setShowModal(true);
    void register(payload);
  };

  const handleDropdownKeyDown = (e: React.KeyboardEvent) => {
    if (!dropdownOpen || dropdownItems === 0) {
      if (e.key === "ArrowDown" && trimmedQuery.length >= 2) {
        setDropdownOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, dropdownItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      if (highlightIndex < searchPlayers.length) {
        selectExistingPlayer(searchPlayers[highlightIndex]!);
      } else {
        selectNewPlayer();
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setHighlightIndex(-1);
    }
  };

  const isNewFormValid =
    uiMode === "new" &&
    trimmedQuery &&
    facebookLink.trim() &&
    deriveBaseUsername(trimmedQuery).length > 0 &&
    selectedGames.size > 0 &&
    submit.state !== "saving";

  if (!isClient) return null;

  return (
    <>
      <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
        <div className="bg-[#161616] border border-[#2A2A2A] rounded-lg p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-xl font-medium text-[#D4AF37] tracking-wide">
              Player Management
            </h2>
            <p className="text-xs text-neutral-500 mt-1.5">
              Search for an existing player or register a new account on a
              single screen.
            </p>
          </div>

          {/* Search input + auto-expanding new-player fields share one layout stack */}
          <div className="space-y-0">
          <div ref={comboboxRef} className="relative">
            <label
              htmlFor="playerSearch"
              className="block text-sm font-medium text-[#C5A059] mb-2"
            >
              Facebook Account Name <span className="text-[#D4AF37]">*</span>
            </label>
            <div className="relative w-full">
              <input
                ref={inputRef}
                id="playerSearch"
                type="text"
                role="combobox"
                aria-expanded={dropdownOpen && uiMode === "search"}
                aria-controls="player-search-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  highlightIndex >= 0
                    ? `player-option-${highlightIndex}`
                    : undefined
                }
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (uiMode === "search" && trimmedQuery.length >= 2) {
                    setDropdownOpen(true);
                  }
                }}
                onKeyDown={handleDropdownKeyDown}
                readOnly={uiMode === "existing"}
                autoComplete="off"
                className={`
                  w-full px-4 py-3 pr-12 border rounded-md transition-all
                  focus:outline-none focus:ring-1
                  ${
                    uiMode === "existing"
                      ? "bg-neutral-900/40 text-neutral-400 border-neutral-800 cursor-default focus:border-neutral-800 focus:ring-neutral-800/30"
                      : "border-[#3A3A3A] bg-[#0B0B0B] text-[#E5E5E5] placeholder:text-[#666] focus:border-[#D4AF37] focus:ring-[#D4AF37]"
                  }
                `}
                placeholder="Search or enter a name…"
                required
              />
              {searchQuery.length > 0 ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => resetToSearch({ focusInput: true })}
                  className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-neutral-400 active:text-neutral-200 transition-colors z-10"
                >
                  <X weight="bold" className="w-5 h-5" />
                </button>
              ) : (
                search.state === "searching" &&
                uiMode === "search" && (
                  <span
                    aria-hidden="true"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin"
                  />
                )
              )}
            </div>

            <AnimatePresence>
              {dropdownOpen &&
                uiMode === "search" &&
                trimmedQuery.length >= 2 && (
                  <motion.ul
                    id="player-search-listbox"
                    role="listbox"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="absolute z-20 mt-1.5 w-full max-h-72 overflow-y-auto rounded-lg border border-[#333] bg-[#111] shadow-xl shadow-black/40 py-1"
                  >
                    {search.state === "searching" && searchPlayers.length === 0 && (
                      <li className="px-4 py-3 text-xs text-[#888]">
                        Searching…
                      </li>
                    )}

                    {search.state === "error" && (
                      <li className="px-4 py-3 text-xs text-amber-400/90">
                        Couldn&apos;t search — you can still create a new
                        player below.
                      </li>
                    )}

                    {searchPlayers.map((player, idx) => (
                      <SearchResultOption
                        key={`${player.row}-${player.facebookName}`}
                        id={`player-option-${idx}`}
                        player={player}
                        highlighted={highlightIndex === idx}
                        onSelect={() => selectExistingPlayer(player)}
                        onHover={() => setHighlightIndex(idx)}
                      />
                    ))}

                    {showCreateNew && (
                      <li role="presentation" className="border-t border-[#2A2A2A] mt-1 pt-1">
                        <button
                          id={`player-option-${searchPlayers.length}`}
                          type="button"
                          role="option"
                          aria-selected={highlightIndex === searchPlayers.length}
                          onMouseEnter={() =>
                            setHighlightIndex(searchPlayers.length)
                          }
                          onClick={selectNewPlayer}
                          className={`
                            w-full text-left px-4 py-3 transition-colors
                            ${
                              highlightIndex === searchPlayers.length
                                ? "bg-[#D4AF37]/10"
                                : "hover:bg-[#1A1A1A]"
                            }
                          `}
                        >
                          <span className="text-sm font-medium text-[#D4AF37]">
                            Create New Player: &lsquo;{trimmedQuery}&rsquo;
                          </span>
                          <span className="block text-[11px] text-[#777] mt-0.5">
                            Register as a new profile even if similar names exist
                          </span>
                        </button>
                      </li>
                    )}

                    {search.state === "ready" &&
                      searchPlayers.length === 0 &&
                      !showCreateNew && (
                        <li className="px-4 py-3 text-xs text-[#888]">
                          No matches — type at least 2 characters.
                        </li>
                      )}
                  </motion.ul>
                )}
            </AnimatePresence>
          </div>

          {/* MODE 2 — New player setup (slides open directly beneath name input) */}
          <AnimatePresence mode="wait">
            {uiMode === "new" && (
              <motion.div
                key="new-setup"
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="overflow-hidden"
              >
                <div className="pt-6 space-y-6">
                <div>
                  <label
                    htmlFor="facebookLink"
                    className="block text-sm font-medium text-[#C5A059] mb-2"
                  >
                    Facebook Profile Link{" "}
                    <span className="text-[#D4AF37]">*</span>
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
                    placeholder="Who referred this player?"
                  />
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-4 mb-3">
                    <label className="text-sm font-medium text-[#C5A059]">
                      Select Games <span className="text-[#D4AF37]">*</span>
                    </label>
                    {selectedGames.size > 0 && (
                      <span className="text-xs text-[#888] shrink-0">
                        {selectedGames.size} selected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#666] mb-3">
                    Tap to toggle. IDs are generated on submit.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {GAMES.map((game) => {
                      const isSelected = selectedGames.has(game.code);
                      return (
                        <button
                          key={game.code}
                          type="button"
                          onClick={() => toggleGame(game.code)}
                          aria-pressed={isSelected}
                          className={`
                            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all
                            ${
                              isSelected
                                ? "border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]"
                                : "border-[#2A2A2A] bg-[#0B0B0B] text-[#C5C5C5] hover:border-[#3A3A3A] hover:text-[#E5E5E5]"
                            }
                          `}
                        >
                          <span aria-hidden="true">{game.emoji}</span>
                          <span>{game.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!isNewFormValid}
                  className={`
                    w-full px-8 py-4 rounded-md font-semibold text-base tracking-wide transition-all
                    ${
                      isNewFormValid
                        ? "bg-[#D4AF37] text-[#0B0B0B] hover:bg-[#C5A059] shadow-xl shadow-[#D4AF37]/20 active:scale-[0.98]"
                        : "bg-[#2A2A2A] text-[#666] cursor-not-allowed"
                    }
                  `}
                >
                  Complete Registration & Get IDs
                </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* MODE 1 — Existing player */}
          <AnimatePresence mode="wait">
            {uiMode === "existing" && selectedPlayer && (
              <motion.div
                key="existing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <VerifiedPlayerCard
                  player={selectedPlayer}
                  copiedId={copiedId}
                  onCopy={copyToClipboard}
                  onBonusChange={handleBonusChange}
                  addingGame={addingGame}
                  inlineAddResult={inlineAddResult}
                  inlineAddError={inlineAddError}
                  onQuickAdd={quickAddGame}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </form>

      {showModal && (
        <ResultModal
          submit={submit}
          copiedId={copiedId}
          onCopy={copyToClipboard}
          onRetry={(p) => void register(p)}
          onClose={() => {
            setShowModal(false);
            if (submit.state === "saved") {
              resetToSearch();
            }
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Search dropdown option
// ---------------------------------------------------------------------------

function SearchResultOption({
  id,
  player,
  highlighted,
  onSelect,
  onHover,
}: {
  id: string;
  player: PlayerRecord;
  highlighted: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const initials = playerInitials(player.facebookName) || "?";

  return (
    <li role="presentation">
      <button
        id={id}
        type="button"
        role="option"
        aria-selected={highlighted}
        onMouseEnter={onHover}
        onClick={onSelect}
        className={`
          flex w-full items-center gap-3 px-4 py-3 text-left transition-colors
          ${
            highlighted
              ? "bg-[#D4AF37]/10"
              : "hover:bg-[#1A1A1A] active:bg-[#D4AF37]/10"
          }
        `}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-linear-to-br from-amber-500/20 to-amber-600/10 text-sm font-semibold text-amber-400 select-none"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-medium text-neutral-200">
          {player.facebookName}
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Verified player card (MODE 1)
// ---------------------------------------------------------------------------

function playerInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function VerifiedPlayerCard({
  player,
  copiedId,
  onCopy,
  onBonusChange,
  addingGame,
  inlineAddResult,
  inlineAddError,
  onQuickAdd,
}: {
  player: PlayerRecord;
  copiedId: string | null;
  onCopy: (text: string, key: string) => void;
  onBonusChange: (row: number, status: string) => void;
  addingGame: GameCode | null;
  inlineAddResult: { code: GameCode; id: string } | null;
  inlineAddError: string | null;
  onQuickAdd: (code: GameCode) => void;
}) {
  const ownedCodes = new Set(player.accounts.map((a) => a.code));
  const availableGames = GAMES.filter((g) => !ownedCodes.has(g.code));

  return (
    <section aria-label="Verified account" className="space-y-2">
      <article className="rounded-2xl border border-[#2A2A2A] bg-[#111111] p-5 shadow-[0_0_0_1px_rgba(212,175,55,0.06),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {player.facebookLink.trim() ? (
              <a
                href={player.facebookLink.trim()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${player.facebookName}'s Facebook profile`}
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-amber-500 to-amber-600 text-neutral-900 shadow-[0_2px_8px_rgba(245,158,11,0.35)] ring-2 ring-[#D4AF37]/30 transition-transform duration-200 hover:brightness-110 active:scale-95"
              >
                <span className="text-base font-bold tracking-wide select-none">
                  {playerInitials(player.facebookName) || "?"}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#111111] ring-1 ring-[#333]"
                >
                  <ArrowUpRight
                    size={11}
                    weight="bold"
                    className="text-[#D4AF37]"
                  />
                </span>
              </a>
            ) : (
              <div
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-amber-500 to-amber-600 text-neutral-900 shadow-[0_2px_8px_rgba(245,158,11,0.35)] ring-2 ring-[#D4AF37]/30"
              >
                <span className="text-base font-bold tracking-wide select-none">
                  {playerInitials(player.facebookName) || "?"}
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-semibold text-[#F2F2F2] truncate leading-tight">
              {player.facebookName}
            </h3>

            <p className="mt-0.5 text-xs leading-snug">
              <span className="text-[#666]">Referral:</span>{" "}
              <span className="text-[#B8B8B8]">
                {player.referredBy || "None"}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[#222222]">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Game IDs
            </span>
            {availableGames.length > 0 && (
              <AddGameMenu
                games={availableGames}
                addingGame={addingGame}
                onSelect={onQuickAdd}
              />
            )}
          </div>

          {player.accounts.length > 0 ? (
            <ul
              className="flex flex-wrap gap-2"
              aria-label="Active games"
            >
              {player.accounts.map((a) => {
                const key = `card-${a.code}`;
                const game = GAME_BY_CODE.get(a.code);
                const justAdded =
                  inlineAddResult?.code === a.code ? inlineAddResult.id : null;
                return (
                  <li key={a.code}>
                    <button
                      type="button"
                      onClick={() => onCopy(a.id, key)}
                      title={`${a.id} — click to copy`}
                      className={`
                        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] leading-5 transition-colors
                        ${
                          justAdded
                            ? "border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#D4AF37]"
                            : "border-[#333333] bg-[#0D0D0D] text-[#A8A8A8] hover:border-[#444444] hover:text-[#D4D4D4] hover:bg-[#151515]"
                        }
                      `}
                    >
                      {game && (
                        <span aria-hidden="true">{game.emoji}</span>
                      )}
                      <span>{a.platform}</span>
                      {copiedId === key ? (
                        <span className="text-[#D4AF37]">Copied</span>
                      ) : justAdded ? (
                        <span className="font-mono text-[10px]">{justAdded}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-neutral-500">
              No game IDs assigned yet. Click &ldquo;Add New Game ID&rdquo; to
              begin.
            </p>
          )}

          {inlineAddError && (
            <p className="mt-2 text-[11px] text-red-400" role="alert">
              {inlineAddError}
            </p>
          )}

          <AnimatePresence>
            {inlineAddResult && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-[11px] text-emerald-400/90"
              >
                Saved — {GAME_BY_CODE.get(inlineAddResult.code)?.name} ID
                created.
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <ReferralBonusToggle player={player} onChange={onBonusChange} />
      </article>
    </section>
  );
}

function AddGameMenu({
  games,
  addingGame,
  onSelect,
}: {
  games: readonly (typeof GAMES)[number][];
  addingGame: GameCode | null;
  onSelect: (code: GameCode) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!!addingGame}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/5 text-[11px] font-medium text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors disabled:opacity-60"
      >
        {addingGame ? (
          <>
            <span className="w-3 h-3 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
            Adding…
          </>
        ) : (
          <>+ Add New Game ID</>
        )}
      </button>

      <AnimatePresence>
        {open && !addingGame && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-30 mt-1.5 min-w-[11rem] max-h-52 overflow-y-auto rounded-lg border border-[#333] bg-[#111] shadow-xl py-1"
          >
            {games.map((game) => (
              <li key={game.code}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelect(game.code);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[#C5C5C5] hover:bg-[#1A1A1A] hover:text-[#E5E5E5] flex items-center gap-2 transition-colors"
                >
                  <span aria-hidden="true">{game.emoji}</span>
                  {game.name}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

const REFERRAL_BONUS_PAID_DATE = /Paid\s*\((\d{4}-\d{2}-\d{2})\)/;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function extractReferralBonusPaidDate(status: string): string | null {
  return status.match(REFERRAL_BONUS_PAID_DATE)?.[1] ?? null;
}

function formatReferralBonusPaidLabel(status: string): string | null {
  const isoDate = extractReferralBonusPaidDate(status);
  if (!isoDate) return null;

  const [year, monthStr, dayStr] = isoDate.split("-");
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (
    !year ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return `Paid on ${day}${ordinalSuffix(day)} ${MONTH_NAMES[month - 1]} ${year}`;
}

function ReferralBonusToggle({
  player,
  onChange,
}: {
  player: PlayerRecord;
  onChange: (row: number, status: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const status = player.referralBonus ?? "Pending";
  const paid = status.startsWith("Paid");
  const paidDateLabel = formatReferralBonusPaidLabel(status);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  async function toggle() {
    if (saving) return;
    const next: ReferralBonusToggleStatus = paid ? "Pending" : "Paid";
    const previous = status;
    setSaving(true);
    setError(null);
    setSavedFlash(false);
    onChange(player.row, next);
    try {
      const res = await fetch("/api/update-referral-bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          row: player.row,
          facebookName: player.facebookName,
          facebookLink: player.facebookLink || undefined,
          status: next,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Update failed (${res.status})`);
      }
      if (typeof data.referralBonus === "string") {
        onChange(data.row ?? player.row, data.referralBonus);
      }
      setSavedFlash(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedFlash(false), 2200);
    } catch (err) {
      onChange(player.row, previous);
      setError(err instanceof Error ? err.message : "Couldn't update bonus");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#222222]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Referral Bonus
        </span>
        <div className="flex flex-col items-end gap-0">
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {savedFlash && (
                <motion.span
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  className="text-[11px] font-medium text-emerald-400"
                >
                  Saved
                </motion.span>
              )}
            </AnimatePresence>
            <button
              type="button"
              role="switch"
              aria-checked={paid}
              aria-busy={saving}
              aria-label={`Referral bonus ${paid ? "Paid" : "Pending"}. Click to mark ${paid ? "Pending" : "Paid"}`}
              disabled={saving}
              onClick={() => void toggle()}
              className={`
                inline-flex items-center gap-2 rounded-full border pl-2.5 pr-1 py-1
                transition-all active:scale-[0.98] disabled:cursor-wait
                ${
                  paid
                    ? "border-[#D4AF37]/55 bg-[#D4AF37]/10"
                    : "border-[#3A3A3A] bg-[#0D0D0D]"
                }
              `}
            >
              <span
                className={`text-[11px] font-medium tracking-wide ${
                  paid ? "text-[#D4AF37]" : "text-[#8A8A8A]"
                }`}
              >
                {saving ? "Saving" : paid ? "Paid" : "Pending"}
              </span>
              <span
                aria-hidden="true"
                className={`
                  relative inline-flex h-5 w-9 shrink-0 items-center rounded-full
                  transition-colors duration-200
                  ${paid ? "bg-[#D4AF37]" : "bg-[#2A2A2A]"}
                `}
              >
                {saving ? (
                  <span className="absolute inset-0 m-auto h-3 w-3 rounded-full border-2 border-[#0B0B0B]/50 border-t-transparent animate-spin" />
                ) : (
                  <span
                    className={`
                      inline-block h-4 w-4 rounded-full bg-[#F2F2F2] shadow-sm
                      transition-transform duration-200
                      ${paid ? "translate-x-4.5" : "translate-x-0.5"}
                    `}
                  />
                )}
              </span>
            </button>
          </div>
          {paidDateLabel && (
            <p className="text-xs text-neutral-400 mt-1 ml-1">
              {paidDateLabel}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result modal
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
                <svg
                  className="w-8 h-8 text-[#0B0B0B]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8 text-[#0B0B0B]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
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
                    {GAME_BY_CODE.get(code)?.emoji}{" "}
                    {GAME_BY_CODE.get(code)?.name}
                  </p>
                  <div className="h-5 w-40 rounded bg-[#2A2A2A]" />
                </div>
              ))}
            </div>
          )}

          {saved && (
            <>
              <p className="text-sm font-medium text-[#C5A059] mb-4">
                {saved.isExisting
                  ? "IDs for this player:"
                  : "Your Generated IDs:"}
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
                        onClick={() =>
                          onCopy(account.generatedID, account.code)
                        }
                        className="shrink-0 p-3 rounded-lg border border-[#2A2A2A] hover:border-[#D4AF37] hover:bg-[#161616] transition-all group"
                        title="Copy ID"
                      >
                        {copiedId === account.code ? (
                          <svg
                            className="w-5 h-5 text-[#D4AF37]"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5 text-[#888] group-hover:text-[#D4AF37] transition-colors"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
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
                  {copiedId === "all"
                    ? "Copied all IDs"
                    : "Copy all IDs as text"}
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
    </div>
  );
}
