import { getReleaseSchema, cleanArtistName, durationToMinutes } from './utils.js';

export const DEBUG = false;

export const DEFAULT_SETTINGS = {
    fieldOrder: ['title', 'artist', 'type', 'genre', 'year', 'label',
        'runtime', 'tracks', 'personalRating', 'discogsRating', 'format',
        'timesListened', 'dateAdded', 'recommendedBy', 'coverUrl', 'link'],
    customEmptyFields: [],
    constantFields: [],
    separator: '\t',
    dateAddedFormat: 'iso',
    googleSheets: {
        serviceAccountJson: '',
        spreadsheetId: '',
        sheetName: 'Albums',
        columnMapping: []
    }
};

/**
 * Map a Discogs musicReleaseFormat string to the simplified "Format" column used
 * in the tracker sheet (Vinyl, Digital, CD, ...). Falls back to the raw value.
 */
function mapFormat(raw) {
    if (!raw) return '';
    const v = raw.toLowerCase();
    if (v.includes('vinyl')) return 'Vinyl';
    if (v.includes('cd')) return 'CD';
    if (v.includes('cassette')) return 'Cassette';
    if (v.includes('file') || v.includes('digital')) return 'Digital';
    return raw;
}

/**
 * Read the human-readable format descriptor row (e.g. "2 x Vinyl, LP, Album, Crystal Clear")
 * from the release info table on the page. Used to enrich the "Type" column.
 */
function getFormatDescriptors() {
    const rows = document.querySelectorAll('table tr, dl > div, .profile tr');
    for (const row of rows) {
        const head = row.querySelector('th, dt, .head');
        if (!head) continue;
        const label = head.textContent.trim().toLowerCase();
        if (label.startsWith('format')) {
            const body = row.querySelector('td, dd, .content');
            if (body) return body.textContent.replace(/\s+/g, ' ').trim();
        }
    }
    return '';
}

/**
 * Pick the most descriptive release-type term from the format descriptors,
 * matching the values typical in the Album tracker (Studio, Live, EP, ...).
 */
function detectReleaseType() {
    const text = getFormatDescriptors().toLowerCase();
    if (!text) return 'Studio';
    if (text.includes('live')) return 'Live';
    if (text.includes('compilation')) return 'Compilation';
    if (text.includes('soundtrack')) return 'Soundtrack';
    if (text.includes('mixtape')) return 'Mixtape';
    if (text.includes('remix')) return 'Remix';
    if (text.includes('single')) return 'Single';
    if (text.includes('ep')) return 'EP';
    if (text.includes('mini-album')) return 'Mini-Album';
    if (text.includes('album')) return 'Studio';
    return 'Studio';
}

function sumTrackDurations() {
    const cells = document.querySelectorAll('[data-track-position] [class*="duration_"]');
    if (!cells.length) return 0;
    let total = 0;
    cells.forEach(c => { total += durationToMinutes(c.textContent); });
    return total;
}

function countTracks() {
    return document.querySelectorAll('[data-track-position]').length;
}

export const FIELD_DEFINITIONS = {
    title: {
        label: 'Title',
        extract: () => {
            const s = getReleaseSchema();
            if (s && s.name) return s.name;
            const h1 = document.querySelector('h1');
            if (!h1) return '';
            const txt = h1.textContent.trim();
            const dashIdx = txt.lastIndexOf('–');
            return dashIdx > -1 ? txt.slice(dashIdx + 1).trim() : txt;
        },
        format: (value) => value
    },
    artist: {
        label: 'Artist',
        extract: () => {
            const s = getReleaseSchema();
            const a = s?.releaseOf?.byArtist;
            if (Array.isArray(a) && a.length) {
                return a.map(x => cleanArtistName(x.name)).filter(Boolean).join(', ');
            }
            if (a && a.name) return cleanArtistName(a.name);
            return '';
        },
        format: (value) => value
    },
    type: {
        label: 'Type',
        extract: () => detectReleaseType(),
        format: (value) => value
    },
    genre: {
        label: 'Genre',
        extract: () => {
            const s = getReleaseSchema();
            const g = s?.genre;
            if (Array.isArray(g)) return g[0] || '';
            return g || '';
        },
        format: (value) => value
    },
    year: {
        label: 'Year',
        extract: () => {
            const s = getReleaseSchema();
            if (s?.datePublished) return String(s.datePublished).slice(0, 4);
            const time = document.querySelector('time[datetime]');
            if (time) return time.getAttribute('datetime').slice(0, 4);
            return '';
        },
        format: (value) => value
    },
    label: {
        label: 'Label',
        extract: () => {
            const s = getReleaseSchema();
            const l = s?.recordLabel;
            if (Array.isArray(l) && l.length) return l.map(x => x.name).filter(Boolean).join(', ');
            if (l && l.name) return l.name;
            return '';
        },
        format: (value) => value
    },
    runtime: {
        label: 'Runtime (min)',
        extract: () => {
            const total = sumTrackDurations();
            return total > 0 ? Math.round(total) : '';
        },
        format: (value) => value
    },
    tracks: {
        label: 'Tracks',
        extract: () => {
            const n = countTracks();
            return n > 0 ? n : '';
        },
        format: (value) => value
    },
    personalRating: {
        label: 'Personal Rating',
        extract: () => '',
        format: (value) => value
    },
    discogsRating: {
        label: 'Discogs Rating',
        extract: () => {
            const s = getReleaseSchema();
            const r = s?.offers?.itemOffered?.aggregateRating?.ratingValue
                ?? s?.aggregateRating?.ratingValue;
            return r != null ? String(r) : '';
        },
        format: (value) => value
    },
    format: {
        label: 'Format',
        extract: () => {
            const s = getReleaseSchema();
            return mapFormat(s?.musicReleaseFormat);
        },
        format: (value) => value
    },
    timesListened: {
        label: 'Times Listened',
        extract: () => '',
        format: (value) => value
    },
    dateAdded: {
        label: 'Date Added',
        extract: () => new Date(),
        format: (value, settings) => {
            const formats = {
                'full': value.toLocaleDateString('en-UK', { year: 'numeric', month: 'short', day: 'numeric' }),
                'iso': value.toISOString().split('T')[0],
                'us': value.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            };
            return formats[settings.dateAddedFormat] || formats.iso;
        }
    },
    recommendedBy: {
        label: 'Recommended By',
        extract: () => '',
        format: (value) => value
    },
    coverUrl: {
        label: 'Cover URL',
        extract: () => {
            const s = getReleaseSchema();
            if (s?.image) return s.image;
            const og = document.querySelector('meta[property="og:image"]');
            return og ? og.getAttribute('content') : '';
        },
        format: (value) => value
    },
    link: {
        label: 'Discogs Link',
        extract: () => {
            const s = getReleaseSchema();
            if (s?.['@id']) return s['@id'];
            const canonical = document.querySelector('link[rel="canonical"]');
            return canonical ? canonical.href : window.location.href;
        },
        format: (value) => value
    }
};
