import { describe, expect, it, vi } from 'vitest';
import { fetchColumnDates, serviceUrlOf } from '../../src/ol/index.js';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const values = ['2005-11-28T18:00:00.000Z', '1999-06-16T18:00:00.000Z', '2005-11-28T12:00:00.000Z', '1999-06-16T18:00:00.000Z'];

describe('fetchColumnDates', () => {
    it('asks gs:Unique and returns sorted unique dates', async () => {
        const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            expect(String(init?.body)).toContain('<ows:Identifier>gs:Unique</ows:Identifier>');
            expect(String(init?.body)).toContain('typeName="ws:storms"');
            return json({ features: values.map(value => ({ properties: { value } })) });
        }) as unknown as typeof globalThis.fetch;
        const result = await fetchColumnDates('https://x.org/geoserver/ws/wms', 'ws:storms', 'obs', { fetch });
        expect(result).toEqual({
            dates: ['1999-06-16T18:00:00.000Z', '2005-11-28T12:00:00.000Z', '2005-11-28T18:00:00.000Z'],
            source: 'wps',
            truncated: false,
        });
        expect(String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0])).toBe('https://x.org/geoserver/ws/wps');
    });

    it('reduces to a granularity', async () => {
        const fetch = vi.fn(async () => json({ features: values.map(value => ({ properties: { value } })) })) as unknown as typeof globalThis.fetch;
        expect((await fetchColumnDates('https://x.org/wms', 'ws:storms', 'obs', { fetch, granularity: 'day' })).dates)
            .toEqual(['1999-06-16', '2005-11-28']);
    });

    it('falls back to WFS when the WPS answers with an exception', async () => {
        const fetch = vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).endsWith('/wps')) return new Response('<ows:ExceptionReport/>', { status: 200, headers: { 'content-type': 'text/xml' } });
            expect(String(url)).toContain('PROPERTYNAME=obs');
            return json({ features: [{ properties: { obs: '2024-01-02' } }, { properties: { obs: '2024-01-01' } }] });
        }) as unknown as typeof globalThis.fetch;
        expect(await fetchColumnDates('https://x.org/wms', 'ws:storms', 'obs', { fetch, maxFeatures: 2 })).toEqual({
            dates: ['2024-01-01', '2024-01-02'], source: 'wfs', truncated: true,
        });
    });

    it('derives service endpoints', () => {
        expect(serviceUrlOf('https://x.org/geoserver/ws/wms?map=a', 'wps')).toBe('https://x.org/geoserver/ws/wps?map=a');
        expect(serviceUrlOf('https://x.org/geoserver/ows', 'wfs')).toBe('https://x.org/geoserver/wfs');
    });
});
