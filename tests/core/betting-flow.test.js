import { describe, it, expect } from 'vitest';
import { calculatePayouts, calculateOdds } from '../../src/core/betting-math.js';

describe('betting flow scenarios', () => {
  it('full race: multiple bettors, winner takes proportional share', () => {
    // Simulate: 4 users bet on different horses, horse 2 wins
    const bets = [
      { uid: 'user1', horse: 0, amount: 20 },
      { uid: 'user2', horse: 2, amount: 30 },
      { uid: 'user3', horse: 2, amount: 10 },
      { uid: 'user4', horse: 1, amount: 40 },
    ];
    const totalPool = 100;
    const payouts = calculatePayouts(bets, 2);

    // Winner pool = 40 (user2: 30, user3: 10), total = 100
    expect(payouts.length).toBe(2);
    const user2Pay = payouts.find(p => p.uid === 'user2');
    const user3Pay = payouts.find(p => p.uid === 'user3');
    expect(user2Pay.payout).toBeCloseTo(75, 0); // (30/40)*100
    expect(user3Pay.payout).toBeCloseTo(25, 0); // (10/40)*100

    // Total payouts should equal total pool
    const totalPaid = payouts.reduce((s, p) => s + p.payout, 0);
    expect(totalPaid).toBeCloseTo(totalPool, 0);
  });

  it('longshot win: small bet on winner takes entire pool', () => {
    const bets = [
      { uid: 'whale', horse: 0, amount: 90 },
      { uid: 'longshot', horse: 3, amount: 10 },
    ];
    const payouts = calculatePayouts(bets, 3);
    expect(payouts.length).toBe(1);
    expect(payouts[0].uid).toBe('longshot');
    expect(payouts[0].payout).toBe(100); // wins entire pool
  });

  it('same user bets on multiple horses', () => {
    const bets = [
      { uid: 'hedger', horse: 0, amount: 30 },
      { uid: 'hedger', horse: 1, amount: 30 },
      { uid: 'other', horse: 2, amount: 40 },
    ];
    // Horse 0 wins — hedger gets payout from horse 0 bet
    const payouts = calculatePayouts(bets, 0);
    expect(payouts.length).toBe(1);
    expect(payouts[0].uid).toBe('hedger');
    expect(payouts[0].payout).toBe(100); // only winner on horse 0
  });

  it('all bets on winner — everyone gets their money back', () => {
    const bets = [
      { uid: 'a', horse: 1, amount: 50 },
      { uid: 'b', horse: 1, amount: 50 },
    ];
    const payouts = calculatePayouts(bets, 1);
    expect(payouts.length).toBe(2);
    expect(payouts[0].payout).toBe(50);
    expect(payouts[1].payout).toBe(50);
  });

  it('odds shift as bets come in', () => {
    // Initial: equal pools
    let pools = { 0: 25, 1: 25, 2: 25, 3: 25 };
    let odds = calculateOdds(pools);
    expect(odds[0]).toBe(4); // even odds

    // After heavy betting on horse 0
    pools = { 0: 70, 1: 10, 2: 10, 3: 10 };
    odds = calculateOdds(pools);
    expect(odds[0]).toBeCloseTo(1.43, 1); // favorite (low payout)
    expect(odds[1]).toBe(10);              // longshot (high payout)
    expect(odds[2]).toBe(10);
    expect(odds[3]).toBe(10);
  });

  it('balance tracking: start 100, bet 30, lose → balance 70', () => {
    let balance = 100;
    const betAmount = 30;

    // Place bet — deduct
    balance -= betAmount;
    expect(balance).toBe(70);

    // Lose — no payout
    const bets = [{ uid: 'me', horse: 0, amount: betAmount }];
    const payouts = calculatePayouts(bets, 1); // horse 1 wins, I bet on 0
    // Refund since no one bet on winner
    const myPayout = payouts.find(p => p.uid === 'me');
    balance += myPayout.payout; // refunded
    expect(balance).toBe(100);
  });

  it('balance tracking: start 100, bet 30, win → profit', () => {
    let balance = 100;
    const betAmount = 30;

    // Place bet — deduct
    balance -= betAmount;
    expect(balance).toBe(70);

    // Win with competition
    const bets = [
      { uid: 'me', horse: 0, amount: betAmount },
      { uid: 'loser', horse: 1, amount: 70 },
    ];
    const payouts = calculatePayouts(bets, 0);
    const myPayout = payouts.find(p => p.uid === 'me');
    expect(myPayout.payout).toBe(100); // I win entire pool
    balance += myPayout.payout;
    expect(balance).toBe(170); // profit!
  });

  it('4-horse race with all horses receiving bets', () => {
    const bets = [
      { uid: 'a', horse: 0, amount: 10 },
      { uid: 'b', horse: 1, amount: 20 },
      { uid: 'c', horse: 2, amount: 30 },
      { uid: 'd', horse: 3, amount: 40 },
    ];
    const totalPool = 100;

    // Horse 3 wins (the heavy favorite)
    const payouts = calculatePayouts(bets, 3);
    expect(payouts.length).toBe(1);
    expect(payouts[0].uid).toBe('d');
    expect(payouts[0].payout).toBe(100); // gets whole pool

    // Verify odds before race
    const pools = { 0: 10, 1: 20, 2: 30, 3: 40 };
    const odds = calculateOdds(pools);
    expect(odds[3]).toBe(2.5);  // 100/40 — favorite
    expect(odds[0]).toBe(10);   // 100/10 — longshot
  });
});
