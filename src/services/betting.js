// ============================================================
// BETTING SERVICE — Firestore operations for parimutuel betting
// ============================================================

import { getDb, isReady, getFirebaseModules } from './firebase.js';
import { getCurrentUser } from './auth.js';
import { calculatePayouts, calculateOdds } from '../core/betting-math.js';

// Re-export pure logic for direct use
export { calculatePayouts, calculateOdds };

/**
 * Create a new betting event. Returns the event ID.
 */
export async function createEvent() {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user) return null;

  const { firestore } = getFirebaseModules();
  const ref = await firestore.addDoc(firestore.collection(db, 'events'), {
    status: 'open',
    createdBy: user.uid,
    createdAt: firestore.serverTimestamp(),
    winner: null,
  });
  return ref.id;
}

/**
 * Place a bet on a horse. Validates balance and event status.
 * Uses a transaction to prevent race conditions on balance.
 */
export async function placeBet(eventId, horseId, amount) {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user || !eventId) {
    throw new Error('Missing required parameters for placing bet');
  }

  const { firestore } = getFirebaseModules();
  const userRef = firestore.doc(db, 'users', user.uid);
  const eventRef = firestore.doc(db, 'events', eventId);

  await firestore.runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) throw new Error('User account not found');

    const balance = userSnap.data().balance;
    if (amount < 1 || amount > balance) throw new Error('Insufficient balance');

    const eventSnap = await transaction.get(eventRef);
    if (!eventSnap.exists() || eventSnap.data().status !== 'open') {
      throw new Error('Betting is not open');
    }

    transaction.update(userRef, { balance: firestore.increment(-amount) });
  });

  // Add the bet document (outside transaction — subcollection writes)
  await firestore.addDoc(firestore.collection(db, 'events', eventId, 'bets'), {
    uid: user.uid,
    displayName: user.displayName || user.email || 'Anonymous',
    horse: horseId,
    amount,
    timestamp: firestore.serverTimestamp(),
  });

  return true;
}

/**
 * Lock bets for an event (race is starting).
 */
export async function lockBets(eventId) {
  const db = getDb();
  if (!db || !eventId) return;
  const { firestore } = getFirebaseModules();
  await firestore.updateDoc(firestore.doc(db, 'events', eventId), { status: 'locked' });
}

/**
 * Resolve an event: calculate payouts and credit winners.
 */
export async function resolveEvent(eventId, winnerHorseId) {
  const db = getDb();
  if (!db || !eventId) return null;

  const { firestore } = getFirebaseModules();
  const betsSnap = await firestore.getDocs(firestore.collection(db, 'events', eventId, 'bets'));
  const bets = [];
  betsSnap.forEach((d) => bets.push({ id: d.id, ...d.data() }));

  const payouts = calculatePayouts(bets, winnerHorseId);

  for (const p of payouts) {
    const userRef = firestore.doc(db, 'users', p.uid);
    await firestore.updateDoc(userRef, { balance: firestore.increment(p.payout) });
  }

  await firestore.updateDoc(firestore.doc(db, 'events', eventId), {
    status: 'resolved',
    winner: winnerHorseId,
  });

  return payouts;
}

/**
 * Subscribe to real-time pool updates for an event.
 * Returns an unsubscribe function.
 */
export function subscribeToPool(eventId, callback) {
  const db = getDb();
  if (!db || !eventId) return () => {};

  let unsub = () => {};
  const { firestore } = getFirebaseModules();
  unsub = firestore.onSnapshot(firestore.collection(db, 'events', eventId, 'bets'), (snap) => {
    const pools = {};
    let total = 0;
    snap.forEach((d) => {
      const data = d.data();
      pools[data.horse] = (pools[data.horse] || 0) + data.amount;
      total += data.amount;
    });
    callback({ pools, total });
  });
  return () => unsub();
}
