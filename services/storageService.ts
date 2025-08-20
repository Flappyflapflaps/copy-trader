import type { BotState } from '../types';
import type { User } from '@firebase/auth';

const LOCAL_STORAGE_KEY = 'solana-copy-trader-state';
const LOCAL_USER_ID = 'local-user';

export function authenticateUser(): Promise<User> {
  return Promise.resolve({ uid: LOCAL_USER_ID } as User);
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
    callback({ uid: LOCAL_USER_ID } as User);
    return () => {}; // No-op unsubscribe for local storage
}

export function saveState(userId: string, state: BotState): void {
  if (userId !== LOCAL_USER_ID) return;
  try {
    const stateToSave = JSON.stringify(state);
    localStorage.setItem(LOCAL_STORAGE_KEY, stateToSave);
  } catch (error) {
    console.error('Error saving state to localStorage:', error);
  }
}

export function syncState(userId: string, onStateUpdate: (state: BotState) => void): () => void {
  if (userId !== LOCAL_USER_ID) return () => {};

  try {
    const savedStateJSON = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedStateJSON) {
      const savedState = JSON.parse(savedStateJSON);
      // Ensure savedWallets is always an array
      if (!savedState.savedWallets) {
        savedState.savedWallets = [];
      }
      onStateUpdate(savedState);
    }
  } catch (error) {
    console.error('Error reading state from localStorage:', error);
  }

  // For localStorage, we don't need an active listener like with Firebase.
  // We just load the state once. The component's own state management handles the rest.
  return () => {}; // Return a no-op unsubscribe function
}