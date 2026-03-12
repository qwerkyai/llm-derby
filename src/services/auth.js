// ============================================================
// AUTH SERVICE — Firebase authentication state machine
// ============================================================

import { initializeFirebase, getAuth, getDb, isReady, getFirebaseModules } from './firebase.js';

let currentUser = null;
const authStateCallbacks = [];

/**
 * Create user doc in Firestore on first login with 100 starting balance.
 */
async function ensureUserDoc(user) {
  const db = getDb();
  if (!db) return;
  const { firestore } = getFirebaseModules();
  const userRef = firestore.doc(db, 'users', user.uid);
  const snap = await firestore.getDoc(userRef);
  if (!snap.exists()) {
    await firestore.setDoc(userRef, {
      displayName: user.displayName || user.email || 'Anonymous',
      balance: 100,
      createdAt: firestore.serverTimestamp(),
    });
  }
}

/**
 * Get user's balance from Firestore.
 */
export async function getUserBalance(uid) {
  const db = getDb();
  if (!db || !uid) return 100;
  const { firestore } = getFirebaseModules();
  const snap = await firestore.getDoc(firestore.doc(db, 'users', uid));
  return snap.exists() ? snap.data().balance : 100;
}

/**
 * Initialize auth. Sets up the auth state listener.
 */
export async function initAuth() {
  const firebaseReady = await initializeFirebase();
  if (!firebaseReady) {
    authStateCallbacks.forEach((cb) => cb(null));
    return;
  }

  const authInstance = getAuth();
  const { auth: authModule } = getFirebaseModules();

  authModule.onAuthStateChanged(authInstance, async (user) => {
    currentUser = user;
    if (user) {
      try {
        await ensureUserDoc(user);
      } catch (err) {
        console.error('Failed to ensure user doc:', err);
      }
    }
    authStateCallbacks.forEach((cb) => cb(user));
  });
}

export async function signInWithGoogle() {
  if (!isReady()) throw new Error('Firebase not ready');
  const authInstance = getAuth();
  const { auth: authModule } = getFirebaseModules();
  const result = await authModule.signInWithPopup(authInstance, new authModule.GoogleAuthProvider());
  return result.user;
}

export async function signInWithEmail(email, password) {
  if (!isReady()) throw new Error('Firebase not ready');
  const authInstance = getAuth();
  const { auth: authModule } = getFirebaseModules();
  const result = await authModule.signInWithEmailAndPassword(authInstance, email, password);
  return result.user;
}

export async function registerWithEmail(email, password, displayName) {
  if (!isReady()) throw new Error('Firebase not ready');
  const authInstance = getAuth();
  const { auth: authModule } = getFirebaseModules();
  const result = await authModule.createUserWithEmailAndPassword(authInstance, email, password);
  if (displayName) {
    await authModule.updateProfile(result.user, { displayName });
  }
  return result.user;
}

export async function signOut() {
  if (!isReady()) return;
  const authInstance = getAuth();
  const { auth: authModule } = getFirebaseModules();
  await authModule.signOut(authInstance);
  currentUser = null;
}

export function onAuthStateChanged(callback) {
  authStateCallbacks.push(callback);
  if (isReady() && currentUser !== undefined) {
    callback(currentUser);
  }
}

export function getCurrentUser() {
  return currentUser;
}
