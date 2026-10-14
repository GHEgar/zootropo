import { useState } from 'react';
import { inspectLayer, type InspectNote, type LayerReport } from 'zootropo/ol';
import { GEOSERVER } from './sources';

const PATHS: Record<LayerReport['path'], string> = {
    time: 'Usa TIME (kind: \'time\')',
    cql: 'Usa CQL sobre una columna de fecha (kind: \'cql\')',
    both: 'Sirve por TIME o por CQL',
    none: 'No se encontraron fechas',
};

const NOTES: Record<InspectNote, string> = {
    'time-continuous': 'El TIME es un intervalo continuo: los pasos salen de la granularidad que elijas.',
    'time-hours': 'Los instantes traen hora: hay nivel de horas.',
    'cql-needs-cql-time': 'Si filtras por CQL, pasa cqlTime: \'catalog\' a bindWmsTime; la capa aplica su TIME por defecto.',
    'cql-catalog-needed': 'Por CQL la lista de fechas la armas tú (por ejemplo, un SELECT DISTINCT).',
    'no-wfs': 'No hay WFS: no se pudieron revisar las columnas.',
    'no-capabilities': 'No se pudo leer GetCapabilities.',
    'no-dates': 'La capa no tiene dimensión TIME ni columnas de fecha.',
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
            <summary>¿Mi capa es compatible?</summary>
            <form onSubmit={event => { event.preventDefault(); void run(); }}>
                <label>WMS <input value={url} onChange={event => setUrl(event.target.value)} /></label>
                <label>Capa <input value={layer} onChange={event => setLayer(event.target.value)} placeholder="workspace:capa" /></label>
                <button type="submit" disabled={state === 'loading'}>{state === 'loading' ? 'Revisando…' : 'Revisar'}</button>
            </form>
            {state === 'error' && <p className="badge warn">No se pudo revisar la capa.</p>}
            {report && (
                <div className="report" data-testid="inspect-report" data-path={report.path}>
                    <strong>{PATHS[report.path]}</strong>
                    {report.time && (
                        <p>
                            TIME: {report.time.instants} instantes{report.time.ranges ? `, ${report.time.ranges} rango(s)` : ''},
                            de {report.time.first} a {report.time.last}
                        </p>
                    )}
                    {report.dateColumns.map(column => (
                        <p key={column.name}>
                            Columna <code>{column.name}</code> ({column.type}){column.first ? `, de ${column.first} a ${column.last}` : ''}
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
