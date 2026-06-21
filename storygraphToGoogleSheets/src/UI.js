import SettingsUI from '../../shared/SettingsUI.js';
import { SEPARATOR_OPTIONS } from '../../shared/utils.js';

const CONFIG = {
    prefix: 'sg2gs',
    modalTitle: 'StoryGraph → Sheets Settings',
    mappingDescription: 'Map your Google Sheet columns to StoryGraph data fields.',
    defaultSheetName: 'Books',
    colors: { primary: '#00635d', primaryHover: '#004d47' },
    formatOptions: [
        { id: 'separator', label: 'Field Separator', settingKey: 'separator', options: SEPARATOR_OPTIONS },
        {
            id: 'dateadded-format', label: 'Date Added Format', settingKey: 'dateAddedFormat',
            options: [
                { value: 'full', label: 'UK Format' },
                { value: 'us', label: 'US Format' },
                { value: 'iso', label: 'ISO (YYYY-MM-DD)' }
            ]
        },
        {
            id: 'review-format', label: 'Community Review Format', settingKey: 'communityReviewFormat',
            options: [
                { value: 'full', label: 'Full breakdown (38% Fast 53% Medium 7% Slow)' },
                { value: 'majority', label: 'Majority only (Medium)' }
            ],
            hint: 'Majority only returns the dominant label when it exceeds 50%'
        }
    ]
};

export default class UI extends SettingsUI {
    static CONFIG = CONFIG;

    /**
     * Injects "Send to Sheets" and settings buttons below the StoryGraph book cover.
     */
    static addButtons(onSettings, onSendToSheets) {
        if (document.querySelector('[data-sg2gs-btns]')) return;

        const cover = document.querySelector('.book-cover');
        if (!cover) return;
        const parent = cover.parentElement;
        if (!parent) return;

        const BTN = 'text-[13px] inline-flex items-center gap-2 px-4 py-3 bg-lightGrey dark:bg-[#3B3B3B] border border-midGrey dark:border-darkerGrey rounded-md text-blackish dark:text-white font-semibold hover:bg-darkGrey dark:hover:bg-darkerGrey cursor-pointer';

        const group = document.createElement('div');
        group.setAttribute('data-sg2gs-btns', '');
        group.className = 'flex gap-2 mt-2';

        const sheetsBtn = document.createElement('button');
        sheetsBtn.className = `flex-1 ${BTN}`;
        sheetsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m1.125 2.625h7.5" />
            </svg>
            Send to Sheets`;
        sheetsBtn.addEventListener('click', function () { onSendToSheets.call(this); });

        const settingsBtn = document.createElement('button');
        settingsBtn.className = `justify-center ${BTN}`;
        settingsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>`;
        settingsBtn.addEventListener('click', onSettings);

        group.appendChild(sheetsBtn);
        group.appendChild(settingsBtn);
        parent.appendChild(group);
    }
}
