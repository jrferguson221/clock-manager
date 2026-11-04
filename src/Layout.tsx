// The page frame: the turf header with the mode tabs and the color-scheme toggle, and the active mode below.

import {
  ActionIcon, Anchor, Box, Container, Group, Stack, Tabs, Text, Title, useComputedColorScheme, useMantineColorScheme,
} from "@mantine/core";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";

const MODES = [
  { to: "/", short: "Leading", label: "Leading: run out the clock" },
  { to: "/trailing", short: "Trailing", label: "Trailing: drive to score" },
  { to: "/best-call", short: "Best call", label: "Best call" },
] as const;

export default function Layout() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const active = MODES.find((m) => m.to === pathname)?.to ?? null;

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
            <Box>
              <Title order={1} className="brand">Clock Manager</Title>
              <Text className="tagline">End-of-game clock decisions for American football</Text>
            </Box>
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
