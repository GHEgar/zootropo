import type { Granularity } from './types.js';

export interface KeyParts {
    year: number;
    month: number | null;
    day: number | null;
    hour: number | null;
    minute: number | null;
    granularity: Granularity;
}

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MINUTE_MS = 60_000;

const KEY = /^(-?\d{4,})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2})(?::(\d{2}))?)?)?)?$/;

const floorDiv = (a: number, b: number): number => Math.floor(a / b);

export const daysInMonth = (year: number, month: number): number => {
    if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

export const dayNumber = (year: number, month: number, day: number): number => {
    const y = month <= 2 ? year - 1 : year;
    const era = floorDiv(y, 400);
    const yoe = y - era * 400;
    const doy = floorDiv(153 * (month + (month > 2 ? -3 : 9)) + 2, 5) + day - 1;
    const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
    return era * 146097 + doe - 719468;
};

export const civil = (days: number): [number, number, number] => {
    const z = days + 719468;
    const era = floorDiv(z, 146097);
    const doe = z - era * 146097;
    const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
    const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
    const mp = floorDiv(5 * doy + 2, 153);
    const day = doy - floorDiv(153 * mp + 2, 5) + 1;
    const month = mp < 10 ? mp + 3 : mp - 9;
    return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
};

const pad = (value: number, size = 2): string => String(value).padStart(size, '0');

export const yearText = (year: number): string => (year < 0 ? `-${pad(-year, 4)}` : pad(year, 4));

export const toKey = (year: number, month?: number | null, day?: number | null, hour?: number | null, minute?: number | null): string => {
    if (month == null) return yearText(year);
    if (day == null) return `${yearText(year)}-${pad(month)}`;
    if (hour == null) return `${yearText(year)}-${pad(month)}-${pad(day)}`;
    if (minute == null) return `${yearText(year)}-${pad(month)}-${pad(day)}T${pad(hour)}`;
    return `${yearText(year)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
};

export const isoDate = (days: number): string => {
    const [year, month, day] = civil(days);
    return toKey(year, month, day);
};

export const parseKey = (key: string): KeyParts => {
    const match = KEY.exec(key);
    if (!match) throw new Error(`Invalid period key: ${key}`);
    const year = Number(match[1]);
    const month = match[2] ? Number(match[2]) : null;
    const day = match[3] ? Number(match[3]) : null;
    const hour = match[4] ? Number(match[4]) : null;
    const minute = match[5] ? Number(match[5]) : null;
    let granularity: Granularity = 'year';
    if (minute !== null) granularity = 'minute';
    else if (hour !== null) granularity = 'hour';
    else if (day !== null) granularity = 'day';
    else if (month !== null) granularity = 'month';
    return { year, month, day, hour, minute, granularity };
};

export const isKey = (key: string): boolean => {
    if (!KEY.test(key)) return false;
    const { year, month, day, hour, minute } = parseKey(key);
    if (month !== null && (month < 1 || month > 12)) return false;
    if (day !== null && month !== null && (day < 1 || day > daysInMonth(year, month))) return false;
    if (hour !== null && hour > 23) return false;
    return minute === null || minute <= 59;
};

export const granularityOf = (key: string): Granularity => parseKey(key).granularity;

export const firstDay = (key: string): number => {
    const { year, month, day } = parseKey(key);
    return dayNumber(year, month ?? 1, day ?? 1);
};

export const lastDay = (key: string): number => {
    const { year, month, day } = parseKey(key);
    if (day !== null && month !== null) return dayNumber(year, month, day);
    if (month !== null) return dayNumber(year, month, daysInMonth(year, month));
    return dayNumber(year, 12, 31);
};

export const startAt = (key: string): number => {
    const { hour, minute } = parseKey(key);
    return firstDay(key) * DAY_MS + (hour ?? 0) * HOUR_MS + (minute ?? 0) * MINUTE_MS;
};

export const endAt = (key: string): number => {
    const { hour, minute } = parseKey(key);
    if (minute !== null) return startAt(key) + MINUTE_MS;
    return hour === null ? (lastDay(key) + 1) * DAY_MS : startAt(key) + HOUR_MS;
};

export const keyOfAt = (at: number, granularity: Granularity): string => {
    const days = floorDiv(at, DAY_MS);
    const [year, month, day] = civil(days);
    if (granularity === 'year') return toKey(year);
    if (granularity === 'month') return toKey(year, month);
    if (granularity === 'day') return toKey(year, month, day);
    const rest = at - days * DAY_MS;
    if (granularity === 'hour') return toKey(year, month, day, floorDiv(rest, HOUR_MS));
    return toKey(year, month, day, floorDiv(rest, HOUR_MS), floorDiv(rest - floorDiv(rest, HOUR_MS) * HOUR_MS, MINUTE_MS));
};

export const keyOfDay = (days: number, granularity: Granularity): string => keyOfAt(days * DAY_MS, granularity);

export const shiftKey = (key: string, delta: number): string => {
    const { year, month, granularity } = parseKey(key);
    if (granularity === 'year') return toKey(year + delta);
    if (granularity === 'month') {
        const index = year * 12 + (month ?? 1) - 1 + delta;
        return toKey(floorDiv(index, 12), index - floorDiv(index, 12) * 12 + 1);
    }
    if (granularity === 'day') return isoDate(firstDay(key) + delta);
    if (granularity === 'hour') return keyOfAt(startAt(key) + delta * HOUR_MS, 'hour');
    return keyOfAt(startAt(key) + delta * MINUTE_MS, 'minute');
};

export const parentKey = (key: string): string | null => {
    const { year, month, day, hour, granularity } = parseKey(key);
    if (granularity === 'year') return null;
    if (granularity === 'month') return toKey(year);
    if (granularity === 'day') return toKey(year, month);
    if (granularity === 'hour') return toKey(year, month, day);
    return toKey(year, month, day, hour);
};

const RANK: Record<Granularity, number> = { year: 0, month: 1, day: 2, hour: 3, minute: 4 };

export const compareKeys = (a: string, b: string): number =>
    startAt(a) - startAt(b) || RANK[granularityOf(a)] - RANK[granularityOf(b)];

export const sortKeys = (keys: Iterable<string>): string[] => [...new Set(keys)].sort(compareKeys);

export const contains = (outer: string, inner: string): boolean =>
    startAt(outer) <= startAt(inner) && endAt(inner) <= endAt(outer);
