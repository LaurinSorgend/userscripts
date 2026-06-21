import SettingsUI from '../../shared/SettingsUI.js';
import { SEPARATOR_OPTIONS } from '../../shared/utils.js';

const CONFIG = {
    prefix: 'd2gs',
    modalTitle: 'Discogs → Sheets Settings',
    mappingDescription: 'Map your Google Sheet columns to Discogs data fields.',
    defaultSheetName: 'Albums',
    colors: { primary: '#333', primaryHover: '#000' },
    formatOptions: [
        { id: 'separator', label: 'Field Separator (clipboard copy)', settingKey: 'separator', options: SEPARATOR_OPTIONS },
        {
            id: 'dateadded-format', label: 'Date Added Format', settingKey: 'dateAddedFormat',
            options: [
                { value: 'iso', label: 'ISO (YYYY-MM-DD)' },
                { value: 'full', label: 'UK Format' },
                { value: 'us', label: 'US Format' }
            ]
        }
    ]
};

export default class UI extends SettingsUI {
    static CONFIG = CONFIG;

    /**
     * Discogs has no stable sidebar / action bar across master/release pages,
     * so we always render a small floating bar in the bottom-right corner.
     */
    static addButtons(onCopy, onSettings, onSendToSheets) {
        const { prefix } = this.cfg;
        if (document.querySelector(`.${prefix}-floating-bar`)) return;

        const bar = document.createElement('div');
        bar.className = `${prefix}-floating-bar`;

        const sheetsBtn = document.createElement('button');
        sheetsBtn.className = `${prefix}-btn ${prefix}-btn-primary`;
        sheetsBtn.type = 'button';
        sheetsBtn.innerHTML = '<span class="d2gs-btn-label">📋 Sheets</span>';
        sheetsBtn.addEventListener('click', () => onSendToSheets.call(sheetsBtn));

        const copyBtn = document.createElement('button');
        copyBtn.className = `${prefix}-btn ${prefix}-btn-secondary`;
        copyBtn.type = 'button';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', onCopy);

        const settingsBtn = document.createElement('button');
        settingsBtn.className = `${prefix}-btn ${prefix}-btn-secondary`;
        settingsBtn.type = 'button';
        settingsBtn.textContent = '⚙';
        settingsBtn.addEventListener('click', onSettings);

        bar.appendChild(sheetsBtn);
        bar.appendChild(copyBtn);
        bar.appendChild(settingsBtn);

        document.body.appendChild(bar);
    }
}
