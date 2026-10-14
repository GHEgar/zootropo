import { createCatalog, type PlayerOptions } from '../core/index.js';
import { fetchDimensions } from './capabilities.js';

export type InspectPath = 'time' | 'cql' | 'both' | 'none';

export type InspectNote =
    | 'time-continuous'
    | 'time-hours'
    | 'cql-needs-cql-time'
    | 'cql-catalog-needed'
    | 'no-wfs'
    | 'no-capabilities'
    | 'no-dates';

export interface TimeReport {
    values: string;
    default: string | null;
    instants: number;
    ranges: number;
    first: string | null;
    last: string | null;
    hasHours: boolean;
}

export interface DateColumn {
    name: string;
    type: string;
    first: string | null;
    last: string | null;
}

export interface LayerReport {
    layer: string;
    path: InspectPath;
    time: TimeReport | null;
    dateColumns: DateColumn[];
    options: Partial<PlayerOptions> | null;
    notes: InspectNote[];
}

export interface InspectOptions {
    wfsUrl?: string;
    sample?: boolean;
    signal?: AbortSignal;
    fetch?: typeof fetch;
}

interface FeatureType {
    properties?: { name: string; type?: string; localType?: string }[];
}

const DATE_TYPE = /date|time/i;

export const wfsUrlOf = (wmsUrl: string): string => wmsUrl.replace(/\/wms(?=\?|$)/i, '/wfs');

const withParams = (url: string, params: Record<string, string>): string => {
    const query = new URLSearchParams(params).toString();
    const separator = url.includes('?') ? (/[?&]$/.test(url) ? '' : '&') : '?';
    return `${url}${separator}${query}`;
};

const MIDNIGHT = /T00:00(:00(\.0+)?)?(Z|[+-]00:?00)?$/;

const hasTimeOfDay = (text: string): boolean => text.includes('T') && !MIDNIGHT.test(text);

const toTimeReport = (values: string, fallback: string | null): TimeReport => {
    const catalog = createCatalog(values);
    const extent = catalog.extent();
    return {
        values,
        default: fallback,
        instants: catalog.instants.length,
        ranges: catalog.ranges.length,
        first: extent?.start ?? null,
        last: extent?.end ?? null,
        hasHours: [...catalog.instants, ...catalog.ranges.flatMap(range => [range.start, range.end])].some(hasTimeOfDay),
    };
};

const json = async (request: typeof fetch, url: string, init: RequestInit): Promise<unknown> => {
    const response = await request(url, init);
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
};

const edgeOf = async (request: typeof fetch, wfs: string, layer: string, column: string, order: 'A' | 'D', init: RequestInit): Promise<string | null> => {
    const body = await json(request, withParams(wfs, {
        SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: layer, COUNT: '1',
        PROPERTYNAME: column, SORTBY: `${column} ${order}`, CQL_FILTER: `${column} IS NOT NULL`,
        OUTPUTFORMAT: 'application/json',
    }), init) as { features?: { properties?: Record<string, unknown> }[] };
    const value = body.features?.[0]?.properties?.[column];
    return value == null ? null : String(value);
};

const readDateColumns = async (request: typeof fetch, wfs: string, layer: string, sample: boolean, init: RequestInit): Promise<DateColumn[]> => {
    const body = await json(request, withParams(wfs, {
        SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'DescribeFeatureType', TYPENAMES: layer,
        OUTPUTFORMAT: 'application/json',
    }), init) as { featureTypes?: FeatureType[] };
    const properties = body.featureTypes?.[0]?.properties ?? [];
    const columns = properties
        .filter(property => DATE_TYPE.test(property.localType ?? property.type ?? ''))
        .map(property => ({ name: property.name, type: property.localType ?? property.type ?? '', first: null, last: null }));
    if (!sample) return columns;
    return Promise.all(columns.map(async column => ({
        ...column,
        first: await edgeOf(request, wfs, layer, column.name, 'A', init).catch(() => null),
        last: await edgeOf(request, wfs, layer, column.name, 'D', init).catch(() => null),
    })));
};

const pathOf = (time: TimeReport | null, columns: readonly DateColumn[]): InspectPath => {
    if (time && columns.length) return 'both';
    if (time) return 'time';
    return columns.length ? 'cql' : 'none';
};

export const inspectLayer = async (url: string, layer: string, options: InspectOptions = {}): Promise<LayerReport> => {
    const request = options.fetch ?? fetch;
    const init: RequestInit = options.signal ? { signal: options.signal } : {};
    const notes: InspectNote[] = [];

    let time: TimeReport | null = null;
    try {
        const dimension = (await fetchDimensions(url, { ...options, fetch: request })).get(layer);
        if (dimension) time = toTimeReport(dimension.values, dimension.default);
    } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        notes.push('no-capabilities');
    }

    let dateColumns: DateColumn[] = [];
    try {
        dateColumns = await readDateColumns(request, options.wfsUrl ?? wfsUrlOf(url), layer, options.sample ?? true, init);
    } catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        notes.push('no-wfs');
    }

    const path = pathOf(time, dateColumns);
    if (time && time.instants === 0 && time.ranges > 0) notes.push('time-continuous');
    if (time?.hasHours) notes.push('time-hours');
    if (path === 'both') notes.push('cql-needs-cql-time');
    if (path === 'cql') notes.push('cql-catalog-needed');
    if (path === 'none') notes.push('no-dates');

    const column = dateColumns[0]?.name;
    let recommended: Partial<PlayerOptions> | null = null;
    if (time) recommended = { kind: 'time', catalog: time.values };
    else if (column) recommended = { kind: 'cql', column };

    return { layer, path, time, dateColumns, options: recommended, notes };
};
