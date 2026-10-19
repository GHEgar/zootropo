import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimePlayer } from '../../src/core/index.js';
import { bindRasterBuffer } from '../../src/maplibre/index.js';
import { fakeMap, paramOf, type FakeMap } from './fake.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const setup = (): FakeMap => {
    const map = fakeMap();
    map.addSource('a');
    map.addSource('b');
    map.layers.set('la', { source: 'a' });
    map.layers.set('lb', { source: 'b' });
    map.paint.set('la:raster-opacity', 0.8);
    return map;
};

const timeOf = (map: FakeMap, id: string): string | null => paramOf(map.sources.get(id)?.tiles?.[0], 'TIME');
const opacityOf = (map: FakeMap, layer: string): number | undefined => map.paint.get(`${layer}:raster-opacity`);

describe('bindRasterBuffer', () => {
    it('preloads the next step on the hidden layer and swaps without waiting', () => {
        const player = createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', mode: 'timeline' });
        const map = setup();
        const buffer = bindRasterBuffer(player, map, 'la', 'lb');
        expect(opacityOf(map, 'lb')).toBe(0);
        player.play();
        expect(timeOf(map, 'a')).toBe('2024-01-01');
        expect(timeOf(map, 'b')).toBe('2024-02-01');
        expect(player.getSnapshot().loading).toBe(true);
        map.content('a', true);
        map.content('b', true);
        expect(player.getSnapshot().loading).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot()).toMatchObject({ step: '2024-02', loading: false });
        expect(buffer.front).toBe('lb');
        expect(opacityOf(map, 'lb')).toBe(0.8);
        expect(opacityOf(map, 'la')).toBe(0);
        expect(timeOf(map, 'a')).toBe('2024-03-01');
        buffer.destroy();
    });

    it('waits for the front layer when the step was not preloaded yet', () => {
        const player = createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', mode: 'timeline' });
        const map = setup();
        bindRasterBuffer(player, map, 'la', 'lb');
        player.play();
        map.content('a', true);
        map.content('b');
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot()).toMatchObject({ step: '2024-02', loading: true });
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot().step).toBe('2024-02');
        map.tile('b');
        expect(player.getSnapshot().step).toBe('2024-03');
    });

    it('loads a manual jump on the front layer and restores opacity on destroy', () => {
        const player = createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', initial: ['2024-01'] });
        const map = setup();
        const buffer = bindRasterBuffer(player, map, 'la', 'lb');
        map.content('a', true);
        player.select('2024-04');
        expect(timeOf(map, map.layers.get(buffer.front)?.source ?? '')).toBe('2024-04-01');
        expect(player.getSnapshot().loading).toBe(true);
        map.content('a');
        map.emit('idle');
        expect(player.getSnapshot().loading).toBe(false);
        buffer.setOpacity(0.5);
        buffer.destroy();
        expect(opacityOf(map, 'la')).toBe(0.5);
        expect(opacityOf(map, 'lb')).toBe(0);
        expect([...map.listeners.values()].every(set => set.size === 0)).toBe(true);
    });

    it('needs layers backed by raster tile sources', () => {
        const player = createTimePlayer({ catalog: '2024-01-01' });
        const map = setup();
        expect(() => bindRasterBuffer(player, map, 'la', 'missing')).toThrow(/raster layers/);
    });
});
