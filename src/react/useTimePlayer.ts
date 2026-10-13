import { useMemo, useSyncExternalStore } from 'react';
import type { KeyboardEvent } from 'react';
import type { Granularity, Item, PlayerSnapshot, TimePlayer } from '../core/index.js';
import { DEFAULT_LABELS, buildTransport, type ButtonProps, type Labels, type Transport } from './transport.js';

export interface ListProps {
    role: 'listbox';
    'aria-label': string;
    'aria-multiselectable': boolean;
    'aria-busy': boolean;
    'data-level': PlayerSnapshot['view']['level'];
}

export interface ItemProps {
    role: 'option';
    'aria-selected': boolean;
    'aria-current'?: 'step';
    'data-key': string;
    'data-level': Granularity;
    'data-selected'?: true;
    'data-partial'?: true;
    'data-current'?: true;
    'data-contains-current'?: true;
    tabIndex: number;
    onClick: () => void;
    onDoubleClick: () => void;
    onKeyDown: (event: KeyboardEvent) => void;
}

export interface UseTimePlayerOptions {
    labels?: Partial<Labels>;
    openOnSelect?: readonly Granularity[];
}

export interface UseTimePlayer extends PlayerSnapshot, Transport {
    player: TimePlayer;
    getListProps(): ListProps;
    getItemProps(item: Item): ItemProps;
    getBackProps(): ButtonProps;
}

const DEFAULT_OPEN: readonly Granularity[] = ['year'];

export const useTimePlayer = (player: TimePlayer, options: UseTimePlayerOptions = {}): UseTimePlayer => {
    const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
    const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...options.labels }), [options.labels]);
    const openOnSelect = options.openOnSelect ?? DEFAULT_OPEN;

    return useMemo(() => {
        const choose = (item: Item): void => {
            const opens = openOnSelect.includes(item.level) && item.level !== 'hour';
            if (!(opens && item.selected)) player.select(item.key, 'toggle');
            if (opens) player.open(item.key);
        };
        const getItemProps = (item: Item): ItemProps => {
            const props: ItemProps = {
                role: 'option',
                'aria-selected': item.selected,
                'data-key': item.key,
                'data-level': item.level,
                tabIndex: 0,
                onClick: () => choose(item),
                onDoubleClick: () => { if (item.level !== 'hour') player.open(item.key); },
                onKeyDown: event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        choose(item);
                    } else if (event.key === 'ArrowRight' && item.level !== 'hour') {
                        event.preventDefault();
                        player.open(item.key);
                    } else if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
                        event.preventDefault();
                        player.back();
                    }
                },
            };
            if (item.selected) props['data-selected'] = true;
            if (item.partial) props['data-partial'] = true;
            if (item.current) {
                props['data-current'] = true;
                props['aria-current'] = 'step';
            }
            if (item.containsCurrent) props['data-contains-current'] = true;
            return props;
        };
        return {
            ...snapshot,
            ...buildTransport(player, snapshot, labels),
            player,
            getListProps: () => ({
                role: 'listbox',
                'aria-label': labels.list,
                'aria-multiselectable': true,
                'aria-busy': snapshot.loading,
                'data-level': snapshot.view.level,
            }),
            getItemProps,
            getBackProps: () => ({
                type: 'button',
                'aria-label': labels.back,
                disabled: snapshot.view.level === 'years',
                onClick: () => player.back(),
            }),
        };
    }, [snapshot, player, labels, openOnSelect]);
};
