// What every mode's page shares: the situation fields in the URL, and the page layout around the scorebug.

import type { ReactNode } from "react";
import { Group, Stack, Text } from "@mantine/core";
import type { BestCallSearch, LeadingSearch, TrailingSearch } from "@situational-football/schemas";
import type { GameState } from "./sim";
import { formatClock } from "./time";
import { spotFrom } from "./fields";

/** The search params every mode has. */
export type SharedSituation = Pick<
  LeadingSearch & TrailingSearch & BestCallSearch,
  "clock" | "running" | "timeouts" | "oppTimeouts" | "down" | "toGo" | "side" | "yardLine"
>;

/** The shared fields of a situation after a play, for writing back to the URL. */
export function sharedFromGame(g: GameState): SharedSituation {
  return {
    clock: formatClock(g.clock), running: g.running, timeouts: g.timeouts.you, oppTimeouts: g.timeouts.opp,
    down: g.down, toGo: g.toGo, ...spotFrom(g.ytg),
  };
}

/**
 * A mode's page: an optional switch or picker, its intro, then the situation as a scorebug (edited in
 * place) over full-width results. Nothing moves while you edit.
 */
export function ModeLayout({ intro, scorebug, toggle, actions, children }: {
  intro: string;
  /** Buttons beside the intro, e.g. a random situation. */
  actions?: ReactNode;
  scorebug: ReactNode;
  /** A switch or picker above everything else. */
  toggle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {toggle}
      {actions ? (
        <Group justify="space-between" align="center" gap="sm" mb="md" className="mode-intro">
          <Text c="dimmed" style={{ flex: "1 1 18rem" }}>{intro}</Text>
          {actions}
        </Group>
      ) : (
        <Text c="dimmed" mb="md">{intro}</Text>
      )}
      <Stack gap="lg">
        {scorebug}
        <section className="results" aria-live="polite" aria-label="Results">{children}</section>
      </Stack>
    </>
  );
}
