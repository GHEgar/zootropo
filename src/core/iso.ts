import { civil, dayNumber, daysInMonth, isoDate } from './keys.js';
import type { TimeDimension, TimeRange } from './types.js';

export interface Shape {
    time: boolean;
    seconds: boolean;
    fraction: number;
    zone: boolean;
}

export interface Instant {
    text: string;
    day: number;
    ms: number;
    at: number;
    shape: Shape;
}

export interface Duration {
    months: number;
    days: number;
    ms: number;
}

const DAY_MS = 86_400_000;
const INSTANT = /^(-?\d{4,})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?)?)?$/;
const DURATION = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

const num = (value: string | undefined): number => (value ? Number(value) : 0);

const build = (day: number, ms: number, shape: Shape, text?: string): Instant => {
    const carry = Math.floor(ms / DAY_MS);
    const normalizedDay = day + carry;
    const normalizedMs = ms - carry * DAY_MS;
    return {
        text: text ?? formatInstant(normalizedDay, normalizedMs, shape),
        day: normalizedDay,
        ms: normalizedMs,
        at: normalizedDay * DAY_MS + normalizedMs,
        shape,
    };
};

export const formatInstant = (day: number, ms: number, shape: Shape): string => {
    const date = isoDate(day);
    if (!shape.time) return date;
    const two = (value: number): string => String(value).padStart(2, '0');
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor(ms / 60_000) % 60;
    const seconds = Math.floor(ms / 1000) % 60;
    let text = `${date}T${two(hours)}:${two(minutes)}`;
    if (shape.seconds) text += `:${two(seconds)}`;
    if (shape.fraction > 0) text += `.${String(ms % 1000).padStart(3, '0').padEnd(shape.fraction, '0').slice(0, shape.fraction)}`;
    return shape.zone ? `${text}Z` : text;
};

export const parseInstant = (text: string): Instant | null => {
    const trimmed = text.trim();
    const match = INSTANT.exec(trimmed);
    if (!match) return null;
    const [, y, m, d, h, mi, s, fraction, zone] = match;
    const month = num(m) || 1;
    const day = num(d) || 1;
    if (month > 12 || day > daysInMonth(Number(y), month)) return null;
    let ms = ((num(h) * 60 + num(mi)) * 60 + num(s)) * 1000 + (fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0);
    if (zone && zone !== 'Z') {
        const sign = zone.startsWith('-') ? -1 : 1;
        const digits = zone.slice(1).replace(':', '');
        ms -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
    }
    const shape: Shape = {
        time: h !== undefined,
        seconds: s !== undefined,
        fraction: fraction?.length ?? 0,
        zone: zone !== undefined,
    };
    return build(dayNumber(Number(y), month, day), ms, shape, zone && zone !== 'Z' ? undefined : trimmed);
};

export const parseDuration = (text: string): Duration | null => {
    const match = DURATION.exec(text.trim());
    if (!match || text.trim() === 'P' || text.trim().endsWith('T')) return null;
    const [, years, months, weeks, days, hours, minutes, seconds] = match;
    const duration: Duration = {
        months: num(years) * 12 + num(months),
        days: num(weeks) * 7 + num(days),
        ms: Math.round(((num(hours) * 60 + num(minutes)) * 60 + num(seconds)) * 1000),
    };
    return duration.months + duration.days + duration.ms > 0 ? duration : null;
};

export const addDuration = (start: Instant, duration: Duration, times: number): Instant => {
    let day = start.day;
    if (duration.months) {
        const [year, month, dayOfMonth] = civil(start.day);
        const index = year * 12 + month - 1 + duration.months * times;
        const nextYear = Math.floor(index / 12);
        const nextMonth = index - nextYear * 12 + 1;
        day = dayNumber(nextYear, nextMonth, Math.min(dayOfMonth, daysInMonth(nextYear, nextMonth)));
    }
    return build(day + duration.days * times, start.ms + duration.ms * times, start.shape);
};

const approximateMs = (duration: Duration): number => duration.months * 30.436875 * DAY_MS + duration.days * DAY_MS + duration.ms;

export interface ParseOptions {
    maxInstants?: number;
}

export const parseTimeDimension = (values: string, options: ParseOptions = {}): TimeDimension => {
    const maxInstants = options.maxInstants ?? 10_000;
    const instants: string[] = [];
    const ranges: TimeRange[] = [];
    for (const token of values.split(',').map(part => part.trim()).filter(Boolean)) {
        if (!token.includes('/')) {
            const instant = parseInstant(token);
            if (instant) instants.push(instant.text);
            continue;
        }
        const [from = '', to = '', period] = token.split('/');
        const start = parseInstant(from);
        const end = parseInstant(to);
        if (!start || !end || end.at < start.at) continue;
        if (start.at === end.at) {
            instants.push(start.text);
            continue;
        }
        const duration = period ? parseDuration(period) : null;
        const estimate = duration ? Math.floor((end.at - start.at) / approximateMs(duration)) + 1 : Infinity;
        if (!duration || estimate > maxInstants - instants.length) {
            ranges.push({ start: start.text, end: end.text });
            continue;
        }
        for (let step = 0; ; step++) {
            const next = addDuration(start, duration, step);
            if (next.at > end.at) break;
            instants.push(next.text);
        }
    }
    return { instants, ranges };
};
