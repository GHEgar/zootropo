import type { Map as MapLibreMap, RasterTileSource } from 'maplibre-gl';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createTimePlayer } from '../../src/core/index.js';
import { bindRasterTime, type MapLibreBufferMapLike, type RasterSourceLike } from '../../src/maplibre/index.js';
import { fakeMap, paramOf, TEMPLATE } from './fake.js';

describe('bindRasterTime', () => {
    it('writes TIME into the tile template and waits for the source', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'] });
        const map = fakeMap();
        const source = map.addSource('ndvi');
        const binding = bindRasterTime(player, map, 'ndvi');
        expect(source.calls).toHaveLength(1);
        expect(paramOf(source.tiles?.[0], 'TIME')).toBe('2024-01-01');
        expect(source.tiles?.[0]).toContain('BBOX={bbox-epsg-3857}');
        expect(binding.tiles).toBe(source.tiles?.[0]);
        expect(player.getSnapshot().loading).toBe(true);
        map.tile('ndvi');
        expect(player.getSnapshot().loading).toBe(true);
        map.content('ndvi');
        map.tile('other');
        map.tile('ndvi', false);
        expect(player.getSnapshot().loading).toBe(true);
        map.tile('ndvi');
        expect(player.getSnapshot().loading).toBe(false);
        player.select('2024-02');
        expect(paramOf(source.tiles?.[0], 'TIME')).toBe('2024-02-01');
        map.content('ndvi', true);
        expect(player.getSnapshot().loading).toBe(false);
        player.clearSelection();
        expect(source.tiles?.[0]).toBe(TEMPLATE);
        expect(source.calls).toHaveLength(3);
        binding.destroy();
        expect(player.getSnapshot().loading).toBe(false);
        expect([...map.listeners.values()].every(set => set.size === 0)).toBe(true);
    });

    it('lets idle release the step only after the new tiles were requested', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'] });
        const map = fakeMap();
        map.addSource('ndvi');
        bindRasterTime(player, map, 'ndvi');
        map.emit('idle');
        expect(player.getSnapshot().loading).toBe(true);
        map.content('ndvi');
        map.emit('idle');
        expect(player.getSnapshot().loading).toBe(false);
    });

    it('writes CQL_FILTER and a wide TIME with cqlTime', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-06-01', kind: 'cql', column: 'fecha', initial: ['2024'] });
        const map = fakeMap();
        const source = map.addSource('storms');
        const binding = bindRasterTime(player, map, 'storms', { cqlTime: 'catalog' });
        expect(paramOf(source.tiles?.[0], 'CQL_FILTER')).toBe("fecha >= '2024-01-01' AND fecha < '2025-01-01'");
        expect(paramOf(source.tiles?.[0], 'TIME')).toBe('2024-01-01/2024-06-01');
        binding.destroy();
    });

    it('uses a given template and adopts templates written by others', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'] });
        const map = fakeMap();
        const source = map.addSource('ndvi', ['https://old.org/wms?BBOX={bbox-epsg-3857}']);
        bindRasterTime(player, map, 'ndvi', { template: TEMPLATE });
        expect(source.tiles?.[0]).toMatch(/^https:\/\/x\.org\/wms\?FORMAT/);
        source.tiles = ['https://y.org/wms?STYLES=dark&BBOX={bbox-epsg-3857}'];
        map.content('ndvi');
        expect(source.tiles[0]).toBe('https://y.org/wms?STYLES=dark&TIME=2024-01-01&BBOX={bbox-epsg-3857}');
        expect(player.getSnapshot().loading).toBe(true);
    });

    it('waits for a source that is added later and does not rewrite an equal template', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'] });
        const map = fakeMap();
        const binding = bindRasterTime(player, map, 'ndvi');
        expect(binding.tiles).toBeNull();
        expect(player.getSnapshot().loading).toBe(false);
        const source = map.addSource('ndvi');
        map.emit('styledata');
        expect(paramOf(source.tiles?.[0], 'TIME')).toBe('2024-01-01');
        map.content('ndvi', true);
        const again = map.addSource('copy', source.tiles);
        bindRasterTime(player, map, 'copy');
        expect(again.calls).toHaveLength(0);
        expect(player.getSnapshot().loading).toBe(false);
    });

    it('restores the original tiles on destroy unless someone else rewrote them', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'] });
        const map = fakeMap();
        const original = 'https://x.org/wms?LAYERS=ndvi&TIME=2023-12-01&BBOX={bbox-epsg-3857}';
        const source = map.addSource('ndvi', [original]);
        bindRasterTime(player, map, 'ndvi').destroy();
        expect(source.tiles).toEqual([original]);
        bindRasterTime(player, map, 'ndvi', { restore: false }).destroy();
        expect(paramOf(source.tiles?.[0], 'TIME')).toBe('2024-01-01');
        source.tiles = [original];
        const binding = bindRasterTime(player, map, 'ndvi');
        const foreign = 'https://x.org/wms?LAYERS=ndvi&TIME=2024-02-01&BBOX={bbox-epsg-3857}';
        source.tiles = [foreign];
        binding.destroy();
        expect(source.tiles).toEqual([foreign]);
    });

    it('lets seek resolve when the new tiles are loaded', async () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'], mode: 'timeline' });
        const map = fakeMap();
        const source = map.addSource('ndvi');
        bindRasterTime(player, map, 'ndvi');
        map.content('ndvi', true);
        let done: boolean | undefined;
        const seeking = player.seek('2024-02').then(value => { done = value; });
        expect(paramOf(source.tiles?.[0], 'TIME')).toBe('2024-02-01');
        await Promise.resolve();
        expect(done).toBeUndefined();
        map.content('ndvi', true);
        await seeking;
        expect(done).toBe(true);
    });

    it('accepts the maplibre-gl map and raster source types', () => {
        expectTypeOf<MapLibreMap>().toExtend<MapLibreBufferMapLike>();
        expectTypeOf<RasterTileSource>().toExtend<RasterSourceLike>();
    });
});
