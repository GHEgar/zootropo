import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimePlayer } from '../../src/core/index.js';
import { watchDimension } from '../../src/ol/index.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const capabilities = (values: string): string => `<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms"><Service><Name>WMS</Name><Title>t</Title></Service>
<Capability><Layer><Title>r</Title><Layer><Name>ws:radar</Name><Title>radar</Title>
<Dimension name="time" units="ISO8601">${values}</Dimension></Layer></Layer></Capability></WMS_Capabilities>`;

describe('watchDimension', () => {
    it('loads, refreshes on the interval and follows the latest frame', async () => {
        const responses = ['2024-06-01T10:00:00Z,2024-06-01T10:05:00Z', '2024-06-01T10:00:00Z,2024-06-01T10:05:00Z,2024-06-01T10:10:00Z'];
        let calls = 0;
        const fetch = vi.fn(async () => new Response(capabilities(responses[Math.min(calls++, 1)] as string), { status: 200 })) as unknown as typeof globalThis.fetch;
        const player = createTimePlayer({ follow: true });
        const watch = watchDimension(player, 'https://x.org/wms', 'ws:radar', { fetch, intervalMs: 30_000 });
        await vi.advanceTimersByTimeAsync(0);
        expect(player.getSnapshot().catalog.instants).toHaveLength(2);
        player.setSelection(['2024-06-01T10:05']);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(player.getSnapshot().catalog.instants).toHaveLength(3);
        expect(player.getSnapshot().selection).toEqual(['2024-06-01T10:10']);
        watch.stop();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
