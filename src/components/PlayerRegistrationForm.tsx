"use client";

import { useEffect, useState } from "react";

type GameCode =
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

interface Game {
  code: GameCode;
  name: string;
  emoji: string;
  suffix: string;
  needsUnderscore: boolean;
}

const GAMES: Game[] = [
  {
    code: "FK",
    name: "Firekirin",
    emoji: "🔥",
    suffix: "fk",
    needsUnderscore: true,
  },
  {
    code: "JW",
    name: "Juwa",
    emoji: "🎲",
    suffix: "jw",
    needsUnderscore: true,
  },
  {
    code: "GV",
    name: "Gamevault",
    emoji: "🎮",
    suffix: "gv",
    needsUnderscore: true,
  },
  {
    code: "OS",
    name: "Orion Stars",
    emoji: "🌟",
    suffix: "os",
    needsUnderscore: true,
  },
  {
    code: "MW",
    name: "Milkyway",
    emoji: "🌌",
    suffix: "mw",
    needsUnderscore: true,
  },
  {
    code: "JW2",
    name: "Juwa 2.0",
    emoji: "🤑",
    suffix: "jw2",
    needsUnderscore: true,
  },
  {
    code: "GR",
    name: "Gameroom",
    emoji: "🕹️",
    suffix: "gr",
    needsUnderscore: false,
  },
  {
    code: "CM",
    name: "Cash Machine",
    emoji: "💸",
    suffix: "cm",
    needsUnderscore: false,
  },
  {
    code: "UP",
    name: "Ultra Panda",
    emoji: "🐼",
    suffix: "up",
    needsUnderscore: false,
  },
  {
    code: "YO",
    name: "YOLO",
    emoji: "🎯",
    suffix: "yo",
    needsUnderscore: false,
  },
  {
    code: "EG",
    name: "Egame",
    emoji: "🎰",
    suffix: "eg",
    needsUnderscore: false,
  },
  {
    code: "PM",
    name: "PandaMasters",
    emoji: "🐼",
    suffix: "pm",
    needsUnderscore: false,
  },
];

export function PlayerRegistrationForm() {
  const [facebookName, setFacebookName] = useState("");
  const [facebookLink, setFacebookLink] = useState("");
  const [referralName, setReferralName] = useState("");
  const [selectedGames, setSelectedGames] = useState<Set<GameCode>>(new Set());
  const [isClient, setIsClient] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [randomNumber, setRandomNumber] = useState<number>(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [generatedAccounts, setGeneratedAccounts] = useState<any[]>([]);

  useEffect(() => {
    setIsClient(true);
    // Generate random 2-3 digit number on mount
    setRandomNumber(Math.floor(Math.random() * 900) + 100);
  }, []);

  const toggleGame = (code: GameCode) => {
    const newSet = new Set(selectedGames);
    if (newSet.has(code)) {
      newSet.delete(code);
    } else {
      newSet.add(code);
    }
    setSelectedGames(newSet);
  };

  const deriveBaseUsername = (name: string): string =>
    name
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const generateUsername = (game: Game): string => {
    const base = deriveBaseUsername(facebookName);
    if (!base) return "";
    const connector = game.needsUnderscore ? "_" : "";
    return `${base}${randomNumber}${connector}${game.suffix}`;
  };

  const copyToClipboard = async (text: string, gameCode: GameCode) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(gameCode);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const accounts = Array.from(selectedGames).map((code) => {
      const game = GAMES.find((g) => g.code === code)!;
      return {
        platform: game.name,
        code: game.code,
        emoji: game.emoji,
        generatedID: generateUsername(game),
      };
    });

    const payload = {
      facebookName,
      facebookLink,
      referralName: referralName || null,
      accounts,
      timestamp: new Date().toISOString(),
    };

    console.log("📊 Syncing to Google Sheets:", payload);

    // Show success modal with generated IDs
    setGeneratedAccounts(accounts);
    setShowSuccessModal(true);

    // Reset form
    setFacebookName("");
    setFacebookLink("");
    setReferralName("");
    setSelectedGames(new Set());
    // Generate new random number for next registration
    setRandomNumber(Math.floor(Math.random() * 900) + 100);
  };

  const isFormValid =
    facebookName.trim() &&
    facebookLink.trim() &&
    deriveBaseUsername(facebookName).length > 0 &&
    selectedGames.size > 0;

  if (!isClient) {
    return null;
  }

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
              className="w-full px-4 py-3 border border-[#3A3A3A] rounded-md bg-[#0B0B0B] text-[#E5E5E5] placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
              placeholder="https://facebook.com/username"
              required
            />
          </div>

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
              className="w-full px-4 py-3 border border-[#3A3A3A] rounded-md bg-[#0B0B0B] text-[#E5E5E5] placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
              placeholder="Who referred this player?"
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
                </span>
              )}
            </div>
            <p className="text-xs text-[#666] mb-3">
              Tap to toggle. IDs generate from the Facebook name.
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
            Complete Registration & Get IDs
          </button>
        </div>
      </form>

      {/* Success Modal with Generated IDs */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-[#161616] border-2 border-[#D4AF37] rounded-2xl shadow-2xl shadow-[#D4AF37]/40 max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="bg-gradient-to-b from-[#D4AF37]/20 to-transparent p-6 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-full bg-[#D4AF37] flex items-center justify-center shrink-0">
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
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-[#D4AF37]">
                    Registration Complete!
                  </h3>
                  <p className="text-[#888] text-sm mt-1">
                    Your gaming IDs are ready
                  </p>
                </div>
              </div>
            </div>

            {/* Generated IDs */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <p className="text-sm font-medium text-[#C5A059] mb-4">
                Your Generated IDs:
              </p>
              <div className="space-y-3">
                {generatedAccounts.map((account, idx) => (
                  <div
                    key={idx}
                    className="bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg p-4 hover:border-[#D4AF37]/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#888] mb-1.5 flex items-center gap-2">
                          <span aria-hidden="true">{account.emoji}</span>
                          <span>{account.platform}</span>
                        </p>
                        <p className="text-base font-mono text-[#D4AF37] break-all font-semibold">
                          {account.generatedID}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(account.generatedID, account.code)}
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
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[#2A2A2A] bg-[#0B0B0B]">
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full px-6 py-3 bg-[#D4AF37] hover:bg-[#C5A059] text-[#0B0B0B] font-semibold rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-[#D4AF37]/20"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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
