import type { TimePlayer } from './player-types.js';

export interface WmsParamOptions {
    param?: string;
    cqlTime?: 'catalog' | string | null;
}

export type WmsParams = Record<string, string | undefined>;

export const paramsFor = (player: TimePlayer, value: string | null, options: WmsParamOptions = {}): WmsParams => {
    const param = options.param ?? (player.kind === 'time' ? 'TIME' : 'CQL_FILTER');
    const params: WmsParams = { [param]: value ?? undefined };
    const cqlTime = player.kind === 'cql' ? options.cqlTime ?? null : null;
    if (cqlTime === null) return params;
    if (cqlTime !== 'catalog') params.TIME = cqlTime;
    else {
        const extent = player.getSnapshot().catalog.extent();
        params.TIME = extent ? `${extent.start}/${extent.end}` : undefined;
    }
    return params;
};

export const paramsKey = (params: WmsParams): string => JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));

export const nextStepValue = (player: TimePlayer): string | null => {
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
