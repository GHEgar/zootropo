import { useState } from 'react';
import { inspectLayer, type InspectNote, type LayerReport } from 'zootropo/ol';
import { GEOSERVER } from './sources';

const PATHS: Record<LayerReport['path'], string> = {
    time: 'Uses TIME (kind: \'time\')',
    cql: 'Uses CQL on a date column (kind: \'cql\')',
    both: 'Works with TIME or CQL',
    none: 'No dates found',
};

const NOTES: Record<InspectNote, string> = {
    'time-continuous': 'TIME is a continuous interval: the steps come from the granularity you pick.',
    'time-hours': 'The instants carry a time of day: there is an hours level.',
    'cql-needs-cql-time': 'If you filter by CQL, pass cqlTime: \'catalog\' to bindWmsTime; the layer applies its default TIME.',
    'cql-catalog-needed': 'With CQL you build the list of dates yourself (for example, a SELECT DISTINCT).',
    'no-wfs': 'No WFS: the columns could not be checked.',
    'no-capabilities': 'GetCapabilities could not be read.',
    'no-dates': 'The layer has no TIME dimension and no date columns.',
};

export function Inspector() {
    const [url, setUrl] = useState(GEOSERVER);
    const [layer, setLayer] = useState('geosolutions:storm_obs');
    const [report, setReport] = useState<LayerReport | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

    const run = async () => {
        setState('loading');
        setReport(null);
        try {
            setReport(await inspectLayer(url.trim(), layer.trim()));
            setState('idle');
        } catch {
            setState('error');
        }
    };

    return (
        <details className="inspector">
            <summary>Is my layer supported?</summary>
            <form onSubmit={event => { event.preventDefault(); void run(); }}>
                <label>WMS <input value={url} onChange={event => setUrl(event.target.value)} /></label>
                <label>Layer <input value={layer} onChange={event => setLayer(event.target.value)} placeholder="workspace:layer" /></label>
                <button type="submit" disabled={state === 'loading'}>{state === 'loading' ? 'Checking…' : 'Check'}</button>
            </form>
            {state === 'error' && <p className="badge warn">The layer could not be checked.</p>}
            {report && (
                <div className="report" data-testid="inspect-report" data-path={report.path}>
                    <strong>{PATHS[report.path]}</strong>
                    {report.time && (
                        <p>
                            TIME: {report.time.instants} instants{report.time.ranges ? `, ${report.time.ranges} range(s)` : ''},
                            from {report.time.first} to {report.time.last}
                        </p>
                    )}
                    {report.dateColumns.map(column => (
                        <p key={column.name}>
                            Column <code>{column.name}</code> ({column.type}){column.first ? `, from ${column.first} to ${column.last}` : ''}
                        </p>
                    ))}
                    <ul>{report.notes.map(note => <li key={note}>{NOTES[note]}</li>)}</ul>
                    {report.options && (
                        <code className="value">{JSON.stringify({ ...report.options, catalog: report.options.catalog ? '…' : undefined })}</code>
                    )}
                </div>
            )}
        </details>
    );
}
