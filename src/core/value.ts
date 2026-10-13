import type { Catalog } from './catalog.js';
import { parseInstant } from './iso.js';
import { DAY_MS, endAt, isoDate, sortKeys, startAt } from './keys.js';

export interface TimeValueOptions {
    compact?: boolean;
}

interface Token {
    at: number;
    text: string;
}

const atOf = (text: string): number => parseInstant(text)?.at ?? 0;

export const timeValue = (catalog: Catalog, keys: readonly string[], options: TimeValueOptions = {}): string | null => {
    const compact = options.compact ?? true;
    const indexes = new Set<number>();
    const tokens: Token[] = [];
    const seenRanges = new Set<string>();
    for (const key of keys) {
        const [from, to] = catalog.slice(key);
        for (let index = from; index < to; index++) indexes.add(index);
        for (const item of catalog.rangesIn(key)) {
            const text = item.start === item.end ? item.start : `${item.start}/${item.end}`;
            if (seenRanges.has(text)) continue;
            seenRanges.add(text);
            tokens.push({ at: atOf(item.start), text });
        }
    }
    const sorted = [...indexes].sort((a, b) => a - b);
    let runStart = 0;
    for (let position = 0; position < sorted.length; position++) {
        const current = sorted[position] as number;
        const next = sorted[position + 1];
        if (next === current + 1 && compact) continue;
        const first = catalog.instants[sorted[runStart] as number] as string;
        const last = catalog.instants[current] as string;
        if (compact && first !== last) tokens.push({ at: atOf(first), text: `${first}/${last}` });
        else for (let index = runStart; index <= position; index++) {
            const text = catalog.instants[sorted[index] as number] as string;
            tokens.push({ at: atOf(text), text });
        }
        runStart = position + 1;
    }
    if (tokens.length === 0) return null;
    return tokens.sort((a, b) => a.at - b.at).map(token => token.text).join(',');
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const quoteIdentifier = (name: string): string => (IDENTIFIER.test(name) ? name : `"${name.replace(/"/g, '""')}"`);

export const and = (parts: readonly (string | null | undefined)[]): string | null => {
    const present = parts.map(part => part?.trim()).filter((part): part is string => Boolean(part));
    if (present.length === 0) return null;
    if (present.length === 1) return present[0] as string;
    return present.map(part => `(${part})`).join(' AND ');
};

const literal = (at: number): string => {
    const day = Math.floor(at / DAY_MS);
    const rest = at - day * DAY_MS;
    if (rest === 0) return isoDate(day);
    return `${isoDate(day)}T${String(Math.floor(rest / 3_600_000)).padStart(2, '0')}:00:00Z`;
};

export const cqlValue = (column: string, keys: readonly string[]): string | null => {
    const spans: [number, number][] = [];
    for (const key of sortKeys(keys)) {
        const from = startAt(key);
        const to = endAt(key);
        const last = spans[spans.length - 1];
        if (last && from <= last[1]) last[1] = Math.max(last[1], to);
        else spans.push([from, to]);
    }
    if (spans.length === 0) return null;
    const field = quoteIdentifier(column);
    const parts = spans.map(([from, to]) => `${field} >= '${literal(from)}' AND ${field} < '${literal(to)}'`);
    if (parts.length === 1) return parts[0] as string;
    return parts.map(part => `(${part})`).join(' OR ');
};
