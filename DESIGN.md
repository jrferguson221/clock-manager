# Situational Football: "Coach's playbook"

The game-day materials: laminated call sheets clipped over a gridded whiteboard, an ink header like the top of
the sheet, and marker color that means something. Operate surfaces first; the guide reads like a numbered playbook.

## Color (src/theme.ts)
- **Ink** `#1a2030`: text, box title bars, the header, table head rules.
- **Board** light `#ecebe6` with a 24px printed grid; dark ("film room") `#151b20` with a chalk grid.
- **Sheets** (`--mantine-color-body`): light `#fffffc`, dark slate `#222a32`.
- **Marker blue** (`blue`, primary, shade 7 light / 6 dark): actions, selection, your call.
- **Marker green** (`green`): the best call, a lead, a win. **Marker red** (`red`): costly calls, deficits.
- **Highlighter yellow** (`--highlight`): the answer (big verdicts), the open tab, focus at night.
- Text-on-tint vars are overridden per scheme so every marker color is AA as text.

## Type
Barlow for body and data; Barlow Condensed 600/700 in tracked caps for box labels, field labels, buttons,
tabs, headings and big figures. Tabular figures everywhere (`body { font-variant-numeric: tabular-nums }`).

## Signature details
- A card's first `.eyebrow` becomes the box's ink title bar (green/blue on the sheet that carries the call).
- Big verdicts get a highlighter stroke (a pulled-up underline; below the letters at night).
- Progress tracks are scales with a tick every 10%; call-value rows are split by dashed rules.
- Calls you can't make are crossed off: dashed border, hatch, strikethrough.
- The scorebug stays the broadcast "TV" in slate, with your plate and end zone in marker blue and a dashed
  route from the ball to the line to gain.
- Guide sections and contents are numbered 01-16 in reading order.

## Rules
Radii 1-3px. Short soft shadows only. No side-stripe borders: emphasis is a full marker outline, a title bar,
or a top band of team color. Focus: 2px blue-7 by day, yellow-4 at night and on the ink header.
