# Discogs to Google Sheets

Adds a small floating button bar to Discogs release / master pages that sends album information directly to a Google Sheet via the Google Sheets API. Mirrors the architecture of `goodreadsToGoogleSheets`.

## Features

- One-click album export from any Discogs release or master page
- Pulls data straight from the page's `application/ld+json` release schema (stable, not dependent on CSS-module class hashes)
- Customizable column mapping against your existing sheet headers
- Drag-to-reorder field list, plus user-defined empty / constant columns
- Settings stored locally in your userscript manager

## Default fields

| Field            | Source on Discogs                                        |
|------------------|----------------------------------------------------------|
| Title            | JSON-LD `name`                                           |
| Artist           | JSON-LD `releaseOf.byArtist[].name` (deduplicated)       |
| Type             | Detected from format descriptors (Studio / Live / EP …)  |
| Genre            | JSON-LD `genre[0]`                                       |
| Year             | JSON-LD `datePublished`                                  |
| Label            | JSON-LD `recordLabel[].name`                             |
| Runtime (min)    | Sum of track durations in the tracklist                  |
| Tracks           | Number of `[data-track-position]` rows                   |
| Personal Rating  | Empty (fill manually)                                    |
| Discogs Rating   | JSON-LD aggregate rating                                 |
| Format           | JSON-LD `musicReleaseFormat` (Vinyl / CD / Digital …)    |
| Times Listened   | Empty (fill manually)                                    |
| Date Added       | Today                                                    |
| Recommended By   | Empty (fill manually)                                    |
| Cover URL        | JSON-LD `image` or `og:image`                            |
| Discogs Link     | JSON-LD `@id` / canonical URL                            |

## Build

```
bun run build:discogs
# or
cd discogsToGoogleSheets && vite build
```

The built userscript lands in `dist/discogsToGoogleSheets.user.js`.

## Setup

Identical to `goodreadsToGoogleSheets`:

1. Enable the Google Sheets API in a Google Cloud project.
2. Create a service account, download the JSON key.
3. Share your spreadsheet with the service account email.
4. Install the userscript in Violentmonkey/Tampermonkey.
5. Open any Discogs release page, click the gear icon in the floating bar, paste credentials, set the sheet name (default: `Albums`), and map columns.

## Matching the Album & Vinyl Tracker sheet

The default field order matches the columns of the bundled `Album_Vinyl_Tracker.xlsx`
Albums tab: Title · Artist · Type · Genre · Year · Label · Runtime (min) · Tracks ·
Rating · Discogs · Format · Times Listened · Date Added · Recommended By · Cover URL · Discogs Link.

Use *Test & Load Columns* in settings to auto-match against your real headers.
