import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Stop } from 'tesela/react';
import type { Transport as TransportProps } from 'zootropo/react';

interface Props {
    transport: TransportProps;
    playing: boolean;
    intervalMs: number;
    direction: 'forward' | 'backward';
}

const ICON = 16;

export function Transport({ transport, playing, intervalMs, direction }: Props) {
    return (
        <div className="transport">
            <button {...transport.getStepProps(-1)}><ChevronLeft size={ICON} /></button>
            <button {...transport.getPlayProps()} className="play">{playing ? <Pause size={ICON} /> : <Play size={ICON} />}</button>
            <button {...transport.getStepProps(1)}><ChevronRight size={ICON} /></button>
            <button {...transport.getStopProps()}><Stop size={ICON} /></button>
            <button {...transport.getIntervalProps()}>{intervalMs / 1000} s</button>
            <button {...transport.getDirectionProps()}>{direction === 'forward' ? <ArrowRight size={ICON} /> : <ArrowLeft size={ICON} />}</button>
        </div>
    );
}
