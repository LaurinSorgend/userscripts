import { getText, getMonthNumber, extractPageCount } from './utils.js';
import { buildTags } from '../../shared/ObsidianManager.js';

export const DEBUG = false;

export const DEFAULT_SETTINGS = {
    fieldOrder: ['title', 'seriesName', 'seriesNumber', 'type', 'pages',
        'goodreadsRating', 'author', 'publishDate', 'dateAdded', 'link'],
    customEmptyFields: [],
    constantFields: [],
    separator: '\t',
    authorFormat: 'lastFirst',
    dateFormat: 'iso',
    dateAddedFormat: 'iso',
    obsidian: {
        baseUrl: 'http://127.0.0.1:27123',
        apiKey: ''
    }
};

// Same DOM extraction as goodreadsToGoogleSheets — only the destination changed.
export const FIELD_DEFINITIONS = {
    title: {
        label: 'Title',
        extract: () => getText('h1.Text__title1', ['.BookPageTitleSection h1', '.BookPageTitleSection__title']),
        format: (value) => value
    },
    seriesName: {
        label: 'Series Name',
        extract: () => {
            const elements = document.querySelectorAll('h3.Text__title3 a, .BookPageTitleSection__series a');
            if (!elements.length) return '';

            const text = elements[0].textContent.trim();
            const match = text.match(/^(.+?)\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
            return match ? match[1].trim() : text;
        },
        format: (value) => value
    },
    seriesNumber: {
        label: 'Series Number',
        extract: () => {
            const elements = document.querySelectorAll('h3.Text__title3 a, .BookPageTitleSection__series a');
            if (!elements.length) return '';

            const text = elements[0].textContent.trim();
            const match = text.match(/\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
            return match ? match[1] : '';
        },
        format: (value) => value
    },
    type: {
        label: 'Type',
        extract: () => {
            const pages = extractPageCount();
            if (!pages) return '';
            const pageNum = parseInt(pages, 10);
            if (pageNum <= 40) return 'Short Story';
            if (pageNum <= 300) return 'Novella';
            return 'Novel';
        },
        format: (value) => value
    },
    pages: {
        label: 'Pages',
        extract: () => extractPageCount(),
        format: (value) => value
    },
    goodreadsRating: {
        label: 'Goodreads Rating',
        extract: () => getText('.RatingStatistics__rating', ['[data-testid="averageRating"]', '.BookPageMetadataSection__ratingStats span']),
        format: (value) => value
    },
    author: {
        label: 'Author',
        extract: () => getText('.ContributorLink__name', ['.BookPageMetadataSection__contributor a', '.AuthorLink__name']),
        format: (value, settings) => {
            if (!value) return '';
            if (settings.authorFormat === 'lastFirst') {
                const parts = value.split(' ');
                if (parts.length > 1) {
                    const last = parts.pop();
                    const first = parts.join(' ');
                    return `${last}, ${first}`;
                }
            }
            return value;
        }
    },
    publishDate: {
        label: 'Published Date',
        extract: () => {
            const pubEl = document.querySelector('p[data-testid="publicationInfo"]');
            let text = pubEl ? pubEl.textContent.trim() : getText('.BookDetails__row span', ['.BookDetails__publication']);

            if (!text) return '';

            const fullMatch = text.match(/(?:First |)published\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
            if (fullMatch) return { month: fullMatch[1], day: fullMatch[2], year: fullMatch[3] };

            const yearMatch = text.match(/(?:First |)published\s+(\d{4})/i);
            if (yearMatch) return { year: yearMatch[1] };

            return '';
        },
        format: (value, settings) => {
            if (!value || typeof value === 'string') return value;

            const formats = {
                'full': `${value.month} ${value.day}, ${value.year}`,
                'yearOnly': value.year,
                'iso': value.month && value.day ?
                    `${value.year}-${String(getMonthNumber(value.month)).padStart(2, '0')}-${String(value.day).padStart(2, '0')}` :
                    value.year
            };

            return formats[settings.dateFormat] || formats.full;
        }
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
            return formats[settings.dateAddedFormat] || formats.full;
        }
    },
    link: {
        label: 'Goodreads Link',
        extract: () => window.location.href,
        format: (value) => value
    }
};

function flipAuthorName(name) {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    const last = parts.pop();
    return `${last}, ${parts.join(' ')}`;
}

/**
 * Maps raw extracted fields (from InfoExtractor.extract(), unformatted) onto
 * books_vault's Book frontmatter shape. Independent of the display-formatting
 * settings (author format, date format) used by the clipboard/copy feature —
 * the vault always gets "Surname, First" and ISO dates.
 */
export function toFrontmatterFields(rawData) {
    const pages = rawData.pages ? parseInt(rawData.pages, 10) : null;
    const pub = rawData.publishDate;
    let published = '';
    if (pub && typeof pub === 'object' && pub.month && pub.day && pub.year) {
        published = `${pub.year}-${String(getMonthNumber(pub.month)).padStart(2, '0')}-${String(pub.day).padStart(2, '0')}`;
    }
    // A year-only publish date can't be expressed as a valid ISO date and is left blank.

    const rating = parseFloat(rawData.goodreadsRating);
    const seriesIndex = parseFloat(rawData.seriesNumber);

    return {
        title: rawData.title || '',
        author: flipAuthorName(rawData.author),
        category: rawData.type || '',
        pages: Number.isFinite(pages) ? pages : '',
        published,
        goodreads: Number.isFinite(rating) ? rating : '',
        date_added: new Date().toISOString().split('T')[0],
        link: rawData.link || '',
        series: rawData.seriesName || '',
        series_index: Number.isFinite(seriesIndex) ? seriesIndex : '',
        tags: buildTags({ category: rawData.type })
    };
}
