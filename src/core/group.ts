import { createClock } from './clock.js';
import { sortKeys } from './keys.js';
import { MEMBER, type GroupLink } from './member.js';
import type { TimePlayer } from './player.js';
import { DEFAULT_INTERVAL_MS, DEFAULT_TIMEOUT_MS, clampInterval, nextIndex, normalizeDirection } from './transport.js';
import type { Direction, GroupEvent } from './types.js';

export interface GroupOptions {
    intervalMs?: number;
    direction?: Direction;
    loop?: boolean;
    timeoutMs?: number;
    onEvent?: (event: GroupEvent) => void;
}

export interface GroupSnapshot {
    players: readonly TimePlayer[];
    sequence: readonly string[];
    index: number;
    step: string | null;
    canPlay: boolean;
    playing: boolean;
    loading: boolean;
    intervalMs: number;
    direction: Direction;
    loop: boolean;
}

export interface PlayerGroup {
    subscribe(listener: () => void): () => void;
    getSnapshot(): GroupSnapshot;
    destroy(): void;
    add(player: TimePlayer): void;
    remove(player: TimePlayer): void;
    play(): void;
    pause(): void;
    toggle(): void;
    stop(): void;
    step(delta?: number): void;
    seek(key: string): void;
    setIntervalMs(ms: number): void;
    setDirection(direction: Direction): void;
    setLoop(loop: boolean): void;
}

interface State {
    players: readonly TimePlayer[];
    frozen: readonly string[] | null;
    step: string | null;
    playing: boolean;
    intervalMs: number;
    direction: Direction;
    loop: boolean;
}

export const createPlayerGroup = (players: readonly TimePlayer[] = [], options: GroupOptions = {}): PlayerGroup => {
    const emit = (event: GroupEvent): void => options.onEvent?.(event);
    const listeners = new Set<() => void>();
    const unsubscribers = new Map<TimePlayer, () => void>();
    let state: State = {
        players: [], frozen: null, step: null, playing: false,
        intervalMs: clampInterval(options.intervalMs ?? DEFAULT_INTERVAL_MS),
        direction: normalizeDirection(options.direction), loop: options.loop ?? true,
    };

    const union = (current: State): string[] =>
        sortKeys(current.players.flatMap(player => player[MEMBER].sequence().keys));

    const toSnapshot = (current: State): GroupSnapshot => {
        const sequence = current.frozen ?? union(current);
        return {
            players: current.players, sequence, index: current.step ? sequence.indexOf(current.step) : -1,
            step: current.step, canPlay: sequence.length >= 2, playing: current.playing,
            loading: current.players.some(player => player[MEMBER].loading()),
            intervalMs: current.intervalMs, direction: current.direction, loop: current.loop,
        };
    };

    let snapshot = toSnapshot(state);
    const refresh = (): void => {
        snapshot = toSnapshot(state);
        listeners.forEach(listener => listener());
    };
    const set = (patch: Partial<State>): void => {
        state = { ...state, ...patch };
        refresh();
    };

    const drive = (key: string | null): void => state.players.forEach(player => player[MEMBER].drive(key));
    const showPlaying = (playing: boolean): void => state.players.forEach(player => player[MEMBER].setPlaying(playing));

    const moveTo = (key: string, sequence: readonly string[], patch: Partial<State> = {}): void => {
        const changed = key !== state.step;
        set({ ...patch, frozen: sequence, step: key });
        drive(key);
        if (changed) emit({ type: 'step', key });
    };

    const halt = (): void => {
        clock.stop();
        if (!state.playing) return;
        set({ playing: false });
        showPlaying(false);
        emit({ type: 'pause' });
    };

    const clock = createClock({
        intervalMs: () => state.intervalMs,
        timeoutMs: () => options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        busy: () => state.players.some(player => player[MEMBER].loading()),
        tick: () => {
            const next = nextIndex(snapshot.index, snapshot.sequence.length, state.direction === 'backward' ? -1 : 1, state.loop);
            if (next === null) halt();
            else moveTo(snapshot.sequence[next] as string, snapshot.sequence);
        },
        onTimeout: () => {
            emit({ type: 'timeout' });
            halt();
        },
    });

    const play = (): void => {
        if (state.playing || !snapshot.canPlay) return;
        const { sequence } = snapshot;
        const preferred = state.players.map(player => player.getSnapshot().selection[0]).find(key => key && sequence.includes(key));
        const start = state.step && sequence.includes(state.step)
            ? state.step
            : preferred ?? sequence[state.direction === 'backward' ? sequence.length - 1 : 0] as string;
        moveTo(start, sequence, { playing: true });
        showPlaying(true);
        emit({ type: 'play' });
        clock.start();
    };

    const stop = (): void => {
        halt();
        if (state.step === null && state.frozen === null) return;
        set({ step: null, frozen: null });
        drive(null);
        emit({ type: 'stop' });
    };

    const step = (amount = 1): void => {
        const next = nextIndex(snapshot.index, snapshot.sequence.length, amount, state.loop);
        if (next === null) return;
        moveTo(snapshot.sequence[next] as string, snapshot.sequence);
        clock.restart();
    };

    const seek = (key: string): void => {
        if (!snapshot.sequence.includes(key)) return;
        moveTo(key, snapshot.sequence);
        clock.restart();
    };

    const link: GroupLink = {
        play,
        pause: () => {
            halt();
            set({ frozen: null });
        },
        toggle: () => (state.playing ? halt() : play()),
        stop,
        step,
        seek,
        notify: () => {
            refresh();
            clock.poke();
        },
    };

    const add = (player: TimePlayer): void => {
        if (unsubscribers.has(player)) return;
        halt();
        player[MEMBER].attach(link);
        unsubscribers.set(player, player.subscribe(refresh));
        set({ players: [...state.players, player], frozen: null });
    };

    const remove = (player: TimePlayer): void => {
        const unsubscribe = unsubscribers.get(player);
        if (!unsubscribe) return;
        halt();
        unsubscribe();
        unsubscribers.delete(player);
        player[MEMBER].attach(null);
        set({ players: state.players.filter(item => item !== player), frozen: null });
    };

    players.forEach(add);

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        getSnapshot: () => snapshot,
        destroy() {
            halt();
            [...state.players].forEach(remove);
            listeners.clear();
        },
        add,
        remove,
        play,
        pause: halt,
        toggle: link.toggle,
        stop,
        step,
        seek,
        setIntervalMs(ms) {
            set({ intervalMs: clampInterval(ms) });
            clock.restart();
        },
        setDirection: direction => set({ direction: normalizeDirection(direction) }),
        setLoop: loop => set({ loop }),
    };
};
