// Shown while a week of decisions loads, or if it can't be loaded. Small, so they stay in the main bundle.

import { Alert, Loader, Stack, Text } from "@mantine/core";
import type { ErrorComponentProps } from "@tanstack/react-router";

export function DecisionsPending() {
  return (
    <Stack align="center" py="xl" gap="xs">
      <Loader color="pylon" aria-label="Loading" />
      <Text c="dimmed">Loading the week's decisions…</Text>
    </Stack>
  );
}

export function DecisionsError({ error }: ErrorComponentProps) {
  return (
    <Alert color="red" title="The decisions couldn't be loaded">
      {error instanceof Error ? error.message : "Something went wrong."} Try reloading the page.
    </Alert>
  );
}
