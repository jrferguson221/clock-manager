// "Coach's playbook" theme: the laminated call sheet and the whiteboard. Ink-dark text on white sheets over a
// gridded whiteboard by day, chalk on slate in the film room at night. Color is dry-erase marker: blue for
// actions and your calls, green for the best call and winning, red for mistakes and losing, and a highlighter
// yellow for the one thing to read first. Condensed caps label every box, like a call sheet.

import {
  Accordion, Alert, Badge, Button, Card, createTheme, NativeSelect, NumberInput, Paper, Progress, SegmentedControl, Switch,
  Table, Tabs, TextInput, Title, type CSSVariablesResolver, type MantineColorsTuple,
} from "@mantine/core";

/** Blue dry-erase marker: primary actions, your call. Shade 7 is the ink of a fresh marker (8.6:1 with white). */
const blue: MantineColorsTuple = [
  "#ebf0fb", "#d3def6", "#a8bdee", "#7a9ae4", "#5480dc", "#3d6dd6", "#2c5cc8", "#2049a8", "#1a3c8a", "#122c68",
];

/** Green marker: the best call, a lead, a win. */
const green: MantineColorsTuple = [
  "#e7f5ec", "#c9e9d5", "#97d3ae", "#62bd86", "#3eab69", "#279c57", "#1a8549", "#126e3c", "#0e5a31", "#084424",
];

/** Red marker: the costly call, a deficit, a loss. */
const red: MantineColorsTuple = [
  "#fcebeb", "#f7d2d2", "#eea4a5", "#e57577", "#dd4d51", "#d83a3e", "#c52a2f", "#a52126", "#871b1f", "#661316",
];

/** Highlighter yellow, for the line to read first. Light shades are the highlight; dark ones read as text. */
const yellow: MantineColorsTuple = [
  "#fffbe0", "#fff5b3", "#ffee80", "#ffe74d", "#ffe12a", "#f5d00d", "#c9a800", "#8f7700", "#6b5900", "#4d4000",
];

/** Slate for the film room: a chalkboard after the lights go down, cool and a little green-blue, never pure gray. */
const dark: MantineColorsTuple = [
  "#e6eaed", "#c6cdd3", "#a1abb4", "#76838f", "#4b5864", "#3a4550", "#2d3741", "#222a32", "#1a2128", "#12171c",
];

/** Ink: the marker-black every label and number is written in. */
const INK = "#1a2030";
const DISPLAY = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';

export const theme = createTheme({
  colors: { blue, green, red, yellow, dark },
  primaryColor: "blue",
  primaryShade: { light: 7, dark: 6 },
  autoContrast: true,
  luminanceThreshold: 0.3,
  white: "#ffffff",
  black: INK,
  fontFamily: 'Barlow, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, monospace',
  headings: {
    fontFamily: DISPLAY,
    fontWeight: "700",
    textWrap: "balance",
    sizes: {
      h1: { fontSize: "2.25rem", lineHeight: "1" },
      h2: { fontSize: "1.625rem", lineHeight: "1.1" },
      h3: { fontSize: "1.3125rem", lineHeight: "1.15" },
      h4: { fontSize: "1.125rem", lineHeight: "1.25" },
    },
  },
  fontSizes: { xs: "0.8125rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.375rem" },
  // Laminated sheets and whiteboard tape: barely rounded.
  radius: { xs: "1px", sm: "2px", md: "3px", lg: "6px", xl: "10px" },
  defaultRadius: "sm",
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  // A sheet lying on the board: short, soft, offset down.
  shadows: {
    xs: "0 1px 0 rgba(26, 32, 48, 0.07), 0 1px 3px rgba(26, 32, 48, 0.05)",
    sm: "0 1px 2px rgba(26, 32, 48, 0.08), 0 2px 6px rgba(26, 32, 48, 0.06)",
    md: "0 2px 4px rgba(26, 32, 48, 0.08), 0 6px 16px rgba(26, 32, 48, 0.08)",
    lg: "0 4px 8px rgba(26, 32, 48, 0.1), 0 12px 28px rgba(26, 32, 48, 0.12)",
    xl: "0 8px 16px rgba(26, 32, 48, 0.12), 0 20px 44px rgba(26, 32, 48, 0.16)",
  },
  cursorType: "pointer",
  focusRing: "auto",
  respectReducedMotion: true,
  other: { displayFont: DISPLAY },
  components: {
    Button: Button.extend({
      defaultProps: { radius: "sm" },
      styles: { root: { fontFamily: DISPLAY, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 700 } },
    }),
    Card: Card.extend({ defaultProps: { withBorder: true, radius: "sm", padding: "md", shadow: "xs" } }),
    Paper: Paper.extend({ defaultProps: { radius: "sm" } }),
    Badge: Badge.extend({
      defaultProps: { variant: "light", radius: "xs" },
      styles: { root: { fontFamily: DISPLAY, letterSpacing: "0.06em", border: "1px solid currentColor" } },
    }),
    Alert: Alert.extend({ defaultProps: { variant: "light", radius: "sm" } }),
    Title: Title.extend({ styles: { root: { textTransform: "uppercase", letterSpacing: "0.03em" } } }),
    TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: "md", hideControls: true } }),
    NativeSelect: NativeSelect.extend({ defaultProps: { size: "md" } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { size: "md", fullWidth: true, color: "blue", autoContrast: true } }),
    Switch: Switch.extend({ defaultProps: { size: "md", color: "green" } }),
    Progress: Progress.extend({ defaultProps: { radius: 0 } }),
    Table: Table.extend({ defaultProps: { verticalSpacing: "xs", horizontalSpacing: "sm" } }),
    Accordion: Accordion.extend({
      styles: { label: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" } },
    }),
    Tabs: Tabs.extend({
      styles: { tab: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" } },
    }),
  },
});

/**
 * Sheets (cards) use --mantine-color-body: white laminate by day, a lifted slate under the film-room lights.
 * The whiteboard behind them is set in styles.css. Text-on-tint colors are pushed a shade darker by day and
 * lighter at night, so every marker color keeps 4.5:1 as text.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--sheet-ink": INK,
  },
  light: {
    "--mantine-color-body": "#fffffc",
    "--mantine-color-text": INK,
    "--mantine-color-dimmed": "#555d6b",
    "--mantine-color-default-border": "#c3c0b5",
    "--mantine-color-anchor": "var(--mantine-color-blue-7)",
    "--mantine-color-green-light-color": "var(--mantine-color-green-8)",
    "--mantine-color-red-light-color": "var(--mantine-color-red-7)",
    "--mantine-color-blue-light-color": "var(--mantine-color-blue-8)",
    "--mantine-color-yellow-light": "rgba(255, 225, 42, 0.22)",
    "--mantine-color-yellow-light-color": "var(--mantine-color-yellow-9)",
    "--mantine-color-yellow-outline": "var(--mantine-color-yellow-8)",
    "--mantine-color-gray-light-color": "#454c58",
    "--sheet-rule": "#1a2030",
    "--sheet-grid": "rgba(32, 73, 168, 0.075)",
    "--board": "#ecebe6",
    "--highlight": "rgba(255, 225, 42, 0.8)",
  },
  dark: {
    "--mantine-color-body": "#222a32",
    "--mantine-color-text": "#e6eaed",
    "--mantine-color-dimmed": "#a8b2bb",
    "--mantine-color-default-border": "#45515c",
    "--mantine-color-anchor": "var(--mantine-color-blue-2)",
    "--mantine-color-blue-text": "var(--mantine-color-blue-2)",
    "--mantine-color-green-text": "var(--mantine-color-green-3)",
    "--mantine-color-red-text": "var(--mantine-color-red-3)",
    "--mantine-color-blue-light-color": "var(--mantine-color-blue-2)",
    "--mantine-color-green-light-color": "var(--mantine-color-green-3)",
    "--mantine-color-red-light-color": "var(--mantine-color-red-2)",
    "--mantine-color-yellow-light-color": "var(--mantine-color-yellow-3)",
    "--mantine-color-gray-light-color": "var(--mantine-color-dark-1)",
    "--mantine-color-blue-outline": "var(--mantine-color-blue-3)",
    "--mantine-color-green-outline": "var(--mantine-color-green-4)",
    "--mantine-color-red-outline": "var(--mantine-color-red-4)",
    "--mantine-color-gray-outline": "var(--mantine-color-dark-2)",
    "--sheet-rule": "#c6cdd3",
    "--sheet-grid": "rgba(230, 234, 237, 0.045)",
    "--board": "#151b20",
    // At night the stroke sits under the letters, never behind them, so it can be full strength.
    "--highlight": "#e9c925",
  },
});
