import { ChevronLeft } from 'tesela/react';
import { toKey, useTimePlayer, type Granularity, type Item, type RequestedMode, type TimePlayer } from 'zootropo/react';
import { LABELS, formatter } from './sources';
import { Transport } from './Transport';

const MODES: RequestedMode[] = ['auto', 'year', 'month', 'day', 'hour', 'minute', 'timeline'];
const MODE_LABELS: Record<RequestedMode, string> = {
    auto: 'Auto', year: 'Years', month: 'Months', day: 'Days', hour: 'Hours', minute: 'Minutes', timeline: 'Timeline',
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
        ? 'Years'
        : view.level === 'months' ? String(view.year) : formatter.key(toKey(view.year, view.month, view.level === 'days' ? null : view.day, view.level === 'minutes' ? view.hour : null));

    return (
        <section className="selector" data-stale={t.stale || undefined}>
            <header>
                <strong>{title}</strong>
                <span className="muted">{t.catalog.empty ? 'loading dates…' : formatter.keys(t.keys) || 'no date'}</span>
                {t.loading && <span className="badge">loading</span>}
                {t.stale && <span className="badge warn">date not available</span>}
            </header>
            <nav className="crumbs">
                <button {...t.getBackProps()}><ChevronLeft size={14} /></button>
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
                    Sequence{' '}
                    <select value={t.mode} onChange={event => player.setMode(event.target.value as RequestedMode)}>
                        {MODES.map(mode => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
                    </select>
                </label>
                {t.sequence.mode === 'timeline' && (
                    <label>
                        Step{' '}
                        <select value={t.granularity} onChange={event => player.setGranularity(event.target.value as Granularity)}>
                            <option value="year">year</option>
                            <option value="month">month</option>
                            <option value="day">day</option>
                            <option value="hour">hour</option>
                            <option value="minute">minute</option>
                        </select>
                    </label>
                )}
                <span className="muted">{t.sequence.keys.length} steps</span>
            </div>
            <code className="value" data-testid={`value-${title}`}>{t.value ?? '—'}</code>
        </section>
    );
}
