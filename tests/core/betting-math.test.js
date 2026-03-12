import { describe, it, expect } from 'vitest';
import { calculatePayouts, calculateOdds } from '../../src/core/betting-math.js';

describe('calculatePayouts', () => {
  it('distributes total pool to winners proportionally', () => {
    const bets = [
      { uid: 'alice', horse: 0, amount: 50 },
      { uid: 'bob', horse: 1, amount: 30 },
      { uid: 'charlie', horse: 0, amount: 20 },
    ];
    const payouts = calculatePayouts(bets, 0);
    // Winner pool = 70 (alice 50 + charlie 20), total = 100
    expect(payouts.length).toBe(2);
    expect(payouts[0].uid).toBe('alice');
    expect(payouts[0].payout).toBeCloseTo(71.43, 1); // (50/70) * 100
    expect(payouts[1].uid).toBe('charlie');
    expect(payouts[1].payout).toBeCloseTo(28.57, 1); // (20/70) * 100
  });

  it('refunds everyone when no one bet on winner', () => {
    const bets = [
      { uid: 'alice', horse: 0, amount: 50 },
      { uid: 'bob', horse: 1, amount: 30 },
    ];
    const payouts = calculatePayouts(bets, 2); // horse 2 wins, nobody bet on it
    expect(payouts.length).toBe(2);
    expect(payouts[0].uid).toBe('alice');
    expect(payouts[0].payout).toBe(50);
    expect(payouts[1].uid).toBe('bob');
    expect(payouts[1].payout).toBe(30);
  });

  it('handles single bettor winning', () => {
    const bets = [{ uid: 'alice', horse: 0, amount: 100 }];
    const payouts = calculatePayouts(bets, 0);
    expect(payouts.length).toBe(1);
    expect(payouts[0].payout).toBe(100);
  });

  it('handles empty bets array', () => {
    const payouts = calculatePayouts([], 0);
    expect(payouts).toEqual([]);
  });

  it('gives winner all money when they are only winner bettor', () => {
    const bets = [
      { uid: 'alice', horse: 0, amount: 10 },
      { uid: 'bob', horse: 1, amount: 40 },
      { uid: 'charlie', horse: 1, amount: 50 },
    ];
    const payouts = calculatePayouts(bets, 0);
    expect(payouts.length).toBe(1);
    expect(payouts[0].uid).toBe('alice');
    expect(payouts[0].payout).toBe(100); // alice gets entire pool
  });
});

describe('calculateOdds', () => {
  it('calculates implied odds from pool totals', () => {
    const pools = { 0: 50, 1: 30, 2: 20 };
    const odds = calculateOdds(pools);
    expect(odds[0]).toBe(2); // 100/50
    expect(odds[1]).toBeCloseTo(3.33, 1); // 100/30
    expect(odds[2]).toBe(5); // 100/20
  });

  it('returns empty for empty pools', () => {
    const odds = calculateOdds({});
    expect(odds).toEqual({});
  });

  it('returns 1:1 odds when single horse has all bets', () => {
    const pools = { 0: 100 };
    const odds = calculateOdds(pools);
    expect(odds[0]).toBe(1);
  });
});
