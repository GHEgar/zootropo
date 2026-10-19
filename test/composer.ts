import type { CqlComposerLike } from '../src/core/index.js';

export interface FakeComposer extends CqlComposerLike {
    calls: [string, string | null][];
    fragments: Map<string, string>;
}

export const fakeComposer = (): FakeComposer => {
    const calls: [string, string | null][] = [];
    const fragments = new Map<string, string>();
    return {
        calls,
        fragments,
        set(name, fragment) {
            calls.push([name, fragment]);
            if (fragment === null) fragments.delete(name);
            else fragments.set(name, fragment);
        },
    };
};
