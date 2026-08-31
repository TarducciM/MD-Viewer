import { beforeEach, describe, expect, it } from "vitest";
import { dismissRatingPromptForever, recordLaunch, shouldShowRatingPrompt, snoozeRatingPrompt } from "./appRating";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = 1_700_000_000_000;

beforeEach(() => {
  localStorage.clear();
});

describe("shouldShowRatingPrompt", () => {
  it("stays false before the launch-count threshold is met", () => {
    for (let i = 0; i < 4; i++) recordLaunch(START + i * DAY_MS);
    expect(shouldShowRatingPrompt(START + 10 * DAY_MS)).toBe(false);
  });

  it("stays false before enough days have passed since first launch", () => {
    for (let i = 0; i < 6; i++) recordLaunch(START);
    expect(shouldShowRatingPrompt(START + DAY_MS)).toBe(false);
  });

  it("becomes true once both thresholds are met", () => {
    for (let i = 0; i < 6; i++) recordLaunch(START);
    expect(shouldShowRatingPrompt(START + 4 * DAY_MS)).toBe(true);
  });

  it("stays false for the snooze window after snoozing", () => {
    for (let i = 0; i < 6; i++) recordLaunch(START);
    const now = START + 4 * DAY_MS;
    snoozeRatingPrompt(now);
    expect(shouldShowRatingPrompt(now + DAY_MS)).toBe(false);
    expect(shouldShowRatingPrompt(now + 20 * DAY_MS)).toBe(true);
  });

  it("stays false forever after a permanent dismissal", () => {
    for (let i = 0; i < 6; i++) recordLaunch(START);
    const now = START + 4 * DAY_MS;
    dismissRatingPromptForever(now);
    expect(shouldShowRatingPrompt(now + 365 * DAY_MS)).toBe(false);
  });
});
