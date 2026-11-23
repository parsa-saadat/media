import { useState } from "react";
import { faNum } from "../../utils/client";
import { Avatar } from "../common/Ui";
import { Icon } from "../common/Icon";
import TicTacToe from "./TicTacToe";
import SnakesLadders from "./SnakesLadders";
import Ludo from "./Ludo";

const GAME_CARDS = [
  { type: "tictactoe", label: "دوز", desc: "کلاسیک دو نفره؛ سه‌تایی کنار هم بچین (بقیهٔ اعضا تماشاگر)", icon: "hash", art: "✕ ◯" },
  { type: "snakes", label: "مار و پله", desc: "۲ تا ۴ بازیکن · تختهٔ ۱۰۰ خانه با مارها و نردبان‌های دقیق", icon: "rocket", art: "🐍 🪜" },
  { type: "ludo", label: "منچ", desc: "۲ تا ۴ بازیکن · هر نفر ۴ مهره برای رساندن به ۴ خانهٔ پایانی", icon: "gamepad", art: "🎲" },
];

/** The in-meeting games hub: pick a game, gather players or spectators, play & rematch. */
export default function GamesPanel({ meeting, onClose, expanded = false, onToggleExpand }) {
  const game = meeting.game;

  if (!game) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHead title="بازی‌های جلسه" onClose={onClose} expanded={expanded} onToggleExpand={onToggleExpand} />
        <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
          <p className="rounded-xl border border-accent/25 bg-accent/10 p-3 text-[11px] leading-6 text-muted">
            یک بازی انتخاب کنید؛ بازیکنان وارد صندلی بازی می‌شوند و سایر اعضای جلسه (مثلاً نفر سوم در دوز یا نفر پنجم به بعد در منچ و مار و پله) می‌توانند بازی را زنده تماشا کنند.
          </p>
          {GAME_CARDS.map((g, i) => (
            <button
              key={g.type}
              style={{ ["--i"]: i }}
              onClick={() => void meeting.gameCreate(g.type)}
              className="lift group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2/75 p-4 text-right transition hover:border-accent/50 hover:bg-surface-2"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent shadow-sm">
                <Icon name={g.icon} size={23} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-fg">{g.label}</span>
                <span className="block text-[11px] leading-5 text-muted">{g.desc}</span>
              </span>
              <span className="text-lg opacity-80 transition group-hover:scale-110">{g.art}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const inCall = meeting.participants.filter((p) => !p.inLobby);
  const playerTokens = new Set(game.players.map((p) => p.joinToken));
  const isPlayer = playerTokens.has(meeting.joinToken);
  const isFull = game.players.length >= game.maxPlayers;
  const isGameHost = game.host === meeting.joinToken;
  const canManage = isGameHost || meeting.amHost;
  const canRematch = canManage || isPlayer;

  // All non-players currently in the meeting (explicit spectators + any extra attendees watching)
  const explicitSpectators = game.spectators ?? [];
  const isExplicitSpectator = explicitSpectators.some((s) => s.joinToken === meeting.joinToken);
  const watchers = inCall.filter((p) => !playerTokens.has(p.joinToken));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHead
        title={game.label}
        onClose={onClose}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        action={
          <div className="flex items-center gap-1.5">
            {!isPlayer && game.status !== "waiting" && (
              <span className="flex items-center gap-1 rounded-lg border border-accent/35 bg-accent/15 px-2.5 py-1 text-[10px] font-bold text-accent">
                <Icon name="eye" size={12} /> تماشاگر
              </span>
            )}
            {canManage && (
              <button
                onClick={() => void meeting.gameClose()}
                className="rounded-lg border border-rose-500/35 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-500 hover:bg-rose-500/25"
              >
                بستن بازی
              </button>
            )}
          </div>
        }
      />

      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto p-3">
        <div className={expanded ? "mx-auto w-full max-w-2xl py-2" : ""}>
          {game.status === "waiting" && (
          <div className="space-y-3.5">
            <div className="rounded-xl border border-line bg-surface-2/80 p-4 text-center">
              <p className="text-sm font-black text-fg">لابی بازی «{game.label}»</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                {faNum(game.players.length)} از {faNum(game.maxPlayers)} صندلی بازیکن پر شده است
                {isFull ? " · ظرفیت بازیکنان تکمیل است (بقیه تماشاگر خواهند بود)" : ""}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {game.players.map((p, idx) => (
                  <span
                    key={p.joinToken}
                    className="flex items-center gap-1.5 rounded-full border border-line bg-surface-3 py-1 pl-2 pr-2.5 text-xs font-bold text-fg"
                  >
                    <Avatar name={p.name} color={p.avatarColor} size={22} />
                    <span>{p.name}</span>
                    {idx === 0 && <span className="text-[10px] text-accent">★</span>}
                  </span>
                ))}
              </div>

              {explicitSpectators.length > 0 && (
                <div className="mt-3 border-t border-line pt-2.5">
                  <p className="mb-1.5 flex items-center justify-center gap-1 text-[10px] font-bold text-accent">
                    <Icon name="eye" size={12} /> تماشاگران آماده ({faNum(explicitSpectators.length)})
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {explicitSpectators.map((s) => (
                      <span key={s.joinToken} className="rounded-full border border-accent/25 bg-accent/12 px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isPlayer && !isFull && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => void meeting.gameJoin()}
                  className="press flex items-center justify-center gap-1.5 rounded-xl border border-accent/45 bg-accent/20 py-2.5 text-xs font-black text-accent shadow-sm hover:bg-accent/30"
                >
                  <Icon name="gamepad" size={15} /> ورود به‌عنوان بازیکن
                </button>
                <button
                  onClick={() => void meeting.gameSpectate()}
                  disabled={isExplicitSpectator}
                  className="press flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 py-2.5 text-xs font-bold text-fg hover:bg-surface-3 disabled:opacity-60"
                >
                  <Icon name="eye" size={15} /> {isExplicitSpectator ? "در حالت تماشاگر هستید" : "فقط تماشا می‌کنم"}
                </button>
              </div>
            )}

            {!isPlayer && isFull && (
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-3 text-center">
                <p className="flex items-center justify-center gap-1.5 text-xs font-black text-accent">
                  <Icon name="eye" size={15} /> حالت تماشاگر فعال است
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  ظرفیت بازیکنان ({faNum(game.maxPlayers)} نفر) پر است. به محض شروع بازی، صفحهٔ بازی به‌صورت زنده برای شما نمایش داده می‌شود.
                </p>
                {!isExplicitSpectator && (
                  <button
                    onClick={() => void meeting.gameSpectate()}
                    className="press mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-accent/35 bg-accent/18 px-3.5 py-1.5 text-xs font-bold text-accent hover:bg-accent/28"
                  >
                    <Icon name="eye" size={13} /> ثبت در فهرست تماشاگران
                  </button>
                )}
              </div>
            )}

            {isPlayer && !isGameHost && (
              <div className="space-y-2 text-center">
                <p className="text-xs text-muted">شما بازیکن هستید · منتظر شروع بازی توسط سازندهٔ اتاق…</p>
                <button
                  onClick={() => void meeting.gameSpectate()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-muted hover:text-fg"
                >
                  <Icon name="eye" size={13} /> تغییر به حالت تماشاگر (آزاد کردن صندلی)
                </button>
              </div>
            )}

            {isGameHost && (
              <button
                onClick={() => void meeting.gameStart()}
                disabled={game.players.length < 2}
                className="press flex w-full items-center justify-center gap-2 rounded-xl border border-accent/55 bg-accent/22 py-3 text-sm font-black text-accent shadow-md hover:bg-accent/32 disabled:opacity-40"
              >
                <Icon name="play" size={15} /> شروع بازی ({faNum(game.players.length)} بازیکن)
              </button>
            )}

            {game.players.length < 2 && <p className="text-center text-[11px] text-muted">برای شروع حداقل ۲ بازیکن لازم است.</p>}
          </div>
        )}

        {game.status === "playing" && (
          <div className="space-y-3">
            {!isPlayer && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-bold text-accent">
                  <Icon name="eye" size={14} /> در حال تماشای زندهٔ بازی
                </span>
                {watchers.length > 1 && (
                  <span className="text-[10px] text-accent/80">{faNum(watchers.length)} تماشاگر</span>
                )}
              </div>
            )}
            <Board game={game} meeting={meeting} />
            {watchers.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2/50 px-2.5 py-1.5 text-[11px] text-muted">
                <Icon name="eye" size={12} className="text-accent" />
                <span>تماشاگران ({faNum(watchers.length)}):</span>
                {watchers.map((w) => (
                  <span key={w.joinToken} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-fg/85">
                    {w.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {game.status === "finished" && (
          <div className="space-y-4 text-center">
            <div className="rounded-xl border border-accent/35 bg-gradient-to-b from-accent/18 to-surface-2/60 p-5">
              <p className="text-4xl">{game.winner ? "🏆" : "🤝"}</p>
              <p className="mt-2 text-lg font-black text-fg">
                {game.winner
                  ? `${game.players.find((p) => p.joinToken === game.winner)?.name ?? "بازیکن"} برنده شد!`
                  : "بازی مساوی شد!"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {game.winner ? "تبریک! وضعیت نهایی صفحه در پایین قابل مشاهده است." : "رقابت پایاپای بود؛ همهٔ خانه‌ها پر شد."}
              </p>
            </div>

            <Board game={game} meeting={meeting} busy />

            <div className="flex flex-wrap gap-2">
              {canRematch && (
                <button
                  onClick={() => void meeting.gameRematch()}
                  className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-accent/50 bg-accent/20 py-2.5 text-xs font-black text-accent hover:bg-accent/30"
                >
                  <Icon name="refresh" size={14} /> بازی دوباره (دست جدید)
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => void meeting.gameClose()}
                  className="press flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 py-2.5 text-xs font-bold text-fg hover:bg-surface-3"
                >
                  <Icon name="close" size={14} /> انتخاب بازی دیگر
                </button>
              )}
            </div>
          </div>
        )}
        </div>
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

function PanelHead({ title, onClose, action, expanded, onToggleExpand }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <Icon name="gamepad" size={16} />
      </span>
      <p className="flex-1 truncate px-1 text-sm font-black text-fg">{title}</p>
      {action}
      {onToggleExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          title={expanded ? "بازگشت به نمای کناری" : "بزرگ‌نمایی بازی در مقیاس کامل"}
          aria-label={expanded ? "بازگشت به نمای کناری" : "بزرگ‌نمایی بازی"}
          className={`flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition ${
            expanded
              ? "border-accent/45 bg-accent/15 text-accent"
              : "border-line bg-surface-2 text-muted hover:text-fg"
          }`}
        >
          <Icon name={expanded ? "minimize" : "maximize"} size={14} />
          <span className="hidden sm:inline">{expanded ? "کوچک‌نمایی" : "بزرگ‌نمایی"}</span>
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="بستن"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
