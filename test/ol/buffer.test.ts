import TileLayer from 'ol/layer/Tile.js';
import TileWMS from 'ol/source/TileWMS.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimePlayer } from '../../src/core/index.js';
import { bindWmsBuffer, type WmsLayer } from '../../src/ol/index.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const layer = (): TileLayer<TileWMS> => new TileLayer({
    opacity: 0.8,
    source: new TileWMS({ url: 'https://x.org/wms', params: { LAYERS: 'ndvi' } }),
});

const timeOf = (item: WmsLayer): unknown => item.getSource()?.getParams().TIME;

describe('bindWmsBuffer', () => {
    it('preloads the next step on the hidden layer and swaps without waiting', () => {
        const player = createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', mode: 'timeline' });
        const a = layer();
        const b = layer();
        const buffer = bindWmsBuffer(player, a, b);
        expect(b.getOpacity()).toBe(0);
        player.play();
        expect(timeOf(a)).toBe('2024-01-01');
        expect(timeOf(b)).toBe('2024-02-01');
        vi.advanceTimersByTime(150);
        expect(player.getSnapshot().loading).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot().step).toBe('2024-02');
        expect(buffer.front).toBe(b);
        expect(b.getOpacity()).toBe(0.8);
        expect(a.getOpacity()).toBe(0);
        expect(player.getSnapshot().loading).toBe(false);
        expect(timeOf(a)).toBe('2024-03-01');
        buffer.destroy();
    });

    it('waits for the front layer when the step was not preloaded yet', () => {
        const player = createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', mode: 'timeline' });
        const a = layer();
        const b = layer();
        bindWmsBuffer(player, a, b);
        player.play();
        vi.advanceTimersByTime(150);
        b.getSource()?.dispatchEvent('tileloadstart');
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot()).toMatchObject({ step: '2024-02', loading: true });
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot().step).toBe('2024-02');
        b.getSource()?.dispatchEvent('tileloadend');
        expect(player.getSnapshot().step).toBe('2024-03');
    });

    it('loads a manual jump on the front layer', () => {
        const player = createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', initial: ['2024-01'] });
        const a = layer();
        const b = layer();
        const buffer = bindWmsBuffer(player, a, b);
        player.select('2024-04');
        expect(timeOf(buffer.front)).toBe('2024-04-01');
        expect(player.getSnapshot().loading).toBe(true);
        vi.advanceTimersByTime(150);
        expect(player.getSnapshot().loading).toBe(false);
        buffer.destroy();
        expect(a.getOpacity()).toBe(0.8);
        expect(b.getOpacity()).toBe(0);
    });
});
