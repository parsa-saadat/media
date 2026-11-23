import { useEffect, useRef, useState } from "react";
import { faNum } from "../../utils/client";
import { Dice } from "./Dice";

const LADDERS = [
  [4, 25],
  [13, 46],
  [33, 49],
  [42, 63],
  [50, 69],
  [62, 81],
  [74, 92],
];
const SNAKES = [
  [27, 5],
  [40, 3],
  [43, 18],
  [54, 31],
  [66, 45],
  [76, 58],
  [89, 53],
  [99, 41],
];

const LADDER_MAP = new Map(LADDERS);
const SNAKE_MAP = new Map(SNAKES);

const SEAT_COLORS = ["#ef4444", "#22c55e", "#f59e0b", "#3b82f6"];

/**
 * Square 1..100 → SVG (x, y) centre on a 100×100 viewBox.
 * Classic boustrophedon Snakes & Ladders board:
 *  Row 0 (bottom):  1 .. 10   left → right
 *  Row 1:          11 .. 20   right → left
 *  ...
 *  Row 9 (top):    91 .. 100  right → left (100 at top-left)
 */
function squareXY(n) {
  if (n <= 0) return { x: 5, y: 95 };
  const idx = n - 1;
  const rowFromBottom = Math.floor(idx / 10);
  const colInRow = idx % 10;
  const col = rowFromBottom % 2 === 0 ? colInRow : 9 - colInRow;
  const row = 9 - rowFromBottom;
  return { x: col * 10 + 5, y: row * 10 + 5 };
}

/** Build a sinusoidal S-curve SVG path from snake head `p` (square `a`) to tail `q` (square `b`). */
function buildSnakePath(p, q, idx) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const dir = idx % 2 === 0 ? 1 : -1;
  const amp = Math.min(5.2, Math.max(2.6, len * 0.14)) * dir;

  const c1x = p.x + dx * 0.25 + nx * amp;
  const c1y = p.y + dy * 0.25 + ny * amp;
  const mx = p.x + dx * 0.5;
  const my = p.y + dy * 0.5;
  const c2x = p.x + dx * 0.75 - nx * amp;
  const c2y = p.y + dy * 0.75 - ny * amp;

  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    d: `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} Q ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)} T ${q.x.toFixed(2)} ${q.y.toFixed(2)}`,
    angleDeg,
  };
}

export default function SnakesLadders({ game, myToken, onMove, busy, rolling }) {
  const { positions = [], last } = game.state;
  const myTurn = game.status === "playing" && game.turn === myToken;

  // Displayed positions animate step-by-step when a player rolls the dice
  const [dispPositions, setDispPositions] = useState(() => [...positions]);
  const [hopSeat, setHopSeat] = useState(null);
  const [hopTick, setHopTick] = useState(0);
  const [slideMode, setSlideMode] = useState(null); // "ladder" | "snake" | null
  const lastSeqRef = useRef(last?.seq ?? null);
  const animTimersRef = useRef([]);

  useEffect(() => {
    return () => {
      for (const t of animTimersRef.current) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const seq = last?.seq ?? null;
    if (seq !== null && seq !== lastSeqRef.current && typeof last.seat === "number") {
      lastSeqRef.current = seq;
      for (const t of animTimersRef.current) clearTimeout(t);
      animTimersRef.current = [];

      const seat = last.seat;
      const from = Math.max(0, Number(last.from ?? 0));
      const mid = Number(last.mid ?? from);
      const to = Number(last.to ?? positions[seat] ?? mid);

      // Build cell-by-cell hop sequence: from+1, from+2, ..., mid, and then snake/ladder glide to `to`
      const stepCells = [];
      if (mid > from) {
        for (let cell = from + 1; cell <= mid; cell++) {
          stepCells.push(cell);
        }
      }

      if (stepCells.length > 0 || to !== mid) {
        setSlideMode(null);
        setDispPositions((prev) => {
          const next = positions.map((p, idx) => (idx === seat ? from : p));
          return next.length ? next : prev;
        });

        stepCells.forEach((cellPos, idx) => {
          const delay = (idx + 1) * 195;
          const timer = setTimeout(() => {
            setSlideMode(null);
            setHopSeat(seat);
            setHopTick((k) => k + 1);
            setDispPositions((prev) => {
              const copy = [...prev];
              copy[seat] = cellPos;
              return copy;
            });
          }, delay);
          animTimersRef.current.push(timer);
        });

        let totalMs = stepCells.length * 195;
        if (to !== mid) {
          const jumpDelay = totalMs + 310;
          const jumpKind = to > mid ? "ladder" : "snake";
          const jumpTimer = setTimeout(() => {
            setSlideMode(jumpKind);
            setHopSeat(seat);
            setHopTick((k) => k + 1);
            setDispPositions((prev) => {
              const copy = [...prev];
              copy[seat] = to;
              return copy;
            });
          }, jumpDelay);
          animTimersRef.current.push(jumpTimer);
          totalMs = jumpDelay + 520;
        } else {
          totalMs += 300;
        }

        const doneTimer = setTimeout(() => {
          setHopSeat(null);
          setSlideMode(null);
          setDispPositions([...positions]);
        }, totalMs);
        animTimersRef.current.push(doneTimer);
        return;
      }
    }
    setDispPositions([...positions]);
  }, [positions, last]);

  const cells = [];
  for (let n = 1; n <= 100; n++) {
    const { x, y } = squareXY(n);
    const ladderDest = LADDER_MAP.get(n);
    const snakeDest = SNAKE_MAP.get(n);
    const rowIdx = Math.floor((n - 1) / 10);
    const colIdx = Math.round((x - 5) / 10);
    const isEvenVisual = (rowIdx + colIdx) % 2 === 0;

    let tint = isEvenVisual ? "var(--surface-2)" : "var(--surface-3)";
    if (n === 100) {
      tint = "color-mix(in srgb, var(--accent) 28%, var(--surface-2))";
    } else if (n === 1) {
      tint = "color-mix(in srgb, #22c55e 16%, var(--surface-2))";
    } else if (ladderDest) {
      tint = "color-mix(in srgb, #22c55e 18%, var(--surface-2))";
    } else if (snakeDest) {
      tint = "color-mix(in srgb, #f43f5e 18%, var(--surface-2))";
    }

    cells.push(
      <g key={n}>
        <rect
          x={x - 5}
          y={y - 5}
          width="10"
          height="10"
          style={{ fill: tint, stroke: "var(--line)" }}
          strokeWidth="0.24"
        />
        {/* Cell number anchored cleanly via textAnchor="start" so RTL never flips digits into neighbors */}
        <text
          x={x - 4.35}
          y={y - 2.35}
          fontSize="2.15"
          fontWeight="800"
          textAnchor="start"
          direction="ltr"
          style={{
            fill:
              n === 100
                ? "var(--accent)"
                : ladderDest
                  ? "#22c55e"
                  : snakeDest
                    ? "#fb7185"
                    : "var(--muted)",
          }}
        >
          {faNum(n)}
        </text>
        {/* Subtle row flow arrow on start of rows */}
        {n === 1 && (
          <text
            x={x + 2.4}
            y={y + 3.4}
            fontSize="2.2"
            fontWeight="800"
            textAnchor="middle"
            fill="#22c55e"
            opacity="0.85"
          >
            شروع
          </text>
        )}
        {ladderDest && (
          <text
            x={x + 4.25}
            y={y + 4.15}
            fontSize="1.65"
            fontWeight="800"
            textAnchor="end"
            direction="ltr"
            fill="#22c55e"
            opacity="0.9"
          >
            ↑{faNum(ladderDest)}
          </text>
        )}
        {snakeDest && (
          <text
            x={x + 4.25}
            y={y + 4.15}
            fontSize="1.65"
            fontWeight="800"
            textAnchor="end"
            direction="ltr"
            fill="#fb7185"
            opacity="0.9"
          >
            ↓{faNum(snakeDest)}
          </text>
        )}
        {n === 100 && (
          <text x={x + 0.8} y={y + 2.9} fontSize="4.1" textAnchor="middle">
            👑
          </text>
        )}
      </g>,
    );
  }

  // Group pawns on identical cells so stacked players fan out cleanly without hiding one another
  const cellGroups = new Map();
  game.players.forEach((_, idx) => {
    const p = dispPositions[idx] ?? positions[idx] ?? 0;
    if (p <= 0) return;
    if (!cellGroups.has(p)) cellGroups.set(p, []);
    cellGroups.get(p).push(idx);
  });

  const waitingAtStart = game.players
    .map((p, i) => ({ p, i, pos: dispPositions[i] ?? positions[i] ?? 0 }))
    .filter((x) => x.pos <= 0);

  const turnSeatIdx = game.players.findIndex((p) => p.joinToken === game.turn);
  const turnAccent = turnSeatIdx >= 0 ? SEAT_COLORS[turnSeatIdx % SEAT_COLORS.length] : undefined;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Player strip */}
      <div className="grid w-full max-w-md grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-center">
        {game.players.map((p, i) => {
          const active = game.turn === p.joinToken && game.status === "playing";
          const c = SEAT_COLORS[i % SEAT_COLORS.length];
          const posVal = dispPositions[i] ?? positions[i] ?? 0;
          return (
            <div
              key={p.joinToken}
              style={active ? { borderColor: c, boxShadow: `0 0 0 1px ${c}66` } : undefined}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                active ? "bg-surface-3 font-bold text-fg" : "border-line bg-surface-2/80 text-muted"
              }`}
            >
              <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/40" style={{ background: c }} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="shrink-0 font-mono text-[10px] opacity-85">
                {posVal > 0 ? `خانه ${faNum(posVal)}` : "بیرون"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Board forced to dir="ltr" so SVG text anchors and coordinates are 100% deterministic */}
      <div
        dir="ltr"
        className="relative aspect-square w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface p-2 shadow-xl"
      >
        <svg viewBox="0 0 100 100" className="h-full w-full select-none rounded-lg">
          {cells}

          {/* Ladders: start exactly at cell `a` centre and climb to cell `b` centre */}
          {LADDERS.map(([a, b]) => {
            const p = squareXY(a);
            const q = squareXY(b);
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            // Inset 1.4u from exact centre so cell labels stay crisp while rails clearly sit inside both cells
            const sx = p.x + ux * 1.1;
            const sy = p.y + uy * 1.1;
            const ex = q.x - ux * 1.1;
            const ey = q.y - uy * 1.1;
            const rdx = ex - sx;
            const rdy = ey - sy;
            const rlen = Math.hypot(rdx, rdy) || 1;
            const nx = (-dy / len) * 1.35;
            const ny = (dx / len) * 1.35;
            const rungs = Math.max(3, Math.round(rlen / 4.2));
            return (
              <g key={`L${a}`} opacity="0.92">
                {/* Subtle shadow for depth */}
                <line
                  x1={sx + nx + 0.25}
                  y1={sy + ny + 0.35}
                  x2={ex + nx + 0.25}
                  y2={ey + ny + 0.35}
                  stroke="rgba(0,0,0,0.32)"
                  strokeWidth="0.95"
                  strokeLinecap="round"
                />
                <line
                  x1={sx - nx + 0.25}
                  y1={sy - ny + 0.35}
                  x2={ex - nx + 0.25}
                  y2={ey - ny + 0.35}
                  stroke="rgba(0,0,0,0.32)"
                  strokeWidth="0.95"
                  strokeLinecap="round"
                />
                {/* Ladder side rails */}
                <line x1={sx + nx} y1={sy + ny} x2={ex + nx} y2={ey + ny} stroke="#16a34a" strokeWidth="0.9" strokeLinecap="round" />
                <line x1={sx - nx} y1={sy - ny} x2={ex - nx} y2={ey - ny} stroke="#16a34a" strokeWidth="0.9" strokeLinecap="round" />
                {/* Ladder rungs */}
                {Array.from({ length: rungs - 1 }, (_, k) => {
                  const t = (k + 1) / rungs;
                  const rx = sx + rdx * t;
                  const ry = sy + rdy * t;
                  return (
                    <line
                      key={k}
                      x1={rx + nx}
                      y1={ry + ny}
                      x2={rx - nx}
                      y2={ry - ny}
                      stroke="#4ade80"
                      strokeWidth="0.68"
                      strokeLinecap="round"
                    />
                  );
                })}
                {/* Start base & top landing anchors */}
                <circle cx={sx} cy={sy} r="0.85" fill="#22c55e" />
                <circle cx={ex} cy={ey} r="0.85" fill="#86efac" stroke="#16a34a" strokeWidth="0.35" />
              </g>
            );
          })}

          {/* Snakes: head with eyes & forked tongue at `a` (higher number), S-curve body, tapered tail at `b` (lower number) */}
          {SNAKES.map(([a, b], idx) => {
            const p = squareXY(a);
            const q = squareXY(b);
            const { d, angleDeg } = buildSnakePath(p, q, idx);
            return (
              <g key={`S${a}`} opacity="0.94">
                {/* Drop shadow */}
                <path
                  d={d}
                  fill="none"
                  stroke="rgba(0,0,0,0.34)"
                  strokeWidth="1.95"
                  strokeLinecap="round"
                  transform="translate(0.25, 0.4)"
                />
                {/* Outer body */}
                <path d={d} fill="none" stroke="#e11d48" strokeWidth="1.7" strokeLinecap="round" />
                {/* Patterned scales */}
                <path d={d} fill="none" stroke="#fecdd3" strokeWidth="0.62" strokeDasharray="1.3 1.45" strokeLinecap="round" />
                {/* Tail tip at `b` */}
                <circle cx={q.x} cy={q.y} r="0.7" fill="#fb7185" />
                {/* Snake head at `a`, oriented toward body */}
                <g transform={`translate(${p.x}, ${p.y}) rotate(${angleDeg})`}>
                  {/* Forked tongue */}
                  <path
                    d="M -1.7 0 L -2.9 -0.55 M -1.7 0 L -2.9 0.55"
                    stroke="#fb7185"
                    strokeWidth="0.32"
                    strokeLinecap="round"
                  />
                  <ellipse cx="0" cy="0" rx="1.95" ry="1.55" fill="#be123c" stroke="#fda4af" strokeWidth="0.3" />
                  <circle cx="-0.45" cy="-0.62" r="0.42" fill="#fff" />
                  <circle cx="-0.45" cy="0.62" r="0.42" fill="#fff" />
                  <circle cx="-0.55" cy="-0.62" r="0.2" fill="#0f172a" />
                  <circle cx="-0.55" cy="0.62" r="0.2" fill="#0f172a" />
                </g>
              </g>
            );
          })}

          {/* Pawns on board (squares 1..100) */}
          {game.players.map((p, i) => {
            const pos = dispPositions[i] ?? positions[i] ?? 0;
            if (pos <= 0) return null;
            const { x, y } = squareXY(pos);
            const group = cellGroups.get(pos) ?? [i];
            const idxInCell = group.indexOf(i);
            let ox = 0;
            let oy = 0.6;
            if (group.length > 1 && idxInCell >= 0) {
              const angle = (idxInCell / group.length) * Math.PI * 2;
              ox = Math.cos(angle) * 1.85;
              oy = 0.4 + Math.sin(angle) * 1.85;
            }
            const c = SEAT_COLORS[i % SEAT_COLORS.length];
            const isHopping = hopSeat === i;
            const dur = isHopping && slideMode ? "460ms" : "175ms";
            return (
              <g
                key={p.joinToken}
                style={{
                  transform: `translate(${x + ox}px, ${y + oy}px)`,
                  transition: `transform ${dur} cubic-bezier(.22,1,.36,1)`,
                }}
              >
                <g key={isHopping ? hopTick : 0} className={isHopping ? "anim-pawn-hop" : ""}>
                  <circle r="2.8" fill="rgba(0,0,0,0.4)" cy="0.48" />
                  <circle r="2.65" fill={c} stroke="#ffffff" strokeWidth="0.7" />
                  <circle r="0.95" cy="-0.55" fill="rgba(255,255,255,0.48)" />
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Waiting pawns tray before entering square 1 */}
      {waitingAtStart.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-line bg-surface-2/65 px-3 py-1.5 text-[11px] text-muted">
          <span>آماده در خط شروع (پیش از خانهٔ ۱):</span>
          {waitingAtStart.map(({ p, i }) => (
            <span key={p.joinToken} className="inline-flex items-center gap-1 font-bold text-fg">
              <span
                className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40"
                style={{ background: SEAT_COLORS[i % SEAT_COLORS.length] }}
              />
              <span>{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {last && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-center text-xs text-muted">
          <span className="font-bold text-fg">{last.name}</span> تاس{" "}
          <span className="font-black text-accent">{faNum(last.dice)}</span> آورد ·{" "}
          {last.from === last.to ? (
            <span>در خانهٔ {faNum(last.to)} ماند</span>
          ) : (
            <span>
              از {faNum(last.from)} به {faNum(last.to)}
            </span>
          )}
          {last.note ? <span className="font-semibold text-accent"> ({faNum(last.note)})</span> : ""}
        </p>
      )}

      {game.status === "playing" && (
        <Dice
          value={last?.dice ?? null}
          rollKey={last?.seq ?? null}
          rolling={rolling}
          accentColor={turnAccent}
          disabled={!myTurn || busy || hopSeat !== null}
          onRoll={() => onMove({ action: "roll" })}
          label={
            myTurn
              ? "نوبت شماست — تاس بریزید"
              : game.players.some((p) => p.joinToken === myToken)
                ? `نوبت ${game.players.find((p) => p.joinToken === game.turn)?.name ?? ""}`
                : `تماشا · نوبت ${game.players.find((p) => p.joinToken === game.turn)?.name ?? ""}`
          }
        />
      )}
    </div>
  );
}
