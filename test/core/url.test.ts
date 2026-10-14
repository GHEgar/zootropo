import { describe, expect, it } from 'vitest';
import { createTimePlayer, fromParam, syncUrl, toParam } from '../../src/core/index.js';

const fakeWindow = (href: string) => {
    const state = { href, calls: 0 };
    return {
        state,
        target: {
            location: { get href() { return state.href; } },
            history: {
                state: null,
                replaceState: (_: unknown, __: string, url: string) => { state.calls++; state.href = new URL(url, state.href).href; },
                pushState: (_: unknown, __: string, url: string) => { state.calls++; state.href = new URL(url, state.href).href; },
            },
        } as unknown as Pick<Window, 'location' | 'history'>,
    };
};

describe('toParam and fromParam', () => {
    it('compacts runs of three or more and expands them back', () => {
        const keys = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-07', '2024-09', '2024-10'];
        expect(toParam(keys)).toBe('2024-01..2024-04,2024-07,2024-09,2024-10');
        expect(fromParam('2024-01..2024-04,2024-07,2024-09,2024-10')).toEqual(keys);
        expect(fromParam('2024-06-01T10:00..2024-06-01T10:02')).toEqual(['2024-06-01T10:00', '2024-06-01T10:01', '2024-06-01T10:02']);
        expect(fromParam('basura,2024-13,2024..2025-01')).toEqual([]);
        expect(fromParam(null)).toEqual([]);
    });
});

describe('syncUrl', () => {
    it('reads the selection from the URL and writes it back on change', () => {
        const { state, target } = fakeWindow('https://x.org/mapa?capa=a&date=2024-02,2024-03#v');
        const player = createTimePlayer({ catalog: '2024-01-01/2024-06-01/P1M' });
        const sync = syncUrl(player, { target });
        expect(player.getSnapshot().selection).toEqual(['2024-02', '2024-03']);
        player.select('2024-04', 'toggle');
        expect(state.href).toBe('https://x.org/mapa?capa=a&date=2024-02..2024-04#v');
        player.clearSelection();
        expect(state.href).toBe('https://x.org/mapa?capa=a#v');
        sync.stop();
        player.select('2024-01');
        expect(state.href).toBe('https://x.org/mapa?capa=a#v');
    });

    it('ignores dates the catalog does not have and uses its own param', () => {
        const { target } = fakeWindow('https://x.org/?fecha=1999-01,2024-05');
        const player = createTimePlayer({ catalog: '2024-01-01/2024-06-01/P1M' });
        syncUrl(player, { target, param: 'fecha' });
        expect(player.getSnapshot().selection).toEqual(['2024-05']);
    });

    it('waits for the catalog when it arrives after the sync starts', () => {
        const { state, target } = fakeWindow('https://x.org/?date=2024-03');
        const player = createTimePlayer();
        syncUrl(player, { target });
        expect(state.href).toBe('https://x.org/?date=2024-03');
        player.setCatalog('2024-01-01/2024-06-01/P1M');
        expect(player.getSnapshot().selection).toEqual(['2024-03']);
        expect(state.href).toBe('https://x.org/?date=2024-03');
    });
});
