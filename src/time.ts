// Parse and format game-clock strings like "2:05".

export function parseClock(str: string): number | null {
  const m = str.trim().match(/^(\d{1,2}):([0-5]\d)$|^(\d+)$/);
  if (!m) return null;
  return m[3] != null ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Format typed clock input as M:SS, filling from the right like a microwave: "5" → "0:05",
 * "130" → "1:30", "1500" → "15:00". Non-digits are ignored, so pasting "2:05" works too.
 */
export function formatClockDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4);
  if (digits === "") return "";
  const padded = digits.padStart(3, "0");
  return `${Number(padded.slice(0, -2))}:${padded.slice(-2)}`;
}
