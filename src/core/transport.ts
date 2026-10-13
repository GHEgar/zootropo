import type { Direction } from './types.js';

export const DEFAULT_INTERVAL_MS = 1000;
export const MIN_INTERVAL_MS = 100;
export const MAX_INTERVAL_MS = 10_000;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const INTERVAL_PRESETS: readonly number[] = [250, 500, 1000, 2000, 3000];

export const clampInterval = (ms: number): number =>
    Number.isFinite(ms) ? Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(ms))) : DEFAULT_INTERVAL_MS;

export const normalizeDirection = (direction: string | undefined): Direction => (direction === 'backward' ? 'backward' : 'forward');

export const nextPreset = (current: number, presets: readonly number[] = INTERVAL_PRESETS): number => {
    if (presets.length === 0) return current;
    const index = presets.indexOf(current);
    return presets[(index + 1) % presets.length] as number;
};

export const nextIndex = (index: number, length: number, delta: number, loop: boolean): number | null => {
    if (length === 0) return null;
    if (index < 0) return delta >= 0 ? 0 : length - 1;
    const target = index + delta;
    if (loop) return ((target % length) + length) % length;
    return target < 0 || target >= length ? null : target;
};
