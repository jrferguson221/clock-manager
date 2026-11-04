// Readable team colors. A team's colors are used only where they pass WCAG contrast against the card
// they sit on, in each color scheme: 3:1 for a stripe or a chip's fill (non-text graphics), 4.5:1 for the
// text on a chip. Pure functions, so every team's palette can be checked in tests.

import { TEAM_COLORS } from "./teamColors";

/**
 * The card backgrounds, as rendered: white by day, and Mantine's dark-6 (one step lighter than the night
 * navy page) in the dark scheme. Checked in the browser: cards don't use the body color in the dark scheme.
 */
export const SURFACES = { light: "#ffffff", dark: "#222938" } as const;
export type Scheme = keyof typeof SURFACES;

/** WCAG minimums: graphics (a stripe, a chip's edge) and normal text. */
export const GRAPHIC_CONTRAST = 3;
export const TEXT_CONTRAST = 4.5;

type Rgb = readonly [number, number, number];

function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (m === null) throw new RangeError(`not a #rrggbb color: ${hex}`);
  const [, r = "0", g = "0", b = "0"] = m;
  return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)];
}

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colors, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** `a` mixed toward `b` by `t` (0: all `a`, 1: all `b`). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [parseHex(a), parseHex(b)];
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export interface TeamPalette {
  /** The team's color for a stripe or a chip on this scheme's cards: at least 3:1 against them. */
  accent: string;
  /** Text on the accent: black or white, whichever reads better (always at least 4.5:1). */
  onAccent: string;
  /** Whether the accent is one of the team's own colors, or one adjusted to be readable. */
  adjusted: boolean;
}

const NEUTRAL = "#6b768c";

/** Black, white and grays: colors with almost no hue, which say little about which team it is. */
export function isNeutral(hex: string): boolean {
  const [r, g, b] = parseHex(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 || (max - min) / max < 0.15;
}

/** The first mix of `color` toward `toward`, up to `limit`, that reaches 3:1 on `surface`; or null. */
function adjustToward(color: string, toward: string, surface: string, limit: number): string | null {
  for (let t = 0; t <= limit + 1e-9; t += 0.05) {
    const c = t === 0 ? color : mix(color, toward, t);
    if (contrast(c, surface) >= GRAPHIC_CONTRAST) return c;
  }
  return null;
}

/** How far a team's own color may be lightened or darkened and still read as that color. */
const RECOGNIZABLE = 0.4;

/**
 * The team color that reads on this scheme's cards, in order of preference:
 * 1. the primary color as it is;
 * 2. the primary lightened (dark scheme) or darkened (light scheme) by up to 40%, so it stays the team's hue;
 * 3. the team's other colors, as they are, with black, white and grays last;
 * 4. the primary adjusted as far as it takes.
 * A black or gray primary skips step 2: lightening black only gives gray.
 */
export function teamPalette(team: string, scheme: Scheme): TeamPalette {
  const surface = SURFACES[scheme];
  const toward = scheme === "dark" ? "#ffffff" : "#000000";
  const colors = TEAM_COLORS[team]?.colors ?? [NEUTRAL];
  const [primary = NEUTRAL, ...others] = colors;
  const readable = (c: string) => contrast(c, surface) >= GRAPHIC_CONTRAST;

  const pick: { color: string; adjusted: boolean } =
    readable(primary) ? { color: primary, adjusted: false }
    : (() => {
      const nearPrimary = isNeutral(primary) ? null : adjustToward(primary, toward, surface, RECOGNIZABLE);
      if (nearPrimary !== null) return { color: nearPrimary, adjusted: true };
      const other = others.find((c) => !isNeutral(c) && readable(c)) ?? others.find(readable);
      if (other !== undefined) return { color: other, adjusted: false };
      return { color: adjustToward(primary, toward, surface, 1) ?? toward, adjusted: true };
    })();

  const accent = pick.color;
  const onAccent = contrast(accent, "#000000") >= contrast(accent, "#ffffff") ? "#000000" : "#ffffff";
  return { accent, onAccent, adjusted: pick.adjusted };
}

/** The CSS custom properties a decision card sets for its team, for both schemes. */
export function teamStyle(team: string): Record<`--${string}`, string> {
  const light = teamPalette(team, "light");
  const dark = teamPalette(team, "dark");
  return {
    "--team-accent-light": light.accent,
    "--team-on-accent-light": light.onAccent,
    "--team-accent-dark": dark.accent,
    "--team-on-accent-dark": dark.onAccent,
  };
}

export const teamName = (team: string) => TEAM_COLORS[team]?.name ?? team;
