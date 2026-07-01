// ==UserScript==
// @name         Goodreads to Google Sheets
// @namespace    https://github.com/laurinsorgend
// @version      1.4
// @author       laurin@sorgend.eu
// @description  Adds a button to send book information directly to Google Sheets using Googles API
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/dist/goodreadsToGoogleSheets.user.js
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/dist/goodreadsToGoogleSheets.meta.js
// @match        https://www.goodreads.com/book/show/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/10.9.0/jsrsasign-all-min.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function (KJUR) {
  'use strict';

  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
  function getText(primary, fallbacks = []) {
    let el = document.querySelector(primary);
    let i = 0;
    while (!el && i < fallbacks.length) {
      el = document.querySelector(fallbacks[i++]);
    }
    return el ? el.textContent.trim() : "";
  }
  function waitForElement(selector, callback, checkFreq = 100, timeout = 15e3) {
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
  async function sendToSheet(sheetsManager, extractor, info, UI2, label = "Item") {
    const defs = extractor.getAllFieldDefinitions();
    const result = await sheetsManager.upsert(info, (diffs) => {
      const enriched = diffs.map((d) => {
        var _a;
        return { ...d, label: ((_a = defs[d.key]) == null ? void 0 : _a.label) || d.key };
      });
      return UI2.showMergeDialog(enriched);
    });
    const messages = {
      appended: `${label} sent to Google Sheets!`,
      updated: "Existing row updated!",
      unchanged: "Already up to date — nothing to change",
      cancelled: "Update cancelled"
    };
    UI2.showNotification(messages[result.action] || messages.appended, 2500, result.action === "cancelled");
    return result;
  }
  const SEPARATOR_OPTIONS = [
    { value: "	", label: "Tab" },
    { value: ",", label: "Comma" },
    { value: ";", label: "Semicolon" },
    { value: "|", label: "Pipe" }
  ];
  var _GM_addStyle = /* @__PURE__ */ (() => typeof GM_addStyle != "undefined" ? GM_addStyle : void 0)();
  var _GM_getValue = /* @__PURE__ */ (() => typeof GM_getValue != "undefined" ? GM_getValue : void 0)();
  var _GM_setValue = /* @__PURE__ */ (() => typeof GM_setValue != "undefined" ? GM_setValue : void 0)();
  var _GM_xmlhttpRequest = /* @__PURE__ */ (() => typeof GM_xmlhttpRequest != "undefined" ? GM_xmlhttpRequest : void 0)();
  class SettingsManager {
    constructor({ storageKey = "settings", defaultSettings } = {}) {
      this.storageKey = storageKey;
      this.defaultSettings = defaultSettings || {};
      this.settings = this.load();
    }
    load() {
      try {
        const saved = _GM_getValue(this.storageKey, null);
        return saved ? { ...this.defaultSettings, ...JSON.parse(saved) } : { ...this.defaultSettings };
      } catch {
        return { ...this.defaultSettings };
      }
    }
    save() {
      try {
        _GM_setValue(this.storageKey, JSON.stringify(this.settings));
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
      this.settings.customEmptyFields = this.settings.customEmptyFields.filter((f) => f.id !== id);
      this.settings.fieldOrder = this.settings.fieldOrder.filter((f) => f !== id);
      this.save();
    }
    getCustomEmptyField(id) {
      return this.settings.customEmptyFields.find((f) => f.id === id);
    }
    addConstantField(label, value) {
      const id = `const_${Date.now()}`;
      this.settings.constantFields.push({ id, label, value });
      this.save();
      return id;
    }
    removeConstantField(id) {
      this.settings.constantFields = this.settings.constantFields.filter((f) => f.id !== id);
      this.settings.fieldOrder = this.settings.fieldOrder.filter((f) => f !== id);
      this.save();
    }
    getConstantField(id) {
      return this.settings.constantFields.find((f) => f.id === id);
    }
    updateConstantField(id, label, value) {
      const field = this.settings.constantFields.find((f) => f.id === id);
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
  }
  class InfoExtractor {
    constructor(settings, { fieldDefinitions = {}, debug = false } = {}) {
      this.settings = settings;
      this.fieldDefinitions = fieldDefinitions;
      this.debug = debug;
    }
    getAllFieldDefinitions() {
      const definitions = { ...this.fieldDefinitions };
      this.settings.get("customEmptyFields").forEach((field) => {
        definitions[field.id] = {
          label: field.label,
          extract: () => "",
          format: (value) => value,
          isCustom: true
        };
      });
      this.settings.get("constantFields").forEach((field) => {
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
          data[key] = "";
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
          formatted[key] = data[key] || "";
        }
      }
      return formatted;
    }
    buildOutput(formatted) {
      const order = this.settings.get("fieldOrder");
      const separator = this.settings.get("separator");
      return order.map((field) => formatted[field] || "").join(separator);
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
  class GoogleSheetsManager {
    constructor(settings) {
      this.settings = settings;
      this.accessToken = null;
      this.tokenExpiration = 0;
    }
    async getAccessToken() {
      const now = Math.floor(Date.now() / 1e3);
      if (this.accessToken && now < this.tokenExpiration) {
        return this.accessToken;
      }
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      if (!sheetsSettings.serviceAccountJson) {
        throw new Error("Service Account JSON is not configured.");
      }
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(sheetsSettings.serviceAccountJson);
      } catch (e) {
        throw new Error("Invalid Service Account JSON format.");
      }
      if (!serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error("Service Account JSON is missing required fields.");
      }
      const claim = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
      };
      const sHeader = JSON.stringify({ alg: "RS256", typ: "JWT" });
      const sPayload = JSON.stringify(claim);
      const sJWT = KJUR.jws.JWS.sign("RS256", sHeader, sPayload, serviceAccount.private_key);
      return new Promise((resolve, reject) => {
        _GM_xmlhttpRequest({
          method: "POST",
          url: "https://oauth2.googleapis.com/token",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + sJWT,
          onload: (response) => {
            if (response.status === 200) {
              try {
                const tokenData = JSON.parse(response.responseText);
                this.accessToken = tokenData.access_token;
                this.tokenExpiration = now + tokenData.expires_in - 60;
                resolve(this.accessToken);
              } catch (e) {
                reject(new Error("Failed to parse token response"));
              }
            } else {
              reject(new Error("Failed to get access token: " + response.responseText));
            }
          },
          onerror: (error) => reject(new Error(`Network error getting token: ${error.error}`)),
          ontimeout: () => reject(new Error("Token request timed out"))
        });
      });
    }
    async getSheetHeaders() {
      const settings = this.settings.getGoogleSheetsSettings();
      if (!settings.spreadsheetId || !settings.sheetName) return [];
      const accessToken = await this.getAccessToken();
      const range = encodeURIComponent(`'${settings.sheetName}'!1:1`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}`;
      return new Promise((resolve, reject) => {
        _GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { "Authorization": `Bearer ${accessToken}` },
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              try {
                const data = JSON.parse(response.responseText);
                resolve(data.values && data.values.length > 0 ? data.values[0] : []);
              } catch (e) {
                reject(new Error("Failed to parse headers"));
              }
            } else {
              reject(new Error("Failed to fetch headers: " + response.responseText));
            }
          },
          onerror: () => reject(new Error("Network error fetching headers"))
        });
      });
    }
    async appendToSheet(data) {
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
        throw new Error("Google Sheets settings are not configured. Please open the settings modal to configure your credentials.");
      }
      const formattedData = this.formatDataForSheet(data);
      const accessToken = await this.getAccessToken();
      return this.makeApiRequest(formattedData, sheetsSettings, accessToken);
    }
    /**
     * Send an item to the sheet, updating an existing row when one already holds
     * the same value in the configured match field instead of appending a
     * duplicate. Empty incoming values never overwrite existing data.
     *
     * @param {Object} data Formatted field map from the extractor.
     * @param {Function} [resolveConflicts] async (diffs) => ({ [colIndex]: value })
     *        | null. Called with the fields that would change so a UI can let the
     *        user choose; returning null aborts the update.
     * @returns {Promise<{action: 'appended'|'updated'|'unchanged'|'cancelled'}>}
     */
    async upsert(data, resolveConflicts) {
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
        throw new Error("Google Sheets settings are not configured. Please open the settings modal to configure your credentials.");
      }
      const order = this.getEffectiveOrder();
      const newValues = this.formatDataForSheet(data).values;
      const matchCol = order.indexOf(this.getMatchFieldKey());
      if (matchCol === -1 || !this.normalize(newValues[matchCol])) {
        await this._appendRow(newValues);
        return { action: "appended" };
      }
      const found = this.findExistingRow(await this.fetchRows(), matchCol, newValues[matchCol]);
      if (!found) {
        await this._appendRow(newValues);
        return { action: "appended" };
      }
      return this._mergeAndUpdate(order, newValues, found, resolveConflicts);
    }
    /** Resolve conflicts (optionally via the callback) and write the merged row. */
    async _mergeAndUpdate(order, newValues, found, resolveConflicts) {
      const merged = order.map((key, i) => newValues[i] !== "" ? newValues[i] : found.row[i] ?? "");
      const diffs = order.reduce((acc, key, i) => {
        const incoming = newValues[i] ?? "";
        const existing = found.row[i] ?? "";
        if (incoming !== "" && incoming !== existing) acc.push({ index: i, key, existing, incoming });
        return acc;
      }, []);
      if (diffs.length && typeof resolveConflicts === "function") {
        const resolution = await resolveConflicts(diffs);
        if (resolution === null) return { action: "cancelled" };
        for (const idx of Object.keys(resolution)) merged[idx] = resolution[idx];
      } else if (!diffs.length) {
        return { action: "unchanged" };
      }
      await this._updateRow(found.rowNumber, merged);
      return { action: "updated" };
    }
    /** Effective column order: explicit column mapping, else the field order. */
    getEffectiveOrder() {
      const mapping = this.settings.getGoogleSheetsSettings().columnMapping;
      return mapping && mapping.length > 0 ? mapping : this.settings.get("fieldOrder");
    }
    getMatchFieldKey() {
      return this.settings.getGoogleSheetsSettings().matchField || "link";
    }
    /** Loosely compare cell values (trim, lowercase, ignore trailing slash). */
    normalize(value) {
      return String(value ?? "").trim().toLowerCase().replace(/\/+$/, "");
    }
    /** All value rows of the sheet (including the header row). */
    async fetchRows() {
      const settings = this.settings.getGoogleSheetsSettings();
      const accessToken = await this.getAccessToken();
      const range = encodeURIComponent(`'${settings.sheetName}'`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}`;
      const data = await this._request("GET", url, null, accessToken);
      return data.values || [];
    }
    /** Find the first data row whose match column equals matchValue. */
    findExistingRow(rows, matchCol, matchValue) {
      const target = this.normalize(matchValue);
      for (let i = 1; i < rows.length; i++) {
        if (this.normalize(rows[i][matchCol]) === target) {
          return { rowNumber: i + 1, row: rows[i] };
        }
      }
      return null;
    }
    async _appendRow(values) {
      const settings = this.settings.getGoogleSheetsSettings();
      const accessToken = await this.getAccessToken();
      return this.makeApiRequest({ values }, settings, accessToken);
    }
    async _updateRow(rowNumber, values) {
      const settings = this.settings.getGoogleSheetsSettings();
      const accessToken = await this.getAccessToken();
      const lastCol = this.columnLetter(values.length);
      const range = encodeURIComponent(`'${settings.sheetName}'!A${rowNumber}:${lastCol}${rowNumber}`);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
      return this._request("PUT", url, { values: [values] }, accessToken);
    }
    /** 1-based column number to A1 column letters (1 -> A, 27 -> AA). */
    columnLetter(n) {
      let letter = "";
      while (n > 0) {
        const rem = (n - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        n = Math.floor((n - 1) / 26);
      }
      return letter || "A";
    }
    _request(method, url, body, accessToken) {
      return new Promise((resolve, reject) => {
        _GM_xmlhttpRequest({
          method,
          url,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          data: body ? JSON.stringify(body) : void 0,
          onload: (response) => {
            var _a;
            if (response.status >= 200 && response.status < 300) {
              try {
                resolve(JSON.parse(response.responseText));
              } catch (e) {
                reject(new Error("Invalid response from Google Sheets API"));
              }
            } else {
              let message = "Unknown error";
              try {
                message = ((_a = JSON.parse(response.responseText).error) == null ? void 0 : _a.message) || message;
              } catch (e) {
                message = response.responseText || message;
              }
              reject(new Error(message));
            }
          },
          onerror: (error) => reject(new Error(`Network error: ${error.error}`)),
          ontimeout: () => reject(new Error("Request timed out"))
        });
      });
    }
    formatDataForSheet(data) {
      const values = this.getEffectiveOrder().map((field) => {
        if (!field || field === "_empty_") return "";
        return data[field] || "";
      });
      return { values };
    }
    makeApiRequest(data, settings, accessToken) {
      return new Promise((resolve, reject) => {
        const range = encodeURIComponent(`'${settings.sheetName}'!A:A`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
        _GM_xmlhttpRequest({
          method: "POST",
          url,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          data: JSON.stringify({ values: [data.values] }),
          onload: (response) => {
            var _a;
            if (response.status >= 200 && response.status < 300) {
              try {
                resolve(JSON.parse(response.responseText));
              } catch (e) {
                reject(new Error("Invalid response from Google Sheets API"));
              }
            } else {
              let errorMessage = "Unknown error";
              try {
                const errorData = JSON.parse(response.responseText);
                errorMessage = ((_a = errorData.error) == null ? void 0 : _a.message) || errorMessage;
              } catch (e) {
                errorMessage = response.responseText || errorMessage;
              }
              reject(new Error(errorMessage));
            }
          },
          onerror: (error) => reject(new Error(`Network error: ${error.error}`)),
          ontimeout: () => reject(new Error("Request timed out"))
        });
      });
    }
    validateSettings() {
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      const errors = [];
      if (!sheetsSettings.serviceAccountJson) {
        errors.push("Service Account JSON is required");
      } else {
        try {
          const json = JSON.parse(sheetsSettings.serviceAccountJson);
          if (!json.client_email || !json.private_key) {
            errors.push("Service Account JSON missing required fields");
          }
        } catch {
          errors.push("Invalid Service Account JSON");
        }
      }
      if (!sheetsSettings.spreadsheetId) errors.push("Spreadsheet ID is required");
      if (!sheetsSettings.sheetName) errors.push("Sheet Name is required");
      return errors;
    }
  }
  class SettingsUI {
    static get cfg() {
      return this.CONFIG;
    }
    static get p() {
      return this.CONFIG.prefix;
    }
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
      if (typeof _GM_addStyle === "function") {
        _GM_addStyle(css);
      } else {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      }
    }
    static showNotification(message, duration = 2e3, isError = false) {
      const { prefix } = this.cfg;
      const existing = document.querySelector(`.${prefix}-notification`);
      if (existing) existing.remove();
      const n = document.createElement("div");
      n.className = `${prefix}-notification${isError ? " error" : ""}`;
      n.textContent = message;
      document.body.appendChild(n);
      setTimeout(() => n.classList.add("show"), 10);
      setTimeout(() => {
        n.classList.remove("show");
        setTimeout(() => n.remove(), 300);
      }, duration);
    }
    static formatOptionsHtml() {
      const { prefix, formatOptions } = this.cfg;
      return (formatOptions || []).map((opt) => `
            <div class="${prefix}-group">
                <label for="${prefix}-${opt.id}">${opt.label}</label>
                <select id="${prefix}-${opt.id}">
                    ${opt.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}
                </select>
                ${opt.hint ? `<div class="hint">${opt.hint}</div>` : ""}
            </div>
        `).join("");
    }
    static createSettingsModal(settings, extractor, sheetsManager) {
      const { prefix, modalTitle, mappingDescription } = this.cfg;
      const modal = document.createElement("div");
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
                    <button class="${prefix}-tab" data-tab="sheets">Google Sheets</button>
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

                <div id="${prefix}-tab-sheets" class="${prefix}-tab-content">
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
                </div>

                <div class="${prefix}-btn-group" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                    <button class="${prefix}-btn ${prefix}-btn-primary" id="${prefix}-save">Save Settings</button>
                    <button class="${prefix}-btn ${prefix}-btn-secondary" id="${prefix}-reset">Reset to Default</button>
                    <button class="${prefix}-btn ${prefix}-btn-secondary" id="${prefix}-cancel">Cancel</button>
                </div>

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
            </div>
        `;
      document.body.appendChild(modal);
      this.populateSettings(modal, settings, extractor);
      this.attachSettingsHandlers(modal, settings, extractor, sheetsManager);
      return modal;
    }
    static populateSettings(modal, settings, extractor) {
      var _a;
      const { prefix, formatOptions, defaultSheetName } = this.cfg;
      for (const opt of formatOptions || []) {
        const el = modal.querySelector(`#${prefix}-${opt.id}`);
        if (el) el.value = settings.get(opt.settingKey) ?? ((_a = opt.options[0]) == null ? void 0 : _a.value) ?? "";
      }
      const sheetsSettings = settings.getGoogleSheetsSettings();
      modal.querySelector(`#${prefix}-service-account`).value = sheetsSettings.serviceAccountJson || "";
      modal.querySelector(`#${prefix}-spreadsheet-id`).value = sheetsSettings.spreadsheetId || "";
      modal.querySelector(`#${prefix}-sheet-name`).value = sheetsSettings.sheetName || defaultSheetName;
      this.populateMatchField(modal, settings, extractor);
      this.populateFieldOrder(modal, settings, extractor);
      this.populateCustomFields(modal, settings);
      this.populateConstantFields(modal, settings);
    }
    static populateFieldOrder(modal, settings, extractor) {
      const { prefix } = this.cfg;
      const fieldList = modal.querySelector(`#${prefix}-field-list`);
      fieldList.innerHTML = "";
      const allDefs = extractor.getAllFieldDefinitions();
      for (const fieldKey of settings.get("fieldOrder")) {
        const def = allDefs[fieldKey];
        if (!def) continue;
        const item = document.createElement("div");
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
      select.innerHTML = Object.entries(allDefs).map(([key, def]) => `<option value="${key}">${def.label}</option>`).join("");
      select.value = settings.getGoogleSheetsSettings().matchField || "link";
    }
    static populateCustomFields(modal, settings) {
      const { prefix } = this.cfg;
      const container = modal.querySelector(`#${prefix}-custom-fields-list`);
      container.innerHTML = "";
      for (const field of settings.get("customEmptyFields") || []) {
        const item = document.createElement("div");
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
      container.innerHTML = "";
      for (const field of settings.get("constantFields") || []) {
        const item = document.createElement("div");
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
      container.addEventListener("dragstart", (e) => {
        dragged = e.target.closest(`.${prefix}-field-item`);
        e.dataTransfer.effectAllowed = "move";
      });
      container.addEventListener("dragover", (e) => {
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
        return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    static attachSettingsHandlers(modal, settings, extractor, sheetsManager) {
      const { prefix } = this.cfg;
      modal.querySelector(`.${prefix}-close`).addEventListener("click", () => modal.classList.remove("show"));
      modal.querySelector(`#${prefix}-cancel`).addEventListener("click", () => modal.classList.remove("show"));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("show");
      });
      modal.querySelectorAll(`.${prefix}-tab`).forEach((tab) => {
        tab.addEventListener("click", () => {
          modal.querySelectorAll(`.${prefix}-tab`).forEach((t) => t.classList.remove("active"));
          modal.querySelectorAll(`.${prefix}-tab-content`).forEach((c) => c.classList.remove("active"));
          tab.classList.add("active");
          modal.querySelector(`#${prefix}-tab-${tab.dataset.tab}`).classList.add("active");
        });
      });
      this.attachFieldHandlers(modal, settings, extractor);
      this.attachSheetsHandlers(modal, settings, extractor, sheetsManager);
      this.attachSaveHandler(modal, settings, extractor);
    }
    static attachFieldHandlers(modal, settings, extractor) {
      const { prefix } = this.cfg;
      modal.querySelector(`#${prefix}-add-custom-field`).addEventListener("click", () => {
        const input = modal.querySelector(`#${prefix}-new-custom-field`);
        const name = input.value.trim();
        if (!name) {
          this.showNotification("Please enter a field name", 2e3, true);
          return;
        }
        const id = settings.addCustomEmptyField(name);
        settings.set("fieldOrder", [...settings.get("fieldOrder"), id]);
        input.value = "";
        this.populateFieldOrder(modal, settings, extractor);
        this.populateCustomFields(modal, settings);
        this.showNotification(`Added "${name}"`);
      });
      modal.querySelector(`#${prefix}-custom-fields-list`).addEventListener("click", (e) => {
        if (!e.target.classList.contains(`${prefix}-field-delete`)) return;
        const id = e.target.dataset.id;
        const field = settings.getCustomEmptyField(id);
        if (confirm(`Delete "${field == null ? void 0 : field.label}"?`)) {
          settings.removeCustomEmptyField(id);
          this.populateFieldOrder(modal, settings, extractor);
          this.populateCustomFields(modal, settings);
        }
      });
      modal.querySelector(`#${prefix}-add-constant`).addEventListener("click", () => {
        const labelInput = modal.querySelector(`#${prefix}-new-constant-label`);
        const valueInput = modal.querySelector(`#${prefix}-new-constant-value`);
        const label = labelInput.value.trim();
        if (!label) {
          this.showNotification("Please enter a field name", 2e3, true);
          return;
        }
        const id = settings.addConstantField(label, valueInput.value.trim());
        settings.set("fieldOrder", [...settings.get("fieldOrder"), id]);
        labelInput.value = "";
        valueInput.value = "";
        this.populateFieldOrder(modal, settings, extractor);
        this.populateConstantFields(modal, settings);
        this.showNotification(`Added constant "${label}"`);
      });
      modal.querySelector(`#${prefix}-constant-fields-list`).addEventListener("click", (e) => {
        if (!e.target.classList.contains(`${prefix}-field-delete`)) return;
        const id = e.target.dataset.id;
        const field = settings.getConstantField(id);
        if (confirm(`Delete constant "${field == null ? void 0 : field.label}"?`)) {
          settings.removeConstantField(id);
          this.populateFieldOrder(modal, settings, extractor);
          this.populateConstantFields(modal, settings);
        }
      });
      modal.querySelector(`#${prefix}-constant-fields-list`).addEventListener("input", (e) => {
        if (!e.target.classList.contains(`${prefix}-constant-value`)) return;
        const id = e.target.closest(`.${prefix}-constant-item`).dataset.id;
        const field = settings.getConstantField(id);
        if (field) {
          field.value = e.target.value;
          settings.save();
        }
      });
    }
    static attachSheetsHandlers(modal, settings, extractor, sheetsManager) {
      const { prefix } = this.cfg;
      const renderMapping = (headers, currentMapping) => {
        const container = modal.querySelector(`#${prefix}-mapping-container`);
        container.innerHTML = "";
        const allDefs = extractor.getAllFieldDefinitions();
        const toOption = ([key, def]) => `<option value="${key}">${def.label}</option>`;
        const standardOpts = Object.entries(allDefs).filter(([, d]) => !d.isConstant && !d.isCustom).map(toOption).join("");
        const constantOpts = Object.entries(allDefs).filter(([, d]) => d.isConstant).map(toOption).join("");
        const customOpts = Object.entries(allDefs).filter(([, d]) => d.isCustom).map(toOption).join("");
        const fieldOptions = standardOpts + (constantOpts ? `<optgroup label="Constants">${constantOpts}</optgroup>` : "") + (customOpts ? `<optgroup label="Custom Empty">${customOpts}</optgroup>` : "");
        headers.forEach((header, index) => {
          const row = document.createElement("div");
          row.className = `${prefix}-group`;
          row.style.cssText = "display:flex;align-items:center;gap:15px;margin-bottom:10px;";
          let defaultValue = currentMapping && currentMapping[index] ? currentMapping[index] : "";
          if (!defaultValue) {
            const norm = header.toLowerCase().replace(/[^a-z0-9]/g, "");
            for (const [key, def] of Object.entries(allDefs)) {
              const defNorm = def.label.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (norm.includes(defNorm) || defNorm.includes(norm)) {
                defaultValue = key;
                break;
              }
            }
          }
          row.innerHTML = `
                    <label style="width:40%;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${header}">${header}</label>
                    <select class="${prefix}-mapping-select" data-index="${index}" style="width:60%;">
                        <option value="_empty_">-- Leave Empty --</option>
                        ${fieldOptions}
                    </select>
                `;
          if (defaultValue) row.querySelector("select").value = defaultValue;
          container.appendChild(row);
        });
        modal.querySelector(`#${prefix}-mapping-section`).style.display = "block";
      };
      modal.querySelector(`#${prefix}-test-load`).addEventListener("click", async () => {
        const serviceAccountJson = modal.querySelector(`#${prefix}-service-account`).value.trim();
        const spreadsheetId = modal.querySelector(`#${prefix}-spreadsheet-id`).value.trim();
        const sheetName = modal.querySelector(`#${prefix}-sheet-name`).value.trim();
        const errorDiv = modal.querySelector(`#${prefix}-error`);
        if (!serviceAccountJson || !spreadsheetId || !sheetName) {
          errorDiv.textContent = "Please fill in all fields first";
          errorDiv.style.display = "block";
          return;
        }
        try {
          JSON.parse(serviceAccountJson);
        } catch {
          errorDiv.textContent = "Invalid Service Account JSON";
          errorDiv.style.display = "block";
          return;
        }
        errorDiv.style.display = "none";
        const btn = modal.querySelector(`#${prefix}-test-load`);
        const orig = btn.textContent;
        btn.textContent = "Connecting...";
        btn.disabled = true;
        try {
          const tempManager = new GoogleSheetsManager({
            getGoogleSheetsSettings: () => ({ serviceAccountJson, spreadsheetId, sheetName })
          });
          const headers = await tempManager.getSheetHeaders();
          if (!headers || !headers.length) throw new Error("No headers found in row 1. Please add headers to your sheet.");
          this.showNotification("Connected! Loading columns...");
          renderMapping(headers, settings.getGoogleSheetsSettings().columnMapping);
        } catch (error) {
          errorDiv.textContent = `Error: ${error.message}`;
          errorDiv.style.display = "block";
          this.showNotification("Connection failed", 3e3, true);
        } finally {
          btn.textContent = orig;
          btn.disabled = false;
        }
      });
    }
    static attachSaveHandler(modal, settings, extractor) {
      const { prefix, formatOptions } = this.cfg;
      modal.querySelector(`#${prefix}-save`).addEventListener("click", () => {
        for (const opt of formatOptions || []) {
          const el = modal.querySelector(`#${prefix}-${opt.id}`);
          if (el) settings.set(opt.settingKey, el.value);
        }
        const newOrder = Array.from(modal.querySelectorAll(`#${prefix}-field-list .${prefix}-field-item`)).map((item) => item.dataset.field);
        settings.set("fieldOrder", newOrder);
        for (const item of modal.querySelectorAll(`#${prefix}-constant-fields-list .${prefix}-constant-item`)) {
          const field = settings.getConstantField(item.dataset.id);
          if (field) field.value = item.querySelector(`.${prefix}-constant-value`).value;
        }
        settings.save();
        const serviceAccountJson = modal.querySelector(`#${prefix}-service-account`).value.trim();
        const spreadsheetId = modal.querySelector(`#${prefix}-spreadsheet-id`).value.trim();
        const sheetName = modal.querySelector(`#${prefix}-sheet-name`).value.trim();
        if (!serviceAccountJson || !spreadsheetId || !sheetName) {
          this.showNotification("Please fill in all Google Sheets fields", 2e3, true);
          return;
        }
        try {
          JSON.parse(serviceAccountJson);
        } catch {
          this.showNotification("Invalid JSON format", 2e3, true);
          return;
        }
        const mappingSelects = modal.querySelectorAll(`.${prefix}-mapping-select`);
        const columnMapping = mappingSelects.length > 0 ? Array.from(mappingSelects).sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index)).map((s) => s.value) : settings.getGoogleSheetsSettings().columnMapping || [];
        const matchField = modal.querySelector(`#${prefix}-match-field`).value;
        settings.setGoogleSheetsSettings({ serviceAccountJson, spreadsheetId, sheetName, columnMapping, matchField });
        this.showNotification("Settings saved!");
        modal.classList.remove("show");
      });
      modal.querySelector(`#${prefix}-reset`).addEventListener("click", () => {
        if (confirm("Reset all settings to default?")) {
          settings.reset();
          this.populateSettings(modal, settings, extractor);
          this.showNotification("Settings reset to default");
        }
      });
    }
    static escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]);
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
        const modal = document.createElement("div");
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
                    <div class="${prefix}-merge-list">${diffs.map((d, i) => this.mergeRowHtml(d, i)).join("")}</div>
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
            <label class="${prefix}-merge-choice${checked ? " selected" : ""}" data-choice="${which}">
                <input type="radio" name="${prefix}-merge-${i}" value="${which}"${checked ? " checked" : ""}>
                <span><span class="${prefix}-merge-tag">${tag}</span><span class="${cls}">${this.escapeHtml(value) || empty}</span></span>
            </label>`;
      return `
            <div class="${prefix}-merge-row">
                <div class="${prefix}-merge-field">${this.escapeHtml(diff.label)}</div>
                <div class="${prefix}-merge-values">
                    ${choice("existing", "Current", `${prefix}-merge-old`, diff.existing, false)}
                    ${choice("incoming", "New", `${prefix}-merge-new`, diff.incoming, true)}
                </div>
            </div>`;
    }
    static attachMergeHandlers(modal, diffs, resolve) {
      const { prefix } = this.cfg;
      const list = modal.querySelector(`.${prefix}-merge-list`);
      list.addEventListener("change", (e) => {
        e.target.closest(`.${prefix}-merge-values`).querySelectorAll(`.${prefix}-merge-choice`).forEach((l) => l.classList.toggle("selected", l.querySelector("input").checked));
      });
      modal.querySelectorAll("[data-all]").forEach((btn) => {
        btn.addEventListener("click", () => {
          list.querySelectorAll(`.${prefix}-merge-choice[data-choice="${btn.dataset.all}"] input`).forEach((input) => {
            input.checked = true;
            input.dispatchEvent(new Event("change", { bubbles: true }));
          });
        });
      });
      const cleanup = (result) => {
        modal.remove();
        resolve(result);
      };
      modal.querySelector(`.${prefix}-close`).addEventListener("click", () => cleanup(null));
      modal.querySelector('[data-action="cancel"]').addEventListener("click", () => cleanup(null));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) cleanup(null);
      });
      modal.querySelector('[data-action="confirm"]').addEventListener("click", () => {
        const resolution = {};
        diffs.forEach((diff, i) => {
          const checked = modal.querySelector(`input[name="${prefix}-merge-${i}"]:checked`);
          resolution[diff.index] = checked && checked.value === "existing" ? diff.existing : diff.incoming;
        });
        cleanup(resolution);
      });
    }
  }
  __publicField(SettingsUI, "CONFIG", null);
  const CONFIG = {
    prefix: "gr2gs",
    modalTitle: "Settings",
    mappingDescription: "Map your Google Sheet columns to Goodreads data fields.",
    defaultSheetName: "Sheet1",
    colors: { primary: "#00635d", primaryHover: "#004d47" },
    formatOptions: [
      { id: "separator", label: "Field Separator", settingKey: "separator", options: SEPARATOR_OPTIONS },
      {
        id: "author-format",
        label: "Author Format",
        settingKey: "authorFormat",
        options: [{ value: "full", label: "Full Name" }, { value: "lastFirst", label: "Last, First" }]
      },
      {
        id: "date-format",
        label: "Publish Date Format",
        settingKey: "dateFormat",
        options: [
          { value: "full", label: "Month Day, Year" },
          { value: "yearOnly", label: "Year Only" },
          { value: "iso", label: "ISO (YYYY-MM-DD)" }
        ]
      },
      {
        id: "dateadded-format",
        label: "Date Added Format",
        settingKey: "dateAddedFormat",
        options: [
          { value: "full", label: "UK Format" },
          { value: "us", label: "US Format" },
          { value: "iso", label: "ISO (YYYY-MM-DD)" }
        ]
      }
    ]
  };
  class UI extends SettingsUI {
    /**
     * Injects "Send to Sheets" and settings buttons into Goodreads' action bar.
     */
    static addButtons(onCopy, onSettings, onSendToSheets) {
      const buttonBar = this.findButtonBar();
      if (!buttonBar) return;
      const buttonGroup = document.createElement("div");
      buttonGroup.className = "ButtonGroup ButtonGroup--block";
      const settingsButtonContainer = document.createElement("div");
      settingsButtonContainer.className = "Button__container";
      settingsButtonContainer.innerHTML = `
            <button type="button" class="Button Button--secondary Button--medium Button--rounded" aria-label="Copy settings">
                <span class="Button__labelItem">
                    <i class="Icon ChevronIcon">
                        <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.12-.22.07-.49.12-.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/></svg>
                    </i>
                </span>
            </button>
        `;
      const sendToSheetsButtonContainer = document.createElement("div");
      sendToSheetsButtonContainer.className = "Button__container Button__container--block";
      sendToSheetsButtonContainer.innerHTML = `
            <button type="button" class="Button Button--secondary Button--medium Button--block" aria-label="Send to Google Sheets">
                <span class="Button__labelItem">Sheets</span>
            </button>
        `;
      settingsButtonContainer.querySelector("button").addEventListener("click", onSettings);
      sendToSheetsButtonContainer.querySelector("button").addEventListener("click", onSendToSheets);
      buttonGroup.appendChild(sendToSheetsButtonContainer);
      buttonGroup.appendChild(settingsButtonContainer);
      buttonBar.appendChild(buttonGroup);
    }
    static findButtonBar() {
      return document.querySelector(".BookActions") || document.querySelector('div[class*="BookActions"]') || document.querySelector(".BookPage__rightColumn");
    }
  }
  __publicField(UI, "CONFIG", CONFIG);
  function getMonthNumber(monthName) {
    const months = {
      January: 1,
      February: 2,
      March: 3,
      April: 4,
      May: 5,
      June: 6,
      July: 7,
      August: 8,
      September: 9,
      October: 10,
      November: 11,
      December: 12
    };
    return months[monthName] || 1;
  }
  function extractPageCount() {
    const pagesEl = document.querySelector('p[data-testid="pagesFormat"]');
    if (pagesEl) {
      const match = pagesEl.textContent.match(/(\d+)\s+pages/);
      if (match) return match[1];
    }
    const formatText = getText(".BookDetails__info span", [".BookDetails__format"]);
    if (formatText) {
      const match = formatText.match(/(\d+)\s+pages/);
      if (match) return match[1];
    }
    const details = document.querySelectorAll(".BookDetails .BookDetails__list span, .BookDetails__metadata span");
    for (const el of details) {
      if (el.textContent.includes("pages")) {
        return el.textContent.replace(/\D/g, "");
      }
    }
    return "";
  }
  const DEBUG = false;
  const DEFAULT_SETTINGS = {
    fieldOrder: [
      "title",
      "seriesName",
      "seriesNumber",
      "type",
      "pages",
      "personalRating",
      "goodreadsRating",
      "author",
      "narrator",
      "publishDate",
      "timesRead",
      "plan",
      "dateAdded",
      "recommendedBy",
      "link"
    ],
    customEmptyFields: [],
    constantFields: [],
    separator: "	",
    authorFormat: "lastFirst",
    dateFormat: "full",
    dateAddedFormat: "full",
    googleSheets: {
      serviceAccountJson: "",
      spreadsheetId: "",
      sheetName: "Sheet1",
      columnMapping: [],
      matchField: "link"
    }
  };
  const FIELD_DEFINITIONS = {
    title: {
      label: "Title",
      extract: () => getText("h1.Text__title1", [".BookPageTitleSection h1", ".BookPageTitleSection__title"]),
      format: (value) => value
    },
    seriesName: {
      label: "Series Name",
      extract: () => {
        const elements = document.querySelectorAll("h3.Text__title3 a, .BookPageTitleSection__series a");
        if (!elements.length) return "";
        const text = elements[0].textContent.trim();
        const match = text.match(/^(.+?)\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
        return match ? match[1].trim() : text;
      },
      format: (value) => value
    },
    seriesNumber: {
      label: "Series Number",
      extract: () => {
        const elements = document.querySelectorAll("h3.Text__title3 a, .BookPageTitleSection__series a");
        if (!elements.length) return "";
        const text = elements[0].textContent.trim();
        const match = text.match(/\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
        return match ? match[1] : "";
      },
      format: (value) => value
    },
    type: {
      label: "Type",
      extract: () => {
        const pages = extractPageCount();
        if (!pages) return "";
        const pageNum = parseInt(pages, 10);
        if (pageNum <= 40) return "Short Story";
        if (pageNum <= 300) return "Novella";
        return "Novel";
      },
      format: (value) => value
    },
    pages: {
      label: "Pages",
      extract: () => extractPageCount(),
      format: (value) => value
    },
    goodreadsRating: {
      label: "Goodreads Rating",
      extract: () => getText(".RatingStatistics__rating", ['[data-testid="averageRating"]', ".BookPageMetadataSection__ratingStats span"]),
      format: (value) => value
    },
    author: {
      label: "Author",
      extract: () => getText(".ContributorLink__name", [".BookPageMetadataSection__contributor a", ".AuthorLink__name"]),
      format: (value, settings) => {
        if (!value) return "";
        if (settings.authorFormat === "lastFirst") {
          const parts = value.split(" ");
          if (parts.length > 1) {
            const last = parts.pop();
            const first = parts.join(" ");
            return `${last}, ${first}`;
          }
        }
        return value;
      }
    },
    publishDate: {
      label: "Published Date",
      extract: () => {
        const pubEl = document.querySelector('p[data-testid="publicationInfo"]');
        let text = pubEl ? pubEl.textContent.trim() : getText(".BookDetails__row span", [".BookDetails__publication"]);
        if (!text) return "";
        const fullMatch = text.match(/(?:First |)published\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
        if (fullMatch) return { month: fullMatch[1], day: fullMatch[2], year: fullMatch[3] };
        const yearMatch = text.match(/(?:First |)published\s+(\d{4})/i);
        if (yearMatch) return { year: yearMatch[1] };
        return "";
      },
      format: (value, settings) => {
        if (!value || typeof value === "string") return value;
        const formats = {
          "full": `${value.month} ${value.day}, ${value.year}`,
          "yearOnly": value.year,
          "iso": value.month && value.day ? `${value.year}-${String(getMonthNumber(value.month)).padStart(2, "0")}-${String(value.day).padStart(2, "0")}` : value.year
        };
        return formats[settings.dateFormat] || formats.full;
      }
    },
    plan: {
      label: "Plan",
      extract: () => "99",
      format: (value) => value
    },
    dateAdded: {
      label: "Date Added",
      extract: () => /* @__PURE__ */ new Date(),
      format: (value, settings) => {
        const formats = {
          "full": value.toLocaleDateString("en-UK", { year: "numeric", month: "short", day: "numeric" }),
          "iso": value.toISOString().split("T")[0],
          "us": value.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        };
        return formats[settings.dateAddedFormat] || formats.full;
      }
    },
    link: {
      label: "Goodreads Link",
      extract: () => window.location.href,
      format: (value) => value
    }
  };
  function initialize() {
    const settings = new SettingsManager({ storageKey: "settings", defaultSettings: DEFAULT_SETTINGS });
    const extractor = new InfoExtractor(settings, { fieldDefinitions: FIELD_DEFINITIONS, debug: DEBUG });
    const sheetsManager = new GoogleSheetsManager(settings);
    let settingsModal = null;
    UI.addStyles();
    waitForElement("h1.Text__title1, .BookPageTitleSection h1", () => {
      setTimeout(() => {
        UI.addButtons(
          function() {
            const info = extractor.getInfo();
            if (!info) {
              UI.showNotification("Error extracting book info", 3e3);
              return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(info).then(() => {
                UI.showNotification("Book info copied!");
              }).catch(() => UI.showNotification("Copy failed", 3e3));
            }
          },
          () => {
            if (!settingsModal) {
              settingsModal = UI.createSettingsModal(settings, extractor, sheetsManager);
            }
            settingsModal.classList.add("show");
          },
          async function() {
            const sheetsSettings = settings.getGoogleSheetsSettings();
            if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
              UI.showNotification("Please configure Google Sheets settings first", 3e3, true);
              if (!settingsModal) {
                settingsModal = UI.createSettingsModal(settings, extractor, sheetsManager);
              }
              settingsModal.classList.add("show");
              return;
            }
            const info = extractor.getFormattedData();
            const label = this.querySelector(".Button__labelItem");
            const original = label.innerHTML;
            try {
              label.innerHTML = '<span class="gr2gs-loading"></span>Sending...';
              await sendToSheet(sheetsManager, extractor, info, UI, "Book info");
            } catch (error) {
              UI.showNotification(error.message, 5e3, true);
            } finally {
              label.innerHTML = original;
            }
          }
        );
      }, 500);
    });
  }
  setTimeout(initialize, 500);

})(KJUR);