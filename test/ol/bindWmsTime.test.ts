import TileWMS from 'ol/source/TileWMS.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTimePlayer } from '../../src/core/index.js';
import { bindWmsTime, capabilitiesUrl, readDimensions } from '../../src/ol/index.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const source = (): TileWMS => new TileWMS({ url: 'https://example.org/wms', params: { LAYERS: 'ndvi' } });

describe('bindWmsTime', () => {
    it('writes TIME and marks the player ready once tiles finish', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-02-01', initial: ['2024-01'] });
        const wms = source();
        const binding = bindWmsTime(player, wms);
        expect(wms.getParams()).toMatchObject({ TIME: '2024-01-01' });
        expect(player.getSnapshot().loading).toBe(true);
        wms.dispatchEvent('tileloadstart');
        wms.dispatchEvent('tileloadstart');
        vi.advanceTimersByTime(500);
        wms.dispatchEvent('tileloadend');
        expect(player.getSnapshot().loading).toBe(true);
        wms.dispatchEvent('tileloaderror');
        expect(player.getSnapshot().loading).toBe(false);
        player.select('2024-02');
        expect(wms.getParams()).toMatchObject({ TIME: '2024-02-01' });
        vi.advanceTimersByTime(150);
        expect(player.getSnapshot().loading).toBe(false);
        player.clearSelection();
        expect(wms.getParams().TIME).toBeUndefined();
        binding.destroy();
    });

    it('sends a wide TIME with cql players on time enabled layers', () => {
        const player = createTimePlayer({ catalog: '2024-01-01,2024-06-01', kind: 'cql', column: 'fecha', initial: ['2024-01'] });
        const wms = source();
        const binding = bindWmsTime(player, wms, { cqlTime: 'catalog' });
        expect(wms.getParams()).toMatchObject({ TIME: '2024-01-01/2024-06-01' });
        player.setCatalog('2023-01-01,2024-01-01');
        expect(wms.getParams()).toMatchObject({ TIME: '2023-01-01/2024-01-01' });
        binding.destroy();
        const fixed = source();
        bindWmsTime(player, fixed, { cqlTime: '1990/2030' }).destroy();
        expect(fixed.getParams()).toMatchObject({ TIME: '1990/2030' });
    });

    it('writes CQL_FILTER for cql players', () => {
        const player = createTimePlayer({ catalog: '2024-01-01', kind: 'cql', column: 'fecha', initial: ['2024'] });
        const wms = source();
        bindWmsTime(player, wms).destroy();
        expect(wms.getParams()).toMatchObject({ CQL_FILTER: "fecha >= '2024-01-01' AND fecha < '2025-01-01'" });
        expect(player.getSnapshot().loading).toBe(false);
    });
});

const CAPABILITIES = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service><Name>WMS</Name><Title>t</Title></Service>
  <Capability>
    <Layer>
      <Title>root</Title>
      <Layer queryable="1">
        <Name>geosolutions:storm_obs_test</Name>
        <Title>storms</Title>
        <Dimension name="time" default="1990-07-22T12:00:00Z" units="ISO8601">1990-07-22T06:00:00.000Z,1990-07-22T12:00:00.000Z</Dimension>
      </Layer>
      <Layer queryable="1">
        <Name>plain</Name>
        <Title>plain</Title>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

describe('capabilities', () => {
    it('reads time dimensions by full and local name', () => {
        const dimensions = readDimensions(CAPABILITIES);
        expect(dimensions.get('storm_obs_test')).toMatchObject({
            layer: 'geosolutions:storm_obs_test',
            values: '1990-07-22T06:00:00.000Z,1990-07-22T12:00:00.000Z',
            default: '1990-07-22T12:00:00Z',
        });
        expect(dimensions.has('plain')).toBe(false);
    });

    it('builds the request url', () => {
        expect(capabilitiesUrl('https://x.org/wms')).toBe('https://x.org/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0');
        expect(capabilitiesUrl('https://x.org/ows?map=a')).toBe('https://x.org/ows?map=a&SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0');
    });
});
