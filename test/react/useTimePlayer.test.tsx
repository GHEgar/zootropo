import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerGroup, createTimePlayer, usePlayerGroup, useTimePlayer } from '../../src/react/index.js';

const CATALOG = '2023-11-01/2023-12-01/P1M,2024-01-01/2024-04-01/P1M';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useTimePlayer', () => {
    it('opens a year on click and toggles months', () => {
        const player = createTimePlayer({ catalog: CATALOG });
        const { result } = renderHook(() => useTimePlayer(player));
        expect(result.current.getListProps()).toMatchObject({ role: 'listbox', 'data-level': 'years' });
        const year = result.current.items.find(item => item.key === '2024');
        if (!year) throw new Error('missing year');
        act(() => result.current.getItemProps(year).onClick());
        expect(result.current).toMatchObject({ selection: ['2024'], view: { level: 'months', year: 2024 } });
        const [first, second] = result.current.items;
        if (!first || !second) throw new Error('missing months');
        act(() => result.current.getItemProps(first).onClick());
        act(() => result.current.getItemProps(second).onClick());
        expect(result.current.selection).toEqual(['2024-01', '2024-02']);
        expect(result.current.getItemProps(result.current.items[0] ?? first)).toMatchObject({ 'aria-selected': true, 'data-selected': true });
        act(() => result.current.getBackProps().onClick());
        expect(result.current.view.level).toBe('years');
    });

    it('drives playback through prop getters', () => {
        const player = createTimePlayer({ catalog: CATALOG, initial: 'latest' });
        const { result } = renderHook(() => useTimePlayer(player, { labels: { play: 'Reproducir' } }));
        expect(result.current.getPlayProps()).toMatchObject({ 'aria-label': 'Reproducir', 'aria-pressed': false, disabled: false });
        act(() => result.current.getPlayProps().onClick());
        expect(result.current.getPlayProps()).toMatchObject({ 'aria-pressed': true, 'data-playing': true });
        act(() => { vi.advanceTimersByTime(1000); });
        expect(result.current.step).toBe('2024-01');
        const current = result.current.items.find(item => item.current);
        expect(current && result.current.getItemProps(current)).toMatchObject({ 'aria-current': 'step', 'data-current': true });
        act(() => result.current.getIntervalProps().onClick());
        expect(result.current.intervalMs).toBe(2000);
        act(() => result.current.getDirectionProps().onClick());
        expect(result.current.direction).toBe('backward');
        act(() => result.current.getStopProps().onClick());
        expect(result.current).toMatchObject({ playing: false, step: null });
    });
});

describe('usePlayerGroup', () => {
    it('exposes the shared transport', () => {
        const group = createPlayerGroup([
            createTimePlayer({ catalog: CATALOG, mode: 'timeline' }),
            createTimePlayer({ catalog: '2024-05-01', mode: 'timeline' }),
        ]);
        const { result } = renderHook(() => usePlayerGroup(group));
        expect(result.current.sequence).toHaveLength(6);
        act(() => result.current.getPlayProps().onClick());
        act(() => { vi.advanceTimersByTime(1000); });
        expect(result.current).toMatchObject({ playing: true, step: '2023-12' });
        act(() => result.current.getStepProps(-1).onClick());
        expect(result.current.step).toBe('2023-11');
    });
});
