import { useEffect, useRef } from 'react';
import Map from 'ol/Map.js';
import type View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import TileWMS from 'ol/source/TileWMS.js';
import 'ol/ol.css';
import type { TimePlayer } from 'zootropo';
import { bindWmsTime } from 'zootropo/ol';

interface Props {
    view: View;
    url: string;
    layer: string;
    player: TimePlayer;
    title: string;
    cqlTime?: 'catalog' | undefined;
}

export function MapPanel({ view, url, layer, player, title, cqlTime }: Props) {
    const target = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!target.current) return undefined;
        const source = new TileWMS({
            url,
            params: { LAYERS: layer, FORMAT: 'image/png', TRANSPARENT: true },
            crossOrigin: 'anonymous',
            transition: 0,
        });
        const map = new Map({
            target: target.current,
            layers: [new TileLayer({ source: new OSM() }), new TileLayer({ source, opacity: 0.85 })],
            view,
        });
        const binding = bindWmsTime(player, source, cqlTime ? { cqlTime } : {});
        return () => {
            binding.destroy();
            map.setTarget(undefined);
        };
    }, [view, url, layer, player, cqlTime]);

    return (
        <section className="map">
            <div ref={target} className="map-target" data-testid={`map-${title}`} />
            <span className="map-title">{title}</span>
        </section>
    );
}
