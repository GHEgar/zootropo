import type { Transport as TransportProps } from 'zootropo/react';

interface Props {
    transport: TransportProps;
    playing: boolean;
    intervalMs: number;
    direction: 'forward' | 'backward';
}

export function Transport({ transport, playing, intervalMs, direction }: Props) {
    return (
        <div className="transport">
            <button {...transport.getStepProps(-1)}>◀︎</button>
            <button {...transport.getPlayProps()} className="play">{playing ? 'Pausa' : 'Play'}</button>
            <button {...transport.getStepProps(1)}>▶︎</button>
            <button {...transport.getStopProps()}>■</button>
            <button {...transport.getIntervalProps()}>{intervalMs / 1000} s</button>
            <button {...transport.getDirectionProps()}>{direction === 'forward' ? '→' : '←'}</button>
        </div>
    );
}
