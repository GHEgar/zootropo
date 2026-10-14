import { toKey, useTimePlayer, type Granularity, type Item, type RequestedMode, type TimePlayer } from 'zootropo/react';
import { LABELS, formatter } from './sources';
import { Transport } from './Transport';

const MODES: RequestedMode[] = ['auto', 'year', 'month', 'day', 'hour', 'minute', 'timeline'];
const MODE_LABELS: Record<RequestedMode, string> = {
    auto: 'Auto', year: 'Años', month: 'Meses', day: 'Días', hour: 'Horas', minute: 'Minutos', timeline: 'Línea de tiempo',
};

const itemLabel = (item: Item): string => {
    if (item.level === 'year') return String(item.year);
    if (item.level === 'month' && item.month !== null) return formatter.month(item.month, 'short');
    if (item.level === 'hour' && item.hour !== null) return formatter.hour(item.hour);
    if (item.level === 'minute' && item.hour !== null && item.minute !== null) return formatter.minute(item.hour, item.minute);
    return String(item.day);
};

interface Props {
    player: TimePlayer;
    title: string;
}

export function Selector({ player, title }: Props) {
    const t = useTimePlayer(player, { labels: LABELS });
    const { view } = t;
    const where = view.level === 'years' || view.year === null
        ? 'Años'
        : view.level === 'months' ? String(view.year) : formatter.key(toKey(view.year, view.month, view.level === 'days' ? null : view.day, view.level === 'minutes' ? view.hour : null));

    return (
        <section className="selector" data-stale={t.stale || undefined}>
            <header>
                <strong>{title}</strong>
                <span className="muted">{t.catalog.empty ? 'cargando fechas…' : formatter.keys(t.keys) || 'sin fecha'}</span>
                {t.loading && <span className="badge">cargando</span>}
                {t.stale && <span className="badge warn">sin esa fecha</span>}
            </header>
            <nav className="crumbs">
                <button {...t.getBackProps()}>‹</button>
                <span>{where}</span>
            </nav>
            <ul {...t.getListProps()} className={`items ${view.level}`}>
                {t.items.map(item => (
                    <li key={item.key} {...t.getItemProps(item)}>{itemLabel(item)}</li>
                ))}
            </ul>
            {!t.grouped && <Transport transport={t} playing={t.playing} intervalMs={t.intervalMs} direction={t.direction} />}
            <div className="options">
                <label>
                    Secuencia{' '}
                    <select value={t.mode} onChange={event => player.setMode(event.target.value as RequestedMode)}>
                        {MODES.map(mode => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
                    </select>
                </label>
                {t.sequence.mode === 'timeline' && (
                    <label>
                        Paso{' '}
                        <select value={t.granularity} onChange={event => player.setGranularity(event.target.value as Granularity)}>
                            <option value="year">año</option>
                            <option value="month">mes</option>
                            <option value="day">día</option>
                            <option value="hour">hora</option>
                            <option value="minute">minuto</option>
                        </select>
                    </label>
                )}
                <span className="muted">{t.sequence.keys.length} pasos</span>
            </div>
            <code className="value" data-testid={`value-${title}`}>{t.value ?? '—'}</code>
        </section>
    );
}
