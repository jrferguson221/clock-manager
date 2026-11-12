// The page frame: the call-sheet header (an X-and-O mark, the title, the binder-tab modes) and the color-scheme toggle, and the active mode below.

import {
  ActionIcon, Anchor, Box, Container, Group, Stack, Tabs, Text, Title, useComputedColorScheme, useMantineColorScheme,
} from "@mantine/core";
import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";

/** The header's tabs. The trainer's tab covers both its pages: leading and trailing, switched at the top. */
const MODES = [
  { to: "/", short: "Trainer", label: "Play-calling trainer", also: "/trailing" },
  { to: "/best-call", short: "Best call", label: "Best call" },
  { to: "/two-point", short: "Go for 2?", label: "Kick or go for 2" },
  { to: "/scenarios", short: "Players", label: "Player decisions" },
  { to: "/coverage", short: "Coverage", label: "Beat the coverage" },
  { to: "/decisions", short: "Week", label: "Decisions of the week" },
  { to: "/guide", short: "Guide", label: "Strategy guide" },
] as const;

export default function Layout() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const active = MODES.find((m) => m.to === pathname || ("also" in m && m.also === pathname))?.to ?? null;

  // On a phone the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    document.querySelector(".mode-tab[data-active]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <Tabs
      value={active}
      onChange={(value) => {
        const mode = MODES.find((m) => m.to === value);
        if (mode) void navigate({ to: mode.to });
      }}
      variant="unstyled"
      classNames={{ list: "mode-tabs", tab: "mode-tab" }}
    >
      <header className="field-header">
        <Container size="xl" px={{ base: "sm", sm: "lg" }}>
          <Group justify="space-between" align="center" wrap="nowrap" pt={{ base: "md", sm: "lg" }} pb="sm">
            <Group gap="sm" wrap="nowrap" align="center">
              <PlayMark />
              <Box>
                <Title order={1} className="brand">Situational Football</Title>
                <Text className="tagline">Late-game strategy for American football</Text>
              </Box>
            </Group>
            <ColorSchemeToggle />
          </Group>
          <Tabs.List aria-label="Mode">
            {MODES.map((m) => (
              <Tabs.Tab key={m.to} value={m.to}>
                <Box component="span" hiddenFrom="sm">{m.short}</Box>
                <Box component="span" visibleFrom="sm">{m.label}</Box>
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Container>
      </header>
      <Container component="main" size="xl" px={{ base: "sm", sm: "lg" }} py="lg">
        {active === null ? <Outlet /> : <Tabs.Panel value={active}><Outlet /></Tabs.Panel>}
      </Container>
    </Tabs>
  );
}

export function NotFound() {
  return (
    <Stack gap="xs">
      <Title order={2}>Page not found</Title>
      <Text>
        There's nothing at this address. <Anchor component={Link} to="/">Go to the run-out-the-clock mode</Anchor>.
      </Text>
    </Stack>
  );
}

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  // Read after mount, so the server render and the first client render agree.
  const computed = useComputedColorScheme("light", { getInitialValueInEffect: true });
  const next = computed === "dark" ? "light" : "dark";
  return (
    <ActionIcon
      onClick={() => setColorScheme(next)}
      variant="subtle" color="gray" size="xl" className="scheme-toggle"
      aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
    >
      {computed === "dark" ? <SunIcon /> : <MoonIcon />}
    </ActionIcon>
  );
}

/** The brand mark: an O, its dashed route, and the X it beats, as drawn on a whiteboard. */
function PlayMark() {
  return (
    <svg className="play-mark" viewBox="0 0 48 48" aria-hidden focusable="false">
      <circle cx="12" cy="34" r="7" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M18 28 C24 20 28 16 36 13" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="4 4" strokeLinecap="round" />
      <path d="M31 9l6 4-5 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M33 30l9 9M42 30l-9 9" stroke="var(--mantine-color-red-4)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

const iconProps = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
} as const;

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
