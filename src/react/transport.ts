import { INTERVAL_PRESETS, nextPreset, type Direction } from '../core/index.js';

export interface Labels {
    list: string;
    play: string;
    pause: string;
    stop: string;
    back: string;
    previous: string;
    next: string;
    interval: (ms: number) => string;
    direction: (direction: Direction) => string;
}

export const DEFAULT_LABELS: Labels = {
    list: 'Dates',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    back: 'Back',
    previous: 'Previous step',
    next: 'Next step',
    interval: ms => `Interval ${ms / 1000} s`,
    direction: direction => (direction === 'forward' ? 'Direction: forward' : 'Direction: backward'),
};

export interface ButtonProps {
    type: 'button';
    'aria-label': string;
    disabled: boolean;
    onClick: () => void;
}

export interface PlayProps extends ButtonProps {
    'aria-pressed': boolean;
    'data-playing'?: true;
    'data-loading'?: true;
}

export interface IntervalProps extends ButtonProps {
    'data-value': number;
}

export interface DirectionProps extends ButtonProps {
    'data-direction': Direction;
}

export interface TransportTarget {
    toggle(): void;
    stop(): void;
    step(delta?: number): void;
    setIntervalMs(ms: number): void;
    setDirection(direction: Direction): void;
}

export interface TransportState {
    playing: boolean;
    loading: boolean;
    canPlay: boolean;
    step: string | null;
    intervalMs: number;
    direction: Direction;
}

export interface Transport {
    getPlayProps(): PlayProps;
    getStopProps(): ButtonProps;
    getStepProps(delta: number): ButtonProps;
    getIntervalProps(presets?: readonly number[]): IntervalProps;
    getDirectionProps(): DirectionProps;
}

export const buildTransport = (target: TransportTarget, state: TransportState, labels: Labels): Transport => ({
    getPlayProps() {
        const props: PlayProps = {
            type: 'button',
            'aria-label': state.playing ? labels.pause : labels.play,
            'aria-pressed': state.playing,
            disabled: !state.canPlay && !state.playing,
            onClick: () => target.toggle(),
        };
        if (state.playing) props['data-playing'] = true;
        if (state.loading) props['data-loading'] = true;
        return props;
    },
    getStopProps: () => ({ type: 'button', 'aria-label': labels.stop, disabled: state.step === null, onClick: () => target.stop() }),
    getStepProps: delta => ({
        type: 'button',
        'aria-label': delta < 0 ? labels.previous : labels.next,
        disabled: !state.canPlay,
        onClick: () => target.step(delta),
    }),
    getIntervalProps: (presets = INTERVAL_PRESETS) => ({
        type: 'button',
        'aria-label': labels.interval(state.intervalMs),
        disabled: false,
        'data-value': state.intervalMs,
        onClick: () => target.setIntervalMs(nextPreset(state.intervalMs, presets)),
    }),
    getDirectionProps: () => ({
        type: 'button',
        'aria-label': labels.direction(state.direction),
        disabled: false,
        'data-direction': state.direction,
        onClick: () => target.setDirection(state.direction === 'forward' ? 'backward' : 'forward'),
    }),
});
