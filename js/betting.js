// ============================================================
// BETTING — parimutuel logic with Firestore backend
// ============================================================

import { getDb, getCurrentUser } from './auth.js';

// ---- Firestore Operations ----

export async function createEvent() {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user) return null;

  const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  const ref = await addDoc(collection(db, 'events'), {
    status: 'open',
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    winner: null
  });
  return ref.id;
}

export async function placeBet(eventId, horseId, amount) {
  const db = getDb();
  const user = getCurrentUser();
  if (!db || !user || !eventId) return false;

  const { doc, getDoc, addDoc, collection, updateDoc, serverTimestamp, increment } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  // Validate balance
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return false;
  const balance = userSnap.data().balance;
  if (amount < 1 || amount > balance) return false;

  // Validate event is open
  const eventRef = doc(db, 'events', eventId);
  const eventSnap = await getDoc(eventRef);
  if (!eventSnap.exists() || eventSnap.data().status !== 'open') return false;

  // Place bet and deduct balance
  await addDoc(collection(db, 'events', eventId, 'bets'), {
    uid: user.uid,
    displayName: user.displayName || user.email || 'Anonymous',
    horse: horseId,
    amount: amount,
    timestamp: serverTimestamp()
  });
  await updateDoc(userRef, { balance: increment(-amount) });
  return true;
}

export async function lockBets(eventId) {
  const db = getDb();
  if (!db || !eventId) return;
  const { doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
  await updateDoc(doc(db, 'events', eventId), { status: 'locked' });
}

export async function resolveEvent(eventId, winnerHorseId) {
  const db = getDb();
  if (!db || !eventId) return;

  const { doc, getDocs, updateDoc, collection, increment } =
    await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  // Get all bets
  const betsSnap = await getDocs(collection(db, 'events', eventId, 'bets'));
  const bets = [];
  betsSnap.forEach(d => bets.push({ id: d.id, ...d.data() }));

  // Calculate payouts
  const payouts = calculatePayouts(bets, winnerHorseId);

  // Credit winners
  for (const p of payouts) {
    const userRef = doc(db, 'users', p.uid);
    await updateDoc(userRef, { balance: increment(p.payout) });
  }

  // Mark event resolved
  await updateDoc(doc(db, 'events', eventId), {
    status: 'resolved',
    winner: winnerHorseId
  });

  return payouts;
}

export async function getPoolTotals(eventId) {
  const db = getDb();
  if (!db || !eventId) return {};
  const { getDocs, collection } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  const betsSnap = await getDocs(collection(db, 'events', eventId, 'bets'));
  const pools = {};
  betsSnap.forEach(d => {
    const data = d.data();
    pools[data.horse] = (pools[data.horse] || 0) + data.amount;
  });
  return pools;
}

export async function getUserBets(eventId, uid) {
  const db = getDb();
  if (!db || !eventId || !uid) return [];
  const { getDocs, collection, query, where } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  const q = query(collection(db, 'events', eventId, 'bets'), where('uid', '==', uid));
  const snap = await getDocs(q);
  const bets = [];
  snap.forEach(d => bets.push({ id: d.id, ...d.data() }));
  return bets;
}

// Subscribe to real-time pool updates
export function subscribeToPool(eventId, callback) {
  const db = getDb();
  if (!db || !eventId) return () => {};

  let unsub = () => {};
  import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').then(({ collection, onSnapshot }) => {
    unsub = onSnapshot(collection(db, 'events', eventId, 'bets'), (snap) => {
      const pools = {};
      let total = 0;
      snap.forEach(d => {
        const data = d.data();
        pools[data.horse] = (pools[data.horse] || 0) + data.amount;
        total += data.amount;
      });
      callback({ pools, total });
    });
  });
  return () => unsub();
}

// ---- Pure Logic (no Firestore needed) ----

export function calculatePayouts(bets, winnerHorseId) {
  const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);
  const winnerBets = bets.filter(b => b.horse === winnerHorseId);
  const winnerPool = winnerBets.reduce((sum, b) => sum + b.amount, 0);

  if (winnerPool === 0) {
    return bets.map(b => ({ uid: b.uid, payout: b.amount }));
  }

  return winnerBets.map(b => ({
    uid: b.uid,
    payout: (b.amount / winnerPool) * totalPool
  }));
}

// Calculate implied odds from pool totals
export function calculateOdds(pools) {
  const total = Object.values(pools).reduce((a, b) => a + b, 0);
  if (total === 0) return {};
  const odds = {};
  for (const [horse, amount] of Object.entries(pools)) {
    odds[horse] = total / amount;
  }
  return odds;
}
