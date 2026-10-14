import { createFormatter, type Labels } from 'zootropo/react';

export const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';
export const GEOSERVER = 'https://gs-stable.geosolutionsgroup.com/geoserver/wms';

export const TERRA = 'MODIS_Terra_L3_NDVI_Monthly';
export const AQUA = 'MODIS_Aqua_L3_NDVI_Monthly';
export const STORMS_TIME = 'geosolutions:storm_obs_test';
export const STORMS_CQL = 'geosolutions:storm_obs';
export const STORMS_COLUMN = 'obs_dateti';

const UNITS = { year: ['year', 'years'], month: ['month', 'months'], day: ['day', 'days'], hour: ['hour', 'hours'], minute: ['minute', 'minutes'] } as const;

export const formatter = createFormatter({
    locale: 'en-US',
    count: (count, granularity) => `${count} ${UNITS[granularity][count === 1 ? 0 : 1]}`,
});

export const LABELS: Partial<Labels> = {
    list: 'Dates',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    back: 'Back',
    previous: 'Previous step',
    next: 'Next step',
    interval: ms => `Interval ${ms / 1000} s`,
    direction: direction => (direction === 'forward' ? 'Forward' : 'Backward'),
};
