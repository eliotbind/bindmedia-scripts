/**
 * ==============================================================================
 * PMax Asset Group - Feed & Channel Reporting
 * ==============================================================================
 *
 * Exports Performance Max asset group performance to Google Sheets, split by
 * channel (ad network) and by feed vs non-feed.
 *
 * Author:        Eliot Shiner, Bind Media
 * Last updated:  2026-11-18
 * Version:       1.0.0
 * Licence:       MIT, see LICENSE in the repository root
 * Source:        https://github.com/eliotbind/bindmedia-scripts
 *
 * ------------------------------------------------------------------------------
 * How it works
 * ------------------------------------------------------------------------------
 * - Tab 'asset groups': performance by date x campaign x asset group x channel.
 * - Tab 'merged': total vs feed vs non-feed by date x campaign x asset group.
 * - Feed figures come from asset_group_product_group_view (leaf listing groups
 *   only), totalled in memory. Non-feed = asset group total minus feed.
 * - Date range: 1st of the month MONTHS_BACK months ago, up to yesterday.
 * - Both queries run before anything is written, so a failed run leaves the
 *   sheet unchanged.
 * - Both tabs are hidden in the template Sheet and feed its dashboard, which
 *   relies on their names, column order and headers. Don't change them.
 *
 * ------------------------------------------------------------------------------
 * Setup
 * ------------------------------------------------------------------------------
 * 1. Make a copy of the template Google Sheet:
 *    https://docs.google.com/spreadsheets/d/18p-ZMXmIf2VNxzVmqAqAcmmScgDdSXz50vLnY6MqHZw/copy
 * 2. In your copy, go to Extensions > Apps Script, select onEdit, click Run and
 *    allow the permissions. This authorises the Sheet's own script that keeps
 *    number formatting in step when you change the dashboard metric. An error
 *    in its log at this point is expected.
 * 3. Paste your copy's ID into CONFIG.SPREADSHEET_ID below.
 * 4. In Google Ads, go to Tools > Bulk actions > Scripts and add a new script.
 * 5. Paste this file in, authorise it and run Preview before scheduling.
 *
 * Provided as is, without warranty. Test in Preview before running on a live account!
 */

// ==============================================================================
// CONFIGURATION
// ==============================================================================

const CONFIG = {
  // ID of your copy of the template Sheet (the long string in its URL between /d/ and /edit).
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',

  // Full months before the current one. 3 = three full months + current month to date.
  MONTHS_BACK: 3,

  // Feed cost can exceed total cost by this much (currency units) before it's flagged.
  TOLERANCE: 0.01,

  // Rows per write call, to stay clear of Sheets timeouts.
  WRITE_CHUNK: 10000,
};

// Data tab names. These match the hidden tabs in the template Sheet and the
// dashboard reads from them, so they aren't user settings. Don't change them.
const TAB_ASSET_GROUPS = 'asset groups';
const TAB_MERGED = 'merged';

const METRIC_NAMES = ['Impressions', 'Clicks', 'Cost', 'Conversions', 'Conversion Value'];

// ==============================================================================
// SCRIPT EXECUTION
// ==============================================================================

function main() {
  const dateRange = getDateRange(CONFIG.MONTHS_BACK);
  Logger.log(`Date range: ${dateRange}`);

  // 1. Query everything first
  const agRows = getAssetGroupRows(dateRange);
  const feedTotals = getFeedTotals(dateRange);

  // 2. Refuse to overwrite good data with an empty pull
  if (agRows.length === 0) {
    throw new Error('Asset group query returned no rows. Sheet not updated.');
  }
  if (feedTotals.size === 0) {
    throw new Error('Feed query returned no leaf rows, so every feed figure would be 0. Sheet not updated.');
  }

  // 3. Write
  const spreadsheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  writeAssetGroupTab(spreadsheet, agRows);
  writeMergedTab(spreadsheet, agRows, feedTotals);

  Logger.log('Export complete.');
}

// ==============================================================================
// QUERIES
// ==============================================================================

function getAssetGroupRows(dateRange) {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      asset_group.id,
      asset_group.name,
      segments.ad_network_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM asset_group
    WHERE segments.date BETWEEN ${dateRange}
      AND metrics.impressions > 0
  `;

  const records = [];
  const report = AdsApp.search(query);
  while (report.hasNext()) {
    const row = report.next();
    records.push({
      date: row.segments.date,
      campaignId: String(row.campaign.id),
      campaignName: row.campaign.name,
      assetGroupId: String(row.assetGroup.id),
      assetGroupName: row.assetGroup.name,
      channel: row.segments.adNetworkType,
      m: metricsOf_(row),
    });
  }
  Logger.log(`Asset groups: ${records.length} rows.`);
  return records;
}

// Returns a Map of "date|campaignId|assetGroupId" -> { date, campaignName, assetGroupName, m }
function getFeedTotals(dateRange) {
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      asset_group.id,
      asset_group.name,
      asset_group_listing_group_filter.type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM asset_group_product_group_view
    WHERE segments.date BETWEEN ${dateRange}
      AND metrics.impressions > 0
  `;

  const totals = new Map();
  let used = 0;
  const report = AdsApp.search(query);
  while (report.hasNext()) {
    const row = report.next();
    const filter = row.assetGroupListingGroupFilter || {};

    // Only leaf nodes count, so parent nodes in a split product tree can't double count.
    if (filter.type !== 'UNIT_INCLUDED') continue;

    const key = [row.segments.date, String(row.campaign.id), String(row.assetGroup.id)].join('|');
    let t = totals.get(key);
    if (!t) {
      t = {
        date: row.segments.date,
        campaignName: row.campaign.name,
        assetGroupName: row.assetGroup.name,
        m: zeros_(),
      };
      totals.set(key, t);
    }
    metricsOf_(row).forEach((v, i) => { t.m[i] += v; });
    used++;
  }
  Logger.log(`Feed: ${used} leaf rows summed into ${totals.size} date x asset group totals.`);
  return totals;
}

// ==============================================================================
// WRITES
// ==============================================================================

function writeAssetGroupTab(spreadsheet, agRows) {
  const headers = [
    'Date', 'Campaign ID', 'Campaign Name', 'Asset Group ID', 'Asset Group Name',
    'Channel (Ad Network)', ...METRIC_NAMES,
  ];
  const rows = agRows.map(r => [
    r.date, r.campaignId, r.campaignName, r.assetGroupId, r.assetGroupName, r.channel, ...r.m,
  ]);
  writeSheet_(spreadsheet, TAB_ASSET_GROUPS, headers, rows);
}

function writeMergedTab(spreadsheet, agRows, feedTotals) {
  const COST = METRIC_NAMES.indexOf('Cost');
  const groups = new Map();

  function groupFor(key, date, campaignName, assetGroupName) {
    let g = groups.get(key);
    if (!g) {
      g = { date, campaignName, assetGroupName, total: zeros_(), feed: zeros_(), hasAg: false };
      groups.set(key, g);
    }
    return g;
  }

  // Asset group totals, summed across channels
  agRows.forEach(r => {
    const g = groupFor([r.date, r.campaignId, r.assetGroupId].join('|'),
      r.date, r.campaignName, r.assetGroupName);
    g.hasAg = true;
    r.m.forEach((v, i) => { g.total[i] += v; });
  });

  // Feed totals
  feedTotals.forEach((t, key) => {
    const g = groupFor(key, t.date, t.campaignName, t.assetGroupName);
    t.m.forEach((v, i) => { g.feed[i] += v; });
  });

  const headers = ['Date', 'Campaign Name', 'Asset Group Name'];
  METRIC_NAMES.forEach(n => headers.push(`${n} (total)`, `${n} (feed)`, `${n} (non-feed)`));
  headers.push('Check');

  let flagged = 0;
  const rows = Array.from(groups.values())
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      a.campaignName.localeCompare(b.campaignName) ||
      a.assetGroupName.localeCompare(b.assetGroupName))
    .map(g => {
      const row = [g.date, g.campaignName, g.assetGroupName];
      METRIC_NAMES.forEach((_, i) => row.push(g.total[i], g.feed[i], g.total[i] - g.feed[i]));

      let check = '';
      if (!g.hasAg) check = 'Feed data, no asset group row';
      else if (g.feed[COST] > g.total[COST] + CONFIG.TOLERANCE) check = 'Feed cost > total';
      if (check) flagged++;

      row.push(check);
      return row;
    });

  writeSheet_(spreadsheet, TAB_MERGED, headers, rows);
  if (flagged) Logger.log(`Merged: ${flagged} rows flagged in the Check column.`);
}

// ==============================================================================
// HELPERS
// ==============================================================================

// The five metrics from a query row, in METRIC_NAMES order; cost converted from micros.
function metricsOf_(row) {
  return [
    Number(row.metrics.impressions || 0),
    Number(row.metrics.clicks || 0),
    Number(row.metrics.costMicros || 0) / 1000000,
    Number(row.metrics.conversions || 0),
    Number(row.metrics.conversionsValue || 0),
  ];
}

function zeros_() {
  return new Array(METRIC_NAMES.length).fill(0);
}

// Clears the tab, writes headers + rows in chunks, then trims unused rows so
// whole-column formulas on the dashboard don't scan an oversized grid.
function writeSheet_(spreadsheet, tabName, headers, rows) {
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) sheet = spreadsheet.insertSheet(tabName);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  for (let start = 0; start < rows.length; start += CONFIG.WRITE_CHUNK) {
    const chunk = rows.slice(start, start + CONFIG.WRITE_CHUNK);
    sheet.getRange(2 + start, 1, chunk.length, headers.length).setValues(chunk);
    SpreadsheetApp.flush();
  }

  const keep = Math.max(rows.length + 1, 2);
  const maxRows = sheet.getMaxRows();
  if (maxRows > keep) sheet.deleteRows(keep + 1, maxRows - keep);

  Logger.log(`${tabName}: wrote ${rows.length} rows.`);
  return sheet;
}

// 1st of the month `monthsBack` months ago, up to yesterday, in the account's time zone.
function getDateRange(monthsBack) {
  const tz = AdsApp.currentAccount().getTimeZone();
  const [year, month, day] = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd').split('-').map(Number);

  const start = new Date(Date.UTC(year, month - 1 - monthsBack, 1));
  const end = new Date(Date.UTC(year, month - 1, day - 1));

  const format = d => Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  return `'${format(start)}' AND '${format(end)}'`;
}
