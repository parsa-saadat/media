import { useEffect, useRef, useState } from "react";
import { faNum } from "../../utils/client";
import { Dice } from "./Dice";

const LADDERS = [
  [3, 22], [5, 8], [11, 26], [20, 29], [27, 84], [36, 44], [51, 67], [71, 91], [80, 99],
];
const SNAKES = [
  [17, 4], [19, 7], [21, 9], [43, 34], [54, 31], [62, 18], [87, 24], [93, 73], [98, 79],
];

const SEAT_COLORS = ["#ef4444", "#22c55e", "#f59e0b", "#3b82f6"];

/** Square 1..100 → SVG (x, y) centre on a 100×100 viewBox. */
function squareXY(n) {
  if (n <= 0) return { x: -6, y: 95 };
  const idx = n - 1;
  const rowFromBottom = Math.floor(idx / 10);
  const colInRow = idx % 10;
  const col = rowFromBottom % 2 === 0 ? colInRow : 9 - colInRow;
  const row = 9 - rowFromBottom;
  return { x: col * 10 + 5, y: row * 10 + 5 };
}

export default function SnakesLadders({ game, myToken, onMove, busy, rolling }) {
  const { positions = [], last } = game.state;
  const myTurn = game.status === "playing" && game.turn === myToken;

  // Displayed positions animate step-by-step when a player rolls the dice
  const [dispPositions, setDispPositions] = useState(() => [...positions]);
  const [hopSeat, setHopSeat] = useState(null);
  const [hopTick, setHopTick] = useState(0);
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
      const mid = Number(last.mid ?? Math.min(100, from + Number(last.dice || 0)));
      const to = Number(last.to ?? positions[seat] ?? mid);

      // Build cell-by-cell hop sequence: from+1, from+2, ..., mid, and then snake/ladder jump to `to`
      const steps = [];
      for (let cell = from + 1; cell <= mid; cell++) {
        steps.push(cell);
      }
      if (to !== mid) {
        steps.push(to);
      }

      if (steps.length > 0) {
        // Sync all other seats immediately while keeping `seat` at `from` before hopping
        setDispPositions((prev) => {
          const next = positions.map((p, idx) => (idx === seat ? from : p));
          return next.length ? next : prev;
        });
        steps.forEach((cellPos, idx) => {
          const isJump = idx === steps.length - 1 && to !== mid;
          const delay = (idx + 1) * 195 + (isJump ? 140 : 0);
          const timer = setTimeout(() => {
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
        const doneTimer = setTimeout(() => {
          setHopSeat(null);
          setDispPositions([...positions]);
        }, steps.length * 195 + 400);
        animTimersRef.current.push(doneTimer);
        return;
      }
    }
    setDispPositions([...positions]);
  }, [positions, last]);

  const cells = [];
  for (let n = 1; n <= 100; n++) {
    const { x, y } = squareXY(n);
    const tint = n === 100
      ? "color-mix(in srgb, #f59e0b 28%, var(--surface-2))"
      : (Math.floor((n - 1) / 10) + n) % 2 === 0
        ? "var(--surface-2)"
        : "var(--surface-3)";
    cells.push(
      <g key={n}>
        <rect
          x={x - 5}
          y={y - 5}
          width="10"
          height="10"
          style={{ fill: tint, stroke: "var(--line)" }}
          strokeWidth="0.22"
        />
        <text
          x={x - 4.1}
          y={y - 2.3}
          fontSize="2.1"
          fontWeight="700"
          style={{ fill: n === 100 ? "#fbbf24" : "var(--muted)" }}
        >
          {faNum(n)}
        </text>
        {n === 100 && <text x={x + 0.6} y={y + 2.7} fontSize="4.2" textAnchor="middle">👑</text>}
      </g>,
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* player strip */}
      <div className="flex w-full max-w-md flex-wrap justify-center gap-1.5">
        {game.players.map((p, i) => {
          const active = game.turn === p.joinToken && game.status === "playing";
          const c = SEAT_COLORS[i % SEAT_COLORS.length];
          const posVal = dispPositions[i] ?? positions[i] ?? 0;
          return (
            <div
              key={p.joinToken}
              style={active ? { borderColor: c, boxShadow: `0 0 0 1px ${c}66` } : undefined}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
                active ? "bg-surface-3 font-bold text-fg" : "border-line bg-surface-2/80 text-muted"
              }`}
            >
              <span className="h-3 w-3 rounded-full ring-1 ring-white/40" style={{ background: c }} />
              <span className="max-w-24 truncate">{p.name}</span>
              <span className="font-mono text-[10px] opacity-80">({faNum(posVal)})</span>
            </div>
          );
        })}
      </div>

      <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface p-2 shadow-xl">
        <svg viewBox="0 0 100 100" className="h-full w-full select-none rounded-lg">
          {cells}

          {/* ladders */}
          {LADDERS.map(([a, b]) => {
            const p = squareXY(a);
            const q = squareXY(b);
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * 1.3;
            const ny = (dx / len) * 1.3;
            const rungs = Math.max(3, Math.round(len / 4.5));
            return (
              <g key={`L${a}`} opacity="0.9">
                <line x1={p.x + nx} y1={p.y + ny} x2={q.x + nx} y2={q.y + ny} stroke="#22c55e" strokeWidth="0.85" strokeLinecap="round" />
                <line x1={p.x - nx} y1={p.y - ny} x2={q.x - nx} y2={q.y - ny} stroke="#22c55e" strokeWidth="0.85" strokeLinecap="round" />
                {Array.from({ length: rungs - 1 }, (_, k) => {
                  const t = (k + 1) / rungs;
                  const rx = p.x + dx * t;
                  const ry = p.y + dy * t;
                  return <line key={k} x1={rx + nx} y1={ry + ny} x2={rx - nx} y2={ry - ny} stroke="#4ade80" strokeWidth="0.65" />;
                })}
              </g>
            );
          })}

          {/* snakes */}
          {SNAKES.map(([a, b]) => {
            const p = squareXY(a);
            const q = squareXY(b);
            const mx = (p.x + q.x) / 2 + (p.y < q.y ? 6 : -6);
            const my = (p.y + q.y) / 2;
            const d = `M ${p.x} ${p.y} Q ${mx} ${my} ${q.x} ${q.y}`;
            return (
              <g key={`S${a}`} opacity="0.9">
                <path d={d} fill="none" stroke="#f43f5e" strokeWidth="1.45" strokeLinecap="round" />
                <path d={d} fill="none" stroke="#fda4af" strokeWidth="0.5" strokeDasharray="1.3 1.3" strokeLinecap="round" />
                <circle cx={p.x} cy={p.y} r="1.55" fill="#e11d48" />
                <circle cx={p.x - 0.5} cy={p.y - 0.4} r="0.32" fill="#fff" />
                <circle cx={p.x + 0.5} cy={p.y - 0.4} r="0.32" fill="#fff" />
              </g>
            );
          })}

          {/* pawns */}
          {game.players.map((p, i) => {
            const pos = dispPositions[i] ?? 0;
            if (pos <= 0) return null;
            const { x, y } = squareXY(pos);
            const off = (i - (game.players.length - 1) / 2) * 1.8;
            const c = SEAT_COLORS[i % SEAT_COLORS.length];
            const isHopping = hopSeat === i;
            return (
              <g
                key={p.joinToken}
                style={{
                  transform: `translate(${x + off}px, ${y + 1.3}px)`,
                  transition: "transform 175ms cubic-bezier(.22,1,.36,1)",
                }}
              >
                <g key={isHopping ? hopTick : 0} className={isHopping ? "anim-pawn-hop" : ""}>
                  <circle r="2.75" fill="rgba(0,0,0,0.35)" cy="0.45" />
                  <circle r="2.6" fill={c} stroke="#fff" strokeWidth="0.65" />
                  <circle r="0.9" cy="-0.5" fill="rgba(255,255,255,0.45)" />
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {last && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-center text-xs text-muted">
          <span className="font-bold text-fg">{last.name}</span> تاس{" "}
          <span className="font-black text-accent">{faNum(last.dice)}</span> آورد · از {faNum(last.from)} به {faNum(last.to)}
          {last.note ? ` (${last.note})` : ""}
        </p>
      )}

      {game.status === "playing" && (
        <Dice
          value={last?.dice ?? null}
          rollKey={last?.seq ?? null}
          rolling={rolling}
          disabled={!myTurn || busy || hopSeat !== null}
          onRoll={() => onMove({ action: "roll" })}
          label={myTurn ? "نوبت شماست — تاس بریزید" : `نوبت ${game.players.find((p) => p.joinToken === game.turn)?.name ?? ""}`}
        />
      )}
    </div>
  );
}
