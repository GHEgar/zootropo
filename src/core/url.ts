import { granularityOf, isKey, shiftKey, sortKeys } from './keys.js';
import type { TimePlayer } from './player-types.js';

const RANGE = '..';
const MAX_EXPANDED = 10_000;

export const toParam = (keys: readonly string[]): string => {
    const sorted = sortKeys(keys);
    const parts: string[] = [];
    for (let index = 0; index < sorted.length;) {
        const start = sorted[index] as string;
        let end = index;
        while (end + 1 < sorted.length && granularityOf(sorted[end + 1] as string) === granularityOf(start)
            && shiftKey(sorted[end] as string, 1) === sorted[end + 1]) end++;
        parts.push(end - index >= 2 ? `${start}${RANGE}${sorted[end]}` : sorted.slice(index, end + 1).join(','));
        index = end + 1;
    }
    return parts.join(',');
};

const expand = (start: string, end: string): string[] => {
    if (!isKey(start) || !isKey(end) || granularityOf(start) !== granularityOf(end)) return [];
    const keys: string[] = [];
    for (let key = start; keys.length < MAX_EXPANDED; key = shiftKey(key, 1)) {
        keys.push(key);
        if (key === end) return keys;
    }
    return [];
};

export const fromParam = (text: string | null | undefined): string[] => {
    if (!text) return [];
    return sortKeys(text.split(',').map(part => part.trim()).filter(Boolean).flatMap(part => {
        const [start, end] = part.split(RANGE);
        if (end !== undefined) return expand(start ?? '', end);
        return isKey(part) ? [part] : [];
    }));
};

export interface UrlSyncOptions {
    param?: string;
    history?: 'replace' | 'push';
    target?: Pick<Window, 'location' | 'history'>;
}

export interface UrlSync {
    stop(): void;
}

export const syncUrl = (player: TimePlayer, options: UrlSyncOptions = {}): UrlSync => {
    const target = options.target ?? (typeof window === 'undefined' ? null : window);
    if (!target) return { stop: () => undefined };
    const param = options.param ?? 'date';
    let pending = fromParam(new URL(target.location.href).searchParams.get(param));
    const applyPending = (): void => {
        if (!pending.length || player.getSnapshot().catalog.empty) return;
        const keys = pending;
        pending = [];
        player.setSelection(keys);
    };
    applyPending();
    let last = player.getSnapshot().selection;

    const write = (): void => {
        applyPending();
        if (pending.length) return;
        const { selection } = player.getSnapshot();
        if (selection === last) return;
        last = selection;
        const url = new URL(target.location.href);
        if (selection.length) url.searchParams.set(param, toParam(selection));
        else url.searchParams.delete(param);
        const next = `${url.pathname}${url.search}${url.hash}`;
        if (options.history === 'push') target.history.pushState(target.history.state, '', next);
        else target.history.replaceState(target.history.state, '', next);
    };

    const unsubscribe = player.subscribe(write);
    write();
    return { stop: unsubscribe };
};
