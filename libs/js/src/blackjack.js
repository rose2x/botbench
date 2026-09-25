'use strict';
// Blackjack rules. Cards are strings like "AS", "10H", "KD" (rank then suit S, H, D, C).
// The dealer stands on all 17s. `outcome` compares a finished player hand with the dealer's.

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];

const newDeck = () => SUITS.flatMap((s) => RANKS.map((r) => r + s));

/** Returns a shuffled copy (Fisher-Yates). rng(n) gives an integer in [0, n). */
function shuffle(cards, rng = (n) => Math.floor(Math.random() * n)) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const rankOf = (card) => card.slice(0, -1);
const cardValue = (card) => { const r = rankOf(card); return r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(r) ? 10 : parseInt(r, 10); };

/** { total: best total without busting if possible, soft: true if an ace is counted as 11 }. */
function handValue(cards) {
  let total = cards.reduce((n, c) => n + cardValue(c), 0);
  let aces = cards.filter((c) => rankOf(c) === 'A').length;
  while (total > 21 && aces) { total -= 10; aces -= 1; }
  return { total, soft: aces > 0 && total <= 21 };
}
const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
const isBust = (cards) => handValue(cards).total > 21;
const dealerShouldHit = (cards) => handValue(cards).total < 17;

/** "player_blackjack", "player", "dealer" or "push". */
function outcome(player, dealer) {
  if (isBust(player)) return 'dealer';
  const [pbj, dbj] = [isBlackjack(player), isBlackjack(dealer)];
  if (pbj && dbj) return 'push';
  if (pbj) return 'player_blackjack';
  if (dbj) return 'dealer';
  if (isBust(dealer)) return 'player';
  const [p, d] = [handValue(player).total, handValue(dealer).total];
  return p > d ? 'player' : d > p ? 'dealer' : 'push';
}

module.exports = { newDeck, shuffle, cardValue, handValue, isBlackjack, isBust, dealerShouldHit, outcome };
