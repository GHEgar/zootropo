import { describe, expect, it } from 'vitest';
import { buildSequence, createCatalog, cqlValue, timeValue, and } from '../../src/core/index.js';
import type { View } from '../../src/core/index.js';

const GIBS = '2023-10-01/2023-12-01/P1M,2024-02-01/2024-04-01/P1M';
const STORMS = [
    '1990-07-22T06:00:00.000Z', '1990-07-22T12:00:00.000Z', '1990-07-23T00:00:00.000Z',
    '1990-08-01T00:00:00.000Z', '1991-01-10T00:00:00.000Z',
];
const YEARS: View = { level: 'years', year: null, month: null };

describe('createCatalog', () => {
    it('builds the year, month and day tree from a dimension string', () => {
        const catalog = createCatalog(GIBS);
        expect(catalog.years()).toEqual([2023, 2024]);
        expect(catalog.months(2024)).toEqual([2, 3, 4]);
        expect(catalog.days(2024, 3)).toEqual([1]);
        expect(catalog.has('2024-01')).toBe(false);
        expect(catalog.isAvailable('2024-02-01')).toBe(true);
        expect(catalog.isAvailable('2024-02-02T10:00:00Z')).toBe(false);
        expect(catalog.latest('month')).toBe('2024-04');
        expect(catalog.earliest('day')).toBe('2023-10-01');
    });

    it('answers continuous ranges lazily', () => {
        const catalog = createCatalog('1990-07-22T06:00:00.000Z/2008-11-14T06:00:00.000Z/PT1S');
        expect(catalog.years()).toHaveLength(19);
        expect(catalog.months(1990)).toEqual([7, 8, 9, 10, 11, 12]);
        expect(catalog.days(1990, 7)).toEqual([22, 23, 24, 25, 26, 27, 28, 29, 30, 31]);
        expect(catalog.rangesIn('1995-03')).toEqual([{ start: '1995-03-01T00:00:00.000Z', end: '1995-03-31T23:59:59.999Z' }]);
        expect(catalog.rangesIn('1990')).toEqual([{ start: '1990-07-22T06:00:00.000Z', end: '1990-12-31T23:59:59.999Z' }]);
        expect(catalog.keys('month').keys).toHaveLength(221);
        expect(catalog.keys('day', 100)).toMatchObject({ truncated: true });
    });

    it('slices instants by period', () => {
        const catalog = createCatalog(STORMS);
        expect(catalog.slice('1990-07')).toEqual([0, 3]);
        expect(catalog.slice('1990-07-22')).toEqual([0, 2]);
        expect(catalog.keys('day').keys).toEqual(['1990-07-22', '1990-07-23', '1990-08-01', '1991-01-10']);
    });
});

describe('timeValue', () => {
    it('compacts instants that are consecutive in the catalog', () => {
        const catalog = createCatalog(STORMS);
        expect(timeValue(catalog, ['1990-07'])).toBe('1990-07-22T06:00:00.000Z/1990-07-23T00:00:00.000Z');
        expect(timeValue(catalog, ['1990-07-22'])).toBe('1990-07-22T06:00:00.000Z/1990-07-22T12:00:00.000Z');
        expect(timeValue(catalog, ['1990-07', '1990-08'])).toBe('1990-07-22T06:00:00.000Z/1990-08-01T00:00:00.000Z');
        expect(timeValue(catalog, ['1990-07-22', '1990-08-01'])).toBe(
            '1990-07-22T06:00:00.000Z/1990-07-22T12:00:00.000Z,1990-08-01T00:00:00.000Z',
        );
    });

    it('lists every instant when compact is off', () => {
        const catalog = createCatalog(STORMS);
        expect(timeValue(catalog, ['1990-07-22'], { compact: false })).toBe('1990-07-22T06:00:00.000Z,1990-07-22T12:00:00.000Z');
    });

    it('returns one instant for a single monthly step and null for nothing', () => {
        const catalog = createCatalog(GIBS);
        expect(timeValue(catalog, ['2024-03'])).toBe('2024-03-01');
        expect(timeValue(catalog, ['2024-01'])).toBeNull();
        expect(timeValue(catalog, [])).toBeNull();
    });

    it('clips continuous ranges to the period', () => {
        const catalog = createCatalog('2016-01-01/2016-06-30');
        expect(timeValue(catalog, ['2016-03'])).toBe('2016-03-01/2016-03-31');
    });
});

describe('cqlValue', () => {
    it('uses half-open ranges and merges contiguous periods', () => {
        expect(cqlValue('fecha', ['2024'])).toBe("fecha >= '2024-01-01' AND fecha < '2025-01-01'");
        expect(cqlValue('fecha', ['2024-03', '2024-01', '2024-02'])).toBe("fecha >= '2024-01-01' AND fecha < '2024-04-01'");
        const field = '"obs date"';
        expect(cqlValue('obs date', ['2024-12-31', '2024-02-29'])).toBe(
            `(${field} >= '2024-02-29' AND ${field} < '2024-03-01') OR (${field} >= '2024-12-31' AND ${field} < '2025-01-01')`,
        );
        expect(cqlValue('fecha', [])).toBeNull();
    });

    it('joins with a base filter', () => {
        expect(and(['tipo = 1', cqlValue('fecha', ['2024-05'])])).toBe("(tipo = 1) AND (fecha >= '2024-05-01' AND fecha < '2024-06-01')");
    });
});

describe('buildSequence', () => {
    const catalog = createCatalog(GIBS);
    const base = { catalog, view: YEARS, granularity: 'month' as const };

    it('infers month mode from a month selection and uses all months of that year', () => {
        expect(buildSequence({ ...base, selection: ['2024-03'], mode: 'auto' })).toEqual({
            mode: 'month', keys: ['2024-02', '2024-03', '2024-04'], truncated: false,
        });
    });

    it('uses only the selected months when there are two or more', () => {
        expect(buildSequence({ ...base, selection: ['2024-02', '2024-04'], mode: 'month' }).keys).toEqual(['2024-02', '2024-04']);
    });

    it('walks years, days and the whole timeline', () => {
        expect(buildSequence({ ...base, selection: [], mode: 'year' }).keys).toEqual(['2023', '2024']);
        expect(buildSequence({ ...base, selection: [], mode: 'timeline' }).keys).toEqual([
            '2023-10', '2023-11', '2023-12', '2024-02', '2024-03', '2024-04',
        ]);
        const daily = createCatalog('2024-05-01/2024-05-04/P1D');
        expect(buildSequence({ ...base, catalog: daily, selection: ['2024-05-02'], mode: 'auto' }).keys).toEqual([
            '2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04',
        ]);
    });

    it('falls back when a mode has fewer than two steps', () => {
        const single = createCatalog('2012-01-01,2016-01-01');
        expect(buildSequence({ ...base, catalog: single, selection: ['2016-01'], mode: 'auto' }).mode).toBe('year');
        expect(buildSequence({ ...base, catalog: single, selection: [], mode: 'month' }).keys).toEqual([]);
    });
});
