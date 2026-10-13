import { describe, expect, it } from 'vitest';
import { parseDuration, parseInstant, parseTimeDimension, shiftKey } from '../../src/core/index.js';
import { civil as civilDays, dayNumber } from '../../src/core/keys.js';

describe('calendar arithmetic', () => {
    it('round-trips day numbers across eras', () => {
        for (const [y, m, d] of [[1970, 1, 1], [2000, 2, 29], [1900, 3, 1], [-4712, 1, 1], [2101, 12, 31]] as const) {
            expect(civilDays(dayNumber(y, m, d))).toEqual([y, m, d]);
        }
        expect(dayNumber(1970, 1, 1)).toBe(0);
    });

    it('shifts keys by their own granularity', () => {
        expect(shiftKey('2024-12', 1)).toBe('2025-01');
        expect(shiftKey('2024-01', -1)).toBe('2023-12');
        expect(shiftKey('2024-02-28', 2)).toBe('2024-03-01');
        expect(shiftKey('0000', -1)).toBe('-0001');
    });
});

describe('parseInstant', () => {
    it('keeps the original text and orders by instant', () => {
        const a = parseInstant('1990-07-22T06:00:00.000Z');
        const b = parseInstant('1990-07-22T12:00:00.000Z');
        expect(a?.text).toBe('1990-07-22T06:00:00.000Z');
        expect((b?.at ?? 0) - (a?.at ?? 0)).toBe(6 * 3_600_000);
    });

    it('normalizes offsets to UTC', () => {
        expect(parseInstant('2024-01-01T01:00:00-06:00')?.text).toBe('2024-01-01T07:00:00Z');
    });

    it('rejects impossible dates', () => {
        expect(parseInstant('2023-02-29')).toBeNull();
        expect(parseInstant('nope')).toBeNull();
    });
});

describe('parseDuration', () => {
    it('reads date and time parts', () => {
        expect(parseDuration('P1M')).toEqual({ months: 1, days: 0, ms: 0 });
        expect(parseDuration('P1Y2W')).toEqual({ months: 12, days: 14, ms: 0 });
        expect(parseDuration('PT6H')).toEqual({ months: 0, days: 0, ms: 6 * 3_600_000 });
        expect(parseDuration('P')).toBeNull();
        expect(parseDuration('PT0S')).toBeNull();
    });
});

describe('parseTimeDimension', () => {
    it('expands periodic intervals and keeps gaps', () => {
        const { instants, ranges } = parseTimeDimension('2023-10-01/2023-12-01/P1M,2024-02-01/2024-03-01/P1M');
        expect(instants).toEqual(['2023-10-01', '2023-11-01', '2023-12-01', '2024-02-01', '2024-03-01']);
        expect(ranges).toEqual([]);
    });

    it('keeps the shape of the start when expanding', () => {
        expect(parseTimeDimension('2020-01-01T00:00:00.000Z/2020-01-01T12:00:00.000Z/PT6H').instants).toEqual([
            '2020-01-01T00:00:00.000Z', '2020-01-01T06:00:00.000Z', '2020-01-01T12:00:00.000Z',
        ]);
    });

    it('clamps month ends instead of drifting', () => {
        expect(parseTimeDimension('2024-01-31/2024-04-30/P1M').instants).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
    });

    it('turns intervals that are too fine into continuous ranges', () => {
        const parsed = parseTimeDimension('1990-07-22T06:00:00.000Z/2008-11-14T06:00:00.000Z/PT1S');
        expect(parsed.instants).toEqual([]);
        expect(parsed.ranges).toEqual([{ start: '1990-07-22T06:00:00.000Z', end: '2008-11-14T06:00:00.000Z' }]);
    });

    it('treats intervals without period as ranges and mixes lists', () => {
        const parsed = parseTimeDimension('2012-01-01T00:00:00.000Z,2016-01-01/2016-06-30,2020-05-05/2020-05-05/P1D');
        expect(parsed.instants).toEqual(['2012-01-01T00:00:00.000Z', '2020-05-05']);
        expect(parsed.ranges).toEqual([{ start: '2016-01-01', end: '2016-06-30' }]);
    });

    it('respects maxInstants', () => {
        expect(parseTimeDimension('2000-01-01/2000-12-31/P1D', { maxInstants: 100 }).ranges).toHaveLength(1);
    });
});
