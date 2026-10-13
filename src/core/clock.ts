export interface ClockOptions {
    intervalMs(): number;
    timeoutMs(): number;
    busy(): boolean;
    tick(): void;
    onTimeout(): void;
}

export interface Clock {
    readonly running: boolean;
    readonly waiting: boolean;
    start(): void;
    stop(): void;
    restart(): void;
    poke(): void;
}

export const createClock = (options: ClockOptions): Clock => {
    let running = false;
    let waiting = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;

    const clear = (): void => {
        if (timer !== null) clearTimeout(timer);
        if (deadline !== null) clearTimeout(deadline);
        timer = null;
        deadline = null;
    };

    const schedule = (): void => {
        clear();
        timer = setTimeout(fire, options.intervalMs());
    };

    const advance = (): void => {
        waiting = false;
        clear();
        options.tick();
        if (running) schedule();
    };

    function fire(): void {
        timer = null;
        if (!running) return;
        if (!options.busy()) {
            advance();
            return;
        }
        waiting = true;
        deadline = setTimeout(() => {
            deadline = null;
            if (!waiting) return;
            running = false;
            waiting = false;
            options.onTimeout();
        }, options.timeoutMs());
    }

    return {
        get running() { return running; },
        get waiting() { return waiting; },
        start() {
            if (running) return;
            running = true;
            waiting = false;
            schedule();
        },
        stop() {
            running = false;
            waiting = false;
            clear();
        },
        restart() {
            if (running && !waiting) schedule();
        },
        poke() {
            if (running && waiting && !options.busy()) advance();
        },
    };
};
