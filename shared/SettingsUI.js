import { GM_addStyle } from '$';
import GoogleSheetsManager from './GoogleSheetsManager.js';

/**
 * Config-driven settings-menu base shared by the "*ToGoogleSheets" userscripts.
 *
 * A subclass sets `static CONFIG = { ... }` and inherits the full settings
 * modal: notification toast, Format/Fields/Google-Sheets tabs, drag-to-reorder
 * field order, custom empty fields, constant fields, column mapping, test &
 * load, save and reset. Only `addButtons` (how buttons are injected into the
 * host page) stays site-specific and is implemented by each subclass.
 *
 * CONFIG shape:
 * {
 *   prefix:            'gr2gs',                       // CSS class & element-id prefix
 *   modalTitle:        'Settings',
 *   mappingDescription:'Map your Google Sheet columns to Goodreads data fields.',
 *   defaultSheetName:  'Sheet1',                      // fallback sheet name
 *   colors:            { primary: '#00635d', primaryHover: '#004d47' },
 *   formatOptions: [                                  // one <select> each on the Format tab
 *     { id: 'separator', label: 'Field Separator', settingKey: 'separator',
 *       options: [{ value, label }, ...], hint?: '...' }
 *   ]
 * }
 */
export default class SettingsUI {
    static CONFIG = null;

    static get cfg() { return this.CONFIG; }
    static get p() { return this.CONFIG.prefix; }
    /** 'sheets' (default) or 'obsidian' — picks which 3rd settings tab renders. */
    static get backend() { return this.CONFIG.backend || 'sheets'; }

    static addStyles() {
        const { prefix, colors } = this.cfg;
        const css = `
            .${prefix}-notification {
                position: fixed; bottom: 20px; right: 20px;
                background-color: #4caf50; color: white; padding: 16px;
                border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                z-index: 9999; opacity: 0; transition: opacity 0.3s ease-in-out;
            }
            .${prefix}-notification.show { opacity: 1; }
            .${prefix}-notification.error { background-color: #f44336; }

            .${prefix}-modal {
                display: none; position: fixed; top: 0; left: 0;
                width: 100%; height: 100%; background: rgba(0,0,0,0.5);
                z-index: 10000; overflow-y: auto;
            }
            .${prefix}-modal.show { display: block; }

            .${prefix}-content {
                background: #fff !important; color: #333 !important; max-width: 600px;
                margin: 50px auto; padding: 30px;
                border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }

            .${prefix}-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #f0f0f0;
            }
            .${prefix}-title { font-size: 24px; font-weight: bold; color: #333 !important; }

            .${prefix}-close {
                cursor: pointer; font-size: 28px; color: #999 !important;
                background: none !important; border: none; padding: 0;
                width: 30px; height: 30px; line-height: 30px;
            }
            .${prefix}-close:hover { color: #333 !important; }

            .${prefix}-section { margin-bottom: 25px; }
            .${prefix}-section h3 { font-size: 18px; margin-bottom: 15px; color: #555 !important; }
            .${prefix}-group { margin-bottom: 15px; }
            .${prefix}-group label { display: block; margin-bottom: 5px; font-weight: 500; color: #444 !important; }

            .${prefix}-group input, .${prefix}-group select, .${prefix}-group textarea {
                width: 100%; padding: 8px; border: 1px solid #ddd !important;
                border-radius: 4px; font-size: 14px; font-family: inherit;
                background: #fff !important; color: #333 !important; box-sizing: border-box;
            }
            .${prefix}-group textarea { resize: vertical; font-family: monospace; font-size: 12px; }
            .${prefix}-group .hint { font-size: 12px; color: #888 !important; margin-top: 4px; }

            .${prefix}-btn-group { display: flex; gap: 10px; margin-top: 20px; }
            .${prefix}-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; }
            .${prefix}-btn-primary { background: ${colors.primary}; color: white; }
            .${prefix}-btn-primary:hover { background: ${colors.primaryHover}; }
            .${prefix}-btn-secondary { background: #f0f0f0; color: #333; }
            .${prefix}-btn-secondary:hover { background: #e0e0e0; }
            .${prefix}-btn-small { padding: 6px 12px; font-size: 13px; }
            .${prefix}-btn:disabled { opacity: 0.6; cursor: not-allowed; }

            .${prefix}-loading {
                display: inline-block; width: 16px; height: 16px;
                border: 2px solid rgba(255,255,255,0.3);
                border-radius: 50%; border-top-color: white;
                animation: ${prefix}-spin 1s ease-in-out infinite;
                margin-right: 8px; vertical-align: middle;
            }
            @keyframes ${prefix}-spin { to { transform: rotate(360deg); } }

            .${prefix}-error {
                color: #f44336; font-size: 14px; margin-top: 10px;
                padding: 10px; background: #ffebee; border-radius: 4px;
            }

            .${prefix}-tabs { display: flex; border-bottom: 2px solid #eee; margin-bottom: 20px; }
            .${prefix}-tab {
                padding: 12px 20px; cursor: pointer; border: none; background: none !important;
                font-size: 15px; font-weight: 500; color: #666 !important;
                border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s;
            }
            .${prefix}-tab:hover { color: ${colors.primary} !important; }
            .${prefix}-tab.active { color: ${colors.primary} !important; border-bottom-color: ${colors.primary}; }
            .${prefix}-tab-content { display: none; }
            .${prefix}-tab-content.active { display: block; }

            .${prefix}-field-list {
                border: 1px solid #ddd; border-radius: 4px; padding: 10px;
                max-height: 250px; overflow-y: auto; background: #fff !important;
            }
            .${prefix}-field-item {
                display: flex; align-items: center; padding: 8px; margin-bottom: 5px;
                background: #f9f9f9 !important; color: #333 !important; border-radius: 4px; cursor: move;
            }
            .${prefix}-field-item:hover { background: #f0f0f0 !important; }
            .${prefix}-drag-handle { margin-right: 10px; color: #999 !important; }
            .${prefix}-field-label { flex: 1; }

            .${prefix}-field-delete, .${prefix}-field-edit {
                background: #ff4444; color: white; border: none;
                border-radius: 3px; padding: 4px 8px; cursor: pointer; font-size: 12px; margin-left: 5px;
            }
            .${prefix}-field-edit { background: #2196F3; }
            .${prefix}-field-delete:hover { background: #cc0000; }
            .${prefix}-field-edit:hover { background: #1976D2; }

            .${prefix}-add-field { display: flex; gap: 10px; margin-top: 10px; }
            .${prefix}-add-field-input { flex: 1; }

            .${prefix}-constant-fields { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
            .${prefix}-constant-item {
                display: flex; align-items: center; gap: 10px; padding: 8px;
                margin-bottom: 5px; background: #f9f9f9 !important; color: #333 !important; border-radius: 4px;
            }
            .${prefix}-constant-item label { flex: 1; margin: 0; color: #333 !important; }
            .${prefix}-constant-item input {
                flex: 1; padding: 6px; border: 1px solid #ddd !important; border-radius: 4px; font-size: 13px;
                background: #fff !important; color: #333 !important;
            }

            .${prefix}-floating-bar {
                position: fixed; bottom: 24px; right: 24px;
                display: flex; gap: 8px; z-index: 9998;
            }
            .${prefix}-floating-bar .${prefix}-btn { box-shadow: 0 4px 12px rgba(0,0,0,0.25); }

            .${prefix}-merge-list { border: 1px solid #ddd; border-radius: 4px; max-height: 50vh; overflow-y: auto; }
            .${prefix}-merge-row {
                display: flex; gap: 15px; align-items: flex-start;
                padding: 12px; border-bottom: 1px solid #eee;
            }
            .${prefix}-merge-row:last-child { border-bottom: none; }
            .${prefix}-merge-field { width: 28%; font-weight: 600; color: #444 !important; word-break: break-word; }
            .${prefix}-merge-values { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
            .${prefix}-merge-choice {
                display: flex; gap: 8px; align-items: flex-start; cursor: pointer;
                padding: 8px; border: 1px solid #ddd !important; border-radius: 4px;
                background: #fff !important; transition: all 0.15s; word-break: break-word;
            }
            .${prefix}-merge-choice.selected { border-color: ${colors.primary} !important; background: #f0f9f8 !important; }
            .${prefix}-merge-choice input { width: auto; margin-top: 3px; flex-shrink: 0; }
            .${prefix}-merge-tag { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #999 !important; margin-right: 6px; }
            .${prefix}-merge-old { color: #b03030 !important; }
            .${prefix}-merge-new { color: #1a7a1a !important; }
        `;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    static showNotification(message, duration = 2000, isError = false) {
        const { prefix } = this.cfg;
        const existing = document.querySelector(`.${prefix}-notification`);
        if (existing) existing.remove();

        const n = document.createElement('div');
        n.className = `${prefix}-notification${isError ? ' error' : ''}`;
        n.textContent = message;
        document.body.appendChild(n);

        setTimeout(() => n.classList.add('show'), 10);
        setTimeout(() => {
            n.classList.remove('show');
            setTimeout(() => n.remove(), 300);
        }, duration);
    }

    static formatOptionsHtml() {
        const { prefix, formatOptions } = this.cfg;
        return (formatOptions || []).map(opt => `
            <div class="${prefix}-group">
                <label for="${prefix}-${opt.id}">${opt.label}</label>
                <select id="${prefix}-${opt.id}">
                    ${opt.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
                </select>
                ${opt.hint ? `<div class="hint">${opt.hint}</div>` : ''}
            </div>
        `).join('');
    }

    static sheetsTabHtml() {
        const { prefix, mappingDescription } = this.cfg;
        return `
            <div class="${prefix}-section">
                <h3>Google Sheets API Configuration</h3>
                <div class="${prefix}-group">
                    <label for="${prefix}-service-account">Service Account JSON</label>
                    <textarea id="${prefix}-service-account" rows="6" placeholder="Paste the entire Service Account JSON file content here"></textarea>
                    <div class="hint">The JSON file you downloaded from Google Cloud Console</div>
                </div>
                <div class="${prefix}-group">
                    <label for="${prefix}-spreadsheet-id">Spreadsheet ID</label>
                    <input type="text" id="${prefix}-spreadsheet-id" placeholder="Enter your spreadsheet ID">
                    <div class="hint">Found in the URL: https://docs.google.com/spreadsheets/d/<span style="font-family: monospace;">SPREADSHEET_ID</span>/edit</div>
                </div>
                <div class="${prefix}-group">
                    <label for="${prefix}-sheet-name">Sheet Name</label>
                    <input type="text" id="${prefix}-sheet-name" placeholder="Enter the sheet name">
                    <div class="hint">The name of the sheet where data will be appended</div>
                </div>
                <div class="${prefix}-group">
                    <label for="${prefix}-match-field">Match Existing Rows By</label>
                    <select id="${prefix}-match-field"></select>
                    <div class="hint">When sending, update the existing row that shares this field's value instead of adding a duplicate. Empty incoming values never overwrite existing data.</div>
                </div>
                <div id="${prefix}-error" class="${prefix}-error" style="display: none;"></div>
                <div class="${prefix}-btn-group">
                    <button class="${prefix}-btn ${prefix}-btn-secondary" id="${prefix}-test-load">Test & Load Columns</button>
                </div>
            </div>
            <div id="${prefix}-mapping-section" class="${prefix}-section" style="display: none;">
                <h3>Column Mapping</h3>
                <p style="font-size: 13px; color: #666; margin-bottom: 15px;">${mappingDescription}</p>
                <div id="${prefix}-mapping-container"></div>
            </div>
        `;
    }

    static obsidianTabHtml() {
        const { prefix } = this.cfg;
        return `
            <div class="${prefix}-section">
                <h3>Obsidian Local REST API</h3>
                <div class="${prefix}-group">
                    <label for="${prefix}-obsidian-base-url">Base URL</label>
                    <input type="text" id="${prefix}-obsidian-base-url" placeholder="http://127.0.0.1:27123">
                    <div class="hint">The Local REST API plugin's server URL (Settings &rarr; Local REST API in Obsidian). Use the plain HTTP port to avoid the self-signed HTTPS certificate.</div>
                </div>
                <div class="${prefix}-group">
                    <label for="${prefix}-obsidian-api-key">API Key</label>
                    <input type="text" id="${prefix}-obsidian-api-key" placeholder="Paste the API key from the plugin settings">
                </div>
                <div id="${prefix}-error" class="${prefix}-error" style="display: none;"></div>
                <div class="${prefix}-btn-group">
                    <button class="${prefix}-btn ${prefix}-btn-secondary" id="${prefix}-test-load">Test Connection</button>
                </div>
            </div>
        `;
    }

    static backendHelpHtml() {
        if (this.backend === 'obsidian') return '';
        const { prefix } = this.cfg;
        return `
            <div class="${prefix}-section" style="margin-top: 20px;">
                <h3>How to Get Your Service Account</h3>
                <ol style="font-size: 14px; color: #666; line-height: 1.6;">
                    <li>Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
                    <li>Create a new project or select an existing one</li>
                    <li>Enable the <strong>Google Sheets API</strong></li>
                    <li>Go to <strong>IAM & Admin &gt; Service Accounts</strong></li>
                    <li>Create a Service Account and create a Key (JSON)</li>
                    <li><strong>Important:</strong> Share your spreadsheet with the service account email (client_email in the JSON)</li>
                    <li>Copy the content of the JSON file and paste it above</li>
                </ol>
            </div>
        `;
    }

    static createSettingsModal(settings, extractor, backendManager) {
        const { prefix, modalTitle } = this.cfg;
        const isObsidian = this.backend === 'obsidian';
        const modal = document.createElement('div');
        modal.className = `${prefix}-modal`;
        modal.innerHTML = `
            <div class="${prefix}-content">
                <div class="${prefix}-header">
                    <div class="${prefix}-title">${modalTitle}</div>
                    <button class="${prefix}-close">&times;</button>
                </div>

                <div class="${prefix}-tabs">
                    <button class="${prefix}-tab active" data-tab="format">Format</button>
                    <button class="${prefix}-tab" data-tab="fields">Fields</button>
                    <button class="${prefix}-tab" data-tab="backend">${isObsidian ? (this.cfg.tabLabel || 'Obsidian') : 'Google Sheets'}</button>
                </div>

                <div id="${prefix}-tab-format" class="${prefix}-tab-content active">
                    <div class="${prefix}-section">
                        <h3>Format Options</h3>
                        ${this.formatOptionsHtml()}
                    </div>
                </div>

                <div id="${prefix}-tab-fields" class="${prefix}-tab-content">
                    <div class="${prefix}-section">
                        <h3>Field Order (Drag to Reorder)</h3>
                        <div class="${prefix}-field-list" id="${prefix}-field-list"></div>
                    </div>

                    <div class="${prefix}-section">
                        <h3>Custom Empty Fields</h3>
                        <div id="${prefix}-custom-fields-list"></div>
                        <div class="${prefix}-add-field">
                            <input type="text" id="${prefix}-new-custom-field" class="${prefix}-add-field-input" placeholder="Empty field name">
                            <button class="${prefix}-btn ${prefix}-btn-primary ${prefix}-btn-small" id="${prefix}-add-custom-field">Add</button>
                        </div>
                    </div>

                    <div class="${prefix}-section ${prefix}-constant-fields">
                        <h3>Constant Fields</h3>
                        <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                            Add fields with a fixed value (e.g. a "Source" or "Recommended By" column).
                        </p>
                        <div id="${prefix}-constant-fields-list"></div>
                        <div class="${prefix}-add-field">
                            <input type="text" id="${prefix}-new-constant-label" class="${prefix}-add-field-input" placeholder="Field name" style="flex: 1;">
                            <input type="text" id="${prefix}-new-constant-value" placeholder="Value" style="flex: 1;">
                            <button class="${prefix}-btn ${prefix}-btn-primary ${prefix}-btn-small" id="${prefix}-add-constant">Add</button>
                        </div>
                    </div>
                </div>

                <div id="${prefix}-tab-backend" class="${prefix}-tab-content">
                    ${isObsidian ? this.obsidianTabHtml() : this.sheetsTabHtml()}
                </div>

                <div class="${prefix}-btn-group" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                    <button class="${prefix}-btn ${prefix}-btn-primary" id="${prefix}-save">Save Settings</button>
                    <button class="${prefix}-btn ${prefix}-btn-secondary" id="${prefix}-reset">Reset to Default</button>
                    <button class="${prefix}-btn ${prefix}-btn-secondary" id="${prefix}-cancel">Cancel</button>
                </div>

                ${this.backendHelpHtml()}
            </div>
        `;

        document.body.appendChild(modal);

        this.populateSettings(modal, settings, extractor);
        this.attachSettingsHandlers(modal, settings, extractor, backendManager);

        return modal;
    }

    static populateSettings(modal, settings, extractor) {
        const { prefix, formatOptions, defaultSheetName } = this.cfg;

        for (const opt of (formatOptions || [])) {
            const el = modal.querySelector(`#${prefix}-${opt.id}`);
            if (el) el.value = settings.get(opt.settingKey) ?? opt.options[0]?.value ?? '';
        }

        if (this.backend === 'obsidian') {
            const obsidianSettings = settings.getObsidianSettings() || {};
            modal.querySelector(`#${prefix}-obsidian-base-url`).value = obsidianSettings.baseUrl || 'http://127.0.0.1:27123';
            modal.querySelector(`#${prefix}-obsidian-api-key`).value = obsidianSettings.apiKey || '';
        } else {
            const sheetsSettings = settings.getGoogleSheetsSettings();
            modal.querySelector(`#${prefix}-service-account`).value = sheetsSettings.serviceAccountJson || '';
            modal.querySelector(`#${prefix}-spreadsheet-id`).value = sheetsSettings.spreadsheetId || '';
            modal.querySelector(`#${prefix}-sheet-name`).value = sheetsSettings.sheetName || defaultSheetName;
            this.populateMatchField(modal, settings, extractor);
        }

        this.populateFieldOrder(modal, settings, extractor);
        this.populateCustomFields(modal, settings);
        this.populateConstantFields(modal, settings);
    }

    static populateFieldOrder(modal, settings, extractor) {
        const { prefix } = this.cfg;
        const fieldList = modal.querySelector(`#${prefix}-field-list`);
        fieldList.innerHTML = '';

        const allDefs = extractor.getAllFieldDefinitions();
        for (const fieldKey of settings.get('fieldOrder')) {
            const def = allDefs[fieldKey];
            if (!def) continue;

            const item = document.createElement('div');
            item.className = `${prefix}-field-item`;
            item.dataset.field = fieldKey;
            item.draggable = true;
            item.innerHTML = `<span class="${prefix}-drag-handle">&#9776;</span><span class="${prefix}-field-label">${def.label}</span>`;
            fieldList.appendChild(item);
        }

        this.attachDragHandlers(fieldList);
    }

    static populateMatchField(modal, settings, extractor) {
        const { prefix } = this.cfg;
        const select = modal.querySelector(`#${prefix}-match-field`);
        if (!select) return;

        const allDefs = extractor.getAllFieldDefinitions();
        select.innerHTML = Object.entries(allDefs)
            .map(([key, def]) => `<option value="${key}">${def.label}</option>`)
            .join('');
        select.value = settings.getGoogleSheetsSettings().matchField || 'link';
    }

    static populateCustomFields(modal, settings) {
        const { prefix } = this.cfg;
        const container = modal.querySelector(`#${prefix}-custom-fields-list`);
        container.innerHTML = '';

        for (const field of (settings.get('customEmptyFields') || [])) {
            const item = document.createElement('div');
            item.className = `${prefix}-field-item`;
            item.innerHTML = `
                <span class="${prefix}-drag-handle">&#9776;</span>
                <span class="${prefix}-field-label">${field.label}</span>
                <button class="${prefix}-field-delete" data-id="${field.id}">Delete</button>
            `;
            container.appendChild(item);
        }
    }

    static populateConstantFields(modal, settings) {
        const { prefix } = this.cfg;
        const container = modal.querySelector(`#${prefix}-constant-fields-list`);
        container.innerHTML = '';

        for (const field of (settings.get('constantFields') || [])) {
            const item = document.createElement('div');
            item.className = `${prefix}-constant-item`;
            item.dataset.id = field.id;
            item.innerHTML = `
                <label>${field.label}</label>
                <input type="text" class="${prefix}-constant-value" value="${field.value}">
                <button class="${prefix}-field-delete" data-id="${field.id}">Delete</button>
            `;
            container.appendChild(item);
        }
    }

    static attachDragHandlers(container) {
        const { prefix } = this.cfg;
        let dragged = null;

        container.addEventListener('dragstart', (e) => {
            dragged = e.target.closest(`.${prefix}-field-item`);
            e.dataTransfer.effectAllowed = 'move';
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const after = this.getDragAfterElement(container, e.clientY);
            if (after == null) container.appendChild(dragged);
            else container.insertBefore(dragged, after);
        });
    }

    static getDragAfterElement(container, y) {
        const { prefix } = this.cfg;
        const items = [...container.querySelectorAll(`.${prefix}-field-item:not(.dragging)`)];
        return items.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    static attachSettingsHandlers(modal, settings, extractor, backendManager) {
        const { prefix } = this.cfg;

        modal.querySelector(`.${prefix}-close`).addEventListener('click', () => modal.classList.remove('show'));
        modal.querySelector(`#${prefix}-cancel`).addEventListener('click', () => modal.classList.remove('show'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('show'); });

        modal.querySelectorAll(`.${prefix}-tab`).forEach(tab => {
            tab.addEventListener('click', () => {
                modal.querySelectorAll(`.${prefix}-tab`).forEach(t => t.classList.remove('active'));
                modal.querySelectorAll(`.${prefix}-tab-content`).forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                modal.querySelector(`#${prefix}-tab-${tab.dataset.tab}`).classList.add('active');
            });
        });

        this.attachFieldHandlers(modal, settings, extractor);
        if (this.backend === 'obsidian') {
            this.attachObsidianHandlers(modal, settings, backendManager);
        } else {
            this.attachSheetsHandlers(modal, settings, extractor, backendManager);
        }
        this.attachSaveHandler(modal, settings, extractor);
    }

    static attachObsidianHandlers(modal, settings, obsidianManager) {
        const { prefix } = this.cfg;

        modal.querySelector(`#${prefix}-test-load`).addEventListener('click', async () => {
            const baseUrl = modal.querySelector(`#${prefix}-obsidian-base-url`).value.trim();
            const apiKey = modal.querySelector(`#${prefix}-obsidian-api-key`).value.trim();
            const errorDiv = modal.querySelector(`#${prefix}-error`);

            if (!baseUrl || !apiKey) {
                errorDiv.textContent = 'Please fill in both fields first';
                errorDiv.style.display = 'block';
                return;
            }

            errorDiv.style.display = 'none';
            const btn = modal.querySelector(`#${prefix}-test-load`);
            const orig = btn.textContent;
            btn.textContent = 'Connecting...';
            btn.disabled = true;

            try {
                const ObsidianManagerCtor = obsidianManager.constructor;
                const tempManager = new ObsidianManagerCtor({ getObsidianSettings: () => ({ baseUrl, apiKey }) });
                await tempManager.testConnection();
                this.showNotification('Connected to Obsidian!');
            } catch (error) {
                errorDiv.textContent = `Error: ${error.message}`;
                errorDiv.style.display = 'block';
                this.showNotification('Connection failed', 3000, true);
            } finally {
                btn.textContent = orig;
                btn.disabled = false;
            }
        });
    }

    static attachFieldHandlers(modal, settings, extractor) {
        const { prefix } = this.cfg;

        modal.querySelector(`#${prefix}-add-custom-field`).addEventListener('click', () => {
            const input = modal.querySelector(`#${prefix}-new-custom-field`);
            const name = input.value.trim();
            if (!name) { this.showNotification('Please enter a field name', 2000, true); return; }

            const id = settings.addCustomEmptyField(name);
            settings.set('fieldOrder', [...settings.get('fieldOrder'), id]);
            input.value = '';
            this.populateFieldOrder(modal, settings, extractor);
            this.populateCustomFields(modal, settings);
            this.showNotification(`Added "${name}"`);
        });

        modal.querySelector(`#${prefix}-custom-fields-list`).addEventListener('click', (e) => {
            if (!e.target.classList.contains(`${prefix}-field-delete`)) return;
            const id = e.target.dataset.id;
            const field = settings.getCustomEmptyField(id);
            if (confirm(`Delete "${field?.label}"?`)) {
                settings.removeCustomEmptyField(id);
                this.populateFieldOrder(modal, settings, extractor);
                this.populateCustomFields(modal, settings);
            }
        });

        modal.querySelector(`#${prefix}-add-constant`).addEventListener('click', () => {
            const labelInput = modal.querySelector(`#${prefix}-new-constant-label`);
            const valueInput = modal.querySelector(`#${prefix}-new-constant-value`);
            const label = labelInput.value.trim();
            if (!label) { this.showNotification('Please enter a field name', 2000, true); return; }

            const id = settings.addConstantField(label, valueInput.value.trim());
            settings.set('fieldOrder', [...settings.get('fieldOrder'), id]);
            labelInput.value = ''; valueInput.value = '';
            this.populateFieldOrder(modal, settings, extractor);
            this.populateConstantFields(modal, settings);
            this.showNotification(`Added constant "${label}"`);
        });

        modal.querySelector(`#${prefix}-constant-fields-list`).addEventListener('click', (e) => {
            if (!e.target.classList.contains(`${prefix}-field-delete`)) return;
            const id = e.target.dataset.id;
            const field = settings.getConstantField(id);
            if (confirm(`Delete constant "${field?.label}"?`)) {
                settings.removeConstantField(id);
                this.populateFieldOrder(modal, settings, extractor);
                this.populateConstantFields(modal, settings);
            }
        });

        modal.querySelector(`#${prefix}-constant-fields-list`).addEventListener('input', (e) => {
            if (!e.target.classList.contains(`${prefix}-constant-value`)) return;
            const id = e.target.closest(`.${prefix}-constant-item`).dataset.id;
            const field = settings.getConstantField(id);
            if (field) { field.value = e.target.value; settings.save(); }
        });
    }

    static attachSheetsHandlers(modal, settings, extractor, sheetsManager) {
        const { prefix } = this.cfg;

        const renderMapping = (headers, currentMapping) => {
            const container = modal.querySelector(`#${prefix}-mapping-container`);
            container.innerHTML = '';

            const allDefs = extractor.getAllFieldDefinitions();
            const toOption = ([key, def]) => `<option value="${key}">${def.label}</option>`;
            const standardOpts = Object.entries(allDefs).filter(([, d]) => !d.isConstant && !d.isCustom).map(toOption).join('');
            const constantOpts = Object.entries(allDefs).filter(([, d]) => d.isConstant).map(toOption).join('');
            const customOpts = Object.entries(allDefs).filter(([, d]) => d.isCustom).map(toOption).join('');
            const fieldOptions = standardOpts
                + (constantOpts ? `<optgroup label="Constants">${constantOpts}</optgroup>` : '')
                + (customOpts ? `<optgroup label="Custom Empty">${customOpts}</optgroup>` : '');

            headers.forEach((header, index) => {
                const row = document.createElement('div');
                row.className = `${prefix}-group`;
                row.style.cssText = 'display:flex;align-items:center;gap:15px;margin-bottom:10px;';

                let defaultValue = (currentMapping && currentMapping[index]) ? currentMapping[index] : '';
                if (!defaultValue) {
                    const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '');
                    for (const [key, def] of Object.entries(allDefs)) {
                        const defNorm = def.label.toLowerCase().replace(/[^a-z0-9]/g, '');
                        if (norm.includes(defNorm) || defNorm.includes(norm)) { defaultValue = key; break; }
                    }
                }

                row.innerHTML = `
                    <label style="width:40%;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${header}">${header}</label>
                    <select class="${prefix}-mapping-select" data-index="${index}" style="width:60%;">
                        <option value="_empty_">-- Leave Empty --</option>
                        ${fieldOptions}
                    </select>
                `;
                if (defaultValue) row.querySelector('select').value = defaultValue;
                container.appendChild(row);
            });

            modal.querySelector(`#${prefix}-mapping-section`).style.display = 'block';
        };

        modal.querySelector(`#${prefix}-test-load`).addEventListener('click', async () => {
            const serviceAccountJson = modal.querySelector(`#${prefix}-service-account`).value.trim();
            const spreadsheetId = modal.querySelector(`#${prefix}-spreadsheet-id`).value.trim();
            const sheetName = modal.querySelector(`#${prefix}-sheet-name`).value.trim();
            const errorDiv = modal.querySelector(`#${prefix}-error`);

            if (!serviceAccountJson || !spreadsheetId || !sheetName) {
                errorDiv.textContent = 'Please fill in all fields first';
                errorDiv.style.display = 'block';
                return;
            }
            try { JSON.parse(serviceAccountJson); } catch {
                errorDiv.textContent = 'Invalid Service Account JSON';
                errorDiv.style.display = 'block';
                return;
            }

            errorDiv.style.display = 'none';
            const btn = modal.querySelector(`#${prefix}-test-load`);
            const orig = btn.textContent;
            btn.textContent = 'Connecting...';
            btn.disabled = true;

            try {
                const tempManager = new GoogleSheetsManager({
                    getGoogleSheetsSettings: () => ({ serviceAccountJson, spreadsheetId, sheetName })
                });
                const headers = await tempManager.getSheetHeaders();
                if (!headers || !headers.length) throw new Error('No headers found in row 1. Please add headers to your sheet.');

                this.showNotification('Connected! Loading columns...');
                renderMapping(headers, settings.getGoogleSheetsSettings().columnMapping);
            } catch (error) {
                errorDiv.textContent = `Error: ${error.message}`;
                errorDiv.style.display = 'block';
                this.showNotification('Connection failed', 3000, true);
            } finally {
                btn.textContent = orig;
                btn.disabled = false;
            }
        });
    }

    static attachSaveHandler(modal, settings, extractor) {
        const { prefix, formatOptions } = this.cfg;

        modal.querySelector(`#${prefix}-save`).addEventListener('click', () => {
            for (const opt of (formatOptions || [])) {
                const el = modal.querySelector(`#${prefix}-${opt.id}`);
                if (el) settings.set(opt.settingKey, el.value);
            }

            const newOrder = Array.from(modal.querySelectorAll(`#${prefix}-field-list .${prefix}-field-item`))
                .map(item => item.dataset.field);
            settings.set('fieldOrder', newOrder);

            for (const item of modal.querySelectorAll(`#${prefix}-constant-fields-list .${prefix}-constant-item`)) {
                const field = settings.getConstantField(item.dataset.id);
                if (field) field.value = item.querySelector(`.${prefix}-constant-value`).value;
            }
            settings.save();

            if (this.backend === 'obsidian') {
                const baseUrl = modal.querySelector(`#${prefix}-obsidian-base-url`).value.trim();
                const apiKey = modal.querySelector(`#${prefix}-obsidian-api-key`).value.trim();

                if (!baseUrl || !apiKey) {
                    this.showNotification('Please fill in both Obsidian fields', 2000, true);
                    return;
                }

                settings.setObsidianSettings({ baseUrl, apiKey });
                this.showNotification('Settings saved!');
                modal.classList.remove('show');
                return;
            }

            const serviceAccountJson = modal.querySelector(`#${prefix}-service-account`).value.trim();
            const spreadsheetId = modal.querySelector(`#${prefix}-spreadsheet-id`).value.trim();
            const sheetName = modal.querySelector(`#${prefix}-sheet-name`).value.trim();

            if (!serviceAccountJson || !spreadsheetId || !sheetName) {
                this.showNotification('Please fill in all Google Sheets fields', 2000, true);
                return;
            }
            try { JSON.parse(serviceAccountJson); } catch {
                this.showNotification('Invalid JSON format', 2000, true);
                return;
            }

            const mappingSelects = modal.querySelectorAll(`.${prefix}-mapping-select`);
            const columnMapping = mappingSelects.length > 0
                ? Array.from(mappingSelects)
                    .sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index))
                    .map(s => s.value)
                : settings.getGoogleSheetsSettings().columnMapping || [];

            const matchField = modal.querySelector(`#${prefix}-match-field`).value;

            settings.setGoogleSheetsSettings({ serviceAccountJson, spreadsheetId, sheetName, columnMapping, matchField });
            this.showNotification('Settings saved!');
            modal.classList.remove('show');
        });

        modal.querySelector(`#${prefix}-reset`).addEventListener('click', () => {
            if (confirm('Reset all settings to default?')) {
                settings.reset();
                this.populateSettings(modal, settings, extractor);
                this.showNotification('Settings reset to default');
            }
        });
    }

    static escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    /**
     * Compare an incoming item against the existing sheet row and let the user
     * pick which value to keep per conflicting field.
     *
     * @param {Array<{index:number,label:string,existing:string,incoming:string}>} diffs
     * @returns {Promise<Object|null>} map of colIndex -> chosen value, or null if cancelled.
     */
    static showMergeDialog(diffs) {
        const { prefix } = this.cfg;

        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = `${prefix}-modal show`;
            modal.innerHTML = `
                <div class="${prefix}-content">
                    <div class="${prefix}-header">
                        <div class="${prefix}-title">Row Already Exists</div>
                        <button class="${prefix}-close">&times;</button>
                    </div>
                    <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                        This item is already in your sheet. Choose which value to keep for each changed field.
                    </p>
                    <div class="${prefix}-btn-group" style="margin-top: 0; margin-bottom: 12px;">
                        <button class="${prefix}-btn ${prefix}-btn-secondary ${prefix}-btn-small" data-all="existing">Keep all current</button>
                        <button class="${prefix}-btn ${prefix}-btn-secondary ${prefix}-btn-small" data-all="incoming">Use all new</button>
                    </div>
                    <div class="${prefix}-merge-list">${diffs.map((d, i) => this.mergeRowHtml(d, i)).join('')}</div>
                    <div class="${prefix}-btn-group" style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px;">
                        <button class="${prefix}-btn ${prefix}-btn-primary" data-action="confirm">Update Row</button>
                        <button class="${prefix}-btn ${prefix}-btn-secondary" data-action="cancel">Cancel</button>
                    </div>
                </div>`;

            this.attachMergeHandlers(modal, diffs, resolve);
            document.body.appendChild(modal);
        });
    }

    static mergeRowHtml(diff, i) {
        const { prefix } = this.cfg;
        const empty = '<em style="color:#aaa;">(empty)</em>';
        const choice = (which, tag, cls, value, checked) => `
            <label class="${prefix}-merge-choice${checked ? ' selected' : ''}" data-choice="${which}">
                <input type="radio" name="${prefix}-merge-${i}" value="${which}"${checked ? ' checked' : ''}>
                <span><span class="${prefix}-merge-tag">${tag}</span><span class="${cls}">${this.escapeHtml(value) || empty}</span></span>
            </label>`;
        return `
            <div class="${prefix}-merge-row">
                <div class="${prefix}-merge-field">${this.escapeHtml(diff.label)}</div>
                <div class="${prefix}-merge-values">
                    ${choice('existing', 'Current', `${prefix}-merge-old`, diff.existing, false)}
                    ${choice('incoming', 'New', `${prefix}-merge-new`, diff.incoming, true)}
                </div>
            </div>`;
    }

    static attachMergeHandlers(modal, diffs, resolve) {
        const { prefix } = this.cfg;
        const list = modal.querySelector(`.${prefix}-merge-list`);

        list.addEventListener('change', (e) => {
            e.target.closest(`.${prefix}-merge-values`)
                .querySelectorAll(`.${prefix}-merge-choice`)
                .forEach(l => l.classList.toggle('selected', l.querySelector('input').checked));
        });

        modal.querySelectorAll('[data-all]').forEach(btn => {
            btn.addEventListener('click', () => {
                list.querySelectorAll(`.${prefix}-merge-choice[data-choice="${btn.dataset.all}"] input`)
                    .forEach(input => { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); });
            });
        });

        const cleanup = (result) => { modal.remove(); resolve(result); };
        modal.querySelector(`.${prefix}-close`).addEventListener('click', () => cleanup(null));
        modal.querySelector('[data-action="cancel"]').addEventListener('click', () => cleanup(null));
        modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(null); });

        modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            const resolution = {};
            diffs.forEach((diff, i) => {
                const checked = modal.querySelector(`input[name="${prefix}-merge-${i}"]:checked`);
                resolution[diff.index] = (checked && checked.value === 'existing') ? diff.existing : diff.incoming;
            });
            cleanup(resolution);
        });
    }
}
