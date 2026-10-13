# zootropo

Headless time player for WMS layers. zootropo owns the state — which dates exist, which year, months
or days are selected, the sequence of steps, play/pause, interval, direction, waiting for the layer to
load — and you own every pixel: it ships no styles, only state, events and ARIA/`data-*` attributes.
It works with layers that have a `TIME` dimension and with layers filtered by a date column through
`CQL_FILTER`, and it can drive several layers with one shared clock to compare them.

```bash
npm install zootropo
```

| Entry | What it is | Needs |
|---|---|---|
| `zootropo` | Framework-free core: ISO 8601 parsing, catalog, selection, sequence, player, group | nothing |
| `zootropo/react` | `useTimePlayer` and `usePlayerGroup` with prop getters | `react >= 19` |
| `zootropo/ol` | `bindWmsTime` and `GetCapabilities` dimension reader | `ol >= 10` |

## Core

```ts
import { createTimePlayer } from 'zootropo';

const player = createTimePlayer({
    catalog: '2000-03-01/2025-03-01/P1M,2025-05-01/2026-08-01/P1M',
    kind: 'time',
    initial: 'latest',
    onEvent: event => console.log(event),
});

player.subscribe(() => render(player.getSnapshot()));

player.open('2024');
player.select('2024-03', 'toggle');
player.setMode('timeline');
player.setIntervalMs(500);
player.setDirection('backward');
player.play();
```

### Catalog

The catalog is the list of dates that exist. It accepts the `values` of a WMS `Dimension`, an array
of ISO strings or `{ instants, ranges }`:

- Lists separated by commas: `2012-01-01T00:00:00Z,2016-01-01T00:00:00Z`.
- Periodic intervals `start/end/period` are expanded to instants (`P1M`, `P1D`, `PT6H`…). Month steps
  clamp to the end of the month instead of drifting.
- Intervals without a period, or with more steps than `maxInstants` (10 000), stay as continuous
  ranges and are answered lazily.

Dates are calendar strings; the model never uses `Date`, so there are no time zone shifts.

### Selection and navigation

Three levels: years, months of a year, days of a month. `items` holds what the current `view` shows,
only what exists in the catalog. `select(key, 'toggle')` adds or removes keys of the same level and
parent; a key from another level or parent replaces the selection. `multiple: false` keeps one key.
`open(key)` goes one level down, `back()` one level up.

Keys are `YYYY`, `YYYY-MM` and `YYYY-MM-DD`.

### Value

| Kind | Value |
|---|---|
| `time` | The instants of the catalog covered by the selection or the current step, in their original format. Instants that are consecutive in the catalog are compacted to `first/last`; continuous ranges are clipped to the period. `compact: false` lists every instant |
| `cql` | Half-open ranges on `column` (`fecha >= '2024-01-01' AND fecha < '2024-02-01'`), contiguous periods merged, joined with `OR`, and `baseCql` added with `AND` |

### Sequence and playback

| Mode | Steps |
|---|---|
| `year` | Every year, or the selected years when there are two or more |
| `month` | The months of the selected year, or the selected months when there are two or more |
| `day` | The days of the selected month, or the selected days when there are two or more |
| `timeline` | The whole catalog at `granularity` (`month` by default), across years |
| `auto` | Inferred from the selection, then the view; the first mode with at least two steps |

`play()` starts on the selected step when it is part of the sequence, otherwise on the first one.
The interval is clamped to 100–10 000 ms. With `loop: false` the player pauses after the last step.
Changing the selection by hand pauses and goes back to the selection.

### Waiting for the layer

Call `loading()` when the layer starts loading the new step and `ready()` when it finishes. The
player waits for `ready()` before advancing and pauses with a `timeout` event after `timeoutMs`
(30 s). `bindWmsTime` does this for you.

### Comparing layers

```ts
import { createPlayerGroup } from 'zootropo';

const group = createPlayerGroup([terra, aqua], { intervalMs: 1000 });
group.play();
```

One clock, interval and direction for every member. The group walks the union of the members'
sequences; a member that has no such date keeps its previous step and reports `stale: true`. It
waits until every member is ready. Play, pause or a manual selection on a member act on the group.

### Labels

```ts
import { createFormatter } from 'zootropo';

const format = createFormatter({ locale: 'es-MX' });
format.keys(['2024-01', '2024-02', '2024-03']);
```

`Intl.DateTimeFormat` with the locale you pass; English by default.

## React

```tsx
import { useTimePlayer } from 'zootropo/react';

function Dates({ player }) {
    const t = useTimePlayer(player);
    return (
        <>
            <button {...t.getBackProps()}>‹</button>
            <ul {...t.getListProps()}>
                {t.items.map(item => <li key={item.key} {...t.getItemProps(item)}>{item.key}</li>)}
            </ul>
            <button {...t.getPlayProps()}>{t.playing ? 'Pause' : 'Play'}</button>
            <button {...t.getStepProps(1)}>Next</button>
            <button {...t.getIntervalProps()}>{t.intervalMs / 1000} s</button>
            <button {...t.getDirectionProps()}>{t.direction}</button>
        </>
    );
}
```

Items carry `aria-selected`, `aria-current="step"` and `data-selected`, `data-partial`,
`data-current`, `data-contains-current`. Clicking a year selects it and opens its months
(`openOnSelect`); double click or `ArrowRight` opens, `ArrowLeft` goes back. `usePlayerGroup` gives
the same transport getters for a group. Every label can be replaced with `labels`.

## OpenLayers

```ts
import { bindWmsTime, fetchDimension } from 'zootropo/ol';

const dimension = await fetchDimension('https://example.org/geoserver/wms', 'ws:layer');
player.setCatalog(dimension?.values ?? []);
const binding = bindWmsTime(player, tileWmsSource);
```

`bindWmsTime` writes `TIME` (or `CQL_FILTER` for `cql` players) with `updateParams`, counts tile and
image loads and calls `loading()`/`ready()`. `fetchDimensions` reads every layer's dimension from a
WMS 1.3.0 `GetCapabilities`, by full and local name.

## Notes

- A GeoServer layer with a `TIME` dimension applies its default time when the request has no `TIME`,
  even with `CQL_FILTER`. Send a wide `TIME` on the source when you filter such a layer by CQL.
- With several instants in `TIME`, what the server draws depends on the layer. Some services, like
  NASA GIBS, accept a single instant: use `multiple: false`.

## Demo

```bash
npm run demo
```

MODIS NDVI from NASA GIBS on two maps with a shared clock, and Atlantic storms from a public
GeoServer by `TIME` or by CQL.

## License

AGPL-3.0-only
