import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerGroup, createTimePlayer, type TimePlayer } from '../../src/core/index.js';

const MONTHLY = '2024-01-01/2024-04-01/P1M';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const loadOnChange = (player: TimePlayer): void => {
    let last = player.getSnapshot().value;
    player.subscribe(() => {
        const { value } = player.getSnapshot();
        if (value === last) return;
        last = value;
        player.loading();
    });
};

const track = (promise: Promise<boolean>) => {
    const result: { value?: boolean } = {};
    void promise.then(value => { result.value = value; });
    return result;
};

describe('seek', () => {
    it('resolves right away when nothing loads and false for unknown keys', async () => {
        const player = createTimePlayer({ catalog: MONTHLY, mode: 'timeline' });
        await expect(player.seek('2024-02')).resolves.toBe(true);
        expect(player.getSnapshot().step).toBe('2024-02');
        await expect(player.seek('2030-01')).resolves.toBe(false);
        expect(player.getSnapshot().step).toBe('2024-02');
    });

    it('resolves once the bound layer is ready', async () => {
        const player = createTimePlayer({ catalog: MONTHLY, mode: 'timeline' });
        loadOnChange(player);
        const result = track(player.seek('2024-03'));
        await vi.advanceTimersByTimeAsync(0);
        expect(result.value).toBeUndefined();
        expect(player.getSnapshot().loading).toBe(true);
        player.ready();
        await vi.advanceTimersByTimeAsync(0);
        expect(result.value).toBe(true);
    });

    it('resolves false on timeout or destroy', async () => {
        const player = createTimePlayer({ catalog: MONTHLY, mode: 'timeline', timeoutMs: 2000 });
        loadOnChange(player);
        const late = track(player.seek('2024-02'));
        await vi.advanceTimersByTimeAsync(2000);
        expect(late.value).toBe(false);
        player.ready();
        const dropped = track(player.seek('2024-03'));
        player.destroy();
        await vi.advanceTimersByTimeAsync(0);
        expect(dropped.value).toBe(false);
    });

    it('waits for every member of a group', async () => {
        const a = createTimePlayer({ catalog: MONTHLY, mode: 'timeline' });
        const b = createTimePlayer({ catalog: MONTHLY, mode: 'timeline' });
        loadOnChange(a);
        loadOnChange(b);
        const group = createPlayerGroup([a, b]);
        const result = track(a.seek('2024-02'));
        expect(group.getSnapshot().step).toBe('2024-02');
        a.ready();
        await vi.advanceTimersByTimeAsync(0);
        expect(result.value).toBeUndefined();
        b.ready();
        await vi.advanceTimersByTimeAsync(0);
        expect(result.value).toBe(true);
        await expect(group.seek('2031-01')).resolves.toBe(false);
    });
});
