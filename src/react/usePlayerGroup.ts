import { useMemo, useSyncExternalStore } from 'react';
import type { GroupSnapshot, PlayerGroup } from '../core/index.js';
import { DEFAULT_LABELS, buildTransport, type Labels, type Transport } from './transport.js';

export interface UsePlayerGroup extends GroupSnapshot, Transport {
    group: PlayerGroup;
}

export const usePlayerGroup = (group: PlayerGroup, options: { labels?: Partial<Labels> } = {}): UsePlayerGroup => {
    const snapshot = useSyncExternalStore(group.subscribe, group.getSnapshot, group.getSnapshot);
    const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...options.labels }), [options.labels]);
    return useMemo(() => ({
        ...snapshot,
        ...buildTransport(group, snapshot, labels),
        group,
    }), [snapshot, group, labels]);
};
