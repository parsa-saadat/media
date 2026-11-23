import { faNum } from "../../utils/client";
import { Icon } from "../common/Icon";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** Classic tic-tac-toe fully adapted to the active app theme, with full end-state rendering and spectator support. */
export default function TicTacToe({ game, myToken, onMove, busy }) {
  const cells = Array.isArray(game.state?.cells) && game.state.cells.length === 9 ? game.state.cells : Array(9).fill(null);
  const mySeat = game.players.findIndex((p) => p.joinToken === myToken);
  const isSpectator = mySeat < 0;
  const myMark = mySeat === 0 ? "X" : mySeat === 1 ? "O" : null;
  const isMyTurn = game.status === "playing" && game.turn === myToken;
  const winnerLine = LINES.find(([a, b, c]) => cells[a] && cells[a] === cells[b] && cells[b] === cells[c]);
  const mark = (v) => (v === "X" ? "✕" : "◯");

  const turnPlayer = game.players.find((p) => p.joinToken === game.turn);
  const hint =
    game.status !== "playing"
      ? ""
      : isSpectator
        ? `شما تماشاگر هستید · نوبت ${turnPlayer?.name ?? "بازیکن"}`
        : isMyTurn
          ? "نوبت شماست — یکی از خانه‌ها را انتخاب کنید"
          : `منتظر حرکت ${turnPlayer?.name ?? "حریف"}…`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative w-full max-w-[360px] rounded-2xl border border-accent/35 p-3.5 shadow-2xl backdrop-blur-xl"
        style={{
          background:
            "radial-gradient(120% 100% at 85% 10%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 65%), var(--surface-2)",
        }}
      >
        <div className="relative grid grid-cols-3 gap-2.5">
          {cells.map((v, i) => {
            const winning = winnerLine?.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={!isMyTurn || busy || !!v || !myMark}
                onClick={() => onMove({ cell: i })}
                className={`flex aspect-square items-center justify-center rounded-xl border text-[42px] font-black leading-none transition-all duration-200 disabled:cursor-default sm:text-[48px] ${
                  winning
                    ? "border-accent bg-accent/25 ring-2 ring-accent/55 shadow-[0_0_24px_rgb(var(--glow)/0.38)]"
                    : v || !isMyTurn || !myMark
                      ? "border-line bg-surface/85"
                      : "border-line bg-surface/85 hover:border-accent/55 hover:bg-accent/12 active:scale-95"
                }`}
              >
                {v && (
                  <span
                    style={{
                      color: v === "X" ? "var(--accent)" : "var(--accent-2)",
                    }}
                    className="anim-pop drop-shadow-sm"
                  >
                    {mark(v)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <Players game={game} myToken={myToken} marks={["✕", "◯"]} hint={hint} />
    </div>
  );
}

export function Players({ game, myToken, marks, hint }) {
  return (
    <div className="w-full max-w-[380px]">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {game.players.map((p, i) => {
          const isTurn = game.turn === p.joinToken && game.status === "playing";
          const isWinner = game.status === "finished" && game.winner === p.joinToken;
          return (
            <div
              key={p.joinToken}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition ${
                isWinner
                  ? "border-accent bg-accent/20 ring-1 ring-accent/45"
                  : isTurn
                    ? "border-accent/55 bg-accent/14"
                    : "border-line bg-surface-2/80"
              }`}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-black text-white"
                style={{ background: p.avatarColor }}
              >
                {marks ? (marks[i] ?? i + 1) : faNum(i + 1)}
              </span>
              <span className="text-xs font-bold">
                {p.name}
                {p.joinToken === myToken && <span className="text-muted"> (شما)</span>}
                {isWinner && <span className="ms-1">👑</span>}
              </span>
            </div>
          );
        })}
      </div>
      {game.status === "playing" && hint && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs font-bold text-accent">
          <Icon name="gamepad" size={14} /> {hint}
        </p>
      )}
    </div>
  );
}
