export const SHARED_KEY = 'nyc_shared_profile';

export interface SharedProfile {
  accounts?: unknown;
  annualIncome?: number;
  otherDebts?: number;
  [key: string]: unknown;
}

export function loadSharedProfile(): SharedProfile | null {
  try {
    const s = localStorage.getItem(SHARED_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

/** Merges `patch` into the existing stored profile (creating one if absent). */
export function saveSharedProfile(patch: Partial<SharedProfile>): void {
  try {
    const existing = loadSharedProfile() || {};
    localStorage.setItem(SHARED_KEY, JSON.stringify({ ...existing, ...patch }));
  } catch (e) {
    // ignore
  }
}
