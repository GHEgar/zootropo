import TileWMS from 'ol/source/TileWMS.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimePlayer } from '../../src/core/index.js';
import { bindWmsTime } from '../../src/ol/index.js';
import { fakeComposer } from '../composer.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const source = (): TileWMS => new TileWMS({ url: 'https://example.org/wms', params: { LAYERS: 'storms', CQL_FILTER: 'kind = 1' } });

const RANGE_2024 = "fecha >= '2024-01-01' AND fecha < '2025-01-01'";

describe('bindWmsTime with a composer', () => {
    it('writes the cql value as a named fragment and leaves CQL_FILTER alone', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2025-01-01', kind: 'cql', column: 'fecha', initial: ['2024'] });
        const wms = source();
        const update = vi.spyOn(wms, 'updateParams');
        const composer = fakeComposer();
        const binding = bindWmsTime(player, wms, { composer });
        expect(composer.fragments.get('time')).toBe(RANGE_2024);
        expect(update).not.toHaveBeenCalled();
        expect(wms.getParams().CQL_FILTER).toBe('kind = 1');
        expect(player.getSnapshot().loading).toBe(true);
        vi.advanceTimersByTime(150);
        expect(player.getSnapshot().loading).toBe(false);
        player.select('2025');
        expect(composer.fragments.get('time')).toBe("fecha >= '2025-01-01' AND fecha < '2026-01-01'");
        player.clearSelection();
        expect(composer.fragments.has('time')).toBe(false);
        player.select('2024');
        binding.destroy();
        expect(composer.calls.at(-1)).toEqual(['time', null]);
        expect(wms.getParams().CQL_FILTER).toBe('kind = 1');
    });

    it('keeps the wide TIME as a parameter and honours the fragment name', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-06-01', kind: 'cql', column: 'fecha', initial: ['2024'] });
        const wms = source();
        const composer = fakeComposer();
        bindWmsTime(player, wms, { composer, fragment: 'when', cqlTime: 'catalog' });
        expect(wms.getParams()).toMatchObject({ TIME: '2024-01-01/2024-06-01', CQL_FILTER: 'kind = 1' });
        expect([...composer.fragments.keys()]).toEqual(['when']);
        const calls = composer.calls.length;
        player.setCatalog('2024-01-01,2024-06-01');
        expect(composer.calls).toHaveLength(calls);
    });

    it('does not touch the composer for TIME players', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'] });
        const wms = source();
        const composer = fakeComposer();
        bindWmsTime(player, wms, { composer }).destroy();
        expect(wms.getParams()).toMatchObject({ TIME: '2024-01-01', CQL_FILTER: 'kind = 1' });
        expect(composer.calls).toEqual([]);
    });
});
