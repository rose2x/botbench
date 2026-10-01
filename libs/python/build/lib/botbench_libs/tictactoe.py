"""Tic-tac-toe with an unbeatable computer player (minimax with alpha-beta).

A board is a 9-character string of "X", "O" and "." read row by row, so "XX.OO...." has X and O each two in a row.
"""
from __future__ import annotations

from typing import Optional

LINES = ((0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6))


def winner(board: str) -> Optional[str]:
    """"X" or "O" if someone has three in a row, else None."""
    for a, b, c in LINES:
        if board[a] != "." and board[a] == board[b] == board[c]:
            return board[a]
    return None


def is_full(board: str) -> bool:
    return "." not in board


def moves(board: str) -> list:
    return [i for i, c in enumerate(board) if c == "."]


def play(board: str, index: int, player: str) -> str:
    if board[index] != ".":
        raise ValueError("That square is taken")
    return board[:index] + player + board[index + 1:]


def _score(board: str, me: str, turn: str, alpha: int, beta: int, depth: int) -> int:
    w = winner(board)
    if w:
        return 10 - depth if w == me else depth - 10
    if is_full(board):
        return 0
    other = "O" if turn == "X" else "X"
    if turn == me:
        best = -100
        for m in moves(board):
            best = max(best, _score(play(board, m, turn), me, other, alpha, beta, depth + 1))
            alpha = max(alpha, best)
            if alpha >= beta:
                break
        return best
    best = 100
    for m in moves(board):
        best = min(best, _score(play(board, m, turn), me, other, alpha, beta, depth + 1))
        beta = min(beta, best)
        if alpha >= beta:
            break
    return best


def best_move(board: str, player: str) -> int:
    """The best square for `player` to play. Ties go to the lowest index. Raises if the game is over."""
    if winner(board) or is_full(board):
        raise ValueError("The game is over")
    other = "O" if player == "X" else "X"
    best, best_score = -1, -100
    for m in moves(board):
        s = _score(play(board, m, player), player, other, -100, 100, 1)
        if s > best_score:
            best, best_score = m, s
    return best
