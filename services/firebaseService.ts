
import { initializeApp, getApps, getApp } from '@firebase/app';
import type { FirebaseApp } from '@firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from '@firebase/auth';
import type { Auth, User } from '@firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from '@firebase/firestore';
import type { Firestore, DocumentReference } from '@firebase/firestore';

import type { BotState } from '../types';
import { firebaseConfig } from '../firebaseConfig';

const isFirebaseEnabled = !!(firebaseConfig && firebaseConfig.apiKey);
const LOCAL_USER_ID = 'local-user-no-sync';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseEnabled) {
  try {
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (e) {
    auth = null; // Ensure auth is null on error
    console.error("Failed to initialize Firebase. Firebase features disabled.", e);
  }
}

const appId = firebaseConfig.appId || 'default-app-id';

// --- Authentication ---

export async function authenticateUser(): Promise<User> {
  if (!auth) {
    console.warn("Firebase not configured or initialized. Running in local mode. State will not be saved.");
    return Promise.resolve({ uid: LOCAL_USER_ID } as User);
  }

  try {
    if (auth.currentUser) return auth.currentUser;

    const userCredential = await signInAnonymously(auth);
    if (!userCredential.user) {
      throw new Error('Anonymous authentication returned null user.');
    }
    return userCredential.user;
  } catch (error) {
    console.error('Firebase authentication failed:', error);
    console.warn("Falling back to local mode. State will not be saved.");
    // Disable Firebase features for the rest of the session to prevent further errors.
    auth = null;
    db = null;
    return Promise.resolve({ uid: LOCAL_USER_ID } as User);
  }
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
    if (!auth) {
        callback({ uid: LOCAL_USER_ID } as User);
        return () => {}; // no-op unsubscribe
    }
    return onAuthStateChanged(auth, callback);
}

// --- Firestore State Management ---

function getDocRef(userId: string): DocumentReference | null {
  if (!db || userId === LOCAL_USER_ID || !appId) return null;
  // Path: /artifacts/{appId}/users/{userId}/botState/main
  return doc(db, `artifacts/${appId}/users/${userId}/botState/main`);
}

export async function saveState(userId: string, state: BotState): Promise<void> {
  if (!db || !userId || userId === LOCAL_USER_ID) return;
  try {
    const docRef = getDocRef(userId);
    if(docRef) {
      await setDoc(docRef, state, { merge: true });
    }
  } catch (error) {
    console.error('Error saving state to Firestore:', error);
  }
}

export function syncState(userId: string, onStateUpdate: (state: BotState) => void): () => void {
  if (!db || !userId || userId === LOCAL_USER_ID) return () => {};
  
  const docRef = getDocRef(userId);
  if (!docRef) return () => {};

  const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
    if (docSnapshot.exists()) {
      onStateUpdate(docSnapshot.data() as BotState);
    }
  }, (error) => {
      console.error("Firestore sync error:", error);
  });
  return unsubscribe;
}
