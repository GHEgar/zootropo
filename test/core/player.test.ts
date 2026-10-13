import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimePlayer, type PlayerEvent } from '../../src/core/index.js';

const MONTHLY = '2023-11-01/2023-12-01/P1M,2024-01-01/2024-04-01/P1M';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('createTimePlayer', () => {
    it('starts empty or on the latest month', () => {
        expect(createTimePlayer({ catalog: MONTHLY }).getSnapshot()).toMatchObject({ selection: [], value: null, view: { level: 'years' } });
        const latest = createTimePlayer({ catalog: MONTHLY, initial: 'latest' }).getSnapshot();
        expect(latest).toMatchObject({ selection: ['2024-04'], value: '2024-04-01', view: { level: 'months', year: 2024 } });
        expect(latest.items.map(item => item.key)).toEqual(['2024-01', '2024-02', '2024-03', '2024-04']);
        expect(latest.items[3]).toMatchObject({ selected: true });
    });

    it('selects, toggles in the same group and navigates levels', () => {
        const player = createTimePlayer({ catalog: MONTHLY, kind: 'cql', column: 'fecha' });
        player.select('2024');
        player.open('2024');
        expect(player.getSnapshot().view).toEqual({ level: 'months', year: 2024, month: null, day: null });
        player.select('2024-02', 'toggle');
        player.select('2024-03', 'toggle');
        expect(player.getSnapshot().selection).toEqual(['2024-02', '2024-03']);
        expect(player.getSnapshot().cql).toBe("fecha >= '2024-02-01' AND fecha < '2024-04-01'");
        player.select('2024-02', 'toggle');
        expect(player.getSnapshot().selection).toEqual(['2024-03']);
        player.back();
        expect(player.getSnapshot().items.find(item => item.key === '2024')).toMatchObject({ partial: true, selected: false });
    });

    it('allows a single key when multiple is off', () => {
        const player = createTimePlayer({ catalog: MONTHLY, multiple: false });
        player.select('2024-02', 'toggle');
        player.select('2024-03', 'toggle');
        expect(player.getSnapshot().selection).toEqual(['2024-03']);
    });

    it('plays from the selected step, wraps around and pauses', () => {
        const events: PlayerEvent[] = [];
        const player = createTimePlayer({ catalog: MONTHLY, initial: ['2024-03'], onEvent: event => events.push(event) });
        player.play();
        expect(player.getSnapshot()).toMatchObject({ playing: true, step: '2024-03', mode: 'auto', sequence: { mode: 'month' } });
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot()).toMatchObject({ step: '2024-04', value: '2024-04-01' });
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot().step).toBe('2024-01');
        player.pause();
        vi.advanceTimersByTime(5000);
        expect(player.getSnapshot()).toMatchObject({ playing: false, step: '2024-01' });
        expect(events.filter(event => event.type === 'step').map(event => 'key' in event && event.key)).toEqual(['2024-03', '2024-04', '2024-01']);
        player.stop();
        expect(player.getSnapshot()).toMatchObject({ step: null, value: '2024-03-01' });
    });

    it('honours direction, interval bounds and loop off', () => {
        const player = createTimePlayer({ catalog: MONTHLY, mode: 'timeline', direction: 'backward', intervalMs: 20, loop: false });
        expect(player.getSnapshot().intervalMs).toBe(100);
        player.play();
        expect(player.getSnapshot().step).toBe('2024-04');
        vi.advanceTimersByTime(100 * 5);
        expect(player.getSnapshot()).toMatchObject({ step: '2023-11', playing: true });
        vi.advanceTimersByTime(100);
        expect(player.getSnapshot()).toMatchObject({ step: '2023-11', playing: false });
        player.setDirection('forward');
        player.step();
        expect(player.getSnapshot().step).toBe('2023-12');
    });

    it('waits for the layer to load before advancing and times out', () => {
        const events: string[] = [];
        const player = createTimePlayer({ catalog: MONTHLY, mode: 'timeline', timeoutMs: 3000, onEvent: event => events.push(event.type) });
        player.play();
        player.loading();
        vi.advanceTimersByTime(1500);
        expect(player.getSnapshot().step).toBe('2023-11');
        player.ready();
        expect(player.getSnapshot().step).toBe('2023-12');
        player.loading();
        vi.advanceTimersByTime(1000 + 3000);
        expect(player.getSnapshot()).toMatchObject({ playing: false, step: '2023-12' });
        expect(events).toContain('timeout');
    });

    it('pauses and resets the step when the selection changes by hand', () => {
        const player = createTimePlayer({ catalog: MONTHLY, initial: 'latest' });
        player.play();
        vi.advanceTimersByTime(1000);
        player.select('2023-12');
        expect(player.getSnapshot()).toMatchObject({ playing: false, step: null, value: '2023-12-01' });
    });

    it('changes mode while paused keeping the step when possible', () => {
        const player = createTimePlayer({ catalog: MONTHLY, initial: ['2024-02'] });
        player.play();
        player.pause();
        player.setMode('timeline');
        expect(player.getSnapshot()).toMatchObject({ step: '2024-02', sequence: { mode: 'timeline' } });
        expect(player.getSnapshot().sequence.keys).toHaveLength(6);
    });

    it('swaps the catalog and keeps what still exists', () => {
        const player = createTimePlayer({ catalog: [], kind: 'cql', column: 'fecha', baseCql: 'tipo = 1' });
        expect(player.getSnapshot()).toMatchObject({ canPlay: false, value: 'tipo = 1' });
        player.setCatalog(MONTHLY);
        player.setSelection(['2024-01', '1999-01']);
        expect(player.getSnapshot().selection).toEqual(['2024-01']);
        player.setCatalog('2024-01-01,2024-02-01');
        expect(player.getSnapshot()).toMatchObject({ selection: ['2024-01'], canPlay: true });
    });

    it('requires a column for cql players', () => {
        expect(() => createTimePlayer({ kind: 'cql' })).toThrow();
    });

    it('opens days into hours when the catalog has times', () => {
        const player = createTimePlayer({ catalog: '2024-03-01T00:00:00Z/2024-03-01T18:00:00Z/PT6H', kind: 'cql', column: 't' });
        player.open('2024');
        player.open('2024-03');
        player.open('2024-03-01');
        expect(player.getSnapshot().view).toEqual({ level: 'hours', year: 2024, month: 3, day: 1 });
        expect(player.getSnapshot().items.map(item => item.hour)).toEqual([0, 6, 12, 18]);
        player.select('2024-03-01T06');
        player.play();
        vi.advanceTimersByTime(1000);
        expect(player.getSnapshot()).toMatchObject({ step: '2024-03-01T12', cql: "t >= '2024-03-01T12:00:00Z' AND t < '2024-03-01T13:00:00Z'" });
        player.back();
        player.open('2024-02');
        expect(player.getSnapshot().view.level).toBe('months');
    });
});
