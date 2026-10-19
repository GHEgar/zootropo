import { describe, expect, it } from 'vitest';
import { inspectLayer, wfsUrlOf } from '../../src/ol/index.js';

const capabilities = (layers: Record<string, string>): string => `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service><Name>WMS</Name><Title>t</Title></Service>
  <Capability><Layer><Title>root</Title>${Object.entries(layers).map(([name, values]) => `
    <Layer><Name>${name}</Name><Title>${name}</Title>
      <Dimension name="time" default="x" units="ISO8601">${values}</Dimension></Layer>`).join('')}
    <Layer><Name>ws:plain</Name><Title>plain</Title></Layer>
  </Layer></Capability>
</WMS_Capabilities>`;

interface Server {
    layers?: Record<string, string>;
    columns?: Record<string, { name: string; localType: string }[]>;
    edges?: Record<string, [string, string]>;
    wfs?: boolean;
}

const fakeFetch = (server: Server): typeof fetch => (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const request = url.searchParams.get('REQUEST');
    const ok = (body: string, type = 'application/json') => new Response(body, { status: 200, headers: { 'content-type': type } });
    if (request === 'GetCapabilities') return ok(capabilities(server.layers ?? {}), 'text/xml');
    if (server.wfs === false) return new Response('no', { status: 404 });
    const layer = url.searchParams.get('TYPENAMES') ?? '';
    if (request === 'DescribeFeatureType') {
        return ok(JSON.stringify({ featureTypes: [{ properties: [{ name: 'the_geom', localType: 'Point' }, ...(server.columns?.[layer] ?? [])] }] }));
    }
    const column = url.searchParams.get('PROPERTYNAME') ?? '';
    const [first, last] = server.edges?.[column] ?? ['', ''];
    const value = url.searchParams.get('SORTBY')?.endsWith(' A') ? first : last;
    return ok(JSON.stringify({ features: [{ properties: { [column]: value } }] }));
}) as typeof fetch;

const WMS = 'https://example.org/geoserver/ws/wms';

describe('inspectLayer', () => {
    it('recommends TIME for a layer with a time dimension', async () => {
        const report = await inspectLayer(WMS, 'ws:ndvi', {
            fetch: fakeFetch({ layers: { 'ws:ndvi': '2024-01-01/2024-03-01/P1M' } }),
        });
        expect(report).toMatchObject({
            path: 'time',
            time: { instants: 3, ranges: 0, first: '2024-01-01', last: '2024-03-01', hasHours: false },
            options: { kind: 'time', catalog: '2024-01-01/2024-03-01/P1M' },
            notes: [],
        });
    });

    it('recommends CQL for a vector layer with a date column and reads its edges', async () => {
        const report = await inspectLayer(WMS, 'ws:storms', {
            fetch: fakeFetch({
                columns: { 'ws:storms': [{ name: 'obs', localType: 'date-time' }, { name: 'name', localType: 'string' }] },
                edges: { obs: ['1990-07-22T06:00:00Z', '2008-11-14T06:00:00Z'] },
            }),
        });
        expect(report).toMatchObject({
            path: 'cql',
            time: null,
            dateColumns: [{ name: 'obs', type: 'date-time', first: '1990-07-22T06:00:00Z', last: '2008-11-14T06:00:00Z' }],
            options: { kind: 'cql', column: 'obs' },
            notes: ['cql-catalog-needed'],
        });
    });

    it('warns when a layer has both, continuous time and hours', async () => {
        const report = await inspectLayer(WMS, 'ws:obs', {
            sample: false,
            fetch: fakeFetch({
                layers: { 'ws:obs': '1990-07-22T06:00:00.000Z/2008-11-14T06:00:00.000Z/PT1S' },
                columns: { 'ws:obs': [{ name: 'fecha', localType: 'date' }] },
            }),
        });
        expect(report.path).toBe('both');
        expect(report.dateColumns).toEqual([{ name: 'fecha', type: 'date', first: null, last: null }]);
        expect(report.notes).toEqual(['time-continuous', 'time-hours', 'cql-needs-cql-time']);
    });

    it('reports layers without dates and servers without WFS', async () => {
        const report = await inspectLayer(WMS, 'ws:plain', { fetch: fakeFetch({ wfs: false }) });
        expect(report).toMatchObject({ path: 'none', options: null, notes: ['no-wfs', 'no-dates'] });
    });

    it('uses the WFS endpoint the caller passes instead of guessing it', async () => {
        const seen: string[] = [];
        const base = fakeFetch({ columns: { 'ws:obs': [{ name: 'fecha', localType: 'date' }] } });
        const request = ((input: RequestInfo | URL, init?: RequestInit) => {
            seen.push(String(input));
            return base(input, init);
        }) as typeof fetch;
        const report = await inspectLayer('https://example.org/maps/service', 'ws:obs', {
            sample: false, wfsUrl: 'https://example.org/features/endpoint', fetch: request,
        });
        expect(report.path).toBe('cql');
        expect(seen.filter(url => url.includes('DescribeFeatureType'))).toEqual([
            expect.stringMatching(/^https:\/\/example\.org\/features\/endpoint\?/),
        ]);
    });

    it('derives the WFS endpoint', () => {
        expect(wfsUrlOf('https://x.org/geoserver/ws/wms')).toBe('https://x.org/geoserver/ws/wfs');
        expect(wfsUrlOf('https://x.org/geoserver/wms?map=a')).toBe('https://x.org/geoserver/wfs?map=a');
        expect(wfsUrlOf('https://x.org/geoserver/ows')).toBe('https://x.org/geoserver/ows');
    });
});
