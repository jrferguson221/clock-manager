// The hurry-up assumption: seconds from the end of an in-bounds play to a no-huddle snap. It changes the
// simulation and the rules of thumb, but it's a team-by-team assumption, not part of the game situation, so
// it sits with the page's footnotes rather than on the scorebug.

import { Group, NativeSelect, Text } from "@mantine/core";
import { LIMITS } from "@situational-football/schemas";

const OPTIONS = Array.from({ length: LIMITS.hurryUp.max - LIMITS.hurryUp.min + 1 }, (_, i) => {
  const n = LIMITS.hurryUp.min + i;
  return { value: String(n), label: `${n} seconds` };
});

export default function HurryUpSetting({ value, onChange }: { value: number; onChange: (seconds: number) => void }) {
  return (
    <Group gap="xs" wrap="nowrap" className="hurry-up-setting">
      <Text size="xs" c="dimmed" component="label" htmlFor="hurry-up">Hurry-up:</Text>
      <NativeSelect
        id="hurry-up" size="xs" w={120} aria-label="Hurry-up time in seconds"
        value={String(value)} data={OPTIONS} onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <Text size="xs" c="dimmed">from the end of an in-bounds play to the next snap, when you're hurrying.</Text>
    </Group>
  );
}
