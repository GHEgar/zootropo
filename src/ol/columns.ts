import { keyOfAt, parseInstant, sortKeys, type Granularity } from '../core/index.js';

export interface ColumnDatesOptions {
    wpsUrl?: string;
    wfsUrl?: string;
    granularity?: Granularity;
    fallback?: 'wfs' | false;
    maxFeatures?: number;
    signal?: AbortSignal;
    fetch?: typeof fetch;
}

export interface ColumnDates {
    dates: string[];
    source: 'wps' | 'wfs';
    truncated: boolean;
}

const SERVICE = /\/(wms|wfs|ows)(?=\?|$)/i;

export const serviceUrlOf = (url: string, service: 'wps' | 'wfs'): string => url.replace(SERVICE, `/${service}`);

const escapeXml = (text: string): string => text.replace(/[<>&"']/g, char => `&#${char.charCodeAt(0)};`);

export const uniqueRequest = (layer: string, column: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<wps:Execute version="1.0.0" service="WPS" xmlns:wps="http://www.opengis.net/wps/1.0.0" xmlns:ows="http://www.opengis.net/ows/1.1" xmlns:wfs="http://www.opengis.net/wfs" xmlns:xlink="http://www.w3.org/1999/xlink">
  <ows:Identifier>gs:Unique</ows:Identifier>
  <wps:DataInputs>
    <wps:Input>
      <ows:Identifier>features</ows:Identifier>
      <wps:Reference mimeType="text/xml" xlink:href="http://geoserver/wfs" method="POST">
        <wps:Body><wfs:GetFeature service="WFS" version="1.0.0" outputFormat="GML2"><wfs:Query typeName="${escapeXml(layer)}"/></wfs:GetFeature></wps:Body>
      </wps:Reference>
    </wps:Input>
    <wps:Input><ows:Identifier>attribute</ows:Identifier><wps:Data><wps:LiteralData>${escapeXml(column)}</wps:LiteralData></wps:Data></wps:Input>
  </wps:DataInputs>
  <wps:ResponseForm><wps:RawDataOutput mimeType="application/json"><ows:Identifier>result</ows:Identifier></wps:RawDataOutput></wps:ResponseForm>
</wps:Execute>`;

interface Collection {
    features?: { properties?: Record<string, unknown> }[];
}

const readJson = async (response: Response): Promise<Collection> => {
    if (!response.ok) throw new Error(`${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json')) throw new Error('Not JSON: the service answered with an exception');
    return response.json() as Promise<Collection>;
};

const byWps = async (request: typeof fetch, url: string, layer: string, column: string, init: RequestInit): Promise<unknown[]> => {
    const body = await readJson(await request(url, {
        ...init, method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: uniqueRequest(layer, column),
    }));
    return (body.features ?? []).map(feature => feature.properties?.value);
};

const byWfs = async (request: typeof fetch, url: string, layer: string, column: string, max: number, init: RequestInit): Promise<unknown[]> => {
    const params = new URLSearchParams({
        SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: layer, PROPERTYNAME: column,
        COUNT: String(max), OUTPUTFORMAT: 'application/json',
    });
    const separator = url.includes('?') ? '&' : '?';
    const body = await readJson(await request(`${url}${separator}${params}`, init));
    return (body.features ?? []).map(feature => feature.properties?.[column]);
};

const normalize = (values: readonly unknown[], granularity: Granularity | undefined): string[] => {
    const texts = values.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').map(String);
    if (!granularity) {
        const seen = new Map<number, string>();
        for (const text of texts) {
            const instant = parseInstant(text);
            if (instant && !seen.has(instant.at)) seen.set(instant.at, instant.text);
        }
        return [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text);
    }
    return sortKeys(texts.map(text => parseInstant(text)).filter(instant => instant !== null).map(instant => keyOfAt(instant.at, granularity)));
};

export const fetchColumnDates = async (url: string, layer: string, column: string, options: ColumnDatesOptions = {}): Promise<ColumnDates> => {
    const request = options.fetch ?? fetch;
    const init: RequestInit = options.signal ? { signal: options.signal } : {};
    const max = options.maxFeatures ?? 50_000;
    try {
        const values = await byWps(request, options.wpsUrl ?? serviceUrlOf(url, 'wps'), layer, column, init);
        return { dates: normalize(values, options.granularity), source: 'wps', truncated: false };
    } catch (error) {
        if ((error as Error).name === 'AbortError' || options.fallback === false) throw error;
    }
    const values = await byWfs(request, options.wfsUrl ?? serviceUrlOf(url, 'wfs'), layer, column, max, init);
    return { dates: normalize(values, options.granularity), source: 'wfs', truncated: values.length >= max };
};
