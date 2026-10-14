import type { Catalog } from './catalog.js';
import { contains, granularityOf, isKey, parentKey, parseKey, sortKeys, toKey, type KeyParts } from './keys.js';
import type { Item, Level, Multiple, SelectMode, View } from './types.js';

export const sameGroup = (a: string, b: string): boolean =>
    granularityOf(a) === granularityOf(b) && parentKey(a) === parentKey(b);

export const applySelect = (current: readonly string[], key: string, mode: SelectMode, multiple: Multiple): string[] => {
    if (mode === 'replace') return [key];
    const selected = current.includes(key);
    if (!multiple) return selected && current.length === 1 ? [] : [key];
    if (multiple === 'mixed') {
        if (selected) return current.filter(item => item !== key);
        return sortKeys([...current.filter(item => !contains(item, key) && !contains(key, item)), key]);
    }
    const first = current[0];
    if (first === undefined || !sameGroup(first, key)) return [key];
    return selected ? current.filter(item => item !== key) : sortKeys([...current, key]);
};

export const YEARS: View = { level: 'years', year: null, month: null, day: null, hour: null };

const LEVELS: readonly Level[] = ['years', 'months', 'days', 'hours', 'minutes'];
const GRANULARITIES: readonly Item['level'][] = ['year', 'month', 'day', 'hour', 'minute'];

const viewAt = (depth: number, parts: Partial<KeyParts>): View => ({
    level: LEVELS[depth] as Level,
    year: depth > 0 ? parts.year ?? null : null,
    month: depth > 1 ? parts.month ?? null : null,
    day: depth > 2 ? parts.day ?? null : null,
    hour: depth > 3 ? parts.hour ?? null : null,
});

const depthOf = (key: string): number => GRANULARITIES.indexOf(parseKey(key).granularity);

export const viewInside = (key: string): View => viewAt(Math.min(depthOf(key) + 1, LEVELS.length - 1), parseKey(key));

export const viewShowing = (key: string): View => viewAt(depthOf(key), parseKey(key));

export const viewAbove = (view: View): View => viewAt(Math.max(LEVELS.indexOf(view.level) - 1, 0), view as Partial<KeyParts>);

const childrenOf = (catalog: Catalog, view: View): string[] | null => {
    const { year, month, day, hour } = view;
    if (view.level === 'years') return catalog.years().map(item => toKey(item));
    if (year === null) return null;
    if (view.level === 'months') return catalog.months(year).map(item => toKey(year, item));
    if (month === null) return null;
    if (view.level === 'days') return catalog.days(year, month).map(item => toKey(year, month, item));
    if (day === null) return null;
    if (view.level === 'hours') return catalog.hours(year, month, day).map(item => toKey(year, month, day, item));
    if (hour === null) return null;
    return catalog.minutes(year, month, day, hour).map(item => toKey(year, month, day, hour, item));
};

export const viewKeys = (catalog: Catalog, view: View): string[] => childrenOf(catalog, view) ?? childrenOf(catalog, YEARS) ?? [];

export const validView = (catalog: Catalog, view: View): View => {
    for (let depth = LEVELS.indexOf(view.level); depth > 0; depth--) {
        const candidate = viewAt(depth, view as Partial<KeyParts>);
        if ((childrenOf(catalog, candidate) ?? []).length > 0) return candidate;
    }
    return YEARS;
};

const LEVEL_OF: Record<Level, Item['level']> = { years: 'year', months: 'month', days: 'day', hours: 'hour', minutes: 'minute' };

export const buildItems = (catalog: Catalog, view: View, selection: readonly string[], step: string | null): Item[] =>
    viewKeys(catalog, view).map(key => {
        const { year, month, day, hour, minute } = parseKey(key);
        const selected = selection.includes(key);
        return {
            key,
            level: LEVEL_OF[view.level],
            year,
            month,
            day,
            hour,
            minute,
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
    if (Array.isArray(initial)) return sortKeys(initial.filter(key => isKey(key) && catalog.has(key)));
    return [];
};
