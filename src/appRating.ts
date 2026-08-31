const STORAGE_KEY = "mdviewer.rating";
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_LAUNCHES = 5;
const MIN_DAYS_SINCE_FIRST_LAUNCH = 3;
const SNOOZE_DAYS = 14;

interface RatingState {
  firstLaunch: number;
  launchCount: number;
  dismissed: boolean;
  snoozeUntil: number | null;
}

function loadState(now: number): RatingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return {
          firstLaunch: typeof parsed.firstLaunch === "number" ? parsed.firstLaunch : now,
          launchCount: typeof parsed.launchCount === "number" ? parsed.launchCount : 0,
          dismissed: Boolean(parsed.dismissed),
          snoozeUntil: typeof parsed.snoozeUntil === "number" ? parsed.snoozeUntil : null,
        };
      }
    }
  } catch {
    // fall through to a fresh default state
  }
  return { firstLaunch: now, launchCount: 0, dismissed: false, snoozeUntil: null };
}

function saveState(state: RatingState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function recordLaunch(now: number): void {
  const state = loadState(now);
  state.launchCount += 1;
  saveState(state);
}

export function shouldShowRatingPrompt(now: number): boolean {
  const state = loadState(now);
  if (state.dismissed) return false;
  if (state.snoozeUntil !== null && now < state.snoozeUntil) return false;
  if (state.launchCount < MIN_LAUNCHES) return false;
  return now - state.firstLaunch >= MIN_DAYS_SINCE_FIRST_LAUNCH * DAY_MS;
}

export function snoozeRatingPrompt(now: number): void {
  const state = loadState(now);
  state.snoozeUntil = now + SNOOZE_DAYS * DAY_MS;
  saveState(state);
}

export function dismissRatingPromptForever(now: number): void {
  const state = loadState(now);
  state.dismissed = true;
  saveState(state);
}
