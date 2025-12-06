// ==UserScript==
// @name         Goodreads Copy Book Info
// @namespace    https://github.com/laurinsorgend
// @version      2.0
// @description  Adds a button to copy book information with customizable format
// @author       laurin@sorgend.eu
// @match        https://www.goodreads.com/book/show/*
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_info
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsCopyInfo/goodreadsCopyInfo.meta.js
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsCopyInfo/goodreadsCopyInfo.user.js
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const DEBUG = false;

    const FIELD_DEFINITIONS = {
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
                const pages = FIELD_DEFINITIONS.pages.extract();
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
            extract: () => {
                const pagesEl = document.querySelector('p[data-testid="pagesFormat"]');
                if (pagesEl) {
                    const match = pagesEl.textContent.match(/(\d+)\s+pages/);
                    if (match) return match[1];
                }

                const formatText = getText('.BookDetails__info span', ['.BookDetails__format']);
                if (formatText) {
                    const match = formatText.match(/(\d+)\s+pages/);
                    if (match) return match[1];
                }

                const details = document.querySelectorAll('.BookDetails .BookDetails__list span, .BookDetails__metadata span');
                for (const el of details) {
                    if (el.textContent.includes('pages')) {
                        return el.textContent.replace(/\D/g, '');
                    }
                }

                return '';
            },
            format: (value) => value
        },
        personalRating: {
            label: 'Personal Rating',
            extract: () => '',
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
        narrator: {
            label: 'Narrator',
            extract: () => '',
            format: (value) => value
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
        timesRead: {
            label: 'Times Read',
            extract: () => '',
            format: (value) => value
        },
        plan: {
            label: 'Plan',
            extract: () => '99',
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
                return formats[settings.dateAddedFormat] || formats.full;
            }
        },
        recommendedBy: {
            label: 'Recommended By',
            extract: () => '',
            format: (value) => value
        },
        link: {
            label: 'Goodreads Link',
            extract: () => window.location.href,
            format: (value) => value
        }
    };

    const DEFAULT_SETTINGS = {
        fieldOrder: ['title', 'seriesName', 'seriesNumber', 'type', 'pages', 'personalRating',
                     'goodreadsRating', 'author', 'narrator', 'publishDate', 'timesRead',
                     'plan', 'dateAdded', 'recommendedBy', 'link'],
        customEmptyFields: [],
        separator: '\t',
        authorFormat: 'lastFirst',
        dateFormat: 'full',
        dateAddedFormat: 'full'
    };

    class SettingsManager {
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
    }

    class BookInfoExtractor {
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
                    formatted[key] = definition.format(data[key], this.settings.settings);
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

        getBookInfo() {
            const raw = this.extract();
            const formatted = this.format(raw);
            return this.buildOutput(formatted);
        }
    }

    class UI {
        static addStyles() {
            const css = `
                .grcopy-notification {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background-color: #4caf50;
                    color: white;
                    padding: 16px;
                    border-radius: 4px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 9999;
                    opacity: 0;
                    transition: opacity 0.3s ease-in-out;
                }
                .grcopy-notification.show { opacity: 1; }

                .grcopy-settings-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 10000;
                    overflow-y: auto;
                }
                .grcopy-settings-modal.show { display: block; }

                .grcopy-settings-content {
                    background: white;
                    max-width: 600px;
                    margin: 50px auto;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }

                .grcopy-settings-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #f0f0f0;
                }

                .grcopy-settings-title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                }

                .grcopy-close {
                    cursor: pointer;
                    font-size: 28px;
                    color: #999;
                    background: none;
                    border: none;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    line-height: 30px;
                }
                .grcopy-close:hover { color: #333; }

                .grcopy-settings-section {
                    margin-bottom: 25px;
                }

                .grcopy-settings-section h3 {
                    font-size: 18px;
                    margin-bottom: 15px;
                    color: #555;
                }

                .grcopy-form-group {
                    margin-bottom: 15px;
                }

                .grcopy-form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 500;
                    color: #666;
                }

                .grcopy-form-group select,
                .grcopy-form-group input {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                }

                .grcopy-field-order {
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 10px;
                    max-height: 300px;
                    overflow-y: auto;
                }

                .grcopy-field-item {
                    display: flex;
                    align-items: center;
                    padding: 8px;
                    margin-bottom: 5px;
                    background: #f9f9f9;
                    border-radius: 4px;
                    cursor: move;
                }

                .grcopy-field-item:hover {
                    background: #f0f0f0;
                }

                .grcopy-drag-handle {
                    margin-right: 10px;
                    color: #999;
                }

                .grcopy-field-label {
                    flex: 1;
                }

                .grcopy-field-delete {
                    background: #ff4444;
                    color: white;
                    border: none;
                    border-radius: 3px;
                    padding: 4px 8px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .grcopy-field-delete:hover {
                    background: #cc0000;
                }

                .grcopy-add-field-container {
                    display: flex;
                    gap: 10px;
                    margin-top: 10px;
                }

                .grcopy-add-field-input {
                    flex: 1;
                }

                .grcopy-button-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }

                .grcopy-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                }

                .grcopy-btn-primary {
                    background: #00635d;
                    color: white;
                }
                .grcopy-btn-primary:hover { background: #004d47; }

                .grcopy-btn-secondary {
                    background: #f0f0f0;
                    color: #333;
                }
                .grcopy-btn-secondary:hover { background: #e0e0e0; }

                .grcopy-btn-small {
                    padding: 6px 12px;
                    font-size: 13px;
                }
            `;

            if (typeof GM_addStyle === 'function') {
                GM_addStyle(css);
            } else {
                const styleNode = document.createElement('style');
                styleNode.textContent = css;
                document.head.appendChild(styleNode);
            }
        }

        static showNotification(message, duration = 2000) {
            const existing = document.querySelector('.grcopy-notification');
            if (existing) existing.remove();

            const notification = document.createElement('div');
            notification.className = 'grcopy-notification';
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => notification.classList.add('show'), 10);
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }

        static createSettingsModal(settings, extractor) {
            const modal = document.createElement('div');
            modal.className = 'grcopy-settings-modal';
            modal.innerHTML = `
                <div class="grcopy-settings-content">
                    <div class="grcopy-settings-header">
                        <div class="grcopy-settings-title">Copy Settings</div>
                        <button class="grcopy-close">&times;</button>
                    </div>

                    <div class="grcopy-settings-section">
                        <h3>Format Options</h3>

                        <div class="grcopy-form-group">
                            <label>Field Separator</label>
                            <select id="grcopy-separator">
                                <option value="\t">Tab</option>
                                <option value=",">Comma</option>
                                <option value=";">Semicolon</option>
                                <option value="|">Pipe</option>
                            </select>
                        </div>

                        <div class="grcopy-form-group">
                            <label>Author Format</label>
                            <select id="grcopy-author-format">
                                <option value="full">Full Name</option>
                                <option value="lastFirst">Last, First</option>
                            </select>
                        </div>

                        <div class="grcopy-form-group">
                            <label>Publish Date Format</label>
                            <select id="grcopy-date-format">
                                <option value="full">Month Day, Year</option>
                                <option value="yearOnly">Year Only</option>
                                <option value="iso">ISO (YYYY-MM-DD)</option>
                            </select>
                        </div>

                        <div class="grcopy-form-group">
                            <label>Date Added Format</label>
                            <select id="grcopy-dateadded-format">
                                <option value="full">UK Format</option>
                                <option value="us">US Format</option>
                                <option value="iso">ISO (YYYY-MM-DD)</option>
                            </select>
                        </div>
                    </div>

                    <div class="grcopy-settings-section">
                        <h3>Field Order (Drag to Reorder)</h3>
                        <div class="grcopy-field-order" id="grcopy-field-list"></div>
                        <div class="grcopy-add-field-container">
                            <input type="text" id="grcopy-new-field-name" class="grcopy-add-field-input" placeholder="Empty field name">
                            <button class="grcopy-btn grcopy-btn-primary grcopy-btn-small" id="grcopy-add-field">Add Empty Field</button>
                        </div>
                    </div>

                    <div class="grcopy-button-group">
                        <button class="grcopy-btn grcopy-btn-primary" id="grcopy-save">Save</button>
                        <button class="grcopy-btn grcopy-btn-secondary" id="grcopy-reset">Reset to Default</button>
                        <button class="grcopy-btn grcopy-btn-secondary" id="grcopy-cancel">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            this.populateSettings(modal, settings, extractor);
            this.attachSettingsHandlers(modal, settings, extractor);

            return modal;
        }

        static populateSettings(modal, settings, extractor) {
            modal.querySelector('#grcopy-separator').value = settings.get('separator');
            modal.querySelector('#grcopy-author-format').value = settings.get('authorFormat');
            modal.querySelector('#grcopy-date-format').value = settings.get('dateFormat');
            modal.querySelector('#grcopy-dateadded-format').value = settings.get('dateAddedFormat');

            const fieldList = modal.querySelector('#grcopy-field-list');
            fieldList.innerHTML = '';

            const allDefinitions = extractor.getAllFieldDefinitions();
            const order = settings.get('fieldOrder');

            order.forEach(fieldKey => {
                const definition = allDefinitions[fieldKey];
                if (!definition) return;

                const item = document.createElement('div');
                item.className = 'grcopy-field-item';
                item.dataset.field = fieldKey;
                item.draggable = true;

                const dragHandle = document.createElement('span');
                dragHandle.className = 'grcopy-drag-handle';
                dragHandle.textContent = '☰';

                const label = document.createElement('span');
                label.className = 'grcopy-field-label';
                label.textContent = definition.label;

                item.appendChild(dragHandle);
                item.appendChild(label);

                if (definition.isCustom) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'grcopy-field-delete';
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${definition.label}"?`)) {
                            settings.removeCustomEmptyField(fieldKey);
                            this.populateSettings(modal, settings, extractor);
                        }
                    };
                    item.appendChild(deleteBtn);
                }

                fieldList.appendChild(item);
            });

            this.attachDragHandlers(fieldList);
        }

        static attachDragHandlers(container) {
            let draggedItem = null;

            container.addEventListener('dragstart', (e) => {
                draggedItem = e.target.closest('.grcopy-field-item');
                e.dataTransfer.effectAllowed = 'move';
            });

            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = this.getDragAfterElement(container, e.clientY);
                if (afterElement == null) {
                    container.appendChild(draggedItem);
                } else {
                    container.insertBefore(draggedItem, afterElement);
                }
            });
        }

        static getDragAfterElement(container, y) {
            const draggableElements = [...container.querySelectorAll('.grcopy-field-item:not(.dragging)')];

            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;

                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        }

        static attachSettingsHandlers(modal, settings, extractor) {
            modal.querySelector('.grcopy-close').addEventListener('click', () => {
                modal.classList.remove('show');
            });

            modal.querySelector('#grcopy-cancel').addEventListener('click', () => {
                modal.classList.remove('show');
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('show');
            });

            modal.querySelector('#grcopy-add-field').addEventListener('click', () => {
                const input = modal.querySelector('#grcopy-new-field-name');
                const name = input.value.trim();

                if (!name) {
                    this.showNotification('Please enter a field name', 2000);
                    return;
                }

                const id = settings.addCustomEmptyField(name);
                const order = settings.get('fieldOrder');
                order.push(id);
                settings.set('fieldOrder', order);

                input.value = '';
                this.populateSettings(modal, settings, extractor);
                this.showNotification(`Added "${name}"`);
            });

            modal.querySelector('#grcopy-save').addEventListener('click', () => {
                settings.set('separator', modal.querySelector('#grcopy-separator').value);
                settings.set('authorFormat', modal.querySelector('#grcopy-author-format').value);
                settings.set('dateFormat', modal.querySelector('#grcopy-date-format').value);
                settings.set('dateAddedFormat', modal.querySelector('#grcopy-dateadded-format').value);

                const fieldItems = modal.querySelectorAll('.grcopy-field-item');
                const newOrder = Array.from(fieldItems).map(item => item.dataset.field);
                settings.set('fieldOrder', newOrder);

                this.showNotification('Settings saved!');
                modal.classList.remove('show');
            });

            modal.querySelector('#grcopy-reset').addEventListener('click', () => {
                if (confirm('Reset all settings to default?')) {
                    settings.reset();
                    this.populateSettings(modal, settings, extractor);
                    this.showNotification('Settings reset to default');
                }
            });
        }

        static addButtons(onCopy, onSettings) {
            const buttonBar = this.findButtonBar();
            if (!buttonBar) return;

            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'ButtonGroup ButtonGroup--block';

            const copyButtonContainer = document.createElement('div');
            copyButtonContainer.className = 'Button__container Button__container--block';
            copyButtonContainer.innerHTML = `
                <button type="button" class="Button Button--secondary Button--medium Button--block">
                    <span class="Button__labelItem">Copy Info</span>
                </button>
            `;

            const settingsButtonContainer = document.createElement('div');
            settingsButtonContainer.className = 'Button__container';
            settingsButtonContainer.innerHTML = `
                <button type="button" class="Button Button--secondary Button--medium Button--rounded" aria-label="Copy settings">
                    <span class="Button__labelItem">
                        <i class="Icon ChevronIcon">
                            <svg viewBox="0 0 24 24">
                                <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                                <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/>
                            </svg>
                        </i>
                    </span>
                </button>
            `;

            copyButtonContainer.querySelector('button').addEventListener('click', onCopy);
            settingsButtonContainer.querySelector('button').addEventListener('click', onSettings);

            buttonGroup.appendChild(copyButtonContainer);
            buttonGroup.appendChild(settingsButtonContainer);

            buttonBar.appendChild(buttonGroup);
        }

        static findButtonBar() {
            let bar = document.querySelector('.BookActions');
            if (!bar) {
                bar = Array.from(document.querySelectorAll('div[class*="BookActions"]'))
                    .find(el => el.className.includes('BookActions'));
            }
            if (!bar) {
                bar = document.querySelector('.BookPage__rightColumn');
            }
            return bar;
        }
    }

    function getText(primary, fallbacks = []) {
        let el = document.querySelector(primary);
        let i = 0;
        while (!el && i < fallbacks.length) {
            el = document.querySelector(fallbacks[i++]);
        }
        return el ? el.textContent.trim() : '';
    }

    function getMonthNumber(monthName) {
        const months = {
            January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
            July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
        };
        return months[monthName] || 1;
    }

    function copyToClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
            return true;
        }

        try {
            navigator.clipboard.writeText(text).catch(() => {
                const el = document.createElement('textarea');
                el.value = text;
                el.style.position = 'absolute';
                el.style.left = '-9999px';
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            });
            return true;
        } catch {
            return false;
        }
    }

    function waitForElement(selector, callback, checkFreq = 100, timeout = 15000) {
        const start = Date.now();

        function check() {
            const el = document.querySelector(selector);
            if (el) {
                callback(el);
            } else if (Date.now() - start < timeout) {
                setTimeout(check, checkFreq);
            }
        }

        check();
    }

    function initialize() {
        const settings = new SettingsManager();
        const extractor = new BookInfoExtractor(settings);
        let settingsModal = null;

        UI.addStyles();

        waitForElement('h1.Text__title1, .BookPageTitleSection h1', () => {
            setTimeout(() => {
                UI.addButtons(
                    function() {
                        const info = extractor.getBookInfo();
                        if (!info) {
                            UI.showNotification('Error extracting book info', 3000);
                            return;
                        }

                        if (copyToClipboard(info)) {
                            const label = this.querySelector('.Button__labelItem');
                            const original = label.textContent;
                            label.textContent = 'Copied!';
                            setTimeout(() => label.textContent = original, 1500);
                            UI.showNotification('Book info copied!');
                        } else {
                            UI.showNotification('Copy failed', 3000);
                        }
                    },
                    () => {
                        if (!settingsModal) {
                            settingsModal = UI.createSettingsModal(settings, extractor);
                        }
                        settingsModal.classList.add('show');
                    }
                );
            }, 500);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 500);
    }
})();