import { extractReviewSection, formatReviewSection } from './utils.js';

export const DEBUG = false;

export const DEFAULT_SETTINGS = {
    fieldOrder: [
        'title', 'seriesName', 'seriesNumber', 'author', 'pages', 'type', 'pubDate', 'storygraphRating', 'reviewCount',
        'genres', 'moods', 'pace', 'plotVsCharacter', 'strongCharDev',
        'loveableChars', 'diverseCast', 'flawsAsFocus',
        'coverUrl', 'link', 'dateAdded', 'personalRating'
    ],
    customEmptyFields: [],
    constantFields: [],
    separator: '\t',
    dateAddedFormat: 'iso',
    communityReviewFormat: 'full',
    googleSheets: {
        serviceAccountJson: '',
        spreadsheetId: '',
        sheetName: 'Books',
        columnMapping: []
    }
};

function getAuthors() {
    const container = document.querySelector('.book-title-author-and-series');
    if (!container) return '';
    const authors = [];
    for (const p of container.querySelectorAll('p.font-body')) {
        if (p.textContent.includes('Translator') || p.textContent.includes('Narrator')) continue;
        for (const a of p.querySelectorAll('a')) {
            const name = a.textContent.trim();
            if (name) authors.push(name);
        }
    }
    return authors.join(', ');
}

function getPages() {
    for (const el of document.querySelectorAll('.toggle-edition-info-link')) {
        const match = el.textContent.trim().match(/^(\d+)\s+pages$/);
        if (match) return match[1];
    }
    return '';
}

function getCommunityField(headingText) {
    return {
        extract: () => extractReviewSection(headingText),
        format: (value, settings) => formatReviewSection(value, settings.communityReviewFormat)
    };
}

function getSeriesEl() {
    const container = document.querySelector('.book-title-author-and-series');
    return container ? container.querySelector('p.font-semibold.tracking-tight') : null;
}

export const FIELD_DEFINITIONS = {
    title: {
        label: 'Title',
        extract: () => {
            const el = document.querySelector('.book-title-author-and-series h3.font-serif, .book-title-author-and-series h3.font-semibold');
            return el ? el.textContent.trim() : '';
        },
        format: (value) => value
    },
    seriesName: {
        label: 'Series Name',
        extract: () => {
            const links = getSeriesEl()?.querySelectorAll('a');
            return links?.[0]?.textContent.trim() ?? '';
        },
        format: (value) => value
    },
    seriesNumber: {
        label: 'Series Number',
        extract: () => {
            const links = getSeriesEl()?.querySelectorAll('a');
            return links?.[1]?.textContent.trim().replace(/^#/, '') ?? '';
        },
        format: (value) => value
    },
    author: {
        label: 'Author',
        extract: getAuthors,
        format: (value) => value
    },
    pages: {
        label: 'Pages',
        extract: getPages,
        format: (value) => value
    },
    pubDate: {
        label: 'Pub Date',
        extract: () => {
            for (const p of document.querySelectorAll('.edition-info p.text-sm')) {
                const label = p.querySelector('span.font-semibold');
                if (label?.textContent.trim() === 'Edition Pub Date:') {
                    return p.textContent.replace(label.textContent, '').trim();
                }
            }
            return '';
        },
        format: (value) => value
    },
    type: {
        label: 'Type',
        extract: () => {
            const pages = parseInt(getPages(), 10);
            if (isNaN(pages)) return '';
            if (pages <= 40) return 'Short Story';
            if (pages <= 300) return 'Novella';
            return 'Novel';
        },
        format: (value) => value
    },
    storygraphRating: {
        label: 'Rating',
        extract: () => {
            const frame = document.querySelector('turbo-frame#community_reviews');
            const el = (frame || document).querySelector('.average-star-rating');
            return el ? el.textContent.trim() : '';
        },
        format: (value) => value
    },
    reviewCount: {
        label: 'Review Count',
        extract: () => {
            const frame = document.querySelector('turbo-frame#community_reviews');
            if (!frame) return '';
            const div = frame.querySelector('[aria-label*="based on"]');
            if (!div) return '';
            const m = div.getAttribute('aria-label').match(/based on (\d+) reviews/);
            return m ? m[1] : '';
        },
        format: (value) => value
    },
    genres: {
        label: 'Genres',
        extract: () => {
            const section = document.querySelector('.book-page-tag-section');
            if (!section) return '';
            return Array.from(section.querySelectorAll('span'))
                .map(s => s.textContent.trim())
                .filter(Boolean)
                .join(', ');
        },
        format: (value) => value
    },
    moods: {
        label: 'Moods',
        extract: () => {
            const frame = document.querySelector('turbo-frame#community_reviews');
            if (!frame) return '';
            return Array.from(frame.querySelectorAll('.moods-list-reviews .mood-item p'))
                .map(p => p.textContent.trim())
                .join(', ');
        },
        format: (value) => value
    },
    pace: { label: 'Pace', ...getCommunityField('Pace') },
    plotVsCharacter: { label: 'Plot vs Character', ...getCommunityField('Plot or character driven?') },
    strongCharDev: { label: 'Strong Char. Dev.', ...getCommunityField('Strong character development?') },
    loveableChars: { label: 'Loveable Characters', ...getCommunityField('Loveable characters?') },
    diverseCast: { label: 'Diverse Cast', ...getCommunityField('Diverse cast of characters?') },
    flawsAsFocus: { label: 'Flaws as Focus', ...getCommunityField('Flaws of characters a main focus?') },
    coverUrl: {
        label: 'Cover URL',
        extract: () => {
            const og = document.querySelector('meta[property="og:image"]');
            return og ? og.getAttribute('content') : '';
        },
        format: (value) => value
    },
    link: {
        label: 'StoryGraph Link',
        extract: () => {
            const canonical = document.querySelector('link[rel="canonical"]');
            return canonical ? canonical.href : window.location.href;
        },
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
    personalRating: {
        label: 'Personal Rating',
        extract: () => '',
        format: (value) => value
    }
};
