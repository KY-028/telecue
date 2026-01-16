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
// Map store speed -> normalized 0..100
// Piecewise logic: 
// Range 1: GLOBAL_MIN_SPEED -> 2.0 maps to 0 -> 80
// Range 2: 2.0 -> GLOBAL_MAX_SPEED maps to 80 -> 100
const SPEED_BREAKPOINT = 2.0;
const NORM_BREAKPOINT = 80;

export const speedToNormalized = (speed: number) => {
    const s = Math.min(Math.max(speed ?? GLOBAL_MIN_SPEED, GLOBAL_MIN_SPEED), GLOBAL_MAX_SPEED);

    // If the breakpoint is out of range or irrelevant, fall back to linear (safety)
    if (SPEED_BREAKPOINT <= GLOBAL_MIN_SPEED || SPEED_BREAKPOINT >= GLOBAL_MAX_SPEED) {
        return ((s - GLOBAL_MIN_SPEED) / (GLOBAL_MAX_SPEED - GLOBAL_MIN_SPEED)) * 100;
    }

    if (s <= SPEED_BREAKPOINT) {
        // Map [GLOBAL_MIN_SPEED, SPEED_BREAKPOINT] -> [0, NORM_BREAKPOINT]
        const rangeSpeed = SPEED_BREAKPOINT - GLOBAL_MIN_SPEED;
        const rangeNorm = NORM_BREAKPOINT - 0;
        return ((s - GLOBAL_MIN_SPEED) / rangeSpeed) * rangeNorm;
    } else {
        // Map (SPEED_BREAKPOINT, GLOBAL_MAX_SPEED] -> (NORM_BREAKPOINT, 100]
        const rangeSpeed = GLOBAL_MAX_SPEED - SPEED_BREAKPOINT;
        const rangeNorm = 100 - NORM_BREAKPOINT;
        return NORM_BREAKPOINT + ((s - SPEED_BREAKPOINT) / rangeSpeed) * rangeNorm;
    }
};

// Map normalized (0..100) -> store speed (the value you'll save to activeScript)
export const normalizedToSpeed = (norm: number) => {
    const n = Math.min(Math.max(norm, NORM_MIN), NORM_MAX);

    // Safety fallback
    if (SPEED_BREAKPOINT <= GLOBAL_MIN_SPEED || SPEED_BREAKPOINT >= GLOBAL_MAX_SPEED) {
        return GLOBAL_MIN_SPEED + (n / 100) * (GLOBAL_MAX_SPEED - GLOBAL_MIN_SPEED);
    }

    if (n <= NORM_BREAKPOINT) {
        // Map [0, NORM_BREAKPOINT] -> [GLOBAL_MIN_SPEED, SPEED_BREAKPOINT]
        const rangeNorm = NORM_BREAKPOINT;
        const rangeSpeed = SPEED_BREAKPOINT - GLOBAL_MIN_SPEED;
        return GLOBAL_MIN_SPEED + (n / rangeNorm) * rangeSpeed;
    } else {
        // Map (NORM_BREAKPOINT, 100] -> (SPEED_BREAKPOINT, GLOBAL_MAX_SPEED]
        const rangeNorm = 100 - NORM_BREAKPOINT;
        const rangeSpeed = GLOBAL_MAX_SPEED - SPEED_BREAKPOINT;
        return SPEED_BREAKPOINT + ((n - NORM_BREAKPOINT) / rangeNorm) * rangeSpeed;
    }
};
