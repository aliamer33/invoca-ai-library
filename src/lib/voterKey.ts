const VOTER_KEY_STORAGE = "invoca-ai-catalog-voter-key";

function createVoterKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `voter-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Stable anonymous id stored in localStorage for catalog up/down votes. */
export function getVoterKey(): string {
  try {
    const existing = localStorage.getItem(VOTER_KEY_STORAGE);
    if (existing) return existing;

    const key = createVoterKey();
    localStorage.setItem(VOTER_KEY_STORAGE, key);
    return key;
  } catch {
    return createVoterKey();
  }
}
