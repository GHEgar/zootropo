import { formatInstant, parseInstant, parseTimeDimension, type Instant, type ParseOptions } from './iso.js';
import {
    DAY_MS, HOUR_MS, MINUTE_MS, civil, dayNumber, endAt, firstDay, isKey, keyOfAt, lastDay, shiftKey, sortKeys, startAt, toKey,
} from './keys.js';
import type { Granularity, TimeDimension, TimeRange } from './types.js';

export interface Catalog {
    readonly instants: readonly string[];
    readonly ranges: readonly TimeRange[];
    readonly empty: boolean;
    years(): number[];
    months(year: number): number[];
    days(year: number, month: number): number[];
    hours(year: number, month: number, day: number): number[];
    minutes(year: number, month: number, day: number, hour: number): number[];
    has(key: string): boolean;
    isAvailable(iso: string): boolean;
    keys(granularity: Granularity, limit?: number): { keys: string[]; truncated: boolean };
    slice(key: string): [number, number];
    rangesIn(key: string): TimeRange[];
    latest(granularity: Granularity): string | null;
    earliest(granularity: Granularity): string | null;
    extent(): TimeRange | null;
}

export type CatalogInput = string | readonly string[] | TimeDimension | Catalog;

interface Span {
    start: Instant;
    end: Instant;
}

export const isCatalog = (value: unknown): value is Catalog =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
    && typeof (value as Catalog).years === 'function' && typeof (value as Catalog).rangesIn === 'function';

const toDimension = (input: Exclude<CatalogInput, Catalog>, options: ParseOptions): TimeDimension => {
    if (typeof input === 'string') return parseTimeDimension(input, options);
    if (Array.isArray(input)) return parseTimeDimension((input as readonly string[]).join(','), options);
    return input as TimeDimension;
};

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);

const lowerBound = (entries: readonly Instant[], at: number): number => {
    let low = 0;
    let high = entries.length;
    while (low < high) {
        const middle = (low + high) >> 1;
        if ((entries[middle] as Instant).at < at) low = middle + 1;
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
    const hoursByDay = new Map<number, Set<number>>();
    const minutesByHour = new Map<number, Set<number>>();
    for (const entry of entries) {
        const [year, month, day] = civil(entry.day);
        const months = tree.get(year) ?? new Map<number, Set<number>>();
        tree.set(year, months);
        const days = months.get(month) ?? new Set<number>();
        months.set(month, days);
        days.add(day);
        if (!entry.shape.time) continue;
        const hours = hoursByDay.get(entry.day) ?? new Set<number>();
        hoursByDay.set(entry.day, hours);
        hours.add(Math.floor(entry.ms / HOUR_MS));
        const hourAt = entry.day * 24 + Math.floor(entry.ms / HOUR_MS);
        const minutes = minutesByHour.get(hourAt) ?? new Set<number>();
        minutesByHour.set(hourAt, minutes);
        minutes.add(Math.floor((entry.ms % HOUR_MS) / MINUTE_MS));
    }

    const overlapping = (from: number, to: number): Span[] => spans.filter(span => span.start.day <= to && span.end.day >= from);
    const overlappingAt = (from: number, to: number): Span[] => spans.filter(span => span.start.at < to && span.end.at >= from);
    const sorted = (values: Iterable<number>): number[] => [...new Set(values)].sort((a, b) => a - b);

    const slice = (key: string): [number, number] => [lowerBound(entries, startAt(key)), lowerBound(entries, endAt(key))];

    const has = (key: string): boolean => {
        const [from, to] = slice(key);
        return to > from || overlappingAt(startAt(key), endAt(key)).length > 0;
    };

    const atOf = (at: number, shape: Instant['shape']): string => {
        const day = Math.floor(at / DAY_MS);
        return formatInstant(day, shape.time ? at - day * DAY_MS : 0, shape);
    };

    const bound = (pick: 'first' | 'last'): Instant | null => {
        const candidates: Instant[] = [];
        const entry = pick === 'first' ? entries[0] : entries[entries.length - 1];
        if (entry) candidates.push(entry);
        for (const span of spans) candidates.push(pick === 'first' ? span.start : span.end);
        if (candidates.length === 0) return null;
        return candidates.reduce((best, item) => ((pick === 'first' ? item.at < best.at : item.at > best.at) ? item : best));
    };

    const edge = (granularity: Granularity, pick: 'first' | 'last'): string | null => {
        const instant = bound(pick);
        return instant ? keyOfAt(instant.at, granularity) : null;
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
        hours(year, month, day) {
            const number = dayNumber(year, month, day);
            const hours: number[] = [...(hoursByDay.get(number) ?? [])];
            for (const span of overlapping(number, number)) {
                if (!span.start.shape.time) continue;
                const from = span.start.day === number ? Math.floor(span.start.ms / HOUR_MS) : 0;
                const to = span.end.day === number ? Math.floor(span.end.ms / HOUR_MS) : 23;
                hours.push(...range(from, to));
            }
            return sorted(hours);
        },
        minutes(year, month, day, hour) {
            const number = dayNumber(year, month, day);
            const from = number * DAY_MS + hour * HOUR_MS;
            const minutes: number[] = [...(minutesByHour.get(number * 24 + hour) ?? [])];
            for (const span of overlappingAt(from, from + HOUR_MS)) {
                if (!span.start.shape.time) continue;
                const first = Math.max(0, Math.floor((span.start.at - from) / MINUTE_MS));
                const last = Math.min(59, Math.floor((span.end.at - from) / MINUTE_MS));
                minutes.push(...range(first, last));
            }
            return sorted(minutes);
        },
        has,
        isAvailable(iso) {
            if (isKey(iso)) return has(iso);
            const instant = parseInstant(iso);
            return instant !== null && has(keyOfAt(instant.at, 'day'));
        },
        keys(granularity, limit = 10_000) {
            const timed = granularity !== 'hour' && granularity !== 'minute';
            const keys = new Set(entries.filter(entry => timed || entry.shape.time).map(entry => keyOfAt(entry.at, granularity)));
            let truncated = false;
            for (const span of spans) {
                if (!timed && !span.start.shape.time) continue;
                for (let key = keyOfAt(span.start.at, granularity); startAt(key) <= span.end.at; key = shiftKey(key, 1)) {
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
            const from = startAt(key);
            const to = endAt(key);
            return overlappingAt(from, to).map(span => ({
                start: span.start.at >= from ? span.start.text : atOf(from, span.start.shape),
                end: span.end.at < to ? span.end.text : atOf(to - 1, span.end.shape),
            }));
        },
        latest: granularity => edge(granularity, 'last'),
        earliest: granularity => edge(granularity, 'first'),
        extent() {
            const first = bound('first');
            const last = bound('last');
            return first && last ? { start: first.text, end: last.text } : null;
        },
    };
};
