import { useState } from "react";
import { faNum } from "../../utils/client";
import { Avatar } from "../common/Ui";
import { Icon } from "../common/Icon";
import TicTacToe from "./TicTacToe";
import SnakesLadders from "./SnakesLadders";
import Ludo from "./Ludo";

const GAME_CARDS = [
  { type: "tictactoe", label: "دوز", desc: "کلاسیک دو نفره؛ سه‌تایی کنار هم بچین", icon: "hash", tint: "#8b5cf6", art: "✕ ◯" },
  { type: "snakes", label: "مار و پله", desc: "تاس بینداز، از نردبان بالا برو، از مار فرار کن!", icon: "rocket", tint: "#10b981", art: "🐍 🪜" },
  { type: "ludo", label: "منچ", desc: "چهار مهره، یک تاس شانس و هیجان تا خانه", icon: "gamepad", tint: "#f59e0b", art: "🎲" },
];

/** The in-meeting games hub: pick a game, gather players, play. State comes from the meeting snapshot. */
export default function GamesPanel({ meeting, onClose }) {
  const game = meeting.game;
  const busy = false;

  if (!game) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHead title="بازی‌های جلسه" onClose={onClose} />
        <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
          <p className="rounded-lg bg-accent/10 p-3 text-[11px] leading-6 text-muted">
            یک بازی انتخاب کنید؛ همهٔ حاضران در جلسه می‌توانند به آن بپیوندند و نتیجه روی همان تخته برای همه نمایش داده می‌شود.
          </p>
          {GAME_CARDS.map((g, i) => (
            <button
              key={g.type}
              style={{ ["--i"]: i }}
              onClick={() => void meeting.gameCreate(g.type)}
              className="lift group flex w-full items-center gap-3 rounded-xl bg-surface-2/70 p-4 text-right hover:bg-surface-2"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-2xl" style={{ background: g.tint + "26", color: g.tint }}>
                <Icon name={g.icon} size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black">{g.label}</span>
                <span className="block text-[11px] leading-5 text-muted">{g.desc}</span>
              </span>
              <span className="text-lg opacity-70 transition group-hover:scale-110">{g.art}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isPlayer = game.players.some((p) => p.joinToken === meeting.joinToken);
  const canManage = game.host === meeting.joinToken || meeting.amHost;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHead title={game.label} onClose={onClose} action={
        canManage ? (
          <button onClick={() => void meeting.gameClose()} className="rounded-xl bg-rose-500/15 px-3 py-1.5 text-[11px] font-bold text-rose-400 hover:bg-rose-500/25">
            بستن بازی
          </button>
        ) : null
      } />

      <div className="scroll-thin flex-1 overflow-y-auto p-3">
        {game.status === "waiting" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-2/70 p-4 text-center">
              <p className="text-sm font-black">اتاق آمادهٔ بازی است!</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                {game.players.length} از {faNum(game.maxPlayers)} بازیکن — بازیکنان دیگر از بین حاضران جلسه دعوت به پیوستن شوند.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {game.players.map((p) => (
                  <span key={p.joinToken} className="flex items-center gap-1.5 rounded-full bg-surface-3 py-1 pl-1.5 pr-3 text-xs font-bold">
                    <Avatar name={p.name} color={p.avatarColor} size={22} />
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
            {!isPlayer && (
              <button
                onClick={() => void meeting.gameJoin()}
                disabled={game.players.length >= game.maxPlayers}
                className="grad-accent press w-full rounded-lg py-3 text-sm font-black text-on-accent disabled:opacity-40"
              >
                پیوستن به بازی
              </button>
            )}
            {game.host === meeting.joinToken && (
              <button
                onClick={() => void meeting.gameStart()}
                disabled={game.players.length < 2}
                className="press w-full rounded-lg bg-emerald-500 py-3 text-sm font-black text-[#052e1a] hover:bg-emerald-400 disabled:opacity-40"
              >
                شروع بازی
              </button>
            )}
            {game.host !== meeting.joinToken && isPlayer && (
              <p className="text-center text-xs text-muted">منتظر میزبانِ بازی برای شروع…</p>
            )}
            {game.players.length < 2 && <p className="text-center text-[11px] text-muted">حداقل ۲ بازیکن لازم است.</p>}
          </div>
        )}

        {game.status === "playing" && <Board game={game} meeting={meeting} busy={busy} />}

        {game.status === "finished" && (
          <div className="space-y-4 text-center">
            <div className="rounded-xl bg-gradient-to-b from-amber-400/25 to-transparent p-6">
              <p className="text-4xl">🏆</p>
              <p className="mt-2 text-lg font-black">
                {game.winner ? `${game.players.find((p) => p.joinToken === game.winner)?.name ?? "بازیکن"} برنده شد!` : "مساوی شد!"}
              </p>
            </div>
            <Board game={game} meeting={meeting} busy readOnly />
            {canManage && (
              <button onClick={() => void meeting.gameClose()} className="press w-full rounded-lg bg-surface-2 py-3 text-sm font-bold hover:bg-surface-3">
                بستن و بازی جدید
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Board({ game, meeting, busy: forceBusy }) {
  const [rolling, setRolling] = useState(false);
  const [moving, setMoving] = useState(false);
  const busy = Boolean(forceBusy || moving || rolling);
  const move = async (mv) => {
    if (busy) return;
    setMoving(true);
    if (mv?.action === "roll") setRolling(true);
    try {
      await meeting.gameMove(mv);
    } finally {
      setRolling(false);
      setMoving(false);
    }
  };
  if (game.type === "tictactoe") return <TicTacToe game={game} myToken={meeting.joinToken} onMove={move} busy={busy} />;
  if (game.type === "snakes") return <SnakesLadders game={game} myToken={meeting.joinToken} onMove={move} busy={busy} rolling={rolling} />;
  return <Ludo game={game} myToken={meeting.joinToken} onMove={move} busy={busy} rolling={rolling} />;
}

function PanelHead({ title, onClose, action }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/5 p-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent"><Icon name="gamepad" size={18} /></span>
      <p className="flex-1 truncate px-1 text-sm font-black">{title}</p>
      {action}
      <button onClick={onClose} aria-label="بستن" className="flex h-9 w-9 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
