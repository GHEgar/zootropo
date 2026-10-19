import { describe, expect, it } from 'vitest';
import { createTimePlayer } from '../../src/core/index.js';
import { bindRasterTime } from '../../src/maplibre/index.js';
import { fakeComposer } from '../composer.js';
import { fakeMap, paramOf, TEMPLATE } from './fake.js';

describe('bindRasterTime with a composer', () => {
    it('writes the cql value as a fragment and waits for the template the consumer writes', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2025-01-01', kind: 'cql', column: 'fecha', initial: ['2024'] });
        const map = fakeMap();
        const source = map.addSource('storms');
        const composer = fakeComposer();
        const binding = bindRasterTime(player, map, 'storms', { composer });
        expect(composer.fragments.get('time')).toBe("fecha >= '2024-01-01' AND fecha < '2025-01-01'");
        expect(source.calls).toHaveLength(0);
        expect(player.getSnapshot().loading).toBe(true);
        source.setTiles([`${TEMPLATE}&CQL_FILTER=kind%3D1`]);
        map.content('storms');
        map.tile('storms');
        expect(player.getSnapshot().loading).toBe(false);
        expect(source.calls).toHaveLength(1);
        expect(paramOf(source.tiles?.[0], 'CQL_FILTER')).toBe('kind=1');
        player.select('2025');
        expect(composer.fragments.get('time')).toBe("fecha >= '2025-01-01' AND fecha < '2026-01-01'");
        expect(player.getSnapshot().loading).toBe(true);
        binding.destroy();
        expect(composer.fragments.has('time')).toBe(false);
        expect(player.getSnapshot().loading).toBe(false);
    });

    it('keeps the wide TIME in the template under its own fragment name', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-06-01', kind: 'cql', column: 'fecha', initial: ['2024'] });
        const map = fakeMap();
        const source = map.addSource('storms');
        const composer = fakeComposer();
        bindRasterTime(player, map, 'storms', { composer, fragment: 'when', cqlTime: 'catalog' });
        expect(paramOf(source.tiles?.[0], 'TIME')).toBe('2024-01-01/2024-06-01');
        expect(paramOf(source.tiles?.[0], 'CQL_FILTER')).toBeNull();
        expect([...composer.fragments.keys()]).toEqual(['when']);
    });

    it('writes the fragment even before the source exists', () => {
        const player = createTimePlayer({ catalog: '2024-01-01', kind: 'cql', column: 'fecha', initial: ['2024'] });
        const composer = fakeComposer();
        bindRasterTime(player, fakeMap(), 'storms', { composer });
        expect(composer.fragments.size).toBe(1);
        expect(player.getSnapshot().loading).toBe(false);
    });
});
