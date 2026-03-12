// ============================================================
// FIREBASE — single initialization point
// Import once here, pass handles to other modules.
// ============================================================

import { firebaseConfig } from './firebase-config.js';

let app = null;
let auth = null;
let db = null;
let ready = false;
let firebaseModules = null;

/**
 * Check if Firebase config has real keys (not placeholders).
 */
function hasRealConfig() {
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_');
}

/**
 * Initialize Firebase. Call once at app startup.
 * Returns true if Firebase is ready, false if running in demo mode.
 */
export async function initializeFirebase() {
  if (ready) return true;

  if (!hasRealConfig()) {
    console.warn('Firebase not configured — running in demo mode');
    return false;
  }

  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

    app = appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);

    firebaseModules = { auth: authModule, firestore: firestoreModule };
    ready = true;
    return true;
  } catch (err) {
    console.error('Firebase initialization failed:', err);
    return false;
  }
}

export function getAuth() {
  return auth;
}

export function getDb() {
  return db;
}

export function isReady() {
  return ready;
}

export function getFirebaseModules() {
  return firebaseModules;
}
