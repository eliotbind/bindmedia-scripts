# Bind Media Scripts

Free, open-source Google Ads scripts built by the team at [Bind Media](https://bind.media).

We write these scripts for our own paid search work and publish them so other advertisers, agencies and in-house teams can use them too. Each one is self-contained: copy it into your Google Ads account, edit a few settings and run it.

## Scripts

### Google Ads

| Script | What it does |
| --- | --- |
| [PMax Asset Group - Feed & Channel Reporting](google-ads/pmax-asset-group-feed-channel-reporting) | Exports Performance Max asset group performance to Google Sheets, split by channel and by feed vs non-feed. |

## Using a script

1. Open the script's folder and read its README.
2. Copy `script.js`.
3. In Google Ads, go to **Tools > Bulk actions > Scripts** and click **+** to add a new script.
4. Paste the code in and edit the `CONFIG` block at the top.
5. Click **Authorise**, run **Preview** and check the logs before scheduling.

Every script follows the same layout: a header saying who wrote it and when it was last updated, a `CONFIG` block with every setting you need to change, then the code.

## Repository layout

```
google-ads/
  <script-name>/
    script.js     the code you paste into Google Ads
    README.md     what it does, setup, settings and changelog
```

## Disclaimer

These scripts are provided as is, without warranty. Scripts can change live campaigns and spend, so always run Preview first and check the results on your own account. Bind Media accepts no liability for changes made by running them.

## Feedback and contributions

Found a bug or have an idea? [Open an issue](https://github.com/eliotbind/bindmedia-scripts/issues). Pull requests are welcome.

## Licence

Released under the [MIT Licence](LICENSE). Copyright (c) 2026 Bind Media LTD.
