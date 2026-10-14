import { useEffect, useRef } from 'react';
import Map from 'ol/Map.js';
import type View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import TileWMS from 'ol/source/TileWMS.js';
import 'ol/ol.css';
import type { TimePlayer } from 'zootropo';
import { bindWmsBuffer, bindWmsTime } from 'zootropo/ol';

interface Props {
    view: View;
    url: string;
    layer: string;
    player: TimePlayer;
    title: string;
    cqlTime?: 'catalog' | undefined;
    buffered?: boolean;
}

export function MapPanel({ view, url, layer, player, title, cqlTime, buffered = false }: Props) {
    const target = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!target.current) return undefined;
        const wms = () => new TileLayer({
            opacity: 0.85,
            source: new TileWMS({
                url,
                params: { LAYERS: layer, FORMAT: 'image/png', TRANSPARENT: true },
                crossOrigin: 'anonymous',
                transition: 0,
            }),
        });
        const front = wms();
        const back = buffered ? wms() : null;
        const map = new Map({
            target: target.current,
            layers: [new TileLayer({ source: new OSM() }), front, ...(back ? [back] : [])],
            view,
        });
        const options = cqlTime ? { cqlTime } : {};
        const binding = back ? bindWmsBuffer(player, front, back, options) : bindWmsTime(player, front.getSource() as TileWMS, options);
        return () => {
            binding.destroy();
            map.setTarget(undefined);
        };
    }, [view, url, layer, player, cqlTime, buffered]);

    return (
        <section className="map">
            <div ref={target} className="map-target" data-testid={`map-${title}`} />
            <span className="map-title">{title}</span>
        </section>
    );
}
