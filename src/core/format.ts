import { firstDay, lastDay, parseKey, shiftKey, sortKeys } from './keys.js';
import type { Granularity } from './types.js';

export interface FormatOptions {
    locale?: string | readonly string[];
    month?: 'long' | 'short' | 'narrow' | 'numeric' | '2-digit';
    maxItems?: number;
    count?: (count: number, granularity: Granularity) => string;
}

export interface Formatter {
    key(key: string, style?: 'long' | 'short'): string;
    month(month: number, style?: 'long' | 'short'): string;
    keys(keys: readonly string[]): string;
}

const DAY_MS = 86_400_000;

const toDate = (days: number): Date => new Date(days * DAY_MS);

const defaultCount = (count: number, granularity: Granularity): string => `${count} ${granularity}${count === 1 ? '' : 's'}`;

const contiguous = (keys: readonly string[]): boolean =>
    keys.every((key, index) => index === 0 || shiftKey(keys[index - 1] as string, 1) === key);

export const createFormatter = (options: FormatOptions = {}): Formatter => {
    const locale = options.locale as string | string[] | undefined;
    const monthStyle = options.month ?? 'long';
    const maxItems = options.maxItems ?? 3;
    const count = options.count ?? defaultCount;
    const formats = {
        year: new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }),
        month: (style: 'long' | 'short') => new Intl.DateTimeFormat(locale, {
            year: 'numeric', month: style === 'long' ? monthStyle : 'short', timeZone: 'UTC',
        }),
        monthOnly: (style: 'long' | 'short') => new Intl.DateTimeFormat(locale, {
            month: style === 'long' ? monthStyle : 'short', timeZone: 'UTC',
        }),
        day: (style: 'long' | 'short') => new Intl.DateTimeFormat(locale, {
            year: 'numeric', month: style === 'long' ? monthStyle : 'short', day: 'numeric', timeZone: 'UTC',
        }),
    };
    const list = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' });

    const formatterFor = (granularity: Granularity, style: 'long' | 'short'): Intl.DateTimeFormat => {
        if (granularity === 'year') return formats.year;
        if (granularity === 'month') return formats.month(style);
        return formats.day(style);
    };

    const key = (value: string, style: 'long' | 'short' = 'long'): string =>
        formatterFor(parseKey(value).granularity, style).format(toDate(firstDay(value)));

    return {
        key,
        month: (month, style = 'long') => formats.monthOnly(style).format(toDate(firstDay(`2000-${String(month).padStart(2, '0')}`))),
        keys(values) {
            const sorted = sortKeys(values);
            const first = sorted[0];
            const last = sorted[sorted.length - 1];
            if (!first || !last) return '';
            if (sorted.length === 1) return key(first);
            const granularities = new Set(sorted.map(item => parseKey(item).granularity));
            const granularity = parseKey(first).granularity;
            if (granularities.size === 1 && contiguous(sorted)) {
                return formatterFor(granularity, 'long').formatRange(toDate(firstDay(first)), toDate(lastDay(last)));
            }
            if (sorted.length <= maxItems) return list.format(sorted.map(item => key(item, 'short')));
            return count(sorted.length, granularity);
        },
    };
};
