import type { Catalog } from './catalog.js';
import { contains, granularityOf, isKey, parentKey, parseKey, sortKeys, toKey } from './keys.js';
import type { Item, Level, SelectMode, View } from './types.js';

export const sameGroup = (a: string, b: string): boolean =>
    granularityOf(a) === granularityOf(b) && parentKey(a) === parentKey(b);

export const applySelect = (current: readonly string[], key: string, mode: SelectMode, multiple: boolean): string[] => {
    if (mode === 'replace') return [key];
    const selected = current.includes(key);
    if (!multiple) return selected && current.length === 1 ? [] : [key];
    const first = current[0];
    if (first === undefined || !sameGroup(first, key)) return [key];
    return selected ? current.filter(item => item !== key) : sortKeys([...current, key]);
};

export const YEARS: View = { level: 'years', year: null, month: null, day: null };

const months = (year: number): View => ({ level: 'months', year, month: null, day: null });
const days = (year: number, month: number | null): View => ({ level: 'days', year, month, day: null });
const hours = (year: number, month: number | null, day: number | null): View => ({ level: 'hours', year, month, day });

export const viewInside = (key: string): View => {
    const { year, month, day, granularity } = parseKey(key);
    if (granularity === 'year') return months(year);
    if (granularity === 'month') return days(year, month);
    return hours(year, month, day);
};

export const viewShowing = (key: string): View => {
    const { year, month, day, granularity } = parseKey(key);
    if (granularity === 'year') return YEARS;
    if (granularity === 'month') return months(year);
    if (granularity === 'day') return days(year, month);
    return hours(year, month, day);
};

export const viewAbove = (view: View): View => {
    if (view.year === null) return YEARS;
    if (view.level === 'hours') return days(view.year, view.month);
    if (view.level === 'days') return months(view.year);
    return YEARS;
};

export const viewKeys = (catalog: Catalog, view: View): string[] => {
    const { year, month, day } = view;
    if (year === null) return catalog.years().map(item => toKey(item));
    if (view.level === 'months') return catalog.months(year).map(item => toKey(year, item));
    if (view.level === 'days' && month !== null) return catalog.days(year, month).map(item => toKey(year, month, item));
    if (view.level === 'hours' && month !== null && day !== null) {
        return catalog.hours(year, month, day).map(item => toKey(year, month, day, item));
    }
    return catalog.years().map(item => toKey(item));
};

export const validView = (catalog: Catalog, view: View): View => {
    const { year, month, day } = view;
    if (view.level === 'years' || year === null || !catalog.has(toKey(year))) return YEARS;
    if (view.level === 'months') return view;
    if (month === null || !catalog.has(toKey(year, month))) return months(year);
    if (view.level === 'days') return view;
    if (day === null || catalog.hours(year, month, day).length === 0) return days(year, month);
    return view;
};

const LEVEL_OF: Record<Level, Item['level']> = { years: 'year', months: 'month', days: 'day', hours: 'hour' };

export const buildItems = (catalog: Catalog, view: View, selection: readonly string[], step: string | null): Item[] =>
    viewKeys(catalog, view).map(key => {
        const { year, month, day, hour } = parseKey(key);
        const selected = selection.includes(key);
        return {
            key,
            level: LEVEL_OF[view.level],
            year,
            month,
            day,
            hour,
            selected,
            partial: !selected && selection.some(item => item !== key && contains(key, item)),
            current: step === key,
            containsCurrent: step !== null && step !== key && contains(key, step),
        };
    });

export const initialSelection = (catalog: Catalog, initial: 'latest' | 'none' | readonly string[]): string[] => {
    if (initial === 'latest') {
        const latest = catalog.latest('month');
        return latest ? [latest] : [];
    }
    if (Array.isArray(initial)) return initial.filter(key => isKey(key) && catalog.has(key));
    return [];
};
