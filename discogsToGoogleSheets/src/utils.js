export { getText, waitForElement } from '../../shared/utils.js';

/**
 * Parses the Discogs JSON-LD release/master schema embedded in the page.
 * Returns null when the script tag is missing or invalid.
 */
export function getReleaseSchema() {
    const el = document.querySelector('script#release_schema, script[type="application/ld+json"]');
    if (!el) return null;
    try {
        return JSON.parse(el.textContent);
    } catch {
        return null;
    }
}

/**
 * Strip the trailing disambiguation number Discogs appends to artist names,
 * e.g. "Rosalía (3)" -> "Rosalía".
 */
export function cleanArtistName(name) {
    if (!name) return '';
    return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}

/**
 * Convert a Discogs track duration "m:ss" or "h:mm:ss" string to a minute total (float).
 */
export function durationToMinutes(text) {
    if (!text) return 0;
    const parts = text.trim().split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else seconds = parts[0];
    return seconds / 60;
}
