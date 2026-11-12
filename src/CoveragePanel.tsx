// Beat the coverage: read the defense's pre-snap look, pick a pass concept, then see the coverage they
// actually played and how your call grades against it in this situation.

import { useMemo, useState } from "react";
import { Badge, Button, Card, Group, List, SimpleGrid, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { getRouteApi } from "@tanstack/react-router";
import {
  CONCEPTS, COVERAGES, FIRST_REP, GRADE_LABELS, gradeAll, makeRep,
  type ConceptId, type Grade, type Graded, type Rep,
} from "./coverage";
import { GameBug } from "./Scorebug";
import { ModeLayout } from "./SituationForm";
import { GuideLink } from "./ReadMore";
import { formatClock } from "./time";
import PlayArt from "./PlayArt";

const route = getRouteApi("/coverage");

/** Each grade's marker color: green for the best call, blue for a good one, then yellow and red. */
export const GRADE_COLORS: Readonly<Record<Grade, string>> = { 3: "green", 2: "blue", 1: "yellow", 0: "red" };

const YOU = { abbr: "YOU", name: "Your offense", points: null, plate: { background: "var(--mantine-color-blue-7)", color: "#fff" } };
const DEF = { abbr: "DEF", name: "The defense", points: null, plate: { background: "#1a2030", color: "#fff" } };

/** A new rep's seed: random, so the order of reps can't be learned. */
const nextSeed = (current: number) => {
  const n = 1 + Math.floor(Math.random() * 999_999);
  return n === current ? (n % 999_999) + 1 : n;
};

export default function CoveragePanel() {
  const { rep: seed = FIRST_REP } = route.useSearch();
  const navigate = route.useNavigate();
  const [tally, setTally] = useState({ reps: 0, best: 0, points: 0 });
  const rep = useMemo(() => makeRep(seed), [seed]);
  const s = rep.situation;

  const scorebug = (
    <GameBug
      offense={{ ...YOU, timeouts: s.timeouts }} defense={{ ...DEF, timeouts: s.oppTimeouts }}
      margin={s.margin} clock={formatClock(s.clock)} running={s.running} down={s.down} toGo={s.toGo} ytg={s.ytg}
    />
  );

  return (
    <ModeLayout
      intro="Read the defense before the snap, then pick a pass concept. You'll see the coverage they really played, and how your call grades against it in this situation."
      scorebug={scorebug}
    >
      <RepView
        key={seed} rep={rep}
        onGraded={(g, best) => setTally((t) => ({ reps: t.reps + 1, best: t.best + (g === best ? 1 : 0), points: t.points + g }))}
        onNext={() => void navigate({ search: { rep: nextSeed(seed) }, resetScroll: false })}
        tally={tally}
      />
    </ModeLayout>
  );
}

function RepView({ rep, onGraded, onNext, tally }: {
  rep: Rep;
  onGraded: (grade: Grade, best: Grade) => void;
  onNext: () => void;
  tally: { reps: number; best: number; points: number };
}) {
  const [picked, setPicked] = useState<ConceptId | null>(null);
  // Every concept graded, and the ones offered in this rep, best first.
  const all = useMemo(() => gradeAll(rep.coverage, rep.situation), [rep]);
  const graded = useMemo(() => all.filter((g) => rep.options.includes(g.concept)), [all, rep]);
  const byConcept = useMemo(() => new Map(graded.map((g) => [g.concept, g])), [graded]);
  const top = graded[0]!.grade;
  const choose = (c: ConceptId) => {
    if (picked !== null) return;
    setPicked(c);
    onGraded(byConcept.get(c)!.grade, top);
  };
  const cov = COVERAGES[rep.coverage];

  return (
    <Stack gap="lg">
      <Card>
        <Text className="eyebrow">{picked === null ? "Pre-snap look" : "After the snap"}</Text>
        {picked === null ? (
          <>
            <PlayArt formation="doubles" look={rep.look} label="The defense's alignment before the snap, against two receivers on each side." className="big" />
            <Text size="sm" c="dimmed" mt="xs">
              C: cornerback, S: safety, N: nickel back, W and M: linebackers, E and T: linemen. Count the deep safeties,
              then check the corners' depth. Some looks are disguised.
            </Text>
          </>
        ) : (
          <>
            <Title order={2} mt={4}>{cov.name}</Title>
            <Text mt={4}>{cov.summary}</Text>
            <PlayArt
              concept={picked} look={rep.look} coverage={rep.coverage} read={byConcept.get(picked)!.base.read} className="big"
              label={`${CONCEPTS[picked].name} against ${cov.name}: your routes in blue with the first read in green, the defense's drops in red.`}
            />
            <Text size="sm" mt="xs"><strong>1st read, in green:</strong> {byConcept.get(picked)!.base.throw}.</Text>
            <Text className="eyebrow" mt="md">Where to attack {cov.name}</Text>
            <List spacing={4} size="sm" mt={4}>
              {cov.weaknesses.map((w) => <List.Item key={w}>{w}</List.Item>)}
            </List>
            <Text size="sm" mt="sm"><strong>The tell:</strong> {cov.tell}</Text>
            {rep.disguise !== null && <Text size="sm" mt={4}><strong>Disguised:</strong> {rep.disguise}</Text>}
          </>
        )}
      </Card>

      {picked !== null && <Verdict g={byConcept.get(picked)!} rep={rep} graded={graded} all={all} />}

      <div>
        <Group justify="space-between" align="baseline" mb="xs">
          <Title order={2}>{picked === null ? "Call the play" : "Your options, graded"}</Title>
          <GuideLink section="coverages">How to read coverages</GuideLink>
        </Group>
        <SimpleGrid cols={{ base: 2, sm: rep.options.length }} spacing="sm" className="concept-grid">
          {rep.options.map((c) => {
            const g = byConcept.get(c)!;
            return (
              <UnstyledButton
                key={c} className="concept-card" onClick={() => choose(c)} disabled={picked !== null && picked !== c}
                aria-pressed={picked === c} data-picked={picked === c || undefined}
                aria-label={picked === null ? `Call ${CONCEPTS[c].name}` : `${CONCEPTS[c].name}: ${GRADE_LABELS[g.grade]}`}
              >
                <PlayArt concept={c} label="" depth={24} />
                <Text className="concept-name">{CONCEPTS[c].name}</Text>
                {picked === null ? (
                  <Text size="xs" c="dimmed">{CONCEPTS[c].idea}</Text>
                ) : (
                  <Badge color={GRADE_COLORS[g.grade]} variant={picked === c ? "filled" : "light"}>{GRADE_LABELS[g.grade]}</Badge>
                )}
              </UnstyledButton>
            );
          })}
        </SimpleGrid>
      </div>

      {picked !== null && (
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            This session: {tally.reps} rep{tally.reps === 1 ? "" : "s"}, the best call {tally.best} time{tally.best === 1 ? "" : "s"}.
          </Text>
          <Button onClick={onNext}>Next rep</Button>
        </Group>
      )}

      <Text size="xs" c="dimmed">
        Grades are coaching rules of thumb, not numbers from the win-probability model: public play-by-play records the
        coverage on some plays but not the route concept. The situation can lower a grade: a throw short of the line to
        gain on 3rd or 4th down, deep routes in the red zone, or a catch in the middle with no timeouts late.
      </Text>
    </Stack>
  );
}

function Verdict({ g, rep, graded, all }: { g: Graded; rep: Rep; graded: Graded[]; all: Graded[] }) {
  const top = graded[0]!.grade;
  const bests = graded.filter((x) => x.grade === top && x.concept !== g.concept);
  // Better calls that weren't among the options, so the rep still teaches the textbook answer.
  const notOffered = all.filter((x) => x.grade === all[0]!.grade && x.grade > top && !rep.options.includes(x.concept));
  const shownGrade = rep.shown !== null ? gradeAll(rep.shown, rep.situation).find((x) => x.concept === g.concept)!.grade : null;
  return (
    <Card className={`accent-card grade-${g.grade}${g.grade === top ? " best" : ""}`}>
      <Text className="eyebrow">Your call: {GRADE_LABELS[g.grade]}</Text>
      <Text className="verdict big">{CONCEPTS[g.concept].name}</Text>
      <Text><strong>Against {COVERAGES[rep.coverage].name}:</strong> {g.base.why} The throw: {g.base.throw}.</Text>
      {g.notes.length > 0 && (
        <>
          <Text mt="xs"><strong>In this situation</strong> ({GRADE_LABELS[g.base.grade]} on its own, {GRADE_LABELS[g.grade]} here):</Text>
          <List spacing={2} size="sm">{g.notes.map((n) => <List.Item key={n}>{n}</List.Item>)}</List>
        </>
      )}
      {shownGrade !== null && shownGrade !== g.grade && (
        <Text size="sm" mt="xs">
          Against the {COVERAGES[rep.shown!].name} they showed, it would have been {GRADE_LABELS[shownGrade]}.
        </Text>
      )}
      <Text size="sm" mt="xs" c="dimmed">
        {g.grade === top && bests.length === 0
          ? "The best of your options."
          : g.grade === top
            ? `Also ${GRADE_LABELS[top].toLowerCase()} of your options: ${bests.map((b) => CONCEPTS[b.concept].name).join(", ")}.`
            : `The best of your options: ${graded.filter((x) => x.grade === top).map((b) => CONCEPTS[b.concept].name).join(", ")} (${GRADE_LABELS[top]}).`}
        {notOffered.length > 0 && ` Not offered, but ${GRADE_LABELS[all[0]!.grade].toLowerCase()} here: ${notOffered.map((b) => CONCEPTS[b.concept].name).join(", ")}.`}
      </Text>
    </Card>
  );
}
