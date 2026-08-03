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

/**
 * Merges `patch` into the existing stored profile (creating one if absent).
 * JSON-merge-patch semantics: a key explicitly set to `undefined` in `patch`
 * deletes that key from the stored profile; an omitted key is left untouched.
 */
export function saveSharedProfile(patch: Partial<SharedProfile>): void {
  try {
    const existing = loadSharedProfile() || {};
    const merged: SharedProfile = { ...existing, ...patch };
    for (const key of Object.keys(patch) as (keyof SharedProfile)[]) {
      if (patch[key] === undefined) delete merged[key];
    }
    localStorage.setItem(SHARED_KEY, JSON.stringify(merged));
  } catch (e) {
    // ignore
  }
}
