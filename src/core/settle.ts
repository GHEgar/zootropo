export interface Settler {
    wait(busy: boolean): Promise<boolean>;
    flush(loaded: boolean): void;
}

export const createSettler = (timeoutMs: () => number): Settler => {
    const waiters = new Set<(loaded: boolean) => void>();
    return {
        wait(busy) {
            if (!busy) return Promise.resolve(true);
            return new Promise(resolve => {
                const done = (loaded: boolean): void => {
                    clearTimeout(timer);
                    waiters.delete(done);
                    resolve(loaded);
                };
                const timer = setTimeout(() => done(false), timeoutMs());
                waiters.add(done);
            });
        },
        flush(loaded) {
            [...waiters].forEach(done => done(loaded));
        },
    };
};
