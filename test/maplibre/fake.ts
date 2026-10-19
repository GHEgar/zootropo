import type { MapLibreBufferMapLike, MapLibreEventName } from '../../src/maplibre/index.js';

export const TEMPLATE = 'https://x.org/wms?FORMAT=image%2Fpng&LAYERS=ndvi&REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&BBOX={bbox-epsg-3857}';

export interface FakeSource {
    tiles?: string[];
    calls: string[][];
    setTiles(tiles: string[]): FakeSource;
}

export interface FakeMap extends MapLibreBufferMapLike {
    sources: Map<string, FakeSource>;
    layers: Map<string, { source: string }>;
    paint: Map<string, number>;
    listeners: Map<string, Set<(event: unknown) => void>>;
    emit(type: MapLibreEventName, event?: unknown): void;
    content(sourceId: string, isSourceLoaded?: boolean): void;
    tile(sourceId: string, isSourceLoaded?: boolean): void;
    addSource(id: string, tiles?: string[]): FakeSource;
}

export const fakeMap = (): FakeMap => {
    const sources = new Map<string, FakeSource>();
    const layers = new Map<string, { source: string }>();
    const paint = new Map<string, number>();
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    const map: FakeMap = {
        sources,
        layers,
        paint,
        listeners,
        getSource: id => sources.get(id),
        getLayer: id => layers.get(id),
        getPaintProperty: (id, name) => paint.get(`${id}:${name}`),
        setPaintProperty: (id, name, value) => paint.set(`${id}:${name}`, value as number),
        on(type, listener) {
            const set = listeners.get(type) ?? new Set();
            set.add(listener);
            listeners.set(type, set);
        },
        off(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        emit(type, event = {}) {
            for (const listener of [...listeners.get(type) ?? []]) listener(event);
        },
        content(sourceId, isSourceLoaded = false) {
            map.emit('sourcedata', { sourceId, sourceDataType: 'metadata', isSourceLoaded });
            map.emit('sourcedata', { sourceId, sourceDataType: 'content', isSourceLoaded });
        },
        tile(sourceId, isSourceLoaded = true) {
            map.emit('sourcedata', { sourceId, tile: {}, isSourceLoaded });
        },
        addSource(id, tiles = [TEMPLATE]) {
            const source: FakeSource = {
                tiles,
                calls: [],
                setTiles(next) {
                    source.tiles = next;
                    source.calls.push(next);
                    return source;
                },
            };
            sources.set(id, source);
            return source;
        },
    };
    return map;
};

export const paramOf = (url: string | undefined, name: string): string | null => {
    if (url === undefined) return null;
    const query = url.slice(url.indexOf('?') + 1).split('&').find(part => part.startsWith(`${name}=`));
    return query === undefined ? null : decodeURIComponent(query.slice(name.length + 1));
};
