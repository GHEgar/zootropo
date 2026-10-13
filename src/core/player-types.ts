import type { Catalog, CatalogInput } from './catalog.js';
import type { MEMBER, Member } from './member.js';
import type {
    Direction, Granularity, Item, Kind, PlayerEvent, RequestedMode, SelectMode, Sequence, View,
} from './types.js';

export interface PlayerOptions {
    catalog?: CatalogInput;
    kind?: Kind;
    column?: string;
    baseCql?: string | null;
    multiple?: boolean;
    mode?: RequestedMode;
    granularity?: Granularity;
    intervalMs?: number;
    direction?: Direction;
    loop?: boolean;
    timeoutMs?: number;
    initial?: 'latest' | 'none' | readonly string[];
    compact?: boolean;
    limit?: number;
    onEvent?: (event: PlayerEvent) => void;
}

export interface PlayerSnapshot {
    kind: Kind;
    catalog: Catalog;
    view: View;
    items: readonly Item[];
    selection: readonly string[];
    mode: RequestedMode;
    granularity: Granularity;
    sequence: Sequence;
    index: number;
    step: string | null;
    keys: readonly string[];
    canPlay: boolean;
    playing: boolean;
    loading: boolean;
    stale: boolean;
    grouped: boolean;
    intervalMs: number;
    direction: Direction;
    loop: boolean;
    baseCql: string | null;
    time: string | null;
    cql: string | null;
    value: string | null;
}

export interface TimePlayer {
    readonly kind: Kind;
    readonly [MEMBER]: Member;
    subscribe(listener: () => void): () => void;
    getSnapshot(): PlayerSnapshot;
    destroy(): void;
    setCatalog(input: CatalogInput): void;
    select(key: string, mode?: SelectMode): void;
    setSelection(keys: readonly string[]): void;
    clearSelection(): void;
    open(key: string): void;
    back(): void;
    setMode(mode: RequestedMode): void;
    setGranularity(granularity: Granularity): void;
    play(): void;
    pause(): void;
    toggle(): void;
    stop(): void;
    step(delta?: number): void;
    seek(key: string): void;
    setIntervalMs(ms: number): void;
    setDirection(direction: Direction): void;
    setLoop(loop: boolean): void;
    setBaseCql(cql: string | null): void;
    loading(): void;
    ready(): void;
}
