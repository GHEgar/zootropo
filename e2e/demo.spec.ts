import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const capabilities = (layers: Record<string, string>): string => `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Service><Name>WMS</Name><Title>mock</Title></Service>
  <Capability><Layer><Title>root</Title>${Object.entries(layers).map(([name, values]) => `
    <Layer queryable="1"><Name>${name}</Name><Title>${name}</Title>
      <Dimension name="time" units="ISO8601">${values}</Dimension></Layer>`).join('')}
  </Layer></Capability>
</WMS_Capabilities>`;

const GIBS = capabilities({
    MODIS_Terra_L3_NDVI_Monthly: '2024-01-01/2024-04-01/P1M',
    MODIS_Aqua_L3_NDVI_Monthly: '2024-01-01,2024-02-01,2024-04-01,2024-05-01',
});

const STORM_DATES = ['1990-07-22T06:00:00.000Z', '1990-07-22T12:00:00.000Z', '1990-07-23T00:00:00.000Z', '1990-08-01T00:00:00.000Z'];

const GEOSERVER = capabilities({
    'geosolutions:storm_obs_test': STORM_DATES.join(','),
});

const mock = async (page: Page): Promise<URL[]> => {
    const maps: URL[] = [];
    const answer = (xml: string) => async (route: Route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('REQUEST') === 'GetCapabilities') {
            await route.fulfill({ contentType: 'text/xml', body: xml });
            return;
        }
        maps.push(url);
        await route.fulfill({ contentType: 'image/png', body: PIXEL });
    };
    await page.route('**/wms.cgi?**', answer(GIBS));
    await page.route('**/geoserver/wms?**', answer(GEOSERVER));
    await page.route('**/tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: PIXEL }));
    await page.route('**/geoserver/wps', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ features: STORM_DATES.map(value => ({ properties: { value } })) }),
    }));
    return maps;
};

const selector = (page: Page, index: number) => page.locator('.selector').nth(index);
const value = (page: Page, index: number) => selector(page, index).locator('.value');

test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
});

test('loads every catalog and starts on the latest month', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await expect(value(page, 0)).toHaveText('2024-04-01');
    await expect(value(page, 1)).toHaveText('2024-05-01');
    await expect(value(page, 2)).toHaveText('1990-08-01T00:00:00.000Z');
});

test('the shared clock walks the union and flags the member without that date', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await expect(value(page, 1)).toHaveText('2024-05-01');
    const next = page.locator('.group button[aria-label="Paso siguiente"]');
    await next.click();
    await next.click();
    await next.click();
    await expect(value(page, 0)).toHaveText('2024-03-01');
    await expect(value(page, 1)).toHaveText('2024-02-01');
    await expect(selector(page, 1)).toHaveAttribute('data-stale', 'true');
    await page.locator('.group .play').click();
    await expect(page.locator('.group .play')).toHaveAttribute('aria-pressed', 'true');
    await expect(value(page, 1)).toHaveText('2024-04-01', { timeout: 5000 });
    await expect(selector(page, 1)).not.toHaveAttribute('data-stale');
});

test('storms by CQL send the date filter and a wide TIME', async ({ page }) => {
    const maps = await mock(page);
    await page.goto('/');
    await page.locator('.kind button', { hasText: 'CQL' }).click();
    await expect(value(page, 2)).toHaveText("obs_dateti >= '1990-08-01' AND obs_dateti < '1990-09-01'");
    await expect.poll(() => maps.some(url => url.searchParams.get('LAYERS') === 'geosolutions:storm_obs'
        && url.searchParams.get('CQL_FILTER')?.includes('1990-08-01')
        && url.searchParams.get('TIME') === '1990-07-22T06:00:00.000Z/1990-08-01T00:00:00.000Z')).toBe(true);
});

test('drills down to hours and selects one', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    const storms = selector(page, 2);
    await expect(value(page, 2)).toHaveText('1990-08-01T00:00:00.000Z');
    await storms.locator('[data-key="1990-07"]').dblclick();
    await storms.locator('[data-key="1990-07-22"]').dblclick();
    await expect(storms.locator('.items')).toHaveAttribute('data-level', 'hours');
    await storms.locator('[data-key="1990-07-22T12"]').click();
    await expect(value(page, 2)).toHaveText('1990-07-22T12:00:00.000Z');
    await storms.locator('button[aria-label="Regresar"]').click();
    await expect(storms.locator('[data-key="1990-07-22"]')).toHaveAttribute('data-partial', 'true');
});

test('the inspector tells which path a layer can use', async ({ page }) => {
    await mock(page);
    await page.route('**/geoserver/wfs?**', async route => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('REQUEST') === 'DescribeFeatureType') {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ featureTypes: [{ properties: [{ name: 'obs_dateti', localType: 'date-time' }] }] }) });
            return;
        }
        const first = url.searchParams.get('SORTBY')?.endsWith(' A');
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ features: [{ properties: { obs_dateti: first ? '1990-07-22T06:00:00Z' : '2008-11-14T06:00:00Z' } }] }) });
    });
    await page.goto('/');
    await page.getByText('¿Mi capa es compatible?').click();
    await page.getByLabel('Capa').fill('geosolutions:storm_obs_test');
    await page.getByRole('button', { name: 'Revisar' }).click();
    const report = page.getByTestId('inspect-report');
    await expect(report).toHaveAttribute('data-path', 'both');
    await expect(report).toContainText('obs_dateti');
    await expect(report).toContainText("cqlTime: 'catalog'");
});

test('the selection lives in the URL', async ({ page }) => {
    await mock(page);
    await page.goto('/?fecha=2024-02');
    await expect(value(page, 0)).toHaveText('2024-02-01');
    await selector(page, 0).locator('[data-key="2024-03"]').click();
    await expect(value(page, 0)).toHaveText('2024-03-01');
    await expect.poll(() => new URL(page.url()).searchParams.get('fecha')).toBe('2024-03');
});
