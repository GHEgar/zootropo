export type Granularity = 'year' | 'month' | 'day' | 'hour';

export type Mode = 'year' | 'month' | 'day' | 'hour' | 'timeline';

export type RequestedMode = Mode | 'auto';

export type Direction = 'forward' | 'backward';

export type Kind = 'time' | 'cql';

export type SelectMode = 'replace' | 'toggle';

export type Level = 'years' | 'months' | 'days' | 'hours';

export interface TimeRange {
    start: string;
    end: string;
}

export interface TimeDimension {
    instants: readonly string[];
    ranges: readonly TimeRange[];
}

export interface View {
    level: Level;
    year: number | null;
    month: number | null;
    day: number | null;
}

export interface Sequence {
    mode: Mode | null;
    keys: readonly string[];
    truncated: boolean;
}

export interface Item {
    key: string;
    level: Granularity;
    year: number;
    month: number | null;
    day: number | null;
    hour: number | null;
    selected: boolean;
    partial: boolean;
    current: boolean;
    containsCurrent: boolean;
}

export type PlayerEvent =
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'stop' }
    | { type: 'step'; key: string; value: string | null }
    | { type: 'select'; keys: readonly string[] }
    | { type: 'value'; value: string | null }
    | { type: 'timeout' };

export type GroupEvent =
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'stop' }
    | { type: 'step'; key: string }
    | { type: 'timeout' };
