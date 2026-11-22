import { faNum } from "../../utils/client";
import { Icon } from "../common/Icon";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** Classic tic-tac-toe with a warm wooden-board look, full end-state rendering, and spectator support. */
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
        className="relative w-full max-w-[360px] rounded-xl p-3.5 shadow-2xl"
        style={{
          background: "linear-gradient(150deg,#8a5a2b,#6d4420 55%,#8a5a2b)",
          boxShadow: "inset 0 2px 0 rgba(255,255,255,.18), 0 20px 40px -18px rgba(0,0,0,.8)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-30"
          style={{ background: "repeating-linear-gradient(97deg, rgba(0,0,0,.14) 0 3px, transparent 3px 26px)" }}
        />
        <div className="relative grid grid-cols-3 gap-2.5">
          {cells.map((v, i) => {
            const winning = winnerLine?.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={!isMyTurn || busy || !!v || !myMark}
                onClick={() => onMove({ cell: i })}
                className={`flex aspect-square items-center justify-center rounded-lg text-[44px] sm:text-[50px] font-black leading-none transition-all duration-200 disabled:cursor-default ${
                  winning
                    ? "bg-amber-300/90 ring-2 ring-amber-200 shadow-[0_0_24px_rgba(252,211,77,.75)]"
                    : v || !isMyTurn || !myMark
                      ? "bg-[#3d2a13]/65"
                      : "bg-[#3d2a13]/65 hover:bg-[#4d3519]/85 active:scale-95"
                }`}
                style={{ boxShadow: "inset 0 2px 6px rgba(0,0,0,.45), inset 0 -1px 0 rgba(255,255,255,.06)" }}
              >
                {v && (
                  <span
                    className={
                      winning
                        ? v === "X"
                          ? "text-[#b91c1c] drop-shadow anim-pop"
                          : "text-[#0369a1] drop-shadow anim-pop"
                        : v === "X"
                          ? "text-[#ff7b6b] drop-shadow-[0_2px_6px_rgba(255,60,40,.5)] anim-pop"
                          : "text-[#6ec6ff] drop-shadow-[0_2px_6px_rgba(60,160,255,.5)] anim-pop"
                    }
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
              className={`flex items-center gap-2 rounded-lg px-3 py-2 transition ${
                isWinner
                  ? "bg-amber-400/20 ring-1 ring-amber-400/60"
                  : isTurn
                    ? "bg-accent/20 ring-1 ring-accent/60"
                    : "bg-surface-2/70"
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
