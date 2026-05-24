import { FIELD_DEFINITIONS, DEBUG } from './constants.js';

export default class AlbumInfoExtractor {
    constructor(settings) {
        this.settings = settings;
    }

    getAllFieldDefinitions() {
        const definitions = { ...FIELD_DEFINITIONS };

        this.settings.get('customEmptyFields').forEach(field => {
            definitions[field.id] = {
                label: field.label,
                extract: () => '',
                format: (value) => value,
                isCustom: true
            };
        });

        this.settings.get('constantFields').forEach(field => {
            definitions[field.id] = {
                label: field.label,
                extract: () => field.value,
                format: (value) => value,
                isConstant: true
            };
        });

        return definitions;
    }

    extract() {
        const data = {};
        const definitions = this.getAllFieldDefinitions();

        for (const [key, definition] of Object.entries(definitions)) {
            try {
                data[key] = definition.extract();
            } catch (e) {
                if (DEBUG) console.error(`Error extracting ${key}:`, e);
                data[key] = '';
            }
        }

        return data;
    }

    format(data) {
        const formatted = {};
        const definitions = this.getAllFieldDefinitions();

        for (const [key, definition] of Object.entries(definitions)) {
            try {
                formatted[key] = definition.format(data[key], this.settings.asObject());
            } catch (e) {
                if (DEBUG) console.error(`Error formatting ${key}:`, e);
                formatted[key] = data[key] || '';
            }
        }

        return formatted;
    }

    buildOutput(formatted) {
        const order = this.settings.get('fieldOrder');
        const separator = this.settings.get('separator');

        return order.map(field => formatted[field] || '').join(separator);
    }

    getAlbumInfo() {
        const raw = this.extract();
        const formatted = this.format(raw);
        return this.buildOutput(formatted);
    }

    getFormattedData() {
        return this.format(this.extract());
    }
}
