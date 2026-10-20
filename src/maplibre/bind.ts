import { routeCql, writeFragment, type ComposerOptions } from '../core/composer.js';
import type { TimePlayer } from '../core/index.js';
import { paramsFor, type WmsParamOptions } from '../core/params.js';
import { settle, sourceIdOf, sourceOf, tilesOf, write, type MapLibreMapLike, type Slot } from './source.js';
import { applyParams } from './template.js';

export interface RasterTimeOptions extends WmsParamOptions, ComposerOptions {
    template?: string;
    restore?: boolean;
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
    let lastCql: string | null | undefined;
    let original: string[] | null | undefined;

    const finish = (): void => {
        if (!waiting || slot.loading) return;
        waiting = false;
        player.ready();
    };

    const apply = (force = false): boolean => {
        const { params, cql } = routeCql(paramsFor(player, player.getSnapshot().value, options), options);
        const cqlChanged = cql !== undefined && (force || cql !== lastCql);
        if (cqlChanged) lastCql = cql;
        const source = sourceOf(map, sourceId);
        let started = false;
        if (source) {
            const current = tilesOf(source);
            const foreign = current !== null && current !== slot.written;
            if (original === undefined || foreign) original = source.tiles ? [...source.tiles] : null;
            if (foreign && (slot.written !== null || base === null)) base = current;
            const next = base === null ? null : applyParams(base, params);
            if (next !== null && (force || next !== current)) {
                write(slot, source, next);
                started = true;
            } else if (next !== null) slot.written = next;
            if (!started && cqlChanged) {
                slot.loading = true;
                slot.armed = false;
                started = true;
            }
        }
        if (started) {
            waiting = true;
            player.loading();
        }
        if (cqlChanged) writeFragment(options, cql);
        return started;
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

    const restore = (): void => {
        const source = sourceOf(map, sourceId);
        if (!(options.restore ?? true) || !source || !original || slot.written === null) return;
        if (tilesOf(source) === slot.written && slot.written !== original[0]) source.setTiles(original);
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
            if (lastCql !== undefined) writeFragment(options, null);
            restore();
            if (waiting) player.ready();
            waiting = false;
        },
    };
};
