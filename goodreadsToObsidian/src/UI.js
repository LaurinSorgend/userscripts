import SettingsUI from '../../shared/SettingsUI.js';
import { SEPARATOR_OPTIONS } from '../../shared/utils.js';

const CONFIG = {
    prefix: 'gr2obs',
    modalTitle: 'Settings',
    backend: 'obsidian',
    tabLabel: 'Obsidian',
    colors: { primary: '#00635d', primaryHover: '#004d47' },
    formatOptions: [
        { id: 'separator', label: 'Field Separator', settingKey: 'separator', options: SEPARATOR_OPTIONS },
        {
            id: 'author-format', label: 'Author Format (copy button only)', settingKey: 'authorFormat',
            options: [{ value: 'full', label: 'Full Name' }, { value: 'lastFirst', label: 'Last, First' }]
        },
        {
            id: 'date-format', label: 'Publish Date Format (copy button only)', settingKey: 'dateFormat',
            options: [
                { value: 'full', label: 'Month Day, Year' },
                { value: 'yearOnly', label: 'Year Only' },
                { value: 'iso', label: 'ISO (YYYY-MM-DD)' }
            ]
        },
        {
            id: 'dateadded-format', label: 'Date Added Format (copy button only)', settingKey: 'dateAddedFormat',
            options: [
                { value: 'full', label: 'UK Format' },
                { value: 'us', label: 'US Format' },
                { value: 'iso', label: 'ISO (YYYY-MM-DD)' }
            ]
        }
    ]
};

export default class UI extends SettingsUI {
    static CONFIG = CONFIG;

    /**
     * Injects "Send to Obsidian" and settings buttons into Goodreads' action bar.
     */
    static addButtons(onCopy, onSettings, onSendToObsidian) {
        const buttonBar = this.findButtonBar();
        if (!buttonBar) return;

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'ButtonGroup ButtonGroup--block';

        const settingsButtonContainer = document.createElement('div');
        settingsButtonContainer.className = 'Button__container';
        settingsButtonContainer.innerHTML = `
            <button type="button" class="Button Button--secondary Button--medium Button--rounded" aria-label="Copy settings">
                <span class="Button__labelItem">
                    <i class="Icon ChevronIcon">
                        <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.12-.22.07-.49.12-.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/></svg>
                    </i>
                </span>
            </button>
        `;

        const sendButtonContainer = document.createElement('div');
        sendButtonContainer.className = 'Button__container Button__container--block';
        sendButtonContainer.innerHTML = `
            <button type="button" class="Button Button--secondary Button--medium Button--block" aria-label="Send to Obsidian">
                <span class="Button__labelItem">Obsidian</span>
            </button>
        `;

        settingsButtonContainer.querySelector('button').addEventListener('click', onSettings);
        sendButtonContainer.querySelector('button').addEventListener('click', onSendToObsidian);

        buttonGroup.appendChild(sendButtonContainer);
        buttonGroup.appendChild(settingsButtonContainer);

        buttonBar.appendChild(buttonGroup);
    }

    static findButtonBar() {
        return document.querySelector('.BookActions')
            || document.querySelector('div[class*="BookActions"]')
            || document.querySelector('.BookPage__rightColumn');
    }
}
