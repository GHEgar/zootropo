import type { WmsParams } from '../core/params.js';

const READABLE: Record<string, string> = { '%2C': ',', '%3A': ':', '%2F': '/' };

const encode = (text: string): string =>
    encodeURIComponent(text).replace(/%2C|%3A|%2F/g, match => READABLE[match] ?? match);

const keyOf = (part: string): string => {
    const at = part.indexOf('=');
    const raw = at < 0 ? part : part.slice(0, at);
    try {
        return decodeURIComponent(raw).toUpperCase();
    } catch {
        return raw.toUpperCase();
    }
};

export const applyParams = (template: string, params: WmsParams): string => {
    const hash = template.indexOf('#');
    const clean = hash < 0 ? template : template.slice(0, hash);
    const at = clean.indexOf('?');
    const base = at < 0 ? clean : clean.slice(0, at);
    const managed = new Set(Object.keys(params).map(key => key.toUpperCase()));
    const parts = at < 0 ? [] : clean.slice(at + 1).split('&').filter(part => part !== '' && !managed.has(keyOf(part)));
    const added = Object.entries(params)
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .sort(([a], [b]) => (a.toUpperCase() < b.toUpperCase() ? -1 : 1));
    for (const [key, value] of added) {
        const name = key.toUpperCase();
        const index = parts.findIndex(part => part.includes('{') || keyOf(part) > name);
        const part = `${encode(key)}=${encode(value)}`;
        if (index < 0) parts.push(part);
        else parts.splice(index, 0, part);
    }
    return parts.length === 0 ? base : `${base}?${parts.join('&')}`;
};
