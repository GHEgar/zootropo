import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerGroup, createTimePlayer } from '../../src/core/index.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const terra = () => createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', mode: 'timeline' });
const aqua = () => createTimePlayer({ catalog: '2024-01-01,2024-02-01,2024-04-01,2024-05-01', mode: 'timeline' });

describe('createPlayerGroup', () => {
    it('walks the union of keys and marks members without that date as stale', () => {
        const a = terra();
        const b = aqua();
        const group = createPlayerGroup([a, b]);
        expect(group.getSnapshot().sequence).toEqual(['2024-01', '2024-02', '2024-03', '2024-04', '2024-05']);
        group.play();
        expect(a.getSnapshot()).toMatchObject({ playing: true, grouped: true, step: '2024-01' });
        vi.advanceTimersByTime(2000);
        expect(group.getSnapshot().step).toBe('2024-03');
        expect(a.getSnapshot()).toMatchObject({ step: '2024-03', stale: false });
        expect(b.getSnapshot()).toMatchObject({ step: '2024-02', stale: true, value: '2024-02-01' });
        vi.advanceTimersByTime(2000);
        expect(a.getSnapshot()).toMatchObject({ step: '2024-04', stale: true });
        expect(b.getSnapshot()).toMatchObject({ step: '2024-05', stale: false });
    });

    it('waits until every member is ready', () => {
        const a = terra();
        const b = aqua();
        const group = createPlayerGroup([a, b], { intervalMs: 500 });
        group.play();
        a.loading();
        b.loading();
        vi.advanceTimersByTime(500);
        a.ready();
        expect(group.getSnapshot().step).toBe('2024-01');
        b.ready();
        expect(group.getSnapshot().step).toBe('2024-02');
    });

    it('routes member transport to the group and pauses on a manual selection', () => {
        const a = terra();
        const b = aqua();
        const group = createPlayerGroup([a, b]);
        a.play();
        expect(group.getSnapshot().playing).toBe(true);
        vi.advanceTimersByTime(1000);
        b.select('2024-04');
        expect(group.getSnapshot().playing).toBe(false);
        expect(a.getSnapshot()).toMatchObject({ playing: false, step: '2024-02' });
        expect(b.getSnapshot()).toMatchObject({ step: null, selection: ['2024-04'] });
        group.stop();
        expect(a.getSnapshot().step).toBeNull();
    });

    it('starts from the members selection when it is in the sequence', () => {
        const a = createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', initial: ['2024-03'] });
        const group = createPlayerGroup([a, createTimePlayer({ catalog: '2024-01-01/2024-04-01/P1M', initial: ['2024-03'] })]);
        group.play();
        expect(group.getSnapshot().step).toBe('2024-03');
    });

    it('releases members', () => {
        const a = terra();
        const group = createPlayerGroup([a, aqua()]);
        group.remove(a);
        a.play();
        expect(a.getSnapshot()).toMatchObject({ playing: true, grouped: false });
        expect(group.getSnapshot().playing).toBe(false);
        group.destroy();
    });
});
