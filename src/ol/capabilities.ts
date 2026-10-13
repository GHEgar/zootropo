import WMSCapabilities from 'ol/format/WMSCapabilities.js';

export interface DimensionInfo {
    layer: string;
    name: string;
    values: string;
    default: string | null;
    units: string | null;
}

export interface CapabilitiesOptions {
    dimension?: string;
    signal?: AbortSignal;
    fetch?: typeof fetch;
}

interface RawDimension {
    name?: string;
    values?: string;
    default?: string | null;
    units?: string | null;
}

interface RawLayer {
    Name?: string;
    Dimension?: RawDimension[];
    Layer?: RawLayer[];
}

export const capabilitiesUrl = (url: string): string => {
    const separator = url.includes('?') ? (/[?&]$/.test(url) ? '' : '&') : '?';
    return `${url}${separator}SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`;
};

export const readDimensions = (xml: string | Document, dimension = 'time'): Map<string, DimensionInfo> => {
    const parsed = new WMSCapabilities().read(xml) as { Capability?: { Layer?: RawLayer } } | null;
    const found = new Map<string, DimensionInfo>();
    const wanted = dimension.toLowerCase();
    const walk = (layer: RawLayer | undefined): void => {
        if (!layer) return;
        const match = layer.Dimension?.find(item => item.name?.toLowerCase() === wanted && item.values);
        if (layer.Name && match?.values) {
            const info: DimensionInfo = {
                layer: layer.Name, name: match.name ?? dimension, values: match.values.trim(),
                default: match.default ?? null, units: match.units ?? null,
            };
            found.set(layer.Name, info);
            const local = layer.Name.includes(':') ? layer.Name.slice(layer.Name.indexOf(':') + 1) : null;
            if (local && !found.has(local)) found.set(local, info);
        }
        layer.Layer?.forEach(walk);
    };
    walk(parsed?.Capability?.Layer);
    return found;
};

export const fetchDimensions = async (url: string, options: CapabilitiesOptions = {}): Promise<Map<string, DimensionInfo>> => {
    const request = options.fetch ?? fetch;
    const init: RequestInit = options.signal ? { signal: options.signal } : {};
    const response = await request(capabilitiesUrl(url), init);
    if (!response.ok) throw new Error(`GetCapabilities failed with ${response.status}`);
    return readDimensions(await response.text(), options.dimension);
};

export const fetchDimension = async (url: string, layer: string, options: CapabilitiesOptions = {}): Promise<DimensionInfo | null> =>
    (await fetchDimensions(url, options)).get(layer) ?? null;
