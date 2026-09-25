'use strict';
// Tic-tac-toe with an unbeatable computer player (minimax with alpha-beta).
// A board is a 9-character string of "X", "O" and "." read row by row, so "XX.OO...." has X and O each two in a row.

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

/** "X" or "O" if someone has three in a row, else null. */
function winner(board) {
  for (const [a, b, c] of LINES) if (board[a] !== '.' && board[a] === board[b] && board[b] === board[c]) return board[a];
  return null;
}
const isFull = (board) => !board.includes('.');
const moves = (board) => [...board].flatMap((c, i) => (c === '.' ? [i] : []));
function play(board, index, player) {
  if (board[index] !== '.') throw new Error('That square is taken');
  return board.slice(0, index) + player + board.slice(index + 1);
}

function score(board, me, turn, alpha, beta, depth) {
  const w = winner(board);
  if (w) return w === me ? 10 - depth : depth - 10;
  if (isFull(board)) return 0;
  const other = turn === 'X' ? 'O' : 'X';
  if (turn === me) {
    let best = -100;
    for (const m of moves(board)) {
      best = Math.max(best, score(play(board, m, turn), me, other, alpha, beta, depth + 1));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }
  let best = 100;
  for (const m of moves(board)) {
    best = Math.min(best, score(play(board, m, turn), me, other, alpha, beta, depth + 1));
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

/** The best square for `player` to play. Ties go to the lowest index. Throws if the game is over. */
function bestMove(board, player) {
  if (winner(board) || isFull(board)) throw new Error('The game is over');
  const other = player === 'X' ? 'O' : 'X';
  let best = -1;
  let bestScore = -100;
  for (const m of moves(board)) {
    const s = score(play(board, m, player), player, other, -100, 100, 1);
    if (s > bestScore) { best = m; bestScore = s; }
  }
  return best;
}

module.exports = { winner, isFull, moves, play, bestMove };
