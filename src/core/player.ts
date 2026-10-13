import { createCatalog, type Catalog } from './catalog.js';
import { createClock } from './clock.js';
import { contains, isKey } from './keys.js';
import { MEMBER, type GroupLink, type Member } from './member.js';
import type { PlayerOptions, PlayerSnapshot, TimePlayer } from './player-types.js';
import {
    YEARS, applySelect, buildItems, initialSelection, validView, viewAbove, viewInside, viewShowing,
} from './selection.js';
import { buildSequence } from './sequence.js';
import { DEFAULT_INTERVAL_MS, DEFAULT_TIMEOUT_MS, clampInterval, nextIndex, normalizeDirection } from './transport.js';
import type { Direction, Granularity, PlayerEvent, RequestedMode, Sequence, View } from './types.js';
import { and, cqlValue, timeValue } from './value.js';

export type { PlayerOptions, PlayerSnapshot, TimePlayer } from './player-types.js';

interface State {
    catalog: Catalog;
    selection: readonly string[];
    view: View;
    mode: RequestedMode;
    granularity: Granularity;
    frozen: Sequence | null;
    step: string | null;
    playing: boolean;
    loading: boolean;
    stale: boolean;
    grouped: boolean;
    intervalMs: number;
    direction: Direction;
    loop: boolean;
    baseCql: string | null;
}

export const createTimePlayer = (options: PlayerOptions = {}): TimePlayer => {
    const kind = options.kind ?? 'time';
    const column = options.column ?? '';
    if (kind === 'cql' && !column) throw new Error('A cql player needs a column');
    const multiple = options.multiple ?? true;
    const emit = (event: PlayerEvent): void => options.onEvent?.(event);
    const listeners = new Set<() => void>();
    const catalog = createCatalog(options.catalog ?? []);
    const selection = initialSelection(catalog, options.initial ?? 'none');
    let link: GroupLink | null = null;

    let state: State = {
        catalog, selection, view: selection[0] ? viewShowing(selection[0]) : YEARS,
        mode: options.mode ?? 'auto', granularity: options.granularity ?? 'month', frozen: null, step: null,
        playing: false, loading: false, stale: false, grouped: false,
        intervalMs: clampInterval(options.intervalMs ?? DEFAULT_INTERVAL_MS),
        direction: normalizeDirection(options.direction), loop: options.loop ?? true,
        baseCql: options.baseCql?.trim() || null,
    };

    const sequenceOf = (current: State): Sequence => current.frozen ?? buildSequence({
        catalog: current.catalog, selection: current.selection, view: current.view,
        mode: current.mode, granularity: current.granularity, limit: options.limit ?? 10_000,
    });

    function toSnapshot(current: State): PlayerSnapshot {
        const sequence = sequenceOf(current);
        const keys = current.step ? [current.step] : current.selection;
        const time = kind === 'time' ? timeValue(current.catalog, keys, { compact: options.compact ?? true }) : null;
        const cql = kind === 'cql' ? and([current.baseCql, cqlValue(column, keys)]) : null;
        return {
            kind, catalog: current.catalog, view: current.view,
            items: buildItems(current.catalog, current.view, current.selection, current.step),
            selection: current.selection, mode: current.mode, granularity: current.granularity, sequence,
            index: current.step ? sequence.keys.indexOf(current.step) : -1, step: current.step, keys,
            canPlay: sequence.keys.length >= 2, playing: current.playing, loading: current.loading,
            stale: current.stale, grouped: current.grouped, intervalMs: current.intervalMs,
            direction: current.direction, loop: current.loop, baseCql: current.baseCql,
            time, cql, value: kind === 'time' ? time : cql,
        };
    }

    let snapshot = toSnapshot(state);

    const set = (patch: Partial<State>): void => {
        const previous = snapshot.value;
        state = { ...state, ...patch };
        snapshot = toSnapshot(state);
        if (snapshot.value !== previous) emit({ type: 'value', value: snapshot.value });
        listeners.forEach(listener => listener());
    };

    const moveTo = (key: string, sequence: Sequence, patch: Partial<State> = {}): void => {
        const changed = key !== state.step;
        set({ ...patch, frozen: sequence, step: key, stale: false, view: viewShowing(key) });
        if (changed) emit({ type: 'step', key, value: snapshot.value });
    };

    const delta = (): number => (state.direction === 'backward' ? -1 : 1);

    const halt = (): void => {
        clock.stop();
        if (!state.playing) return;
        set({ playing: false });
        emit({ type: 'pause' });
    };

    const clock = createClock({
        intervalMs: () => state.intervalMs,
        timeoutMs: () => options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        busy: () => state.loading,
        tick: () => {
            const { sequence, index } = snapshot;
            const next = nextIndex(index, sequence.keys.length, delta(), state.loop);
            if (next === null) halt();
            else moveTo(sequence.keys[next] as string, sequence);
        },
        onTimeout: () => {
            emit({ type: 'timeout' });
            halt();
        },
    });

    const play = (): void => {
        if (link) return link.play();
        if (state.playing || !snapshot.canPlay) return;
        const { sequence } = snapshot;
        const only = state.selection.length === 1 ? state.selection[0] as string : null;
        let start = state.step && sequence.keys.includes(state.step) ? state.step : null;
        if (!start && only && sequence.keys.includes(only)) start = only;
        if (!start) start = (state.direction === 'backward' ? sequence.keys[sequence.keys.length - 1] : sequence.keys[0]) as string;
        moveTo(start, sequence, { playing: true });
        emit({ type: 'play' });
        clock.start();
    };

    const pause = (): void => (link ? link.pause() : halt());

    const stop = (): void => {
        if (link) return link.stop();
        halt();
        if (state.step === null && state.frozen === null) return;
        set({ step: null, frozen: null, stale: false });
        emit({ type: 'stop' });
    };

    const changeSelection = (next: readonly string[]): void => {
        if (link) link.pause();
        else halt();
        const first = next[0];
        set({ selection: next, step: null, frozen: null, stale: false, view: first ? viewShowing(first) : state.view });
        emit({ type: 'select', keys: next });
    };

    const remode = (patch: Partial<State>): void => {
        if (link) link.pause();
        const sequence = sequenceOf({ ...state, ...patch, frozen: null });
        if (sequence.keys.length < 2) {
            halt();
            set({ ...patch, frozen: null, step: null });
            return;
        }
        if (state.step === null && !state.playing) return set({ ...patch, frozen: null });
        const step = state.step && sequence.keys.includes(state.step) ? state.step : sequence.keys[0] as string;
        moveTo(step, sequence, patch);
    };

    const member: Member = {
        attach(next) {
            link = next;
            clock.stop();
            set({ grouped: next !== null, playing: false, stale: false });
        },
        drive(key) {
            if (key === null) return set({ step: null, frozen: null, stale: false });
            const { sequence } = snapshot;
            const match = sequence.keys.find(item => item === key)
                ?? sequence.keys.find(item => contains(item, key))
                ?? sequence.keys.find(item => contains(key, item));
            if (match) moveTo(match, sequence);
            else if (!state.stale) set({ stale: true });
        },
        setPlaying(playing) {
            if (playing !== state.playing) set({ playing });
        },
        sequence: () => snapshot.sequence,
        loading: () => state.loading,
    };

    return {
        kind,
        [MEMBER]: member,
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        getSnapshot: () => snapshot,
        destroy() {
            clock.stop();
            link = null;
            listeners.clear();
        },
        setCatalog(input) {
            halt();
            const next = createCatalog(input);
            set({
                catalog: next, selection: state.selection.filter(key => next.has(key)),
                view: validView(next, state.view), frozen: null, step: null, stale: false,
            });
        },
        select: (key, mode = 'replace') => changeSelection(applySelect(state.selection, key, mode, multiple)),
        setSelection: keys => changeSelection(keys.filter(key => isKey(key) && state.catalog.has(key)).slice(0, multiple ? undefined : 1)),
        clearSelection: () => changeSelection([]),
        open: key => set({ view: validView(state.catalog, viewInside(key)) }),
        back: () => set({ view: viewAbove(state.view) }),
        setMode: mode => { if (mode !== state.mode) remode({ mode }); },
        setGranularity: granularity => { if (granularity !== state.granularity) remode({ granularity }); },
        play,
        pause,
        toggle: () => (state.playing ? pause() : play()),
        stop,
        step(amount = 1) {
            if (link) return link.step(amount);
            const { sequence, index } = snapshot;
            const next = nextIndex(index, sequence.keys.length, amount, state.loop);
            if (next === null) return;
            moveTo(sequence.keys[next] as string, sequence);
            clock.restart();
        },
        seek(key) {
            if (link) return link.seek(key);
            if (!snapshot.sequence.keys.includes(key)) return;
            moveTo(key, snapshot.sequence);
            clock.restart();
        },
        setIntervalMs(ms) {
            set({ intervalMs: clampInterval(ms) });
            clock.restart();
        },
        setDirection: direction => set({ direction: normalizeDirection(direction) }),
        setLoop: loop => set({ loop }),
        setBaseCql: cql => set({ baseCql: cql?.trim() || null }),
        loading() {
            if (!state.loading) set({ loading: true });
        },
        ready() {
            if (state.loading) set({ loading: false });
            clock.poke();
            link?.notify();
        },
    };
};
