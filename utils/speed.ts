import { FIXED_MIN, FIXED_MAX, WPM_MIN, WPM_MAX } from '../constants/prompter';

// convert between WPM <-> store speed (your original formula)
export const wpmToSpeed = (wpm: number) => (wpm - 30) / 100;
export const speedToWpm = (speed: number) => Math.round(speed * 100 + 30);

// Build a global speed domain that ensures consistency.
export const GLOBAL_MIN_SPEED = Math.max(FIXED_MIN, wpmToSpeed(WPM_MIN));
export const GLOBAL_MAX_SPEED = Math.max(FIXED_MAX, wpmToSpeed(WPM_MAX));

// Normalized slider domain (UI stays stable 0..100)
export const NORM_MIN = 0;
export const NORM_MAX = 100;

// Map store speed -> normalized 0..100
export const speedToNormalized = (speed: number) => {
    const s = Math.min(Math.max(speed ?? GLOBAL_MIN_SPEED, GLOBAL_MIN_SPEED), GLOBAL_MAX_SPEED);
    return ((s - GLOBAL_MIN_SPEED) / (GLOBAL_MAX_SPEED - GLOBAL_MIN_SPEED)) * 100;
};

// Map normalized (0..100) -> store speed (the value you'll save to activeScript)
export const normalizedToSpeed = (norm: number) => {
    const n = Math.min(Math.max(norm, NORM_MIN), NORM_MAX) / 100;
    return GLOBAL_MIN_SPEED + n * (GLOBAL_MAX_SPEED - GLOBAL_MIN_SPEED);
};
