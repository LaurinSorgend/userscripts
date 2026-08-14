// ==UserScript==
// @name         StoryGraph to Obsidian
// @namespace    https://github.com/laurinsorgend
// @version      1.0
// @author       laurin@sorgend.eu
// @description  Adds a button to create/update a book note in your Obsidian vault via the Local REST API plugin
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/storygraphToObsidian/dist/storygraphToObsidian.user.js
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/storygraphToObsidian/dist/storygraphToObsidian.meta.js
// @match        https://app.thestorygraph.com/*
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
  async function sendToObsidian(obsidianManager, fmData, UI2, label = "Item") {
    const result = await obsidianManager.upsert(fmData, (diffs) => UI2.showMergeDialog(diffs));
    const messages = {
      created: `${label} created in Obsidian!`,
      updated: "Existing note updated!",
      unchanged: "Already up to date — nothing to change",
      cancelled: "Update cancelled"
    };
    UI2.showNotification(messages[result.action] || messages.created, 2500, result.action === "cancelled");
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
    getObsidianSettings() {
      return this.settings.obsidian || this.defaultSettings.obsidian;
    }
    setObsidianSettings(settings) {
      this.settings.obsidian = { ...this.settings.obsidian, ...settings };
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
  const FIELD_LABELS = {
    title: "Title",
    author: "Author",
    category: "Category",
    pages: "Pages",
    published: "Published",
    country: "Country",
    series: "Series",
    series_index: "Series Index",
    goodreads: "Goodreads Rating",
    interest: "Interest",
    date_added: "Date Added",
    recommended_by: "Recommended By",
    link: "Link",
    genres: "Genres",
    moods: "Moods",
    pace: "Pace",
    storygraph: "StoryGraph Polls",
    cover_source: "Cover Source"
  };
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const COERCED = /^(y|n|yes|no|true|false|on|off|null|~)$/i;
  const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
  const LEADING_INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;
  function needsQuotes(s) {
    if (s === "") return true;
    if (/^\s|\s$/.test(s)) return true;
    if (LEADING_INDICATOR.test(s)) return true;
    if (/:\s|:$|\s#/.test(s)) return true;
    if (/["\\]/.test(s)) return true;
    if (s.includes(",")) return true;
    if (COERCED.test(s)) return true;
    if (NUMERIC.test(s)) return true;
    if (ISO_DATE.test(s)) return false;
    return false;
  }
  function scalar(v) {
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    const s = String(v);
    if (!needsQuotes(s)) return s;
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }
  function yamlLines(obj, depth) {
    const pad = "  ".repeat(depth);
    const out = [];
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === void 0 || value === "") continue;
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        out.push(`${pad}${key}:`);
        for (const item of value) out.push(`${pad}  - ${scalar(item)}`);
      } else if (isPlainObject(value)) {
        const nested = yamlLines(value, depth + 1);
        if (nested.length === 0) continue;
        out.push(`${pad}${key}:`);
        out.push(...nested);
      } else {
        out.push(`${pad}${key}: ${scalar(value)}`);
      }
    }
    return out;
  }
  function sanitizeFilename(title) {
    return title.replace(/\s*[:/]\s*/g, " - ").replace(/[\\*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim();
  }
  function buildTags({ category, country }) {
    const tags = ["book"];
    if (category) tags.push("book/" + category.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    if (country) tags.push("country/" + country.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    return tags;
  }
  function buildNoteContent(fmData, filename) {
    const fields = { type: "book", title: fmData.title };
    if (filename !== fmData.title) fields.aliases = [fmData.title];
    Object.assign(fields, {
      author: fmData.author,
      category: fmData.category,
      pages: fmData.pages,
      published: fmData.published,
      country: fmData.country,
      series: fmData.series,
      series_index: fmData.series_index,
      goodreads: fmData.goodreads,
      interest: fmData.interest,
      date_added: fmData.date_added,
      recommended_by: fmData.recommended_by,
      link: fmData.link,
      genres: fmData.genres,
      moods: fmData.moods,
      pace: fmData.pace,
      storygraph: fmData.storygraph,
      cover_source: fmData.cover_source,
      tags: fmData.tags
    });
    const frontmatter = ["---", ...yamlLines(fields, 0), "---"].join("\n");
    return `${frontmatter}

\`\`\`button
name Start Reading
type command
action Templater: Insert Start Reading
\`\`\`

## Readings

\`\`\`dataview
TABLE WITHOUT ID file.link AS "Reading", start AS "Started", end AS "Finished", rating AS "Rating", format AS "Format"
FROM [[]] AND #reading
SORT end DESC
\`\`\`

## Notes
`;
  }
  function isEmpty(v) {
    if (v === void 0 || v === null || v === "") return true;
    if (Array.isArray(v)) return v.length === 0;
    if (isPlainObject(v)) return Object.keys(v).length === 0;
    return false;
  }
  function display(v) {
    if (isEmpty(v)) return "";
    if (Array.isArray(v)) return v.join(", ");
    if (isPlainObject(v)) {
      return Object.entries(v).map(([k, val]) => {
        if (isPlainObject(val)) {
          return `${k}: {${Object.entries(val).map(([k2, v2]) => `${k2} ${v2}%`).join(", ")}}`;
        }
        return `${k}: ${val}`;
      }).join("; ");
    }
    return String(v);
  }
  class ObsidianManager {
    constructor(settings) {
      this.settings = settings;
    }
    getObsidianSettings() {
      return this.settings.getObsidianSettings();
    }
    baseUrl() {
      const { baseUrl } = this.getObsidianSettings();
      if (!baseUrl) throw new Error("Obsidian settings are not configured. Please open the settings modal to configure the Local REST API URL and key.");
      return baseUrl.replace(/\/+$/, "");
    }
    apiKey() {
      const { apiKey } = this.getObsidianSettings();
      if (!apiKey) throw new Error("Obsidian settings are not configured. Please open the settings modal to configure the Local REST API URL and key.");
      return apiKey;
    }
    vaultUrl(path) {
      return `${this.baseUrl()}/vault/${path.split("/").map(encodeURIComponent).join("/")}`;
    }
    async testConnection() {
      return this._request("GET", `${this.baseUrl()}/`, { headers: { Accept: "application/json" } });
    }
    /**
     * Create or update the book note for `fmData` (plain object keyed by vault
     * frontmatter field names; must include `title`). Mirrors
     * GoogleSheetsManager.upsert's contract: empty incoming values never
     * overwrite existing data, and an optional resolveConflicts(diffs) async
     * callback (the same shape SettingsUI.showMergeDialog expects/returns)
     * can let the user pick a value per changed field.
     *
     * @returns {Promise<{action:'created'|'updated'|'unchanged'|'cancelled', path:string}>}
     */
    async upsert(fmData, resolveConflicts) {
      if (!fmData || !fmData.title) throw new Error("Cannot save to Obsidian without a title.");
      const filename = sanitizeFilename(fmData.title);
      const path = `Books/${filename}.md`;
      const existing = await this._getNote(path);
      if (!existing) {
        await this._putNote(path, buildNoteContent(fmData, filename));
        return { action: "created", path };
      }
      const { diffs, real } = this._diff(fmData, existing.frontmatter || {});
      if (!diffs.length) return { action: "unchanged", path };
      let chosen = {};
      for (const d of diffs) chosen[d.key] = real[d.key].incoming;
      if (typeof resolveConflicts === "function") {
        const resolution = await resolveConflicts(diffs);
        if (resolution === null) return { action: "cancelled", path };
        for (const d of diffs) {
          const picked = resolution[d.index];
          chosen[d.key] = picked === d.existing ? real[d.key].existing : real[d.key].incoming;
        }
      }
      for (const [key, value] of Object.entries(chosen)) {
        if (isEmpty(value)) continue;
        await this._patchFrontmatterField(path, key, value);
      }
      return { action: "updated", path };
    }
    /** Diff incoming frontmatter fields against an existing note's parsed frontmatter. */
    _diff(fmData, existingFm) {
      const diffs = [];
      const real = {};
      for (const [key, value] of Object.entries(fmData)) {
        if (isEmpty(value)) continue;
        const existingVal = existingFm[key];
        const existingDisplay = display(existingVal);
        const incomingDisplay = display(value);
        if (existingDisplay === incomingDisplay) continue;
        diffs.push({ index: key, key, label: FIELD_LABELS[key] || key, existing: existingDisplay, incoming: incomingDisplay });
        real[key] = { existing: existingVal, incoming: value };
      }
      return { diffs, real };
    }
    async _getNote(path) {
      try {
        return await this._request("GET", this.vaultUrl(path), {
          headers: { Accept: "application/vnd.olrapi.note+json" }
        });
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    }
    async _putNote(path, content) {
      await this._request("PUT", this.vaultUrl(path), {
        headers: { "Content-Type": "text/markdown" },
        data: content
      });
    }
    async _patchFrontmatterField(path, key, value) {
      await this._request("PATCH", this.vaultUrl(path), {
        headers: {
          "Content-Type": "application/json",
          Operation: "replace",
          "Target-Type": "frontmatter",
          Target: key
        },
        data: JSON.stringify(value)
      });
    }
    _request(method, url, { headers = {}, data } = {}) {
      const apiKey = this.apiKey();
      return new Promise((resolve, reject) => {
        _GM_xmlhttpRequest({
          method,
          url,
          headers: { Authorization: `Bearer ${apiKey}`, ...headers },
          data,
          onload: (response) => {
            if (response.status === 404) {
              const err2 = new Error("Not found");
              err2.status = 404;
              reject(err2);
              return;
            }
            if (response.status >= 200 && response.status < 300) {
              if (!response.responseText) {
                resolve(null);
                return;
              }
              try {
                resolve(JSON.parse(response.responseText));
              } catch (e) {
                resolve(response.responseText);
              }
              return;
            }
            let message = response.responseText || `HTTP ${response.status}`;
            try {
              message = JSON.parse(response.responseText).message || message;
            } catch (e) {
            }
            const err = new Error(`Obsidian API error: ${message}`);
            err.status = response.status;
            reject(err);
          },
          onerror: () => reject(new Error("Network error reaching the Obsidian Local REST API — is Obsidian running with the plugin enabled?")),
          ontimeout: () => reject(new Error("Obsidian request timed out"))
        });
      });
    }
    validateSettings() {
      const { baseUrl, apiKey } = this.getObsidianSettings();
      const errors = [];
      if (!baseUrl) errors.push("Obsidian Local REST API URL is required");
      if (!apiKey) errors.push("Obsidian Local REST API key is required");
      return errors;
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
      const diffs = order.reduce((acc, key, i) => {
        const incoming = newValues[i] ?? "";
        const existing = found.row[i] ?? "";
        if (incoming !== "" && incoming !== existing) acc.push({ index: i, key, existing, incoming });
        return acc;
      }, []);
      if (!diffs.length) return { action: "unchanged" };
      const merged = order.map((key, i) => newValues[i] !== "" ? newValues[i] : null);
      if (typeof resolveConflicts === "function") {
        const resolution = await resolveConflicts(diffs);
        if (resolution === null) return { action: "cancelled" };
        for (const idx of Object.keys(resolution)) {
          merged[idx] = resolution[idx] === "" ? null : resolution[idx];
        }
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
    /** 'sheets' (default) or 'obsidian' — picks which 3rd settings tab renders. */
    static get backend() {
      return this.CONFIG.backend || "sheets";
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
      if (this.backend === "obsidian") return "";
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
      const isObsidian = this.backend === "obsidian";
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
                    <button class="${prefix}-tab" data-tab="backend">${isObsidian ? this.cfg.tabLabel || "Obsidian" : "Google Sheets"}</button>
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
      var _a;
      const { prefix, formatOptions, defaultSheetName } = this.cfg;
      for (const opt of formatOptions || []) {
        const el = modal.querySelector(`#${prefix}-${opt.id}`);
        if (el) el.value = settings.get(opt.settingKey) ?? ((_a = opt.options[0]) == null ? void 0 : _a.value) ?? "";
      }
      if (this.backend === "obsidian") {
        const obsidianSettings = settings.getObsidianSettings() || {};
        modal.querySelector(`#${prefix}-obsidian-base-url`).value = obsidianSettings.baseUrl || "http://127.0.0.1:27123";
        modal.querySelector(`#${prefix}-obsidian-api-key`).value = obsidianSettings.apiKey || "";
      } else {
        const sheetsSettings = settings.getGoogleSheetsSettings();
        modal.querySelector(`#${prefix}-service-account`).value = sheetsSettings.serviceAccountJson || "";
        modal.querySelector(`#${prefix}-spreadsheet-id`).value = sheetsSettings.spreadsheetId || "";
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
    static attachSettingsHandlers(modal, settings, extractor, backendManager) {
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
      if (this.backend === "obsidian") {
        this.attachObsidianHandlers(modal, settings, backendManager);
      } else {
        this.attachSheetsHandlers(modal, settings, extractor, backendManager);
      }
      this.attachSaveHandler(modal, settings, extractor);
    }
    static attachObsidianHandlers(modal, settings, obsidianManager) {
      const { prefix } = this.cfg;
      modal.querySelector(`#${prefix}-test-load`).addEventListener("click", async () => {
        const baseUrl = modal.querySelector(`#${prefix}-obsidian-base-url`).value.trim();
        const apiKey = modal.querySelector(`#${prefix}-obsidian-api-key`).value.trim();
        const errorDiv = modal.querySelector(`#${prefix}-error`);
        if (!baseUrl || !apiKey) {
          errorDiv.textContent = "Please fill in both fields first";
          errorDiv.style.display = "block";
          return;
        }
        errorDiv.style.display = "none";
        const btn = modal.querySelector(`#${prefix}-test-load`);
        const orig = btn.textContent;
        btn.textContent = "Connecting...";
        btn.disabled = true;
        try {
          const ObsidianManagerCtor = obsidianManager.constructor;
          const tempManager = new ObsidianManagerCtor({ getObsidianSettings: () => ({ baseUrl, apiKey }) });
          await tempManager.testConnection();
          this.showNotification("Connected to Obsidian!");
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
        if (this.backend === "obsidian") {
          const baseUrl = modal.querySelector(`#${prefix}-obsidian-base-url`).value.trim();
          const apiKey = modal.querySelector(`#${prefix}-obsidian-api-key`).value.trim();
          if (!baseUrl || !apiKey) {
            this.showNotification("Please fill in both Obsidian fields", 2e3, true);
            return;
          }
          settings.setObsidianSettings({ baseUrl, apiKey });
          this.showNotification("Settings saved!");
          modal.classList.remove("show");
          return;
        }
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
    prefix: "sg2obs",
    modalTitle: "StoryGraph → Obsidian Settings",
    backend: "obsidian",
    tabLabel: "Obsidian",
    colors: { primary: "#00635d", primaryHover: "#004d47" },
    formatOptions: [
      { id: "separator", label: "Field Separator", settingKey: "separator", options: SEPARATOR_OPTIONS },
      {
        id: "dateadded-format",
        label: "Date Added Format (copy button only)",
        settingKey: "dateAddedFormat",
        options: [
          { value: "full", label: "UK Format" },
          { value: "us", label: "US Format" },
          { value: "iso", label: "ISO (YYYY-MM-DD)" }
        ]
      },
      {
        id: "review-format",
        label: "Community Review Format (copy button only)",
        settingKey: "communityReviewFormat",
        options: [
          { value: "full", label: "Full breakdown (38% Fast 53% Medium 7% Slow)" },
          { value: "majority", label: "Majority only (Medium)" }
        ],
        hint: "Majority only returns the dominant label when it exceeds 50%. The Obsidian note always gets the full percent breakdown."
      }
    ]
  };
  class UI extends SettingsUI {
    /**
     * Injects "Send to Obsidian" and settings buttons below the StoryGraph book cover.
     */
    static addButtons(onSettings, onSendToObsidian) {
      if (document.querySelector("[data-sg2obs-btns]")) return;
      const cover = document.querySelector(".book-cover");
      if (!cover) return;
      const parent = cover.parentElement;
      if (!parent) return;
      const BTN = "text-[13px] inline-flex items-center gap-2 px-4 py-3 bg-lightGrey dark:bg-[#3B3B3B] border border-midGrey dark:border-darkerGrey rounded-md text-blackish dark:text-white font-semibold hover:bg-darkGrey dark:hover:bg-darkerGrey cursor-pointer";
      const group = document.createElement("div");
      group.setAttribute("data-sg2obs-btns", "");
      group.className = "flex gap-2 mt-2";
      const sendBtn = document.createElement("button");
      sendBtn.className = `flex-1 ${BTN}`;
      sendBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 shrink-0">
                <path d="M14.9 3.5c-2.5-1.4-5.4-1.2-7.5.5-2.6 2-3.6 5.6-2.4 8.7.3.8.1 1.7-.5 2.3l-1 1c-1 1-1.1 2.6-.1 3.6.6.6 1.4.9 2.2.8l1.6-.2c.7-.1 1.4.2 1.9.7 2.3 2.3 6 2.6 8.6.6 2.9-2.2 3.8-6.2 2.1-9.4-.3-.6-.3-1.3.1-1.9 1.2-1.9 1-4.5-.6-6.1-1.1-1.1-2.7-1.6-4.4-1.6z"/>
            </svg>
            Send to Obsidian`;
      sendBtn.addEventListener("click", function() {
        onSendToObsidian.call(this);
      });
      const settingsBtn = document.createElement("button");
      settingsBtn.className = `justify-center ${BTN}`;
      settingsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>`;
      settingsBtn.addEventListener("click", onSettings);
      group.appendChild(sendBtn);
      group.appendChild(settingsBtn);
      parent.appendChild(group);
    }
  }
  __publicField(UI, "CONFIG", CONFIG);
  function extractReviewSection(headingText) {
    const frame = document.querySelector("turbo-frame#community_reviews");
    if (!frame) return null;
    const headings = frame.querySelectorAll("p.text-center.font-semibold");
    for (const h of headings) {
      if (h.textContent.trim() !== headingText) continue;
      const barContainer = h.nextElementSibling;
      if (!barContainer) continue;
      const result = {};
      for (const span of barContainer.querySelectorAll(".sr-only")) {
        const m = span.textContent.match(/(\d+)% of readers chose (.+)/i);
        if (m) result[m[2].toLowerCase()] = parseInt(m[1], 10);
      }
      return Object.keys(result).length ? result : null;
    }
    return null;
  }
  function formatReviewSection(data, communityReviewFormat) {
    if (!data) return "";
    if (communityReviewFormat === "majority") {
      let maxLabel = null, maxPct = 0;
      for (const [label, pct] of Object.entries(data)) {
        if (pct > maxPct) {
          maxPct = pct;
          maxLabel = label;
        }
      }
      if (maxPct > 50 && maxLabel) {
        return maxLabel.charAt(0).toUpperCase() + maxLabel.slice(1);
      }
    }
    return Object.entries(data).map(([label, pct]) => `${pct}% ${label.charAt(0).toUpperCase() + label.slice(1)}`).join(" ");
  }
  const DEBUG = false;
  const DEFAULT_SETTINGS = {
    fieldOrder: [
      "title",
      "seriesName",
      "seriesNumber",
      "author",
      "pages",
      "type",
      "pubDate",
      "storygraphRating",
      "reviewCount",
      "genres",
      "moods",
      "pace",
      "plotVsCharacter",
      "strongCharDev",
      "loveableChars",
      "diverseCast",
      "flawsAsFocus",
      "coverUrl",
      "link",
      "dateAdded",
      "personalRating"
    ],
    customEmptyFields: [],
    constantFields: [],
    separator: "	",
    dateAddedFormat: "iso",
    communityReviewFormat: "full",
    obsidian: {
      baseUrl: "http://127.0.0.1:27123",
      apiKey: ""
    }
  };
  function getAuthors() {
    const container = document.querySelector(".book-title-author-and-series");
    if (!container) return "";
    const authors = [];
    for (const p of container.querySelectorAll("p.font-body")) {
      if (p.textContent.includes("Translator") || p.textContent.includes("Narrator")) continue;
      for (const a of p.querySelectorAll("a")) {
        const name = a.textContent.trim();
        if (name) authors.push(name);
      }
    }
    return authors.join(", ");
  }
  function getPages() {
    for (const el of document.querySelectorAll(".toggle-edition-info-link")) {
      const match = el.textContent.trim().match(/^(\d+)\s+pages$/);
      if (match) return match[1];
    }
    return "";
  }
  function getCommunityField(headingText) {
    return {
      extract: () => extractReviewSection(headingText),
      format: (value, settings) => formatReviewSection(value, settings.communityReviewFormat)
    };
  }
  function getSeriesEl() {
    const container = document.querySelector(".book-title-author-and-series");
    return container ? container.querySelector("p.font-semibold.tracking-tight") : null;
  }
  const FIELD_DEFINITIONS = {
    title: {
      label: "Title",
      extract: () => {
        const el = document.querySelector(".book-title-author-and-series h3.font-serif, .book-title-author-and-series h3.font-semibold");
        return el ? el.textContent.trim() : "";
      },
      format: (value) => value
    },
    seriesName: {
      label: "Series Name",
      extract: () => {
        var _a, _b;
        const links = (_a = getSeriesEl()) == null ? void 0 : _a.querySelectorAll("a");
        return ((_b = links == null ? void 0 : links[0]) == null ? void 0 : _b.textContent.trim()) ?? "";
      },
      format: (value) => value
    },
    seriesNumber: {
      label: "Series Number",
      extract: () => {
        var _a, _b;
        const links = (_a = getSeriesEl()) == null ? void 0 : _a.querySelectorAll("a");
        return ((_b = links == null ? void 0 : links[1]) == null ? void 0 : _b.textContent.trim().replace(/^#/, "")) ?? "";
      },
      format: (value) => value
    },
    author: {
      label: "Author",
      extract: getAuthors,
      format: (value) => value
    },
    pages: {
      label: "Pages",
      extract: getPages,
      format: (value) => value
    },
    pubDate: {
      label: "Pub Date",
      extract: () => {
        for (const p of document.querySelectorAll(".edition-info p.text-sm")) {
          const label = p.querySelector("span.font-semibold");
          if ((label == null ? void 0 : label.textContent.trim()) === "Edition Pub Date:") {
            return p.textContent.replace(label.textContent, "").trim();
          }
        }
        return "";
      },
      format: (value) => value
    },
    type: {
      label: "Type",
      extract: () => {
        const pages = parseInt(getPages(), 10);
        if (isNaN(pages)) return "";
        if (pages <= 40) return "Short Story";
        if (pages <= 300) return "Novella";
        return "Novel";
      },
      format: (value) => value
    },
    storygraphRating: {
      label: "Rating",
      extract: () => {
        const frame = document.querySelector("turbo-frame#community_reviews");
        const el = (frame || document).querySelector(".average-star-rating");
        return el ? el.textContent.trim() : "";
      },
      format: (value) => value
    },
    reviewCount: {
      label: "Review Count",
      extract: () => {
        const frame = document.querySelector("turbo-frame#community_reviews");
        if (!frame) return "";
        const div = frame.querySelector('[aria-label*="based on"]');
        if (!div) return "";
        const m = div.getAttribute("aria-label").match(/based on (\d+) reviews/);
        return m ? m[1] : "";
      },
      format: (value) => value
    },
    genres: {
      label: "Genres",
      extract: () => {
        const section = document.querySelector(".book-page-tag-section");
        if (!section) return "";
        return Array.from(section.querySelectorAll("span")).map((s) => s.textContent.trim()).filter(Boolean).join(", ");
      },
      format: (value) => value
    },
    moods: {
      label: "Moods",
      extract: () => {
        const frame = document.querySelector("turbo-frame#community_reviews");
        if (!frame) return "";
        return Array.from(frame.querySelectorAll(".moods-list-reviews .mood-item p")).map((p) => p.textContent.trim()).join(", ");
      },
      format: (value) => value
    },
    pace: { label: "Pace", ...getCommunityField("Pace") },
    plotVsCharacter: { label: "Plot vs Character", ...getCommunityField("Plot or character driven?") },
    strongCharDev: { label: "Strong Char. Dev.", ...getCommunityField("Strong character development?") },
    loveableChars: { label: "Loveable Characters", ...getCommunityField("Loveable characters?") },
    diverseCast: { label: "Diverse Cast", ...getCommunityField("Diverse cast of characters?") },
    flawsAsFocus: { label: "Flaws as Focus", ...getCommunityField("Flaws of characters a main focus?") },
    coverUrl: {
      label: "Cover URL",
      extract: () => {
        const og = document.querySelector('meta[property="og:image"]');
        return og ? og.getAttribute("content") : "";
      },
      format: (value) => value
    },
    link: {
      label: "StoryGraph Link",
      extract: () => {
        const canonical = document.querySelector('link[rel="canonical"]');
        return canonical ? canonical.href : window.location.href;
      },
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
        return formats[settings.dateAddedFormat] || formats.iso;
      }
    },
    personalRating: {
      label: "Personal Rating",
      extract: () => "",
      format: (value) => value
    }
  };
  function flipAuthorName(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length < 2) return name;
    const last = parts.pop();
    return `${last}, ${parts.join(" ")}`;
  }
  function formatAuthors(raw) {
    if (!raw) return "";
    return raw.split(",").map((n) => n.trim()).filter(Boolean).map(flipAuthorName).join(" & ");
  }
  function parseStorygraphDate(text) {
    if (!text) return "";
    const d = new Date(text);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
  }
  function normalizePollLabel(label) {
    const l = label.toLowerCase();
    if (l.includes("n/a") || /^na$/.test(l)) return "na";
    if (l === "fast" || l === "medium" || l === "slow") return l;
    if (l === "positive" || l === "complicated" || l === "negative") return l;
    if (l.includes("mix")) return "mix";
    if (l.includes("character") && !l.includes("plot")) return "character";
    if (l.includes("plot") && !l.includes("character")) return "plot";
    return l.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function normalizePoll(raw) {
    if (!raw) return null;
    const out = {};
    for (const [label, pct] of Object.entries(raw)) out[normalizePollLabel(label)] = pct;
    return out;
  }
  function toFrontmatterFields(rawData) {
    const pages = rawData.pages ? parseInt(rawData.pages, 10) : null;
    const seriesIndex = parseFloat(rawData.seriesNumber);
    const genres = (rawData.genres || "").split(",").map((g) => g.trim().toLowerCase()).filter(Boolean);
    const moods = (rawData.moods || "").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean);
    const storygraph = {};
    const plotVsCharacter = normalizePoll(rawData.plotVsCharacter);
    if (plotVsCharacter) storygraph.plot_vs_character = plotVsCharacter;
    const pollMap = {
      strong_character_development: rawData.strongCharDev,
      loveable_characters: rawData.loveableChars,
      diverse_cast: rawData.diverseCast,
      flaws_as_focus: rawData.flawsAsFocus
    };
    for (const [key, raw] of Object.entries(pollMap)) {
      const normalized = normalizePoll(raw);
      if (normalized) storygraph[key] = normalized;
    }
    return {
      title: rawData.title || "",
      author: formatAuthors(rawData.author),
      category: rawData.type || "",
      pages: Number.isFinite(pages) ? pages : "",
      published: parseStorygraphDate(rawData.pubDate),
      link: rawData.link || "",
      series: rawData.seriesName || "",
      series_index: Number.isFinite(seriesIndex) ? seriesIndex : "",
      date_added: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      genres,
      moods,
      pace: normalizePoll(rawData.pace) || "",
      storygraph: Object.keys(storygraph).length ? storygraph : "",
      cover_source: rawData.coverUrl || "",
      tags: buildTags({ category: rawData.type })
    };
  }
  function initialize() {
    const settings = new SettingsManager({ storageKey: "sg2obs_settings", defaultSettings: DEFAULT_SETTINGS });
    const extractor = new InfoExtractor(settings, { fieldDefinitions: FIELD_DEFINITIONS, debug: DEBUG });
    const obsidianManager = new ObsidianManager(settings);
    let settingsModal = null;
    UI.addStyles();
    const openSettings = () => {
      if (!settingsModal) {
        settingsModal = UI.createSettingsModal(settings, extractor, obsidianManager);
      }
      settingsModal.classList.add("show");
    };
    const sendToObsidianHandler = async function() {
      const obsidianSettings = settings.getObsidianSettings();
      if (!obsidianSettings.baseUrl || !obsidianSettings.apiKey) {
        UI.showNotification("Please configure Obsidian settings first", 3e3, true);
        openSettings();
        return;
      }
      const fmData = toFrontmatterFields(extractor.extract());
      const label = this.querySelector("svg") ? this.lastChild : this;
      const original = label.textContent;
      try {
        label.textContent = " Sending...";
        this.disabled = true;
        await sendToObsidian(obsidianManager, fmData, UI, "Book note");
      } catch (error) {
        UI.showNotification(error.message, 5e3, true);
      } finally {
        label.textContent = original;
        this.disabled = false;
      }
    };
    waitForElement(".book-title-author-and-series", () => {
      setTimeout(() => UI.addButtons(openSettings, sendToObsidianHandler), 500);
    });
  }
  function hookSpaNavigation(callback) {
    const orig = (type) => {
      const fn = history[type];
      return function(...args) {
        fn.apply(this, args);
        callback();
      };
    };
    history.pushState = orig("pushState");
    history.replaceState = orig("replaceState");
  }
  setTimeout(() => {
    initialize();
    hookSpaNavigation(() => setTimeout(initialize, 600));
  }, 500);

})(KJUR);