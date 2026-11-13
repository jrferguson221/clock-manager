// Play art on a whiteboard: the offense's formation and routes, the defense's pre-snap look, and (after the
// snap) where each defender goes. Drawn in yards: x across the field from the ball, y downfield.

import { useId } from "react";
import {
  CONCEPTS, COVERAGES, DEFENDER_IDS, DEFENDER_LABELS, FORMATIONS, LINE, QB,
  type ConceptId, type CoverageId, type DefenderId, type FormationId, type Point, type ReceiverId,
} from "./coverage";

/** The field drawn: sideline to sideline, and from behind the quarterback to deep downfield. */
const X0 = -26.7, X1 = 26.7;

const pts = (p: readonly Point[], top: number) => p.map(([x, y]) => `${(x - X0).toFixed(2)},${(top - y).toFixed(2)}`).join(" ");

export interface PlayArtProps {
  /** The concept to draw; with none, the formation stands with no routes. */
  concept?: ConceptId;
  /** Formation when there's no concept. */
  formation?: FormationId;
  /** The defense's alignment before the snap. */
  look?: Readonly<Record<DefenderId, Point>>;
  /** The coverage to draw after the snap: zones, man assignments and rushers. */
  coverage?: CoverageId;
  /** The first read: that route is highlighted and labeled, the others dimmed. */
  read?: ReceiverId;
  /** Downfield yards shown. */
  depth?: number;
  label: string;
  className?: string;
}

export default function PlayArt({ concept, formation, look, coverage, read, depth = 27, label, className }: PlayArtProps) {
  const id = useId().replace(/:/g, "");
  const top = depth;
  const bottom = -7;
  const height = top - bottom;
  const at = ([x, y]: Point) => ({ x: x - X0, y: top - y });
  const f: FormationId = concept ? CONCEPTS[concept].formation : formation ?? "doubles";
  const receivers = FORMATIONS[f];
  const routes = concept ? CONCEPTS[concept].routes : {};
  const cov = coverage ? COVERAGES[coverage] : null;
  /**
   * A zone's label goes at the top of its ellipse, or else the bottom or the middle, wherever no defender's
   * letter sits on it (sizes are in yards: a label is about 0.76 wide per character).
   */
  const labelY = (center: Point, size: Point, text: string) => {
    const half = text.length * 0.38;
    const spots = [center[1] + size[1] / 2 - 1.6, center[1] - size[1] / 2 + 1.1, center[1] - 0.5];
    const clear = (y: number) => !look || !Object.values(look).some(([dx, dy]) => Math.abs(dx - center[0]) < half + 0.5 && Math.abs(dy - y) < 1.8);
    return top - (spots.find(clear) ?? spots[0]!);
  };
  const yardLines = Array.from({ length: Math.floor(depth / 5) + 1 }, (_, i) => i * 5).filter((y) => y > 0 && y < depth);

  return (
    <svg
      viewBox={`0 0 ${X1 - X0} ${height}`} role="img" aria-label={label}
      className={`play-art ${className ?? ""}`} preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="pa-arrowhead" />
        </marker>
        <marker id={`${id}-rarrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="pa-arrowhead-read" />
        </marker>
        <marker id={`${id}-darrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="pa-arrowhead-def" />
        </marker>
      </defs>
      <rect x={0} y={0} width={X1 - X0} height={height} className="pa-field" />
      {yardLines.map((y) => <line key={y} x1={0} x2={X1 - X0} y1={top - y} y2={top - y} className="pa-yardline" />)}
      {/* Hash marks, 9.25 yards either side of the middle in the NFL. */}
      {Array.from({ length: depth + 7 }, (_, i) => i - 7).map((y) => (
        <g key={`h${y}`} className="pa-hash">
          <line x1={-3.1 - X0 - 0.5} x2={-3.1 - X0 + 0.5} y1={top - y} y2={top - y} />
          <line x1={3.1 - X0 - 0.5} x2={3.1 - X0 + 0.5} y1={top - y} y2={top - y} />
        </g>
      ))}
      <line x1={0} x2={X1 - X0} y1={top} y2={top} className="pa-los" />

      {/* After the snap: zones under everything else, then each defender's path. */}
      {cov && DEFENDER_IDS.map((d) => {
        const a = cov.assignments[d];
        if (a.kind !== "zone") return null;
        const c = at(a.at);
        return (
          <g key={`z${d}`} className={`pa-zone ${a.label.startsWith("Deep") ? "deep" : "under"}`}>
            <ellipse cx={c.x} cy={c.y} rx={a.size[0] / 2} ry={a.size[1] / 2} />
            <text x={c.x} y={labelY(a.at, a.size, a.label)} className="pa-zone-label">{a.label}</text>
          </g>
        );
      })}
      {cov && look && DEFENDER_IDS.map((d) => {
        const a = cov.assignments[d];
        const start = look[d];
        if (a.kind === "zone") return <polyline key={`p${d}`} points={pts([start, a.at], top)} className="pa-drop" markerEnd={`url(#${id}-darrow)`} />;
        if (a.kind === "man") {
          const r = receivers[a.receiver];
          // A dotted line to the receiver, and a dashed ring around him: pressed defenders are right on top of him.
          const rc = at(r);
          return (
            <g key={`p${d}`}>
              <polyline points={pts([start, [r[0], r[1] + 1.5]], top)} className="pa-man" />
              <circle cx={rc.x} cy={rc.y} r={1.7} className="pa-man-ring" />
            </g>
          );
        }
        const toward: Point = [start[0] + (QB[0] - start[0]) * 0.45, start[1] + (QB[1] - start[1]) * 0.45];
        return <polyline key={`p${d}`} points={pts([start, toward], top)} className="pa-rush" markerEnd={`url(#${id}-darrow)`} />;
      })}

      {/* Routes. */}
      {(Object.entries(routes) as [ReceiverId, readonly Point[]][]).map(([r, route]) => (
        r === read ? null : (
          <polyline key={`r${r}`} points={pts(route, top)} className={read ? "pa-route dim" : "pa-route"} markerEnd={`url(#${id}-arrow)`} />
        )
      ))}
      {read && (() => {
        // The first read on top, in the best call's green, labeled where the ball should arrive.
        const route = routes[read] ?? [receivers[read], [receivers[read][0], receivers[read][1] + 3]];
        const end = at(route[route.length - 1]!);
        // Above the arrow, or beside it (toward the middle of the field) when the route runs to the top.
        const nearTop = end.y < 5;
        const labelX = nearTop ? end.x + (end.x < (X1 - X0) / 2 ? 5.5 : -5.5) : Math.min(Math.max(end.x, 5), X1 - X0 - 5);
        const labelY = nearTop ? end.y + 3.2 : end.y - 1.6;
        return (
          <g className="pa-read">
            <polyline points={pts(route, top)} className="pa-route read" markerEnd={`url(#${id}-rarrow)`} />
            <text x={labelX} y={labelY} className="pa-read-label">1st read</text>
          </g>
        );
      })()}

      {/* The offense. */}
      {LINE.map((p, i) => {
        const c = at(p);
        return <rect key={`ol${i}`} x={c.x - 0.7} y={c.y - 0.7} width={1.4} height={1.4} className="pa-lineman" />;
      })}
      {[QB, ...Object.values(receivers)].map((p, i) => {
        const c = at(p);
        return <circle key={`o${i}`} cx={c.x} cy={c.y} r={0.85} className="pa-player" />;
      })}

      {/* The defense, where it lines up. */}
      {look && DEFENDER_IDS.map((d) => {
        const c = at(look[d]);
        return <text key={`d${d}`} x={c.x} y={c.y} className="pa-defender" dominantBaseline="central">{DEFENDER_LABELS[d]}</text>;
      })}
    </svg>
  );
}
