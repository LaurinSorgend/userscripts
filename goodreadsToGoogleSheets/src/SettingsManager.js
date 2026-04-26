import { GM_getValue, GM_setValue } from '$';
import { DEFAULT_SETTINGS } from './constants.js';

export default class SettingsManager {
    constructor() {
        this.settings = this.load();
    }

    load() {
        try {
            const saved = GM_getValue('settings', null);
            return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
        } catch {
            return { ...DEFAULT_SETTINGS };
        }
    }

    save() {
        try {
            GM_setValue('settings', JSON.stringify(this.settings));
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
        this.settings = { ...DEFAULT_SETTINGS };
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
        return this.settings.googleSheets || DEFAULT_SETTINGS.googleSheets;
    }

    setGoogleSheetsSettings(settings) {
        this.settings.googleSheets = { ...this.settings.googleSheets, ...settings };
        this.save();
    }
}