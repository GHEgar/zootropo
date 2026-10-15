import 'rotulo';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import View from 'ol/View.js';
import { fromLonLat } from 'ol/proj.js';
import {
    createPlayerGroup, createTimePlayer, usePlayerGroup, useUrlSync, type PlayerGroup, type TimePlayer,
} from 'zootropo/react';
import { fetchColumnDates, fetchDimensions } from 'zootropo/ol';
import { Inspector } from './Inspector';
import { MapPanel } from './MapPanel';
import { Selector } from './Selector';
import { Transport } from './Transport';
import { AQUA, GEOSERVER, GIBS, LABELS, STORMS_COLUMN, STORMS_CQL, STORMS_TIME, TERRA } from './sources';

type StormKind = 'time' | 'cql';

const loadInto = (player: TimePlayer, values: string | undefined): void => {
    if (!values) return;
    player.setCatalog(values);
    const latest = player.getSnapshot().catalog.latest('month');
    if (latest && player.getSnapshot().selection.length === 0) player.setSelection([latest]);
};

function GroupControls({ group }: { group: PlayerGroup }) {
    const g = usePlayerGroup(group, { labels: LABELS });
    return (
        <div className="group">
            <strong>Shared clock</strong>
            <span className="muted">{g.step ?? '—'} · {g.sequence.length} steps{g.loading ? ' · waiting for layers' : ''}</span>
            <Transport transport={g} playing={g.playing} intervalMs={g.intervalMs} direction={g.direction} />
        </div>
    );
}

function App() {
    const view = useMemo(() => new View({ center: fromLonLat([-75, 22]), zoom: 3 }), []);
    const [error, setError] = useState<string | null>(null);
    const [sync, setSync] = useState(true);
    const [stormKind, setStormKind] = useState<StormKind>('time');
    const [stormTimes, setStormTimes] = useState<string>();
    const [stormDates, setStormDates] = useState<string>();

    const terra = useMemo(() => createTimePlayer({ multiple: false }), []);
    const aqua = useMemo(() => createTimePlayer({ multiple: false }), []);
    const storms = useMemo(() => (stormKind === 'time'
        ? createTimePlayer({ mode: 'timeline', granularity: 'month' })
        : createTimePlayer({ kind: 'cql', column: STORMS_COLUMN, mode: 'timeline', granularity: 'month' })), [stormKind]);

    const group = useMemo(() => (sync ? createPlayerGroup() : null), [sync]);
    useEffect(() => {
        if (!group) return undefined;
        group.add(terra);
        group.add(aqua);
        return () => {
            group.remove(terra);
            group.remove(aqua);
        };
    }, [group, terra, aqua]);

    useEffect(() => {
        const controller = new AbortController();
        const fail = (reason: unknown) => { if (!controller.signal.aborted) setError(String(reason)); };
        fetchDimensions(GIBS, { signal: controller.signal }).then(dimensions => {
            loadInto(terra, dimensions.get(TERRA)?.values);
            loadInto(aqua, dimensions.get(AQUA)?.values);
        }).catch(fail);
        fetchDimensions(GEOSERVER, { signal: controller.signal })
            .then(dimensions => setStormTimes(dimensions.get(STORMS_TIME)?.values))
            .catch(fail);
        return () => controller.abort();
    }, [terra, aqua]);

    useEffect(() => {
        if (stormKind !== 'cql' || stormDates) return undefined;
        const controller = new AbortController();
        fetchColumnDates(GEOSERVER, STORMS_CQL, STORMS_COLUMN, { signal: controller.signal })
            .then(result => setStormDates(result.dates.join(',')))
            .catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
        return () => controller.abort();
    }, [stormKind, stormDates]);

    useEffect(() => loadInto(storms, stormKind === 'time' ? stormTimes : stormDates), [storms, stormKind, stormTimes, stormDates]);
    useUrlSync(terra, { param: 'date' });

    return (
        <div className="layout">
            <header className="head">
                <strong>zootropo</strong>
                <span className="muted">Monthly MODIS NDVI (GIBS) and Atlantic storms (GeoServer)</span>
                {error && <span className="badge warn">{error}</span>}
            </header>
            <div className="maps">
                <MapPanel view={view} url={GIBS} layer={TERRA} player={terra} title="A · Terra" buffered />
                <MapPanel view={view} url={GIBS} layer={AQUA} player={aqua} title="B · Aqua" buffered />
                <MapPanel
                    view={view}
                    url={GEOSERVER}
                    layer={stormKind === 'time' ? STORMS_TIME : STORMS_CQL}
                    player={storms}
                    cqlTime={stormKind === 'cql' ? 'catalog' : undefined}
                    title={`Storms · ${stormKind === 'time' ? 'TIME' : 'CQL'}`}
                />
            </div>
            <aside className="panel">
                <Inspector />
                <label className="sync">
                    <input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)} />
                    Sync A and B
                </label>
                {group && <GroupControls group={group} />}
                <Selector player={terra} title="A · Terra" />
                <Selector player={aqua} title="B · Aqua" />
                <div className="kind">
                    Storms by{' '}
                    <button type="button" aria-pressed={stormKind === 'time'} onClick={() => setStormKind('time')}>TIME</button>
                    <button type="button" aria-pressed={stormKind === 'cql'} onClick={() => setStormKind('cql')}>CQL</button>
                </div>
                <Selector key={stormKind} player={storms} title="Storms" />
            </aside>
        </div>
    );
}

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
