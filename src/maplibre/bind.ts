import type { TimePlayer } from '../core/index.js';
import { paramsFor, type WmsParamOptions } from '../core/params.js';
import { settle, sourceIdOf, sourceOf, tilesOf, write, type MapLibreMapLike, type Slot } from './source.js';
import { applyParams } from './template.js';

export interface RasterTimeOptions extends WmsParamOptions {
    template?: string;
}

export interface RasterTimeBinding {
    readonly tiles: string | null;
    apply(): void;
    destroy(): void;
}

export const bindRasterTime = (player: TimePlayer, map: MapLibreMapLike, sourceId: string, options: RasterTimeOptions = {}): RasterTimeBinding => {
    const slot: Slot = { sourceId, written: null, loading: false, armed: false };
    let base: string | null = options.template ?? null;
    let waiting = false;

    const finish = (): void => {
        if (!waiting || slot.loading) return;
        waiting = false;
        player.ready();
    };

    const apply = (force = false): boolean => {
        const source = sourceOf(map, sourceId);
        if (!source) return false;
        const current = tilesOf(source);
        const foreign = current !== null && current !== slot.written;
        if (foreign && (slot.written !== null || base === null)) base = current;
        if (base === null) return false;
        const next = applyParams(base, paramsFor(player, player.getSnapshot().value, options));
        if (!force && next === current) {
            slot.written = next;
            return false;
        }
        write(slot, source, next);
        waiting = true;
        player.loading();
        return true;
    };

    const onSource = (event: unknown): void => {
        if (sourceIdOf(event) !== sourceId) return;
        if ((event as { sourceDataType?: unknown }).sourceDataType === 'metadata' && apply()) return;
        if (settle(slot, event)) finish();
    };

    const onIdle = (): void => {
        if (apply()) return;
        if (slot.armed) slot.loading = false;
        finish();
    };

    const onStyle = (): void => {
        apply();
    };

    map.on('sourcedata', onSource);
    map.on('styledata', onStyle);
    map.on('idle', onIdle);
    const unsubscribe = player.subscribe(() => apply());
    apply();

    return {
        get tiles() { return slot.written; },
        apply: () => {
            apply(true);
        },
        destroy() {
            unsubscribe();
            map.off('sourcedata', onSource);
            map.off('styledata', onStyle);
            map.off('idle', onIdle);
            if (waiting) player.ready();
            waiting = false;
        },
    };
};
