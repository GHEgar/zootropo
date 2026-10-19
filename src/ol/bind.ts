import { listen, unlistenByKey, type EventsKey } from 'ol/events.js';
import type ImageWMS from 'ol/source/ImageWMS.js';
import type TileWMS from 'ol/source/TileWMS.js';
import { routeCql, writeFragment, type ComposerOptions } from '../core/composer.js';
import type { TimePlayer } from '../core/index.js';
import { paramsFor, paramsKey, type WmsParamOptions } from './params.js';

export interface WmsTimeOptions extends WmsParamOptions, ComposerOptions {
    settleMs?: number;
}

export interface WmsTimeBinding {
    readonly pending: number;
    apply(): void;
    destroy(): void;
}

const STARTS = ['tileloadstart', 'imageloadstart'];
const ENDS = ['tileloadend', 'tileloaderror', 'imageloadend', 'imageloaderror'];

export const bindWmsTime = (player: TimePlayer, source: ImageWMS | TileWMS, options: WmsTimeOptions = {}): WmsTimeBinding => {
    const settleMs = options.settleMs ?? 150;
    let pending = 0;
    let waiting = false;
    let last: string | undefined;
    let lastCql: string | null | undefined;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const clearSettle = (): void => {
        if (settle !== null) clearTimeout(settle);
        settle = null;
    };

    const finish = (): void => {
        if (!waiting || pending > 0 || settle !== null) return;
        waiting = false;
        player.ready();
    };

    const keys: EventsKey[] = [
        ...STARTS.map(type => listen(source, type, () => {
            pending++;
            clearSettle();
        })),
        ...ENDS.map(type => listen(source, type, () => {
            pending = Math.max(0, pending - 1);
            finish();
        })),
    ];

    const apply = (force = false): void => {
        const { params, cql } = routeCql(paramsFor(player, player.getSnapshot().value, options), options);
        const key = paramsKey(params);
        const paramsChanged = force || key !== last;
        const cqlChanged = cql !== undefined && (force || cql !== lastCql);
        if (!paramsChanged && !cqlChanged) return;
        last = key;
        lastCql = cql;
        waiting = true;
        player.loading();
        if (paramsChanged && (!options.composer || Object.keys(params).length > 0)) source.updateParams(params);
        writeFragment(options, cql);
        clearSettle();
        settle = setTimeout(() => {
            settle = null;
            finish();
        }, settleMs);
    };

    const unsubscribe = player.subscribe(() => apply());
    apply(true);

    return {
        get pending() { return pending; },
        apply: () => apply(true),
        destroy() {
            unsubscribe();
            clearSettle();
            keys.forEach(unlistenByKey);
            if (lastCql !== undefined) writeFragment(options, null);
            if (waiting) player.ready();
            waiting = false;
        },
    };
};
