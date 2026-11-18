# PMax Asset Group - Feed & Channel Reporting

Performance Max reports asset group results as one number. This script splits it two ways, by channel (Search, YouTube, Display and so on) and by feed vs non-feed, and writes the result to Google Sheets so you can see where spend and conversions actually come from.

| | |
| --- | --- |
| **Author** | Eliot Shiner, Bind Media |
| **Last updated** | 2026-11-18 |
| **Version** | 1.0.0 |
| **Runs on** | Single account |
| **Suggested schedule** | Daily |

## What it does

- Pulls asset group performance by date, campaign, asset group and channel.
- Pulls product (feed) performance from `asset_group_product_group_view`, counting leaf listing groups only (`UNIT_INCLUDED`) so a split product tree isn't double counted.
- Works out non-feed performance as asset group total minus feed.
- Runs both queries before writing anything. If either comes back empty, it stops and leaves the sheet as it was.

## Output

| Tab | One row per | Columns |
| --- | --- | --- |
| `asset groups` | date x campaign x asset group x channel | Impressions, clicks, cost, conversions, conversion value |
| `merged` | date x campaign x asset group | Each metric as total, feed and non-feed, plus a `Check` column |

The `Check` column flags rows where feed cost is higher than total cost (beyond `TOLERANCE`), or where there's feed data with no matching asset group row.

Both tabs are hidden in the template Sheet and the dashboard tabs read from them. Each run clears and rewrites them for the whole date range. Don't rename, reorder or edit them, or the dashboard will break.

## Setup

1. **[Make a copy of the template Google Sheet](https://docs.google.com/spreadsheets/d/18p-ZMXmIf2VNxzVmqAqAcmmScgDdSXz50vLnY6MqHZw/copy)**. It's already set up with the tabs the script writes to.
2. Authorise the Sheet's own Apps Script. The template includes a small script that keeps number formatting in step when you change the metric shown on the dashboard, and your copy needs your permission to run it:
   1. In your copy, go to **Extensions > Apps Script**.
   2. Make sure `onEdit` is selected in the function dropdown at the top, click **Run**, then **Review permissions** and choose your Google account.
   3. If you see **Google hasn't verified this app**, click **Advanced**, then **Go to (project name) (unsafe)**. This warning is normal for an Apps Script copied along with a Sheet.
   4. Click **Allow**, then close the Apps Script tab. The execution log may show an error, because `onEdit` expects a real edit to react to. That's expected: permission is granted and it will run automatically from then on.
3. Take your copy's ID from its URL: the long string between `/d/` and `/edit`. For example, in `https://docs.google.com/spreadsheets/d/abc123XYZ/edit`, the ID is `abc123XYZ`.
4. Copy [`script.js`](script.js).
5. In Google Ads, go to **Tools > Bulk actions > Scripts** and click **+** to add a new script.
6. Paste the code in and replace `YOUR_SPREADSHEET_ID` in the `CONFIG` block with your copy's ID.
7. Click **Authorise**, then **Preview** and check the logs.
8. Save and schedule it to run daily.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `SPREADSHEET_ID` | `'YOUR_SPREADSHEET_ID'` | The ID of your copy of the template Sheet. |
| `MONTHS_BACK` | `3` | Full months before the current one. `3` = three full months plus the current month to yesterday. |
| `TOLERANCE` | `0.01` | How far (in account currency) feed cost can exceed total cost before it's flagged. |
| `WRITE_CHUNK` | `10000` | Rows per write call, to avoid Sheets timeouts. |

## Notes and limitations

- The data tab names are fixed in the script to match the template Sheet, so they aren't in `CONFIG`.
- Large accounts with a long date range can produce a lot of rows. Lower `MONTHS_BACK` if the script times out.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-11-18 | First public release. |
