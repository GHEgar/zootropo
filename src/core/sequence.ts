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

const anchor = (input: SequenceInput): { year: number | null; month: number | null } => {
    const first = input.selection[0];
    if (first) {
        const { year, month } = parseKey(first);
        return { year, month };
    }
    if (input.view.year !== null) return { year: input.view.year, month: input.view.month };
    const latest = input.catalog.latest('month');
    if (!latest) return { year: null, month: null };
    const { year, month } = parseKey(latest);
    return { year, month };
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
    const { year, month } = anchor(input);
    if (year === null) return EMPTY;
    if (mode === 'month') {
        const chosen = ofGranularity(input.selection, 'month');
        const keys = chosen.length >= 2 ? chosen : catalog.months(year).map(item => toKey(year, item));
        return { mode, keys, truncated: false };
    }
    if (month === null) return EMPTY;
    const chosen = ofGranularity(input.selection, 'day');
    const keys = chosen.length >= 2 ? chosen : catalog.days(year, month).map(day => toKey(year, month, day));
    return { mode, keys, truncated: false };
};

const CANDIDATES: Record<Granularity | 'none', Mode[]> = {
    day: ['day', 'month', 'year', 'timeline'],
    month: ['month', 'year', 'timeline'],
    year: ['year', 'month', 'timeline'],
    none: ['year', 'month', 'timeline'],
};

const VIEW_CANDIDATES: Record<View['level'], Mode[]> = {
    years: ['year', 'month', 'timeline'],
    months: ['month', 'year', 'timeline'],
    days: ['day', 'month', 'year', 'timeline'],
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
