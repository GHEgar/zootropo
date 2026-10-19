import { describe, expect, it } from 'vitest';
import { applyParams } from '../../src/maplibre/index.js';
import { TEMPLATE } from './fake.js';

describe('applyParams', () => {
    it('inserts in key order and keeps the bbox placeholder', () => {
        expect(applyParams(TEMPLATE, { TIME: '2024-01-01/2024-03-01' })).toBe(
            'https://x.org/wms?FORMAT=image%2Fpng&LAYERS=ndvi&REQUEST=GetMap&SERVICE=WMS&TIME=2024-01-01/2024-03-01&VERSION=1.3.0&BBOX={bbox-epsg-3857}',
        );
    });

    it('replaces managed keys ignoring case and drops undefined ones', () => {
        const url = 'https://x.org/wms?time=2020-01-01&LAYERS=a&bbox={bbox-epsg-3857}';
        expect(applyParams(url, { TIME: '2024-01-01' })).toBe('https://x.org/wms?LAYERS=a&TIME=2024-01-01&bbox={bbox-epsg-3857}');
        expect(applyParams(url, { TIME: undefined })).toBe('https://x.org/wms?LAYERS=a&bbox={bbox-epsg-3857}');
    });

    it('encodes CQL and handles templates without a query', () => {
        expect(applyParams('https://x.org/wms', { CQL_FILTER: "fecha >= '2024-01-01'" })).toBe(
            "https://x.org/wms?CQL_FILTER=fecha%20%3E%3D%20'2024-01-01'",
        );
        expect(applyParams('https://x.org/wms?#x', { TIME: undefined })).toBe('https://x.org/wms');
    });
});
