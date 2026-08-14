import { GM_getValue, GM_setValue } from '$';

/**
 * Shared settings store for the "*ToGoogleSheets" userscripts.
 *
 * Each project owns its own DEFAULT_SETTINGS (field order, formats, default
 * sheet name, ...) and its own GM storage key, so both are passed in via the
 * constructor. Everything else (custom/constant field handling, google sheets
 * sub-object access, save/reset) is identical across scripts and lives here.
 */
export default class SettingsManager {
    constructor({ storageKey = 'settings', defaultSettings } = {}) {
        this.storageKey = storageKey;
        this.defaultSettings = defaultSettings || {};
        this.settings = this.load();
    }

    load() {
        try {
            const saved = GM_getValue(this.storageKey, null);
            return saved
                ? { ...this.defaultSettings, ...JSON.parse(saved) }
                : { ...this.defaultSettings };
        } catch {
            return { ...this.defaultSettings };
        }
    }

    save() {
        try {
            GM_setValue(this.storageKey, JSON.stringify(this.settings));
            return true;
        } catch {
            return false;
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
    }

    reset() {
        this.settings = { ...this.defaultSettings };
        this.save();
    }

    addCustomEmptyField(label) {
        const id = `custom_${Date.now()}`;
        this.settings.customEmptyFields.push({ id, label });
        this.save();
        return id;
    }

    removeCustomEmptyField(id) {
        this.settings.customEmptyFields = this.settings.customEmptyFields.filter(f => f.id !== id);
        this.settings.fieldOrder = this.settings.fieldOrder.filter(f => f !== id);
        this.save();
    }

    getCustomEmptyField(id) {
        return this.settings.customEmptyFields.find(f => f.id === id);
    }

    addConstantField(label, value) {
        const id = `const_${Date.now()}`;
        this.settings.constantFields.push({ id, label, value });
        this.save();
        return id;
    }

    removeConstantField(id) {
        this.settings.constantFields = this.settings.constantFields.filter(f => f.id !== id);
        this.settings.fieldOrder = this.settings.fieldOrder.filter(f => f !== id);
        this.save();
    }

    getConstantField(id) {
        return this.settings.constantFields.find(f => f.id === id);
    }

    updateConstantField(id, label, value) {
        const field = this.settings.constantFields.find(f => f.id === id);
        if (field) {
            field.label = label;
            field.value = value;
            this.save();
        }
    }

    asObject() {
        return { ...this.settings };
    }

    getGoogleSheetsSettings() {
        return this.settings.googleSheets || this.defaultSettings.googleSheets;
    }

    setGoogleSheetsSettings(settings) {
        this.settings.googleSheets = { ...this.settings.googleSheets, ...settings };
        this.save();
    }

    getObsidianSettings() {
        return this.settings.obsidian || this.defaultSettings.obsidian;
    }

    setObsidianSettings(settings) {
        this.settings.obsidian = { ...this.settings.obsidian, ...settings };
        this.save();
    }
}
