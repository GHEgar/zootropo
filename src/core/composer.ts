import type { WmsParams } from './params.js';

export interface CqlComposerLike {
    set(name: string, fragment: string | null): void;
}

export interface ComposerOptions {
    composer?: CqlComposerLike;
    fragment?: string;
}

export interface RoutedParams {
    params: WmsParams;
    cql: string | null | undefined;
}

const CQL_PARAM = 'CQL_FILTER';

export const routeCql = (params: WmsParams, options: ComposerOptions): RoutedParams => {
    if (!options.composer) return { params, cql: undefined };
    const key = Object.keys(params).find(name => name.toUpperCase() === CQL_PARAM);
    if (key === undefined) return { params, cql: undefined };
    const { [key]: cql, ...rest } = params;
    return { params: rest, cql: cql ?? null };
};

export const writeFragment = (options: ComposerOptions, cql: string | null | undefined): void => {
    if (cql === undefined || !options.composer) return;
    options.composer.set(options.fragment ?? 'time', cql);
};
