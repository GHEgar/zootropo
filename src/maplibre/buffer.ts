import type { TimePlayer } from '../core/index.js';
import { nextStepValue, paramsFor, type WmsParamOptions } from '../core/params.js';
import { settle, sourceOf, tilesOf, write, type MapLibreBufferMapLike, type Slot } from './source.js';
import { applyParams } from './template.js';

export interface RasterBufferOptions extends WmsParamOptions {
    template?: string;
    preload?: boolean;
}

export interface RasterBuffer {
    readonly front: string;
    readonly back: string;
    setOpacity(opacity: number): void;
    destroy(): void;
}

interface BufferSlot extends Slot {
    layerId: string;
}

const OPACITY = 'raster-opacity';

export const bindRasterBuffer = (player: TimePlayer, map: MapLibreBufferMapLike, frontLayerId: string, backLayerId: string, options: RasterBufferOptions = {}): RasterBuffer => {
    const slotOf = (layerId: string): BufferSlot => {
        const layer = map.getLayer(layerId) as { source?: unknown } | undefined | null;
        const sourceId = typeof layer?.source === 'string' ? layer.source : null;
        const source = sourceId === null ? null : sourceOf(map, sourceId);
        if (sourceId === null || source === null) throw new Error('bindRasterBuffer needs raster layers with a tile source');
        return { layerId, sourceId, written: tilesOf(source), loading: false, armed: false };
    };

    let front = slotOf(frontLayerId);
    let back = slotOf(backLayerId);
    const base = options.template ?? front.written;
    if (base === null) throw new Error('bindRasterBuffer needs a tile template');
    const initial = map.getPaintProperty(front.layerId, OPACITY);
    let opacity = typeof initial === 'number' ? initial : 1;
    let waiting = false;
    map.setPaintProperty(back.layerId, OPACITY, 0);

    const check = (): void => {
        if (!waiting || front.loading) return;
        waiting = false;
        player.ready();
    };

    const urlOf = (value: string | null): string => applyParams(base, paramsFor(player, value, options));

    const load = (slot: BufferSlot, url: string): void => {
        if (slot.written === url) return;
        const source = sourceOf(map, slot.sourceId);
        if (source) write(slot, source, url);
    };

    const sync = (): void => {
        const url = urlOf(player.getSnapshot().value);
        if (front.written !== url) {
            if (back.written === url) {
                [front, back] = [back, front];
                map.setPaintProperty(front.layerId, OPACITY, opacity);
                map.setPaintProperty(back.layerId, OPACITY, 0);
            } else {
                load(front, url);
            }
            if (front.loading && !waiting) {
                waiting = true;
                player.loading();
            }
        }
        if (options.preload ?? true) {
            const next = nextStepValue(player);
            if (next !== null) load(back, urlOf(next));
        }
    };

    const onSource = (event: unknown): void => {
        const changed = [front, back].map(slot => settle(slot, event));
        if (changed.some(Boolean)) check();
    };

    const onIdle = (): void => {
        for (const slot of [front, back]) if (slot.armed) slot.loading = false;
        check();
    };

    map.on('sourcedata', onSource);
    map.on('idle', onIdle);
    const unsubscribe = player.subscribe(sync);
    sync();

    return {
        get front() { return front.layerId; },
        get back() { return back.layerId; },
        setOpacity(value) {
            opacity = value;
            map.setPaintProperty(front.layerId, OPACITY, value);
        },
        destroy() {
            unsubscribe();
            map.off('sourcedata', onSource);
            map.off('idle', onIdle);
            map.setPaintProperty(back.layerId, OPACITY, 0);
            map.setPaintProperty(front.layerId, OPACITY, opacity);
            if (waiting) player.ready();
            waiting = false;
        },
    };
};
