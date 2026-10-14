import { listen, unlistenByKey, type EventsKey } from 'ol/events.js';
import type ImageLayer from 'ol/layer/Image.js';
import type TileLayer from 'ol/layer/Tile.js';
import type ImageWMS from 'ol/source/ImageWMS.js';
import type TileWMS from 'ol/source/TileWMS.js';
import type { TimePlayer } from '../core/index.js';
import { paramsFor, paramsKey, type WmsParamOptions, type WmsParams } from './params.js';

export type WmsLayer = TileLayer<TileWMS> | ImageLayer<ImageWMS>;

export interface WmsBufferOptions extends WmsParamOptions {
    settleMs?: number;
    preload?: boolean;
}

export interface WmsBuffer {
    readonly front: WmsLayer;
    readonly back: WmsLayer;
    setOpacity(opacity: number): void;
    destroy(): void;
}

interface Slot {
    layer: WmsLayer;
    source: TileWMS | ImageWMS;
    pending: number;
    key: string | null;
    settle: ReturnType<typeof setTimeout> | null;
    keys: EventsKey[];
}

const STARTS = ['tileloadstart', 'imageloadstart'];
const ENDS = ['tileloadend', 'tileloaderror', 'imageloadend', 'imageloaderror'];

export const bindWmsBuffer = (player: TimePlayer, frontLayer: WmsLayer, backLayer: WmsLayer, options: WmsBufferOptions = {}): WmsBuffer => {
    const settleMs = options.settleMs ?? 150;
    let opacity = frontLayer.getOpacity();
    let waiting = false;

    const loaded = (slot: Slot): boolean => slot.pending === 0 && slot.settle === null;

    const check = (): void => {
        if (!waiting || !loaded(front)) return;
        waiting = false;
        player.ready();
    };

    const slotOf = (layer: WmsLayer): Slot => {
        const source = layer.getSource();
        if (!source) throw new Error('bindWmsBuffer needs layers with a WMS source');
        const slot: Slot = { layer, source, pending: 0, key: null, settle: null, keys: [] };
        slot.keys = [
            ...STARTS.map(type => listen(source, type, () => {
                slot.pending++;
                if (slot.settle !== null) clearTimeout(slot.settle);
                slot.settle = null;
            })),
            ...ENDS.map(type => listen(source, type, () => {
                slot.pending = Math.max(0, slot.pending - 1);
                check();
            })),
        ];
        return slot;
    };

    let front = slotOf(frontLayer);
    let back = slotOf(backLayer);
    back.layer.setOpacity(0);

    const load = (slot: Slot, params: WmsParams): void => {
        const key = paramsKey(params);
        if (slot.key === key) return;
        slot.key = key;
        slot.source.updateParams(params);
        if (slot.settle !== null) clearTimeout(slot.settle);
        slot.settle = setTimeout(() => {
            slot.settle = null;
            check();
        }, settleMs);
    };

    const nextValue = (): string | null => {
        const { sequence, index, step, direction, loop } = player.getSnapshot();
        const length = sequence.keys.length;
        if (step === null || length < 2) return null;
        let target = index + (direction === 'backward' ? -1 : 1);
        if (target < 0 || target >= length) {
            if (!loop) return null;
            target = (target + length) % length;
        }
        return player.valueOf([sequence.keys[target] as string]);
    };

    const sync = (): void => {
        const current = paramsFor(player, player.getSnapshot().value, options);
        const currentKey = paramsKey(current);
        if (front.key !== currentKey) {
            if (back.key === currentKey) {
                [front, back] = [back, front];
                front.layer.setOpacity(opacity);
                back.layer.setOpacity(0);
            } else {
                load(front, current);
            }
            if (!loaded(front) && !waiting) {
                waiting = true;
                player.loading();
            }
        }
        if (options.preload ?? true) {
            const next = nextValue();
            if (next !== null) load(back, paramsFor(player, next, options));
        }
    };

    const unsubscribe = player.subscribe(sync);
    sync();

    return {
        get front() { return front.layer; },
        get back() { return back.layer; },
        setOpacity(value) {
            opacity = value;
            front.layer.setOpacity(value);
        },
        destroy() {
            unsubscribe();
            for (const slot of [front, back]) {
                slot.keys.forEach(unlistenByKey);
                if (slot.settle !== null) clearTimeout(slot.settle);
            }
            back.layer.setOpacity(0);
            front.layer.setOpacity(opacity);
            if (waiting) player.ready();
            waiting = false;
        },
    };
};
