import { HttpError } from "../../utils/http/http.util.js";
import { deleteGames, findLatestGame, findOneGame, insertGame, updateOneGame } from "../../model/controller/games/games.controller.js";

export const GAME_TYPES = ["tictactoe", "snakes", "ludo"];
export const GAME_LABELS = { tictactoe: "دوز", snakes: "مار و پله", ludo: "منچ" };
/** Max players per game type. */
const MAX_PLAYERS = { tictactoe: 2, snakes: 4, ludo: 4 };
const PLAYER_COLORS = ["#f43f5e", "#3b82f6", "#10b981", "#f59e0b"];

/* ── snakes & ladders: the classic 1..100 board layout ── */
const LADDERS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
const SNAKES = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };

const roll = () => 1 + Math.floor(Math.random() * 6);

const tokenOf = (game, joinToken) => game.players.findIndex((p) => p.joinToken === joinToken);

function tictactoeLines(cells) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) return cells[a];
  }
  return cells.every(Boolean) ? "draw" : null;
}

/* ── ludo helpers ── */
// Main track has 52 shared cells. Each seat enters at its own offset. A token's position is its
// progress in its own frame: -1 = yard, 0..50 = track, 51..55 = home column, 56 = finished.
const HOME_ENTRY = 51; // own-frame step where the home column starts
const FINISH = 56;
const safeCells = [0, 8, 13, 21, 26, 34, 39, 47]; // every seat's start cell + star cells

const globalCell = (seat, ownPos) => (ownPos + seat * 13) % 52;
const isSafe = (globalPos) => safeCells.includes(globalPos);

/** Legal own-frame destinations for every token of the current player after `dice`. */
function ludoLegalMoves(state, seat) {
  const positions = state.tokens[seat];
  const moves = [];
  for (let t = 0; t < 4; t++) {
    const p = positions[t];
    if (p === FINISH) continue;
    if (p === -1) {
      if (state.dice === 6) moves.push({ token: t, to: 0, from: -1 });
      continue;
    }
    const to = p + state.dice;
    if (to > FINISH) continue; // exact roll required to enter home
    moves.push({ token: t, to, from: p });
  }
  return moves;
}

function ludoCapture(state, seat, to) {
  if (to >= HOME_ENTRY) return null; // home column is private — nobody gets captured there
  const cell = globalCell(seat, to);
  if (isSafe(cell)) return null;
  for (let other = 0; other < state.tokens.length; other++) {
    if (other === seat) continue;
    for (let t = 0; t < 4; t++) {
      const p = state.tokens[other][t];
      if (p >= 0 && p < HOME_ENTRY && globalCell(other, p) === cell) {
        state.tokens[other][t] = -1;
        return other;
      }
    }
  }
  return null;
}

const ludoAllHome = (positions) => positions.every((p) => p === FINISH);
const ludoHasAnyLegal = (state, seat) => ludoLegalMoves(state, seat).length > 0;

function nextPlayer(game, state) {
  const n = game.players.length;
  state.seat = (state.seat + 1) % n;
  state.dice = null;
  state.rolled = false;
  state.sixStreak = 0;
}

/** Creates the pending game for a meeting. Any earlier game is closed. */
export async function createGame(meeting, participant, type) {
  if (!GAME_TYPES.includes(type)) throw new HttpError(400, "بازی ناشناخته است");
  const current = await findOneGame({ meetingId: meeting._id, status: { $in: ["waiting", "playing"] } });
  if (current) throw new HttpError(409, "یک بازی در این جلسه از قبل باز است");
  return insertGame({
    meetingId: meeting._id,
    type,
    label: GAME_LABELS[type],
    status: "waiting",
    players: [{ joinToken: participant.joinToken, name: participant.name, avatarColor: participant.avatarColor }],
    maxPlayers: MAX_PLAYERS[type],
    host: participant.joinToken,
    turn: null,
    winner: null,
    state: initialFor(type, 1),
    lastEvent: "",
  });
}

function initialFor(type, seats) {
  if (type === "tictactoe") return { cells: Array(9).fill(null), seat: 0 };
  if (type === "snakes") return { positions: Array(seats).fill(0), last: null };
  return { tokens: Array.from({ length: seats }, () => [-1, -1, -1, -1]), dice: null, rolled: false, seat: 0, sixStreak: 0, message: "" };
}

/** Public shape of a game for every participant in the meeting. */
export function publicGame(game) {
  if (!game) return null;
  return {
    id: game._id,
    type: game.type,
    label: game.label,
    status: game.status,
    players: game.players,
    maxPlayers: game.maxPlayers,
    host: game.host,
    turn: game.turn,
    winner: game.winner,
    state: game.state,
    lastEvent: game.lastEvent,
  };
}

export async function activeGame(meetingId) {
  // the open game, or the one that just finished — so the winner screen stays visible for a while
  const cutoff = new Date(Date.now() - 10 * 60_000);
  return findLatestGame(meetingId, cutoff);
}

export async function joinGame(meeting, participant) {
  const game = await activeGame(meeting._id);
  if (!game) throw new HttpError(404, "بازی بازی فعالی نیست");
  if (game.status !== "waiting") throw new HttpError(409, "بازی شروع شده است");
  if (tokenOf(game, participant.joinToken) >= 0) throw new HttpError(409, "شما داخل بازی هستید");
  if (game.players.length >= game.maxPlayers) throw new HttpError(409, "ظرفیت بازی پر است");
  game.players.push({ joinToken: participant.joinToken, name: participant.name, avatarColor: participant.avatarColor });
  const state = game.state;
  if (game.type === "snakes") state.positions.push(0);
  if (game.type === "ludo") state.tokens.push([-1, -1, -1, -1]);
  const updated = await updateOneGame({ _id: game._id }, { players: game.players, state });
  return { game: publicGame(updated), joined: participant.name };
}

export async function startGame(meeting, participant) {
  const game = await activeGame(meeting._id);
  if (!game) throw new HttpError(404, "بازی فعالی نیست");
  if (game.host !== participant.joinToken) throw new HttpError(403, "فقط سازندهٔ بازی شروعش می‌کند");
  if (game.status !== "waiting") throw new HttpError(409, "بازی از قبل شروع شده است");
  if (game.players.length < 2) throw new HttpError(400, "حداقل دو بازیکن لازم است");
  game.turn = game.players[0].joinToken;
  const updated = await updateOneGame(
    { _id: game._id },
    { status: "playing", turn: game.turn, state: game.state, lastEvent: "بازی شروع شد" },
  );
  return { game: publicGame(updated) };
}

export async function closeGame(meeting, participant, force) {
  const game = await activeGame(meeting._id);
  if (!game) return { closed: false };
  const isHostOfMeeting = force && participant;
  if (game.host !== participant?.joinToken && !isHostOfMeeting) throw new HttpError(403, "اجازهٔ بستن بازی را ندارید");
  await deleteGames({ _id: game._id });
  return { closed: true };
}

/** The meeting host (or the end of the meeting) closes whatever is on the board — active OR the
    game that just finished, which is why the status filter must not narrow this down. */
export async function closeActive(meetingId) {
  await deleteGames({ meetingId });
  return { closed: true };
}

/** A participant left (or was kicked): their tokens leave the board; a 2-player game ends. */
export async function removeParticipantFromGames(meetingId, joinToken) {
  const game = await activeGame(meetingId);
  if (!game) return;
  const index = tokenOf(game, joinToken);
  if (index < 0) return;
  const rest = game.players.filter((_, i) => i !== index);
  if (game.status === "waiting" || rest.length < 2) {
    await deleteGames({ _id: game._id });
    return;
  }
  const state = game.state;
  if (game.type === "snakes") state.positions.splice(index, 1);
  if (game.type === "ludo") state.tokens.splice(index, 1);
  // re-seat every state keyed by seat index
  if (game.type === "ludo") state.seat = Math.max(0, Math.min(state.seat > index ? state.seat - 1 : state.seat, rest.length - 1));
  if (game.type === "tictactoe" && game.turn === joinToken) game.turn = rest[0].joinToken;
  const turn = game.turn === joinToken ? rest[0].joinToken : game.turn;
  await updateOneGame(
    { _id: game._id },
    {
      players: rest,
      state,
      turn,
      status: game.type === "tictactoe" ? "playing" : game.status,
      lastEvent: `${game.players[index].name} بازی را ترک کرد`,
    },
  );
}

/** Applies one move. The server owns every dice roll, so clients cannot cheat. */
export async function applyMove(meeting, participant, move) {
  const game = await activeGame(meeting._id);
  if (!game) throw new HttpError(404, "بازی فعالی نیست");
  if (game.status !== "playing") throw new HttpError(409, "بازی در جریان نیست");
  if (game.turn !== participant.joinToken) throw new HttpError(409, "نوبت شما نیست");
  const seat = tokenOf(game, participant.joinToken);
  if (seat < 0) throw new HttpError(403, "شما بازیکن این بازی نیستید");
  const state = game.state;
  let event = "";
  let patch = {};

  if (game.type === "tictactoe") {
    const cell = Math.trunc(Number(move?.cell));
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new HttpError(400, "خانهٔ نامعتبر است");
    if (state.cells[cell]) throw new HttpError(409, "این خانه پر است");
    state.cells[cell] = seat === 0 ? "X" : "O";
    const result = tictactoeLines(state.cells);
    if (result === "draw") {
      Object.assign(patch, { status: "finished", winner: null, turn: null, lastEvent: "مساوی شد" });
      event = "مساوی";
    } else if (result) {
      Object.assign(patch, { status: "finished", winner: participant.joinToken, turn: null, lastEvent: `${participant.name} برد` });
      event = "برد";
    } else {
      const next = game.players[(seat + 1) % game.players.length].joinToken;
      Object.assign(patch, { turn: next, state });
      event = "حرکت";
    }
  } else if (game.type === "snakes") {
    if (move?.action !== "roll") throw new HttpError(400, "اقدام نامعتبر است");
    const dice = roll();
    const from = state.positions[seat];
    const stepTarget = Math.min(100, from + dice);
    let pos = stepTarget;
    let note = "";
    const rollSeq = (state.rollSeq ?? 0) + 1;
    state.rollSeq = rollSeq;
    if (pos === 100) {
      Object.assign(patch, { status: "finished", winner: participant.joinToken, turn: null, lastEvent: `${participant.name} برنده شد` });
      state.positions[seat] = 100;
      state.last = { seq: rollSeq, seat, name: participant.name, dice, from, mid: 100, to: 100, note: "پیروزی" };
      event = "برد";
    } else {
      if (LADDERS[pos]) {
        note = `نردبان تا ${LADDERS[pos]}`;
        pos = LADDERS[pos];
      } else if (SNAKES[pos]) {
        note = `مار تا ${SNAKES[pos]}`;
        pos = SNAKES[pos];
      }
      state.positions[seat] = pos;
      state.last = { seq: rollSeq, seat, name: participant.name, dice, from, mid: stepTarget, to: pos, note };
      const next = game.players[(seat + 1) % game.players.length].joinToken;
      Object.assign(patch, { turn: next, state });
      event = note || "حرکت";
    }
  } else if (game.type === "ludo") {
    if (move?.action === "roll") {
      if (state.rolled) throw new HttpError(409, "تاس قبلاً ریخته شده؛ مهره را حرکت دهید");
      const dice = roll();
      const rollSeq = (state.rollSeq ?? 0) + 1;
      state.rollSeq = rollSeq;
      state.dice = dice;
      state.lastRoll = { seq: rollSeq, seat, name: participant.name, dice };
      state.rolled = true;
      const legalMoves = ludoLegalMoves(state, seat);
      if (dice === 6) {
        state.sixStreak += 1;
        if (state.sixStreak >= 3) {
          state.message = `تاس ۶ آمد — سه بار شش متوالی! نوبت به بازیکن بعدی رفت`;
          nextPlayer(game, state);
          state.dice = 6;
          Object.assign(patch, { state, turn: game.players[state.seat].joinToken });
          event = "سه‌تاشش";
        } else if (!legalMoves.length) {
          state.message = `${participant.name} تاس ${dice} آورد — حرکتی نداشت`;
          nextPlayer(game, state);
          state.dice = dice;
          Object.assign(patch, { state, turn: game.players[state.seat].joinToken });
          event = "بدون حرکت";
        } else {
          state.message = "";
          Object.assign(patch, { state });
          event = `تاس ${dice}`;
        }
      } else {
        state.sixStreak = 0;
        if (!legalMoves.length) {
          state.message = `${participant.name} تاس ${dice} آورد (برای ورود مهره ۶ لازم است)`;
          nextPlayer(game, state);
          state.dice = dice;
          Object.assign(patch, { state, turn: game.players[state.seat].joinToken });
          event = `تاس ${dice} — بدون حرکت`;
        } else {
          state.message = "";
          Object.assign(patch, { state });
          event = `تاس ${dice}`;
        }
      }
    } else if (move?.action === "move") {
      if (!state.rolled) throw new HttpError(409, "اول تاس بریزید");
      const legal = ludoLegalMoves(state, seat).find((m) => m.token === Math.trunc(Number(move.token)));
      if (!legal) throw new HttpError(400, "این حرکت مجاز نیست");
      const t = legal.token;
      const usedDice = state.dice;
      const moveSeq = (state.moveSeq ?? 0) + 1;
      state.moveSeq = moveSeq;
      state.tokens[seat][t] = legal.to;
      let again = usedDice === 6;
      const captured = ludoCapture(state, seat, legal.to);
      state.lastMove = {
        seq: moveSeq,
        seat,
        token: t,
        from: legal.from,
        to: legal.to,
        dice: usedDice,
        capturedSeat: captured,
      };
      if (captured !== null) {
        again = true;
        event = `مهرهٔ ${game.players[captured].name} زده شد`;
        state.message = "یک مهره زده شد — جایزه: دوباره تاس بریزید!";
      } else if (legal.to === FINISH) {
        again = true;
        state.message = "مهره به خانه رسید — جایزه: دوباره تاس بریزید!";
      } else if (again) {
        state.message = "تاس ۶ — یک بار دیگر تاس بریزید!";
      }
      if (ludoAllHome(state.tokens[seat])) {
        Object.assign(patch, { status: "finished", winner: participant.joinToken, turn: null, state, lastEvent: `${participant.name} برنده شد` });
        event = "برد";
      } else if (again) {
        state.rolled = false;
        Object.assign(patch, { state });
        event = event || "دوباره بریز";
      } else {
        state.message = "";
        nextPlayer(game, state);
        state.dice = usedDice;
        Object.assign(patch, { state, turn: game.players[state.seat].joinToken });
        event = event || "حرکت";
      }
    } else {
      throw new HttpError(400, "اقدام نامعتبر است");
    }
  }

  if (!Object.keys(patch).length) patch = { state };
  const updated = await updateOneGame({ _id: game._id }, { ...patch, lastEvent: event || game.lastEvent });
  return { game: publicGame(updated), event };
}
