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
