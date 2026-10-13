import { formatInstant, parseInstant, parseTimeDimension, type Instant, type ParseOptions } from './iso.js';
import { civil, firstDay, isKey, keyOfDay, lastDay, shiftKey, sortKeys, toKey } from './keys.js';
import type { Granularity, TimeDimension, TimeRange } from './types.js';

export interface Catalog {
    readonly instants: readonly string[];
    readonly ranges: readonly TimeRange[];
    readonly empty: boolean;
    years(): number[];
    months(year: number): number[];
    days(year: number, month: number): number[];
    has(key: string): boolean;
    isAvailable(iso: string): boolean;
    keys(granularity: Granularity, limit?: number): { keys: string[]; truncated: boolean };
    slice(key: string): [number, number];
    rangesIn(key: string): TimeRange[];
    latest(granularity: Granularity): string | null;
    earliest(granularity: Granularity): string | null;
}

export type CatalogInput = string | readonly string[] | TimeDimension | Catalog;

interface Span {
    start: Instant;
    end: Instant;
}

const DAY_MS = 86_400_000;

export const isCatalog = (value: unknown): value is Catalog =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Catalog).years === 'function' && typeof (value as Catalog).rangesIn === 'function';

const toDimension = (input: Exclude<CatalogInput, Catalog>, options: ParseOptions): TimeDimension => {
    if (typeof input === 'string') return parseTimeDimension(input, options);
    if (Array.isArray(input)) return parseTimeDimension((input as readonly string[]).join(','), options);
    return input as TimeDimension;
};

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);

const lowerBound = (entries: readonly Instant[], day: number): number => {
    let low = 0;
    let high = entries.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if ((entries[middle] as Instant).day < day) low = middle + 1;
        else high = middle;
    }
    return low;
};

export const createCatalog = (input: CatalogInput, options: ParseOptions = {}): Catalog => {
    if (isCatalog(input)) return input;
    const dimension = toDimension(input, options);
    const byAt = new Map<number, Instant>();
    for (const text of dimension.instants) {
        const instant = parseInstant(text);
        if (instant && !byAt.has(instant.at)) byAt.set(instant.at, instant);
    }
    const entries = [...byAt.values()].sort((a, b) => a.at - b.at);
    const spans: Span[] = [];
    for (const item of dimension.ranges) {
        const start = parseInstant(item.start);
        const end = parseInstant(item.end);
        if (start && end && end.at >= start.at) spans.push({ start, end });
    }
    spans.sort((a, b) => a.start.at - b.start.at);

    const tree = new Map<number, Map<number, Set<number>>>();
    for (const entry of entries) {
        const [year, month, day] = civil(entry.day);
        const months = tree.get(year) ?? new Map<number, Set<number>>();
        tree.set(year, months);
        const days = months.get(month) ?? new Set<number>();
        months.set(month, days);
        days.add(day);
    }

    const overlapping = (from: number, to: number): Span[] => spans.filter(span => span.start.day <= to && span.end.day >= from);
    const sorted = (values: Iterable<number>): number[] => [...new Set(values)].sort((a, b) => a - b);

    const slice = (key: string): [number, number] => [lowerBound(entries, firstDay(key)), lowerBound(entries, lastDay(key) + 1)];

    const has = (key: string): boolean => {
        const [from, to] = slice(key);
        return to > from || overlapping(firstDay(key), lastDay(key)).length > 0;
    };

    const edge = (granularity: Granularity, pick: 'first' | 'last'): string | null => {
        const candidates: number[] = [];
        const entry = pick === 'first' ? entries[0] : entries[entries.length - 1];
        if (entry) candidates.push(entry.day);
        for (const span of spans) candidates.push(pick === 'first' ? span.start.day : span.end.day);
        if (candidates.length === 0) return null;
        return keyOfDay(pick === 'first' ? Math.min(...candidates) : Math.max(...candidates), granularity);
    };

    return {
        instants: entries.map(entry => entry.text),
        ranges: spans.map(span => ({ start: span.start.text, end: span.end.text })),
        empty: entries.length === 0 && spans.length === 0,
        years() {
            const years: number[] = [...tree.keys()];
            for (const span of spans) years.push(...range(civil(span.start.day)[0], civil(span.end.day)[0]));
            return sorted(years);
        },
        months(year) {
            const months: number[] = [...(tree.get(year)?.keys() ?? [])];
            for (const span of overlapping(firstDay(toKey(year)), lastDay(toKey(year)))) {
                const [startYear, startMonth] = civil(span.start.day);
                const [endYear, endMonth] = civil(span.end.day);
                months.push(...range(startYear === year ? startMonth : 1, endYear === year ? endMonth : 12));
            }
            return sorted(months);
        },
        days(year, month) {
            const days: number[] = [...(tree.get(year)?.get(month) ?? [])];
            const monthKey = toKey(year, month);
            for (const span of overlapping(firstDay(monthKey), lastDay(monthKey))) {
                const from = Math.max(span.start.day, firstDay(monthKey));
                const to = Math.min(span.end.day, lastDay(monthKey));
                days.push(...range(from, to).map(day => civil(day)[2]));
            }
            return sorted(days);
        },
        has,
        isAvailable(iso) {
            if (isKey(iso)) return has(iso);
            const instant = parseInstant(iso);
            return instant !== null && has(keyOfDay(instant.day, 'day'));
        },
        keys(granularity, limit = 10_000) {
            const keys = new Set(entries.map(entry => keyOfDay(entry.day, granularity)));
            let truncated = false;
            for (const span of spans) {
                for (let key = keyOfDay(span.start.day, granularity); firstDay(key) <= span.end.day; key = shiftKey(key, 1)) {
                    if (keys.size >= limit) {
                        truncated = true;
                        break;
                    }
                    keys.add(key);
                }
            }
            const all = sortKeys(keys);
            return { keys: all.slice(0, limit), truncated: truncated || all.length > limit };
        },
        slice,
        rangesIn(key) {
            const from = firstDay(key);
            const to = lastDay(key);
            return overlapping(from, to).map(span => ({
                start: span.start.day >= from ? span.start.text : formatInstant(from, 0, span.start.shape),
                end: span.end.day <= to ? span.end.text : formatInstant(to, span.end.shape.time ? DAY_MS - 1 : 0, span.end.shape),
            }));
        },
        latest: granularity => edge(granularity, 'last'),
        earliest: granularity => edge(granularity, 'first'),
    };
};
