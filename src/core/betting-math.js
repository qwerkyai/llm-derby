// ============================================================
// BETTING MATH — pure parimutuel logic
// No DOM. No Firebase. No side effects. Fully testable.
// ============================================================

/**
 * Calculate payouts for a resolved race.
 *
 * Parimutuel: all bets go into a pool. Winners split the total pool
 * proportional to their individual bet vs the winning horse's pool.
 *
 * payout = (myBet / winnerPool) * totalPool
 *
 * If nobody bet on the winner, everyone gets their money back.
 *
 * @param {Array<{uid: string, horse: number, amount: number}>} bets
 * @param {number} winnerHorseId
 * @returns {Array<{uid: string, payout: number}>}
 */
export function calculatePayouts(bets, winnerHorseId) {
  const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);
  const winnerBets = bets.filter((b) => b.horse === winnerHorseId);
  const winnerPool = winnerBets.reduce((sum, b) => sum + b.amount, 0);

  if (winnerPool === 0) {
    // No one picked the winner — refund everyone
    return bets.map((b) => ({ uid: b.uid, payout: b.amount }));
  }

  return winnerBets.map((b) => ({
    uid: b.uid,
    payout: (b.amount / winnerPool) * totalPool,
  }));
}

/**
 * Calculate implied odds from pool totals.
 *
 * odds = totalPool / horsePool
 * e.g. if totalPool=100 and horsePool=25, odds are 4:1
 *
 * @param {Object<string, number>} pools - { horseId: totalAmount }
 * @returns {Object<string, number>} - { horseId: odds }
 */
export function calculateOdds(pools) {
  const total = Object.values(pools).reduce((a, b) => a + b, 0);
  if (total === 0) return {};
  const odds = {};
  for (const [horse, amount] of Object.entries(pools)) {
    odds[horse] = total / amount;
  }
  return odds;
}
