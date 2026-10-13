import { listen, unlistenByKey, type EventsKey } from 'ol/events.js';
import type ImageWMS from 'ol/source/ImageWMS.js';
import type TileWMS from 'ol/source/TileWMS.js';
import type { TimePlayer } from '../core/index.js';

export interface WmsTimeOptions {
    param?: string;
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
    const param = options.param ?? (player.kind === 'time' ? 'TIME' : 'CQL_FILTER');
    const settleMs = options.settleMs ?? 150;
    let pending = 0;
    let waiting = false;
    let last: string | null | undefined;
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
        const value = player.getSnapshot().value;
        if (!force && value === last) return;
        last = value;
        waiting = true;
        player.loading();
        source.updateParams({ [param]: value ?? undefined });
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
            if (waiting) player.ready();
            waiting = false;
        },
    };
};
