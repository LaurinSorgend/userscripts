import { GM_xmlhttpRequest } from '$';

/**
 * Shared Obsidian Local REST API connection used by the "*ToObsidian" userscripts.
 * Talks to the community plugin "Local REST API" (https://127.0.0.1:27123 by
 * default, plain HTTP on loopback) via GM_xmlhttpRequest so CORS is not an
 * issue, mirroring how GoogleSheetsManager talks to the Sheets API.
 *
 * Unlike the Sheets manager, there is no spreadsheet-column concept: the
 * caller passes a plain object already keyed by vault frontmatter field
 * names (e.g. { title, author, category, pages, ... }), and this class only
 * knows how to turn that into a note at Books/<sanitised title>.md, upsert
 * it, and diff/patch individual frontmatter fields on an existing note.
 *
 * The manager is agnostic of the concrete settings store: it only needs an
 * object exposing `getObsidianSettings()` (i.e. a SettingsManager instance).
 */

const FIELD_LABELS = {
    title: 'Title',
    author: 'Author',
    category: 'Category',
    pages: 'Pages',
    published: 'Published',
    country: 'Country',
    series: 'Series',
    series_index: 'Series Index',
    goodreads: 'Goodreads Rating',
    interest: 'Interest',
    date_added: 'Date Added',
    recommended_by: 'Recommended By',
    link: 'Link',
    genres: 'Genres',
    moods: 'Moods',
    pace: 'Pace',
    storygraph: 'StoryGraph Polls',
    cover_source: 'Cover Source'
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COERCED = /^(y|n|yes|no|true|false|on|off|null|~)$/i;
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const LEADING_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;

function needsQuotes(s) {
    if (s === '') return true;
    if (/^\s|\s$/.test(s)) return true;
    if (LEADING_INDICATOR.test(s)) return true;
    if (/:\s|:$|\s#/.test(s)) return true;
    if (/["\\]/.test(s)) return true;
    if (s.includes(',')) return true;
    if (COERCED.test(s)) return true;
    if (NUMERIC.test(s)) return true;
    if (ISO_DATE.test(s)) return false; // deliberately a YAML date
    return false;
}

function scalar(v) {
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    const s = String(v);
    if (!needsQuotes(s)) return s;
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function isPlainObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function yamlLines(obj, depth) {
    const pad = '  '.repeat(depth);
    const out = [];
    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined || value === '') continue;
        if (Array.isArray(value)) {
            if (value.length === 0) continue;
            out.push(`${pad}${key}:`);
            for (const item of value) out.push(`${pad}  - ${scalar(item)}`);
        } else if (isPlainObject(value)) {
            const nested = yamlLines(value, depth + 1);
            if (nested.length === 0) continue;
            out.push(`${pad}${key}:`);
            out.push(...nested);
        } else {
            out.push(`${pad}${key}: ${scalar(value)}`);
        }
    }
    return out;
}

/** Matches Templates/Book.md's own sanitiser in books_vault. */
export function sanitizeFilename(title) {
    return title
        .replace(/\s*[:/]\s*/g, ' - ')
        .replace(/[\\*?"<>|#^[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Matches the tag scheme Templates/Book.md writes. */
export function buildTags({ category, country }) {
    const tags = ['book'];
    if (category) tags.push('book/' + category.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    if (country) tags.push('country/' + country.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    return tags;
}

/** Full new-note content: frontmatter block + the same body scaffold Templates/Book.md writes. */
function buildNoteContent(fmData, filename) {
    const fields = { type: 'book', title: fmData.title };
    if (filename !== fmData.title) fields.aliases = [fmData.title];
    Object.assign(fields, {
        author: fmData.author,
        category: fmData.category,
        pages: fmData.pages,
        published: fmData.published,
        country: fmData.country,
        series: fmData.series,
        series_index: fmData.series_index,
        goodreads: fmData.goodreads,
        interest: fmData.interest,
        date_added: fmData.date_added,
        recommended_by: fmData.recommended_by,
        link: fmData.link,
        genres: fmData.genres,
        moods: fmData.moods,
        pace: fmData.pace,
        storygraph: fmData.storygraph,
        cover_source: fmData.cover_source,
        tags: fmData.tags
    });

    const frontmatter = ['---', ...yamlLines(fields, 0), '---'].join('\n');
    return `${frontmatter}

\`\`\`button
name Start Reading
type command
action Templater: Insert Start Reading
\`\`\`

## Readings

\`\`\`dataview
TABLE WITHOUT ID file.link AS "Reading", start AS "Started", end AS "Finished", rating AS "Rating", format AS "Format"
FROM [[]] AND #reading
SORT end DESC
\`\`\`

## Notes
`;
}

function isEmpty(v) {
    if (v === undefined || v === null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (isPlainObject(v)) return Object.keys(v).length === 0;
    return false;
}

function display(v) {
    if (isEmpty(v)) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (isPlainObject(v)) {
        return Object.entries(v).map(([k, val]) => {
            if (isPlainObject(val)) {
                return `${k}: {${Object.entries(val).map(([k2, v2]) => `${k2} ${v2}%`).join(', ')}}`;
            }
            return `${k}: ${val}`;
        }).join('; ');
    }
    return String(v);
}

export default class ObsidianManager {
    constructor(settings) {
        this.settings = settings;
    }

    getObsidianSettings() {
        return this.settings.getObsidianSettings();
    }

    baseUrl() {
        const { baseUrl } = this.getObsidianSettings();
        if (!baseUrl) throw new Error('Obsidian settings are not configured. Please open the settings modal to configure the Local REST API URL and key.');
        return baseUrl.replace(/\/+$/, '');
    }

    apiKey() {
        const { apiKey } = this.getObsidianSettings();
        if (!apiKey) throw new Error('Obsidian settings are not configured. Please open the settings modal to configure the Local REST API URL and key.');
        return apiKey;
    }

    vaultUrl(path) {
        return `${this.baseUrl()}/vault/${path.split('/').map(encodeURIComponent).join('/')}`;
    }

    async testConnection() {
        return this._request('GET', `${this.baseUrl()}/`, { headers: { Accept: 'application/json' } });
    }

    /**
     * Create or update the book note for `fmData` (plain object keyed by vault
     * frontmatter field names; must include `title`). Mirrors
     * GoogleSheetsManager.upsert's contract: empty incoming values never
     * overwrite existing data, and an optional resolveConflicts(diffs) async
     * callback (the same shape SettingsUI.showMergeDialog expects/returns)
     * can let the user pick a value per changed field.
     *
     * @returns {Promise<{action:'created'|'updated'|'unchanged'|'cancelled', path:string}>}
     */
    async upsert(fmData, resolveConflicts) {
        if (!fmData || !fmData.title) throw new Error('Cannot save to Obsidian without a title.');

        const filename = sanitizeFilename(fmData.title);
        const path = `Books/${filename}.md`;
        const existing = await this._getNote(path);

        if (!existing) {
            await this._putNote(path, buildNoteContent(fmData, filename));
            return { action: 'created', path };
        }

        const { diffs, real } = this._diff(fmData, existing.frontmatter || {});
        if (!diffs.length) return { action: 'unchanged', path };

        let chosen = {};
        for (const d of diffs) chosen[d.key] = real[d.key].incoming;

        if (typeof resolveConflicts === 'function') {
            const resolution = await resolveConflicts(diffs);
            if (resolution === null) return { action: 'cancelled', path };
            for (const d of diffs) {
                const picked = resolution[d.index];
                chosen[d.key] = (picked === d.existing) ? real[d.key].existing : real[d.key].incoming;
            }
        }

        for (const [key, value] of Object.entries(chosen)) {
            if (isEmpty(value)) continue; // never blank out existing data
            await this._patchFrontmatterField(path, key, value);
        }
        return { action: 'updated', path };
    }

    /** Diff incoming frontmatter fields against an existing note's parsed frontmatter. */
    _diff(fmData, existingFm) {
        const diffs = [];
        const real = {};
        for (const [key, value] of Object.entries(fmData)) {
            if (isEmpty(value)) continue;
            const existingVal = existingFm[key];
            const existingDisplay = display(existingVal);
            const incomingDisplay = display(value);
            if (existingDisplay === incomingDisplay) continue;
            diffs.push({ index: key, key, label: FIELD_LABELS[key] || key, existing: existingDisplay, incoming: incomingDisplay });
            real[key] = { existing: existingVal, incoming: value };
        }
        return { diffs, real };
    }

    async _getNote(path) {
        try {
            return await this._request('GET', this.vaultUrl(path), {
                headers: { Accept: 'application/vnd.olrapi.note+json' }
            });
        } catch (err) {
            if (err.status === 404) return null;
            throw err;
        }
    }

    async _putNote(path, content) {
        await this._request('PUT', this.vaultUrl(path), {
            headers: { 'Content-Type': 'text/markdown' },
            data: content
        });
    }

    async _patchFrontmatterField(path, key, value) {
        await this._request('PATCH', this.vaultUrl(path), {
            headers: {
                'Content-Type': 'application/json',
                Operation: 'replace',
                'Target-Type': 'frontmatter',
                Target: key
            },
            data: JSON.stringify(value)
        });
    }

    _request(method, url, { headers = {}, data } = {}) {
        const apiKey = this.apiKey();
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                headers: { Authorization: `Bearer ${apiKey}`, ...headers },
                data,
                onload: (response) => {
                    if (response.status === 404) {
                        const err = new Error('Not found');
                        err.status = 404;
                        reject(err);
                        return;
                    }
                    if (response.status >= 200 && response.status < 300) {
                        if (!response.responseText) { resolve(null); return; }
                        try { resolve(JSON.parse(response.responseText)); }
                        catch (e) { resolve(response.responseText); }
                        return;
                    }
                    let message = response.responseText || `HTTP ${response.status}`;
                    try { message = JSON.parse(response.responseText).message || message; } catch (e) { /* not JSON */ }
                    const err = new Error(`Obsidian API error: ${message}`);
                    err.status = response.status;
                    reject(err);
                },
                onerror: () => reject(new Error('Network error reaching the Obsidian Local REST API — is Obsidian running with the plugin enabled?')),
                ontimeout: () => reject(new Error('Obsidian request timed out'))
            });
        });
    }

    validateSettings() {
        const { baseUrl, apiKey } = this.getObsidianSettings();
        const errors = [];
        if (!baseUrl) errors.push('Obsidian Local REST API URL is required');
        if (!apiKey) errors.push('Obsidian Local REST API key is required');
        return errors;
    }
}
