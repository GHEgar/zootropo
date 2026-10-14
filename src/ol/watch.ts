import type { TimePlayer } from '../core/index.js';
import { fetchDimension, type CapabilitiesOptions } from './capabilities.js';

export interface WatchOptions extends Omit<CapabilitiesOptions, 'signal'> {
    intervalMs?: number;
    immediate?: boolean;
    onError?: (error: Error) => void;
    onUpdate?: (values: string) => void;
}

export interface DimensionWatch {
    refresh(): Promise<void>;
    stop(): void;
}

export const watchDimension = (player: TimePlayer, url: string, layer: string, options: WatchOptions = {}): DimensionWatch => {
    const intervalMs = Math.max(5_000, options.intervalMs ?? 60_000);
    let last: string | null = null;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const refresh = async (): Promise<void> => {
        controller?.abort();
        const current = new AbortController();
        controller = current;
        try {
            const capabilitiesOptions: CapabilitiesOptions = { signal: current.signal };
            if (options.dimension) capabilitiesOptions.dimension = options.dimension;
            if (options.fetch) capabilitiesOptions.fetch = options.fetch;
            const dimension = await fetchDimension(url, layer, capabilitiesOptions);
            if (current.signal.aborted || stopped || !dimension || dimension.values === last) return;
            const first = last === null;
            last = dimension.values;
            if (first && player.getSnapshot().catalog.empty) player.setCatalog(dimension.values);
            else player.updateCatalog(dimension.values);
            options.onUpdate?.(dimension.values);
        } catch (error) {
            if (current.signal.aborted || stopped) return;
            options.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
    };

    const loop = (): void => {
        timer = setTimeout(() => {
            void refresh().finally(() => { if (!stopped) loop(); });
        }, intervalMs);
    };

    if (options.immediate ?? true) void refresh();
    loop();

    return {
        refresh,
        stop() {
            stopped = true;
            controller?.abort();
            if (timer !== null) clearTimeout(timer);
        },
    };
};
