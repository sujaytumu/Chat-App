// Tic-tac-toe inside a chat. X = whoever sent the challenge, O = the 1:1 partner, or the first group member to join.
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

export function winnerOf(board) {
  for (const l of LINES) {
    const [a, b, c] = l;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line: l };
  }
  return { winner: board.every(Boolean) ? "draw" : null, line: null };
}

// A fresh game from the client's request. Only tic-tac-toe exists; everything else is refused.
export function newGame(raw, senderId, receiverId) {
  if (raw?.kind !== "ttt") return null;
  return { kind: "ttt", board: Array(9).fill(""), x: String(senderId), o: receiverId ? String(receiverId) : undefined, turn: "X" };
}

// Which mark may this person play right now? "X", "O", or "O" by joining an open seat (group games) — else null.
export function seatFor(game, userId, isGroup) {
  const me = String(userId);
  if (String(game.x) === me) return { mark: "X", join: false };
  if (game.o && String(game.o) === me) return { mark: "O", join: false };
  if (isGroup && !game.o) return { mark: "O", join: true };
  return null;
}

// The state after `mark` plays `cell`, or null when the move is not allowed (not your turn, taken, game over).
export function applyMove(game, cell, mark) {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) return null;
  if (game.winner || game.turn !== mark || game.board[cell]) return null;
  const board = [...game.board];
  board[cell] = mark;
  const { winner } = winnerOf(board);
  return { board, turn: mark === "X" ? "O" : "X", winner };
}
