import type { Catalog } from './catalog.js';
import { granularityOf, parseKey, toKey } from './keys.js';
import type { Granularity, Mode, RequestedMode, Sequence, View } from './types.js';

export interface SequenceInput {
    catalog: Catalog;
    selection: readonly string[];
    view: View;
    mode: RequestedMode;
    granularity: Granularity;
    limit?: number;
}

const EMPTY: Sequence = { mode: null, keys: [], truncated: false };

interface Anchor {
    year: number | null;
    month: number | null;
    day: number | null;
    hour: number | null;
}

const anchor = (input: SequenceInput): Anchor => {
    const first = input.selection[0];
    if (first) {
        const { year, month, day, hour } = parseKey(first);
        return { year, month, day, hour };
    }
    const { view } = input;
    if (view.year !== null) return { year: view.year, month: view.month, day: view.day, hour: view.hour };
    const latest = input.catalog.latest('hour');
    if (!latest) return { year: null, month: null, day: null, hour: null };
    const { year, month, day, hour } = parseKey(latest);
    return { year, month, day, hour };
};

const ofGranularity = (selection: readonly string[], granularity: Granularity): string[] =>
    selection.filter(key => granularityOf(key) === granularity);

const build = (input: SequenceInput, mode: Mode): Sequence => {
    const { catalog } = input;
    if (mode === 'timeline') {
        const { keys, truncated } = catalog.keys(input.granularity, input.limit);
        return { mode, keys, truncated };
    }
    if (mode === 'year') {
        const chosen = ofGranularity(input.selection, 'year');
        const keys = chosen.length >= 2 ? chosen : catalog.years().map(year => toKey(year));
        return { mode, keys, truncated: false };
    }
    const { year, month, day, hour } = anchor(input);
    if (year === null) return EMPTY;
    if (mode === 'month') {
        const chosen = ofGranularity(input.selection, 'month');
        const keys = chosen.length >= 2 ? chosen : catalog.months(year).map(item => toKey(year, item));
        return { mode, keys, truncated: false };
    }
    if (month === null) return EMPTY;
    if (mode === 'day') {
        const chosen = ofGranularity(input.selection, 'day');
        const keys = chosen.length >= 2 ? chosen : catalog.days(year, month).map(item => toKey(year, month, item));
        return { mode, keys, truncated: false };
    }
    if (day === null) return EMPTY;
    if (mode === 'hour') {
        const chosen = ofGranularity(input.selection, 'hour');
        const keys = chosen.length >= 2 ? chosen : catalog.hours(year, month, day).map(item => toKey(year, month, day, item));
        return { mode, keys, truncated: false };
    }
    if (hour === null) return EMPTY;
    const chosen = ofGranularity(input.selection, 'minute');
    const keys = chosen.length >= 2 ? chosen : catalog.minutes(year, month, day, hour).map(item => toKey(year, month, day, hour, item));
    return { mode, keys, truncated: false };
};

const CANDIDATES: Record<Granularity | 'none', Mode[]> = {
    minute: ['minute', 'hour', 'day', 'month', 'year', 'timeline'],
    hour: ['hour', 'day', 'month', 'year', 'timeline'],
    day: ['day', 'month', 'year', 'timeline'],
    month: ['month', 'year', 'timeline'],
    year: ['year', 'month', 'timeline'],
    none: ['year', 'month', 'timeline'],
};

const VIEW_CANDIDATES: Record<View['level'], Mode[]> = {
    years: ['year', 'month', 'timeline'],
    months: ['month', 'year', 'timeline'],
    days: ['day', 'month', 'year', 'timeline'],
    hours: ['hour', 'day', 'month', 'year', 'timeline'],
    minutes: ['minute', 'hour', 'day', 'month', 'year', 'timeline'],
};

export const buildSequence = (input: SequenceInput): Sequence => {
    if (input.catalog.empty) return EMPTY;
    if (input.mode !== 'auto') {
        const sequence = build(input, input.mode);
        return sequence.keys.length >= 2 ? sequence : { ...sequence, keys: [] };
    }
    const first = input.selection[0];
    const candidates = first ? CANDIDATES[granularityOf(first)] : VIEW_CANDIDATES[input.view.level] ?? CANDIDATES.none;
    for (const mode of candidates) {
        const sequence = build(input, mode);
        if (sequence.keys.length >= 2) return sequence;
    }
    return EMPTY;
};
