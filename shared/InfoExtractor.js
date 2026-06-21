/**
 * Shared, site-agnostic extractor base.
 *
 * Each project supplies its own FIELD_DEFINITIONS (label/extract/format per
 * field) plus a DEBUG flag; the extraction, formatting and output-building
 * logic is identical across scripts and therefore lives here.
 *
 * A definition may carry `isCustom` / `isConstant` flags (added automatically
 * for custom empty fields and constant fields) which the column-mapping UI
 * uses to group options.
 */
export default class InfoExtractor {
    constructor(settings, { fieldDefinitions = {}, debug = false } = {}) {
        this.settings = settings;
        this.fieldDefinitions = fieldDefinitions;
        this.debug = debug;
    }

    getAllFieldDefinitions() {
        const definitions = { ...this.fieldDefinitions };

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
                if (this.debug) console.error(`Error extracting ${key}:`, e);
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
                if (this.debug) console.error(`Error formatting ${key}:`, e);
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

    /** Clipboard-ready, separator-joined string of the current field order. */
    getInfo() {
        return this.buildOutput(this.format(this.extract()));
    }

    /** Object keyed by field id, values already formatted (used for Sheets). */
    getFormattedData() {
        return this.format(this.extract());
    }
}
