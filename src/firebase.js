import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, getDocs, query, where, limit } from 'firebase/firestore';
import {
  getAuth, setPersistence, browserSessionPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COL = 'factoryos';

const auth = getAuth(app);
// Default persistence is session-only: a login must not survive a full browser restart, since
// shared shop-floor terminals get handed off between operators across shift changes. Each
// sign-in can override this via signIn's `remember` flag (operators' personal phones).
setPersistence(auth, browserSessionPersistence);

const USERS_COL = 'factoryos_users';
const toEmail = username => `${username.trim().toLowerCase()}@factoryos.local`;

export const fb = {
  async get(key) {
    try { const s = await getDoc(doc(db, COL, key)); return s.exists() ? s.data().value : null; } catch (e) { return null; }
  },
  async set(key, value) {
    try { await setDoc(doc(db, COL, key), { value, updatedAt: Date.now() }); return true; } catch (e) { return false; }
  },
  sub(key, cb) {
    return onSnapshot(doc(db, COL, key), s => cb(s.exists() ? s.data().value : null), e => console.error(e));
  },

  // ── Auth ──────────────────────────────────────────
  async signIn(username, password, remember = false) {
    // Per-login persistence: shared shop-floor terminals stay session-only (cleared on browser
    // close); an operator's personal phone can opt into surviving restarts via "Keep me signed
    // in on this device" on the login screen.
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, toEmail(username), password);
    return cred.user;
  },
  async signOutUser() {
    await signOut(auth);
  },
  onAuthChange(cb) {
    return onAuthStateChanged(auth, cb);
  },

  // ── User profiles (factoryos_users/{uid}) ──────────
  async getUserProfile(uid) {
    try { const s = await getDoc(doc(db, USERS_COL, uid)); return s.exists() ? { uid, ...s.data() } : null; } catch (e) { return null; }
  },
  // Admin/supervisor only, per Firestore rules.
  async listUserProfiles() {
    try {
      const snap = await getDocs(collection(db, USERS_COL));
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    } catch (e) { return []; }
  },
  // Admin/supervisor only, per Firestore rules. Used to resolve another operator's wage
  // (e.g. a supervisor completing a shift on someone else's behalf).
  async findUserProfileByUsername(username) {
    try {
      const q = query(collection(db, USERS_COL), where('username', '==', username), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { uid: d.id, ...d.data() };
    } catch (e) { return null; }
  },
  // Creates the user against a throwaway secondary Firebase App instance so the admin's own
  // session (on the primary instance) is never signed out mid-flow.
  async createUserWithProfile(username, password, profile) {
    const secondary = initializeApp(firebaseConfig, 'secondary-' + Date.now());
    try {
      const secondaryAuth = getAuth(secondary);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, toEmail(username), password);
      await setDoc(doc(db, USERS_COL, cred.user.uid), { username, ...profile });
      return cred.user.uid;
    } finally {
      await deleteApp(secondary);
    }
  },
  // Admin only, per Firestore rules.
  async setUserProfile(uid, profile) {
    await setDoc(doc(db, USERS_COL, uid), profile);
    return true;
  },
  // Admin only, enforced inside the deleteUserAccount Cloud Function (functions/index.js).
  // Deletes both the Firebase Auth credential and the profile doc — full revocation in one call.
  // firebase/functions is imported on demand — this is the only call site, admin-only, so the
  // SDK's functions module stays out of everyone else's initial download.
  async deleteUserProfile(uid) {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const deleteUserAccount = httpsCallable(getFunctions(app), 'deleteUserAccount');
    await deleteUserAccount({ uid });
    return true;
  },
  // Admin only, enforced inside the resetUserPassword Cloud Function (same admin-check
  // pattern as deleteUserAccount). The in-app fix for forgotten passwords.
  async resetUserPassword(uid, newPassword) {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const resetFn = httpsCallable(getFunctions(app), 'resetUserPassword');
    await resetFn({ uid, newPassword });
    return true;
  },
};
