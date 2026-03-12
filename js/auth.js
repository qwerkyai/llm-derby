// ============================================================
// AUTH — Firebase authentication (Google + email/password)
// ============================================================

import { firebaseConfig } from './firebase-config.js';

let auth = null;
let db = null;
let firebaseReady = false;
let authStateCallbacks = [];
let currentUser = null;

// Initialize Firebase (lazy, CDN-based)
async function ensureFirebase() {
  if (firebaseReady) return;

  // Check if config has real keys
  if (firebaseConfig.apiKey === 'YOUR_API_KEY') {
    console.warn('Firebase not configured — running in demo mode (no auth)');
    firebaseReady = false;
    return;
  }

  try {
    // Dynamic import from CDN
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getAuth, onAuthStateChanged: onASC, signInWithPopup, GoogleAuthProvider,
            signInWithEmailAndPassword, createUserWithEmailAndPassword,
            updateProfile, signOut: fbSignOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Store module references for use in other functions
    window._fbAuth = {
      signInWithPopup, GoogleAuthProvider,
      signInWithEmailAndPassword, createUserWithEmailAndPassword,
      updateProfile, signOut: fbSignOut
    };
    window._fbStore = { doc, getDoc, setDoc, serverTimestamp };

    // Auth state listener
    onASC(auth, async (user) => {
      currentUser = user;
      if (user) {
        // Ensure user doc exists in Firestore
        await ensureUserDoc(user);
      }
      authStateCallbacks.forEach(cb => cb(user));
    });

    firebaseReady = true;
  } catch (err) {
    console.error('Firebase init failed:', err);
    firebaseReady = false;
  }
}

// Create user doc on first login with 100 starting balance
async function ensureUserDoc(user) {
  if (!db) return;
  const { doc, getDoc, setDoc, serverTimestamp } = window._fbStore;
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      displayName: user.displayName || user.email || 'Anonymous',
      balance: 100,
      createdAt: serverTimestamp()
    });
  }
}

// Get user's balance from Firestore
export async function getUserBalance(uid) {
  if (!db || !uid) return 100;
  const { doc, getDoc } = window._fbStore;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data().balance : 100;
}

// ---- Public API ----

export async function initAuth() {
  await ensureFirebase();
  // If Firebase failed, notify callbacks with null
  if (!firebaseReady) {
    authStateCallbacks.forEach(cb => cb(null));
  }
}

export async function signInWithGoogle() {
  if (!firebaseReady || !auth) {
    console.warn('Firebase not ready');
    return null;
  }
  const { signInWithPopup, GoogleAuthProvider } = window._fbAuth;
  try {
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    return result.user;
  } catch (err) {
    console.error('Google sign-in failed:', err);
    throw err;
  }
}

export async function signInWithEmail(email, password) {
  if (!firebaseReady || !auth) return null;
  const { signInWithEmailAndPassword } = window._fbAuth;
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (err) {
    console.error('Email sign-in failed:', err);
    throw err;
  }
}

export async function registerWithEmail(email, password, displayName) {
  if (!firebaseReady || !auth) return null;
  const { createUserWithEmailAndPassword, updateProfile } = window._fbAuth;
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    return result.user;
  } catch (err) {
    console.error('Registration failed:', err);
    throw err;
  }
}

export async function signOut() {
  if (!firebaseReady || !auth) return;
  const { signOut: fbSignOut } = window._fbAuth;
  await fbSignOut(auth);
  currentUser = null;
}

export function onAuthStateChanged(callback) {
  authStateCallbacks.push(callback);
  // If we already know the state, call immediately
  if (firebaseReady && currentUser !== undefined) {
    callback(currentUser);
  }
}

export function getCurrentUser() {
  return currentUser;
}

export function isFirebaseReady() {
  return firebaseReady;
}

export function getDb() {
  return db;
}
