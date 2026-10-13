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

export const YEARS: View = { level: 'years', year: null, month: null };

export const viewInside = (key: string): View => {
    const { year, month, granularity } = parseKey(key);
    if (granularity === 'year') return { level: 'months', year, month: null };
    return { level: 'days', year, month };
};

export const viewShowing = (key: string): View => {
    const { year, month, granularity } = parseKey(key);
    if (granularity === 'year') return YEARS;
    if (granularity === 'month') return { level: 'months', year, month: null };
    return { level: 'days', year, month };
};

export const viewAbove = (view: View): View => {
    if (view.level === 'days' && view.year !== null) return { level: 'months', year: view.year, month: null };
    return YEARS;
};

export const sameView = (a: View, b: View): boolean => a.level === b.level && a.year === b.year && a.month === b.month;

export const viewKeys = (catalog: Catalog, view: View): string[] => {
    if (view.level === 'months' && view.year !== null) {
        const year = view.year;
        return catalog.months(year).map(month => toKey(year, month));
    }
    if (view.level === 'days' && view.year !== null && view.month !== null) {
        const { year, month } = view;
        return catalog.days(year, month).map(day => toKey(year, month, day));
    }
    return catalog.years().map(year => toKey(year));
};

export const validView = (catalog: Catalog, view: View): View => {
    if (view.level === 'years' || view.year === null) return YEARS;
    if (!catalog.has(toKey(view.year))) return YEARS;
    if (view.level === 'days' && (view.month === null || !catalog.has(toKey(view.year, view.month)))) {
        return { level: 'months', year: view.year, month: null };
    }
    return view;
};

const LEVEL_OF: Record<Level, Item['level']> = { years: 'year', months: 'month', days: 'day' };

export const buildItems = (catalog: Catalog, view: View, selection: readonly string[], step: string | null): Item[] =>
    viewKeys(catalog, view).map(key => {
        const { year, month, day } = parseKey(key);
        const selected = selection.includes(key);
        return {
            key,
            level: LEVEL_OF[view.level],
            year,
            month,
            day,
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
