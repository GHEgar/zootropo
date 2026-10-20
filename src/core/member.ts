import type { Sequence } from './types.js';

export const MEMBER: unique symbol = Symbol('zootropo.member');

export interface GroupLink {
    play(): void;
    pause(): void;
    toggle(): void;
    stop(): void;
    step(delta: number): void;
    seek(key: string): Promise<boolean>;
    notify(): void;
}

export interface Member {
    attach(link: GroupLink | null): void;
    drive(key: string | null): void;
    setPlaying(playing: boolean): void;
    sequence(): Sequence;
    loading(): boolean;
    settled(): Promise<boolean>;
}
