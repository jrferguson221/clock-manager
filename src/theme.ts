// "Sideline" theme: pylon orange for actions, turf green for the field and for winning, chalk-white
// paper by day and a navy night-game palette under the lights. Condensed, scoreboard-style headings.

import {
  Alert, Badge, Button, Card, createTheme, NativeSelect, NumberInput, Paper, Progress, SegmentedControl, Switch,
  Table, Tabs, TextInput, Title, type CSSVariablesResolver, type MantineColorsTuple,
} from "@mantine/core";

/** Safety orange, like the pylons at the corners of the end zone. Shade 7 keeps 4.5:1 contrast with white. */
const pylon: MantineColorsTuple = [
  "#fff3e8", "#ffe2cc", "#ffc299", "#ffa061", "#ff8433", "#ff7214", "#f26405", "#c24a00", "#a14000", "#7f3100",
];

/** Natural-grass green, for the header field and for good outcomes. */
const turf: MantineColorsTuple = [
  "#e9f8ee", "#cdeed8", "#9fdcb5", "#6cc98f", "#43b86f", "#2aa95b", "#1e9650", "#157f43", "#0f6837", "#08502a",
];

/** Navy-charcoal for the dark scheme: a stadium at night rather than a neutral gray. */
const dark: MantineColorsTuple = [
  "#e6e9ef", "#c4cad6", "#9aa3b5", "#6b768c", "#3d475c", "#2c3446", "#222938", "#1a202c", "#141925", "#0d111a",
];

const DISPLAY = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';

export const theme = createTheme({
  colors: { pylon, turf, dark },
  primaryColor: "pylon",
  // One shade for fills in both schemes: white text on it keeps 4.9:1, and Mantine works out contrast per color, not per scheme.
  primaryShade: { light: 7, dark: 7 },
  // Light fills (dark-scheme orange, yellow badges) get dark text instead of white.
  autoContrast: true,
  luminanceThreshold: 0.3,
  white: "#ffffff",
  black: "#15191f",
  fontFamily: 'Barlow, system-ui, -apple-system, "Segoe UI", sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, monospace',
  headings: {
    fontFamily: DISPLAY,
    fontWeight: "700",
    textWrap: "balance",
    sizes: {
      h1: { fontSize: "2.25rem", lineHeight: "1" },
      h2: { fontSize: "1.5rem", lineHeight: "1.15" },
      h3: { fontSize: "1.25rem", lineHeight: "1.2" },
    },
  },
  fontSizes: { xs: "0.8125rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.375rem" },
  // Squared-off corners, like yard markers and scoreboards, rather than soft pills.
  radius: { xs: "2px", sm: "4px", md: "6px", lg: "10px", xl: "16px" },
  defaultRadius: "sm",
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  shadows: {
    xs: "0 1px 0 rgba(13, 17, 26, 0.06)",
    sm: "0 1px 2px rgba(13, 17, 26, 0.08), 0 2px 6px rgba(13, 17, 26, 0.05)",
    md: "0 2px 4px rgba(13, 17, 26, 0.08), 0 6px 16px rgba(13, 17, 26, 0.08)",
    lg: "0 4px 8px rgba(13, 17, 26, 0.1), 0 12px 28px rgba(13, 17, 26, 0.12)",
    xl: "0 8px 16px rgba(13, 17, 26, 0.12), 0 20px 44px rgba(13, 17, 26, 0.16)",
  },
  cursorType: "pointer",
  focusRing: "auto",
  respectReducedMotion: true,
  other: { displayFont: DISPLAY },
  components: {
    Button: Button.extend({
      defaultProps: { radius: "sm" },
      styles: { root: { fontFamily: DISPLAY, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 700 } },
    }),
    Card: Card.extend({ defaultProps: { withBorder: true, radius: "md", padding: "md", shadow: "xs" } }),
    Paper: Paper.extend({ defaultProps: { radius: "md" } }),
    Badge: Badge.extend({ defaultProps: { variant: "light", radius: "xs" } }),
    Alert: Alert.extend({ defaultProps: { variant: "light", radius: "md" } }),
    Title: Title.extend({ styles: { root: { textTransform: "uppercase", letterSpacing: "0.02em" } } }),
    TextInput: TextInput.extend({ defaultProps: { size: "md" } }),
    NumberInput: NumberInput.extend({ defaultProps: { size: "md", hideControls: true } }),
    NativeSelect: NativeSelect.extend({ defaultProps: { size: "md" } }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { size: "md", fullWidth: true, color: "pylon", autoContrast: true } }),
    Switch: Switch.extend({ defaultProps: { size: "md", color: "turf" } }),
    Progress: Progress.extend({ defaultProps: { radius: "xs" } }),
    Table: Table.extend({ defaultProps: { verticalSpacing: "xs", horizontalSpacing: "sm" } }),
    Tabs: Tabs.extend({
      styles: { tab: { fontFamily: DISPLAY, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase" } },
    }),
  },
});

/**
 * Cards use --mantine-color-body (white by day, night navy under the lights). The page behind them is
 * chalk or a darker navy, set in styles.css, so cards stand off it in both schemes.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-dimmed": "#5c6370",
    "--mantine-color-default-border": "#d6d4cb",
  },
  dark: {},
});
