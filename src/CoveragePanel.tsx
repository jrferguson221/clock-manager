// Beat the coverage: read the defense's pre-snap look, pick a pass concept, then see the coverage they
// actually played and how your call grades against it in this situation.

import { useEffect, useMemo, useRef, useState } from "react";
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
  // After the call, any option can be shown against the coverage; your call stays graded.
  const [viewing, setViewing] = useState<ConceptId | null>(null);
  const shown = viewing ?? picked;
  // The cards sit below the diagram: bring it into view when another play is shown.
  const diagram = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewing === null) return;
    const el = diagram.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [viewing]);
  // Every concept graded, and the ones offered in this rep, best first.
  const all = useMemo(() => gradeAll(rep.coverage, rep.situation), [rep]);
  const graded = useMemo(() => all.filter((g) => rep.options.includes(g.concept)), [all, rep]);
  const byConcept = useMemo(() => new Map(graded.map((g) => [g.concept, g])), [graded]);
  const top = graded[0]!.grade;
  const choose = (c: ConceptId) => {
    if (picked !== null) {
      setViewing(c);
      return;
    }
    setPicked(c);
    onGraded(byConcept.get(c)!.grade, top);
  };
  const cov = COVERAGES[rep.coverage];

  return (
    <Stack gap="lg">
      <Card ref={diagram}>
        <Text className="eyebrow">{picked === null ? "Pre-snap look" : "After the snap"}</Text>
        {shown === null ? (
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
              concept={shown} look={rep.look} coverage={rep.coverage} read={byConcept.get(shown)!.base.read} className="big"
              label={`${CONCEPTS[shown].name} against ${cov.name}: the routes in blue with the first read in green, the defense's drops in red.`}
            />
            <Text size="sm" mt="xs">
              <strong>{CONCEPTS[shown].name}{shown === picked ? " (your call)" : ""}, 1st read in green:</strong> {byConcept.get(shown)!.base.throw}.
            </Text>
            <Text className="eyebrow" mt="md">Where to attack {cov.name}</Text>
            <List spacing={4} size="sm" mt={4}>
              {cov.weaknesses.map((w) => <List.Item key={w}>{w}</List.Item>)}
            </List>
            <Text size="sm" mt="sm"><strong>The tell:</strong> {cov.tell}</Text>
            {rep.disguise !== null && <Text size="sm" mt={4}><strong>Disguised:</strong> {rep.disguise}</Text>}
          </>
        )}
      </Card>

      {picked !== null && shown !== null && (
        <Verdict g={byConcept.get(shown)!} yours={byConcept.get(picked)!} rep={rep} graded={graded} all={all} />
      )}

      <div>
        <Group justify="space-between" align="baseline" mb="xs">
          <Title order={2}>{picked === null ? "Call the play" : "Your options, graded"}</Title>
          <GuideLink section="coverages">How to read coverages</GuideLink>
        </Group>
        {picked !== null && (
          <Text size="sm" c="dimmed" mb="xs">Tap any play to see how it does against this coverage, and why.</Text>
        )}
        <SimpleGrid cols={{ base: 2, sm: rep.options.length }} spacing="sm" className="concept-grid">
          {rep.options.map((c) => {
            const g = byConcept.get(c)!;
            return (
              <UnstyledButton
                key={c} className="concept-card" onClick={() => choose(c)}
                aria-pressed={picked === null ? undefined : shown === c} data-picked={(picked !== null && shown === c) || undefined}
                aria-label={picked === null
                  ? `Call ${CONCEPTS[c].name}`
                  : `Show ${CONCEPTS[c].name}${picked === c ? ", your call" : ""}: ${GRADE_LABELS[g.grade]}`}
              >
                <PlayArt concept={c} label="" depth={24} />
                <Text className="concept-name">{CONCEPTS[c].name}</Text>
                {picked === null ? (
                  <Text size="xs" c="dimmed">{CONCEPTS[c].idea}</Text>
                ) : (
                  <Group gap={6}>
                    <Badge color={GRADE_COLORS[g.grade]} variant={shown === c ? "filled" : "light"}>{GRADE_LABELS[g.grade]}</Badge>
                    {picked === c && <Text size="xs" fw={700} className="your-call-tag">Your call</Text>}
                  </Group>
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

/**
 * Why a concept is good or bad against the coverage. For your call it's the verdict; for another option,
 * it's what would have happened instead, against your call's grade.
 */
function Verdict({ g, yours, rep, graded, all }: { g: Graded; yours: Graded; rep: Rep; graded: Graded[]; all: Graded[] }) {
  const isYours = g.concept === yours.concept;
  const top = graded[0]!.grade;
  const bests = graded.filter((x) => x.grade === top && x.concept !== g.concept);
  // Better calls that weren't among the options, so the rep still teaches the textbook answer.
  const notOffered = all.filter((x) => x.grade === all[0]!.grade && x.grade > top && !rep.options.includes(x.concept));
  const shownGrade = rep.shown !== null ? gradeAll(rep.shown, rep.situation).find((x) => x.concept === g.concept)!.grade : null;
  return (
    <Card className={`accent-card grade-${g.grade}${g.grade === top ? " best" : ""}`}>
      <Text className="eyebrow">{isYours ? "Your call" : "If you'd called it"}: {GRADE_LABELS[g.grade]}</Text>
      <Text className="verdict big">{CONCEPTS[g.concept].name}</Text>
      <Text>
        <strong>{g.base.grade >= 2 ? "Why it works" : "Why it struggles"} against {COVERAGES[rep.coverage].name}:</strong>{" "}
        {g.base.why} The throw: {g.base.throw}.
      </Text>
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
      {!isYours && (
        <Text size="sm" mt="xs">
          {g.grade > yours.grade
            ? `Better than your call, ${CONCEPTS[yours.concept].name} (${GRADE_LABELS[yours.grade]}).`
            : g.grade < yours.grade
              ? `Worse than your call, ${CONCEPTS[yours.concept].name} (${GRADE_LABELS[yours.grade]}).`
              : `As good as your call, ${CONCEPTS[yours.concept].name} (${GRADE_LABELS[yours.grade]}).`}
        </Text>
      )}
      {isYours && <Text size="sm" mt="xs" c="dimmed">
        {g.grade === top && bests.length === 0
          ? "The best of your options."
          : g.grade === top
            ? `Also ${GRADE_LABELS[top].toLowerCase()} of your options: ${bests.map((b) => CONCEPTS[b.concept].name).join(", ")}.`
            : `The best of your options: ${graded.filter((x) => x.grade === top).map((b) => CONCEPTS[b.concept].name).join(", ")} (${GRADE_LABELS[top]}).`}
        {notOffered.length > 0 && ` Not offered, but ${GRADE_LABELS[all[0]!.grade].toLowerCase()} here: ${notOffered.map((b) => CONCEPTS[b.concept].name).join(", ")}.`}
      </Text>}
    </Card>
  );
}
