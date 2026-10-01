'use strict';
// Pure functions for a virtual currency: no storage opinions, so any database works.
//
//   const [newFrom, newTo] = applyTransfer(balanceA, balanceB, 100);
//   const { ready, amount } = dailyReward(lastClaimTs, nowTs);

const DEFAULT_COOLDOWN = 86400; // 24 hours
const DEFAULT_REWARD_RANGE = [50, 150];

class InsufficientFundsError extends Error {}

const canAfford = (balance, amount) => amount > 0 && balance >= amount;

/** Returns [newFrom, newTo]. Throws for a non-positive amount, or InsufficientFundsError if short. */
function applyTransfer(balanceFrom, balanceTo, amount) {
  if (amount <= 0) throw new Error('Transfer amount must be positive');
  if (balanceFrom < amount) throw new InsufficientFundsError(`Balance ${balanceFrom} is short of ${amount}`);
  return [balanceFrom - amount, balanceTo + amount];
}

/** { ready: true, amount } or { ready: false, retryAfter: seconds }. rng(lo, hi) picks the reward. */
function dailyReward(lastClaimedTs, nowTs, { cooldownSeconds = DEFAULT_COOLDOWN, rewardRange = DEFAULT_REWARD_RANGE, rng = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)) } = {}) {
  if (lastClaimedTs !== null && lastClaimedTs !== undefined) {
    const left = cooldownSeconds - (nowTs - lastClaimedTs);
    if (left > 0) return { ready: false, retryAfter: left, amount: 0 };
  }
  return { ready: true, retryAfter: 0, amount: rng(rewardRange[0], rewardRange[1]) };
}

const formatCurrency = (amount, symbol = '🪙') => `${amount.toLocaleString('en-US')} ${symbol}`;

module.exports = { canAfford, applyTransfer, dailyReward, formatCurrency, InsufficientFundsError, DEFAULT_COOLDOWN, DEFAULT_REWARD_RANGE };
