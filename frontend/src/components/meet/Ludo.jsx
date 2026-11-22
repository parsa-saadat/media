import { useEffect, useRef, useState } from "react";
import { faNum } from "../../utils/client";
import { Dice } from "./Dice";

const SEAT_COLORS = ["#ef4444", "#22c55e", "#f59e0b", "#3b82f6"];
const SEAT_NAMES = ["قرمز", "سبز", "زرد", "آبی"];

/**
 * 52-cell clockwise outer track on a 15×15 grid (rows 0..14, cols 0..14).
 * Seat 0 (Red, top-left yard [0,0]):     starts at idx 0  = [6,1]  (left arm),   home stretch [7,1..5]
 * Seat 1 (Green, top-right yard [0,9]):  starts at idx 13 = [1,8]  (top arm),    home stretch [1..5,7]
 * Seat 2 (Yellow, bot-right yard [9,9]): starts at idx 26 = [8,13] (right arm),  home stretch [7,13..9]
 * Seat 3 (Blue, bot-left yard [9,0]):    starts at idx 39 = [13,6] (bottom arm), home stretch [13..9,7]
 */
const TRACK = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];

const HOME = [
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],     // Seat 0 Red -> left-to-center
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],     // Seat 1 Green -> top-to-center
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], // Seat 2 Yellow -> right-to-center
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], // Seat 3 Blue -> bottom-to-center
];

// Yard top-left [row, col] matching each seat's start arm!
const YARDS = [
  [0, 0], // Seat 0 Red: top-left
  [0, 9], // Seat 1 Green: top-right
  [9, 9], // Seat 2 Yellow: bottom-right
  [9, 0], // Seat 3 Blue: bottom-left
];

const SAFE_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const START_BY_INDEX = new Map([
  [0, 0],
  [13, 1],
  [26, 2],
  [39, 3],
]);

// Finish nest positions inside each seat's center triangle (row, col fractional centres on 15×15 grid)
const FINISH_SPOTS = [
  [[7.0, 6.35], [6.65, 6.35], [7.35, 6.35], [7.0, 6.65]], // Seat 0 left triangle
  [[6.35, 7.0], [6.35, 6.65], [6.35, 7.35], [6.65, 7.0]], // Seat 1 top triangle
  [[7.0, 8.65], [6.65, 8.65], [7.35, 8.65], [7.0, 8.35]], // Seat 2 right triangle
  [[8.65, 7.0], [8.65, 6.65], [8.65, 7.35], [8.35, 7.0]], // Seat 3 bottom triangle
];

function tokenRC(seat, slot, step) {
  if (step === -1) {
    const [yr, yc] = YARDS[seat];
    const offsets = [
      [1.85, 1.85],
      [1.85, 4.15],
      [4.15, 1.85],
      [4.15, 4.15],
    ];
    const [dr, dc] = offsets[slot];
    return [yr + dr, yc + dc];
  }
  if (step === 56) {
    return FINISH_SPOTS[seat][slot];
  }
  if (step >= 51) {
    const [r, c] = HOME[seat][step - 51];
    return [r + 0.5, c + 0.5];
  }
  const [r, c] = TRACK[(step + seat * 13) % 52];
  return [r + 0.5, c + 0.5];
}

function legalTokens(tokens, seat, dice) {
  if (!dice) return new Set();
  const mine = tokens[seat] ?? [];
  const occupied = new Set(mine.filter((s) => s >= 0 && s < 56));
  const out = new Set();
  mine.forEach((pos, idx) => {
    const to = pos === -1 ? (dice === 6 ? 0 : -99) : pos + dice;
    if (to < 0 || to > 56) return;
    if (to < 56 && occupied.has(to)) return;
    out.add(idx);
  });
  return out;
}

function cloneTokens(tokens) {
  return Array.isArray(tokens) ? tokens.map((arr) => (Array.isArray(arr) ? [...arr] : [])) : [];
}

export default function Ludo({ game, myToken, onMove, busy, rolling }) {
  const { tokens = [], dice, rolled, seat = 0, message, lastRoll, lastMove } = game.state;
  const mySeat = game.players.findIndex((p) => p.joinToken === myToken);
  const myTurn = game.status === "playing" && mySeat === seat;

  // Step-by-step pawn hopping state
  const [dispTokens, setDispTokens] = useState(() => cloneTokens(tokens));
  const [hopPawn, setHopPawn] = useState(null); // { seat, token }
  const [hopTick, setHopTick] = useState(0);
  const lastMoveSeqRef = useRef(lastMove?.seq ?? null);
  const timersRef = useRef([]);

  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const seq = lastMove?.seq ?? null;
    if (seq !== null && seq !== lastMoveSeqRef.current && typeof lastMove.seat === "number") {
      lastMoveSeqRef.current = seq;
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];

      const mSeat = lastMove.seat;
      const mTok = lastMove.token;
      const from = Number(lastMove.from ?? -1);
      const to = Number(lastMove.to ?? 0);

      // Build step-by-step cell positions:
      // If leaving yard (-1 -> 0), single hop onto start square 0; otherwise hop from+1 .. to
      const steps = [];
      if (from === -1 && to === 0) {
        steps.push(0);
      } else if (to > from && from >= 0) {
        for (let s = from + 1; s <= to; s++) steps.push(s);
      }

      if (steps.length > 0) {
        // Hold moving pawn at `from` initially (and if capturing, hold captured pawn until arrival!)
        setDispTokens((prev) => {
          const base = cloneTokens(prev.length ? prev : tokens);
          if (base[mSeat]) base[mSeat][mTok] = from;
          return base;
        });

        steps.forEach((stepPos, idx) => {
          const isFinal = idx === steps.length - 1;
          const timer = setTimeout(() => {
            setHopPawn({ seat: mSeat, token: mTok });
            setHopTick((k) => k + 1);
            setDispTokens((prev) => {
              const next = isFinal ? cloneTokens(tokens) : cloneTokens(prev);
              if (next[mSeat]) next[mSeat][mTok] = stepPos;
              return next;
            });
          }, (idx + 1) * 185);
          timersRef.current.push(timer);
        });

        const endTimer = setTimeout(() => {
          setHopPawn(null);
          setDispTokens(cloneTokens(tokens));
        }, steps.length * 185 + 260);
        timersRef.current.push(endTimer);
        return;
      }
    }
    setDispTokens(cloneTokens(tokens));
  }, [tokens, lastMove]);

  const animating = hopPawn !== null;
  const movable = myTurn && rolled && !animating ? legalTokens(tokens, seat, dice) : new Set();

  // Compute collision offsets so stacked pawns on the same track/home cell fan out neatly
  const coordGroups = new Map();
  game.players.forEach((_, s) => {
    (dispTokens[s] ?? []).forEach((pos, t) => {
      if (pos < 0 || pos >= 56) return;
      const [r, c] = tokenRC(s, t, pos);
      const key = `${r.toFixed(1)}:${c.toFixed(1)}`;
      if (!coordGroups.has(key)) coordGroups.set(key, []);
      coordGroups.get(key).push(`${s}:${t}`);
    });
  });

  const turnColor = SEAT_COLORS[seat % 4];
  const shownDice = dice ?? lastRoll?.dice ?? null;
  const turnPlayerName = game.players[seat]?.name ?? "";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Player badges using authentic Ludo seat colors */}
      <div className="grid w-full max-w-md grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:justify-center">
        {game.players.map((p, i) => {
          const active = i === seat && game.status === "playing";
          const homeCount = (tokens[i] ?? []).filter((x) => x === 56).length;
          const seatColor = SEAT_COLORS[i];
          return (
            <div
              key={p.joinToken}
              style={active ? { borderColor: seatColor, boxShadow: `0 0 0 1px ${seatColor}66` } : undefined}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                active ? "bg-surface-3 font-bold text-fg" : "border-line bg-surface-2/80 text-muted"
              }`}
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1 ring-white/40"
                style={{ background: seatColor }}
                title={SEAT_NAMES[i]}
              />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="shrink-0 font-mono text-[10px] opacity-85">{faNum(homeCount)}/۴</span>
            </div>
          );
        })}
      </div>

      {/* Theme-integrated 15x15 Ludo board */}
      <div className="relative aspect-square w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface p-2 shadow-xl">
        <svg viewBox="0 0 150 150" className="h-full w-full select-none rounded-lg">
          {/* Base board background */}
          <rect x="0" y="0" width="150" height="150" rx="4" style={{ fill: "var(--surface)" }} />

          {/* Four 6x6 corner yards */}
          {YARDS.map(([yr, yc], i) => {
            const activePlayer = i < game.players.length;
            const c = SEAT_COLORS[i];
            const spots = [
              [1.85, 1.85],
              [1.85, 4.15],
              [4.15, 1.85],
              [4.15, 4.15],
            ];
            return (
              <g key={`yard-${i}`} opacity={activePlayer ? 1 : 0.45}>
                <rect
                  x={yc * 10 + 0.8}
                  y={yr * 10 + 0.8}
                  width="58.4"
                  height="58.4"
                  rx="5"
                  fill={c}
                  fillOpacity="0.22"
                  stroke={c}
                  strokeOpacity="0.7"
                  strokeWidth="1"
                />
                <rect
                  x={yc * 10 + 7.5}
                  y={yr * 10 + 7.5}
                  width="45"
                  height="45"
                  rx="4"
                  style={{ fill: "var(--surface-2)", stroke: c }}
                  strokeOpacity="0.45"
                  strokeWidth="0.7"
                />
                {spots.map(([dr, dc], sIdx) => (
                  <circle
                    key={sIdx}
                    cx={(yc + dc) * 10}
                    cy={(yr + dr) * 10}
                    r="5"
                    fill={c}
                    fillOpacity="0.18"
                    stroke={c}
                    strokeOpacity="0.55"
                    strokeWidth="0.8"
                  />
                ))}
                {game.players[i] && (
                  <text
                    x={(yc + 3) * 10}
                    y={(yr + 0.58) * 10}
                    fontSize="3.2"
                    fontWeight="800"
                    textAnchor="middle"
                    fill={c}
                  >
                    {game.players[i].name.slice(0, 14)}
                  </text>
                )}
              </g>
            );
          })}

          {/* 52-cell outer track */}
          {TRACK.map(([r, c], idx) => {
            const startSeat = START_BY_INDEX.get(idx);
            const isStart = startSeat !== undefined;
            const isSafe = SAFE_INDICES.has(idx);
            const startColor = isStart ? SEAT_COLORS[startSeat] : null;
            return (
              <g key={`t-${idx}`}>
                <rect
                  x={c * 10 + 0.35}
                  y={r * 10 + 0.35}
                  width="9.3"
                  height="9.3"
                  rx="1.4"
                  style={
                    isStart
                      ? { fill: startColor, fillOpacity: 0.38, stroke: startColor }
                      : { fill: "var(--surface-2)", stroke: "var(--line)" }
                  }
                  strokeWidth={isStart ? "0.7" : "0.45"}
                />
                {isSafe && (
                  <text
                    x={c * 10 + 5}
                    y={r * 10 + 6.7}
                    fontSize="5"
                    textAnchor="middle"
                    fill={isStart ? "#ffffff" : "var(--muted)"}
                    opacity={isStart ? "0.95" : "0.65"}
                  >
                    ★
                  </text>
                )}
              </g>
            );
          })}

          {/* Four 5-cell colored home stretches */}
          {HOME.map((cells, s) =>
            cells.map(([r, c], k) => (
              <rect
                key={`h-${s}-${k}`}
                x={c * 10 + 0.45}
                y={r * 10 + 0.45}
                width="9.1"
                height="9.1"
                rx="1.4"
                fill={SEAT_COLORS[s]}
                fillOpacity="0.34"
                stroke={SEAT_COLORS[s]}
                strokeOpacity="0.75"
                strokeWidth="0.6"
              />
            )),
          )}

          {/* Center 3x3 home goal: triangles strictly aligned with each seat's home stretch! */}
          <g>
            {/* Left triangle -> Seat 0 (Red) */}
            <polygon points="60,60 60,90 75,75" fill={SEAT_COLORS[0]} fillOpacity="0.85" stroke="var(--surface)" strokeWidth="0.7" />
            {/* Top triangle -> Seat 1 (Green) */}
            <polygon points="60,60 90,60 75,75" fill={SEAT_COLORS[1]} fillOpacity="0.85" stroke="var(--surface)" strokeWidth="0.7" />
            {/* Right triangle -> Seat 2 (Yellow) */}
            <polygon points="90,60 90,90 75,75" fill={SEAT_COLORS[2]} fillOpacity="0.85" stroke="var(--surface)" strokeWidth="0.7" />
            {/* Bottom triangle -> Seat 3 (Blue) */}
            <polygon points="60,90 90,90 75,75" fill={SEAT_COLORS[3]} fillOpacity="0.85" stroke="var(--surface)" strokeWidth="0.7" />
            <rect x="60" y="60" width="30" height="30" rx="2" fill="none" stroke="var(--line)" strokeWidth="0.8" />
            <circle cx="75" cy="75" r="3.4" style={{ fill: "var(--surface)", stroke: "var(--line)" }} strokeWidth="0.6" />
          </g>

          {/* Tokens: rendered in seat color, with smooth step-by-step CSS transition + hop bounce */}
          {game.players.map((_, s) =>
            (dispTokens[s] ?? []).map((pos, t) => {
              const [r, c] = tokenRC(s, t, pos);
              const groupKey = `${r.toFixed(1)}:${c.toFixed(1)}`;
              const stack = pos >= 0 && pos < 56 ? coordGroups.get(groupKey) ?? [] : [];
              const stackIdx = stack.indexOf(`${s}:${t}`);
              let dx = 0;
              let dy = 0;
              if (stack.length > 1 && stackIdx >= 0) {
                const angle = (stackIdx / stack.length) * Math.PI * 2;
                dx = Math.cos(angle) * 1.9;
                dy = Math.sin(angle) * 1.9;
              }
              const cx = c * 10 + dx;
              const cy = r * 10 + dy;
              const canPick = s === seat && movable.has(t) && !busy;
              const isHopping = hopPawn?.seat === s && hopPawn?.token === t;
              const pieceColor = SEAT_COLORS[s];

              return (
                <g
                  key={`tok-${s}-${t}`}
                  onClick={() => canPick && onMove({ action: "move", token: t })}
                  style={{
                    transform: `translate(${cx}px, ${cy}px)`,
                    transition: "transform 170ms cubic-bezier(.22,1,.36,1)",
                    cursor: canPick ? "pointer" : "default",
                  }}
                >
                  {canPick && (
                    <circle r="5.3" fill="none" stroke="#ffffff" strokeWidth="0.9" strokeDasharray="1.8 1.4">
                      <animate attributeName="r" values="4.4;5.8;4.4" dur="1.05s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.95;0.45;0.95" dur="1.05s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <g key={isHopping ? hopTick : 0} className={isHopping ? "anim-pawn-hop" : ""}>
                    <circle r={pos === 56 ? 2.6 : 3.5} cy="0.55" fill="rgba(0,0,0,0.42)" />
                    <circle
                      r={pos === 56 ? 2.5 : 3.4}
                      fill={pieceColor}
                      stroke="#ffffff"
                      strokeWidth={canPick ? "1.1" : "0.75"}
                    />
                    <circle r={pos === 56 ? 0.9 : 1.3} cy="-0.65" fill="rgba(255,255,255,0.45)" />
                  </g>
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {/* Status & last roll banner */}
      {(message || lastRoll) && (
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-center text-xs">
          {lastRoll && (
            <span className="text-muted">
              آخرین پرتاب: <strong className="text-fg">{lastRoll.name}</strong> تاس{" "}
              <strong className="text-accent">{faNum(lastRoll.dice)}</strong>
            </span>
          )}
          {message && (
            <span className="font-semibold text-amber-300">
              {lastRoll ? "· " : ""}
              {message}
            </span>
          )}
        </div>
      )}

      {/* Dice & Turn action bar */}
      {game.status === "playing" && (
        <Dice
          value={shownDice}
          rollKey={lastRoll?.seq ?? null}
          rolling={rolling}
          accentColor={turnColor}
          disabled={!myTurn || rolled || busy || animating}
          onRoll={() => onMove({ action: "roll" })}
          label={
            rolled
              ? myTurn
                ? `تاس ${faNum(dice)} آمد — روی مهرهٔ چشمک‌زن بزنید`
                : `${turnPlayerName} در حال انتخاب مهره (${faNum(dice)})`
              : myTurn
                ? "نوبت شماست — تاس بیندازید"
                : `نوبت ${turnPlayerName}`
          }
        />
      )}
    </div>
  );
}
