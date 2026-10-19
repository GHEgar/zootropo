export type MapLibreEventName = 'sourcedata' | 'styledata' | 'idle';

export interface MapLibreMapLike {
    getSource(id: string): unknown;
    on(type: MapLibreEventName, listener: (event: unknown) => void): unknown;
    off(type: MapLibreEventName, listener: (event: unknown) => void): unknown;
}

export interface MapLibreBufferMapLike extends MapLibreMapLike {
    getLayer(id: string): unknown;
    getPaintProperty(layerId: string, name: string): unknown;
    setPaintProperty(layerId: string, name: string, value: unknown): unknown;
}

export interface RasterSourceLike {
    tiles?: string[] | undefined;
    setTiles(tiles: string[]): unknown;
}

export interface Slot {
    sourceId: string;
    written: string | null;
    loading: boolean;
    armed: boolean;
}

interface SourceEvent {
    sourceId?: unknown;
    sourceDataType?: unknown;
    isSourceLoaded?: unknown;
}

export const sourceOf = (map: MapLibreMapLike, id: string): RasterSourceLike | null => {
    const source = map.getSource(id) as Partial<RasterSourceLike> | undefined | null;
    return source && typeof source.setTiles === 'function' ? source as RasterSourceLike : null;
};

export const tilesOf = (source: RasterSourceLike): string | null => source.tiles?.[0] ?? null;

export const sourceIdOf = (event: unknown): unknown => (event as SourceEvent | null)?.sourceId;

export const write = (slot: Slot, source: RasterSourceLike, url: string): void => {
    slot.written = url;
    slot.loading = true;
    slot.armed = false;
    source.setTiles([url]);
};

export const settle = (slot: Slot, event: unknown): boolean => {
    const data = event as SourceEvent | null;
    if (!slot.loading || data?.sourceId !== slot.sourceId) return false;
    if (data.sourceDataType === 'content') slot.armed = true;
    if (!slot.armed || data.isSourceLoaded !== true) return false;
    slot.loading = false;
    return true;
};
