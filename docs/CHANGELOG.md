# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado con
[SemVer](https://semver.org/lang/es/).

## [No publicado]

### Agregado

- `inspectLayer(url, capa)` en `zootropo/ol`: revisa la dimensión `TIME` en `GetCapabilities` y las
  columnas de fecha por WFS (con su primera y última fecha) y dice qué camino sirve (`time`, `cql`,
  `both`, `none`), con qué opciones crear el reproductor y qué trampas hay (`cqlTime`, tiempo continuo,
  sin WFS).
- «¿Mi capa es compatible?» en el demo: el mismo reporte con una URL y un nombre de capa.

## [0.3.0] - 2026-10-13

### Agregado

- `multiple: 'mixed'`: la selección mezcla niveles y padres (un año, unos meses de otro año, unos
  días). Al marcar una llave se quitan sus ancestros y descendientes, así el filtro no repite periodos.

## [0.2.1] - 2026-10-13

### Corregido

- `initial` y `setSelection` ordenan las llaves como `select()`: antes la secuencia seguía el orden
  en que llegaban.

## [0.2.0] - 2026-10-13

### Agregado

- Nivel de horas: llaves `YYYY-MM-DDTHH`, vista `hours`, modo de secuencia `hour` y `timeline` por
  hora. Solo aparece cuando los instantes del catálogo traen hora.
- `catalog.hours(year, month, day)` y `catalog.extent()`.
- CQL por hora con fecha y hora (`'1990-07-22T06:00:00Z'`).
- `bindWmsTime(player, source, { cqlTime })`: con `'catalog'` o un valor fijo manda un `TIME` amplio
  junto al `CQL_FILTER`, para capas de GeoServer con dimensión de tiempo.
- `formatter.hour(hour)`.
- Pruebas e2e con Playwright contra el demo, con servidores simulados.
- Workflow que construye el demo y lo publica en GitHub Pages.

### Cambiado

- Los periodos se comparan por milisegundo (`startAt`/`endAt`) en lugar de por día.
- La vista lleva `day` y los ítems `hour`.

## [0.1.0] - 2026-10-13

### Agregado

- Lectura de dimensiones ISO 8601: listas, intervalos `inicio/fin/periodo` expandidos a instantes,
  intervalos continuos como rangos, zonas horarias normalizadas a UTC; aritmética de calendario con
  enteros, sin `Date`.
- `createCatalog`: árbol año → mes → día, rangos continuos respondidos sin expandir,
  `isAvailable(iso)` y llaves por granularidad.
- Selección en tres niveles con varias llaves del mismo nivel y padre, navegación con `open` y `back`.
- Valor `TIME` con los instantes del catálogo compactados en rangos, y valor CQL con rangos
  semiabiertos fundidos y `baseCql`.
- Secuencias `year`, `month`, `day`, `timeline` y `auto`.
- `createTimePlayer`: play, pausa, detener, pasos, intervalo acotado, dirección, bucle, espera de carga
  con `loading()`/`ready()` y timeout, eventos por `onEvent`.
- `createPlayerGroup`: reloj compartido sobre la unión de las secuencias, miembros sin la fecha
  marcados como `stale`, espera a todos los miembros.
- `createFormatter` con `Intl`.
- `zootropo/react`: `useTimePlayer` y `usePlayerGroup` con prop getters y ARIA.
- `zootropo/ol`: `bindWmsTime` y lectura de dimensiones desde `GetCapabilities`.
- Demo en Vite con NASA GIBS y un GeoServer público.
