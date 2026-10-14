import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimePlayer, parseTimeDimension } from '../../src/core/index.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const NOW = Date.UTC(2024, 5, 1, 10, 20);

describe('PRESENT and current', () => {
    it('resolves the end of an interval to now with the shape of its start', () => {
        expect(parseTimeDimension('2024-06-01T10:00:00Z/PRESENT/PT10M', { now: NOW }).instants).toEqual([
            '2024-06-01T10:00:00Z', '2024-06-01T10:10:00Z', '2024-06-01T10:20:00Z',
        ]);
        expect(parseTimeDimension('2024-05-30/current', { now: NOW }).ranges).toEqual([{ start: '2024-05-30', end: '2024-06-01' }]);
        expect(parseTimeDimension('current', { now: NOW }).instants).toEqual(['2024-06-01T10:20:00Z']);
    });
});

describe('updateCatalog', () => {
    it('keeps playing and extends the timeline', () => {
        const player = createTimePlayer({ catalog: '2024-06-01T10:00:00Z,2024-06-01T10:05:00Z', mode: 'timeline', granularity: 'minute' });
        player.play();
        player.updateCatalog('2024-06-01T10:00:00Z,2024-06-01T10:05:00Z,2024-06-01T10:10:00Z');
        expect(player.getSnapshot()).toMatchObject({ playing: true, step: '2024-06-01T10:00' });
        expect(player.getSnapshot().sequence.keys).toHaveLength(3);
        vi.advanceTimersByTime(2000);
        expect(player.getSnapshot().step).toBe('2024-06-01T10:10');
    });

    it('follows the latest date only when the selection was on it', () => {
        const player = createTimePlayer({ catalog: '2024-04-01,2024-05-01', initial: 'latest', follow: true });
        player.updateCatalog('2024-04-01,2024-05-01,2024-06-01');
        expect(player.getSnapshot().selection).toEqual(['2024-06']);
        player.select('2024-04');
        player.updateCatalog('2024-04-01,2024-05-01,2024-06-01,2024-07-01');
        expect(player.getSnapshot().selection).toEqual(['2024-04']);
    });

    it('does not follow without the option and drops what disappeared', () => {
        const player = createTimePlayer({ catalog: '2024-04-01,2024-05-01', initial: 'latest' });
        player.updateCatalog('2024-05-01,2024-06-01');
        expect(player.getSnapshot().selection).toEqual(['2024-05']);
        player.updateCatalog('2024-06-01,2024-07-01');
        expect(player.getSnapshot().selection).toEqual([]);
    });
});
