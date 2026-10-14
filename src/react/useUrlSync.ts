import { useEffect } from 'react';
import { syncUrl, type TimePlayer, type UrlSyncOptions } from '../core/index.js';

export const useUrlSync = (player: TimePlayer, options: Omit<UrlSyncOptions, 'target'> = {}): void => {
    const { param, history } = options;
    useEffect(() => {
        const sync = syncUrl(player, {
            ...(param === undefined ? {} : { param }),
            ...(history === undefined ? {} : { history }),
        });
        return () => sync.stop();
    }, [player, param, history]);
};
