// ==UserScript==
// @name         StoryGraph to Reading Tracker
// @namespace    https://github.com/laurinsorgend
// @version      1.0.2
// @author       laurin@sorgend.eu
// @description  Adds a button to a StoryGraph book page that puts the book on your reading tracker shelf
// @supportURL   https://github.com/LaurinSorgend/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/LaurinSorgend/userscripts/main/storygraphToBookTracker/dist/storygraphToBookTracker.user.js
// @updateURL    https://raw.githubusercontent.com/LaurinSorgend/userscripts/main/storygraphToBookTracker/dist/storygraphToBookTracker.meta.js
// @match        https://app.thestorygraph.com/books/*
// @connect      *
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const LABELS = {
    title: "Title",
    authors: "Author",
    narrator: "Narrator",
    series: "Series",
    seriesIndex: "Number in series",
    type: "Type",
    genres: "Genres",
    pages: "Pages",
    publishedOn: "Published",
    goodreadsRating: "Rating",
    goodreadsRatingCount: "Ratings",
    goodreadsURL: "Link",
    coverURL: "Cover",
    description: "Description",
    country: "Country",
    interest: "Interest",
    ownedPhysically: "Owned",
    onAudiobookshelf: "On Audiobookshelf",
    recommendedBy: "Recommended by"
  };
  function lastFirst(name) {
    const text2 = String(name ?? "").trim().replace(/\s+/g, " ");
    if (!text2 || text2.includes(",")) return text2;
    const parts = text2.split(" ");
    if (parts.length < 2) return text2;
    const surname = [parts.pop()];
    while (parts.length > 1 && PARTICLES.has(parts[parts.length - 1].toLowerCase())) {
      surname.unshift(parts.pop());
    }
    return `${surname.join(" ")}, ${parts.join(" ")}`;
  }
  const PARTICLES = /* @__PURE__ */ new Set([
    "de",
    "del",
    "della",
    "der",
    "den",
    "des",
    "di",
    "do",
    "dos",
    "du",
    "da",
    "das",
    "la",
    "las",
    "le",
    "les",
    "lo",
    "van",
    "von",
    "ter",
    "ten",
    "af",
    "av",
    "bin",
    "ibn",
    "al",
    "el",
    "san",
    "santa",
    "ap",
    "abu"
  ]);
  function typeForPages(pages2) {
    const count = Number(pages2);
    if (!count) return "";
    if (count <= 40) return "Short Story";
    if (count <= 300) return "Novella";
    return "Novel";
  }
  function firstNumber(text2) {
    const match = /-?\d+(?:[.,]\d+)?/.exec(String(text2 ?? "").replace(/(\d),(?=\d{3}\b)/g, "$1"));
    return match ? Number(match[0].replace(",", ".")) : null;
  }
  function scrape(fields) {
    const book = {};
    for (const [name, extract] of Object.entries(fields)) {
      let value;
      try {
        value = extract();
      } catch {
        value = null;
      }
      if (value === null || value === void 0 || value === "") continue;
      if (Array.isArray(value) && !value.length) continue;
      book[name] = value;
    }
    return book;
  }
  function text(primary, ...fallbacks) {
    for (const selector of [primary, ...fallbacks]) {
      const element = document.querySelector(selector);
      if (element) return element.textContent.trim();
    }
    return "";
  }
  function texts(selector, root = document) {
    return [...root.querySelectorAll(selector)].map((element) => element.textContent.trim()).filter(Boolean);
  }
  function meta(property) {
    return document.querySelector(`meta[property="${property}"]`)?.getAttribute("content") ?? "";
  }
  function canonical() {
    return document.querySelector('link[rel="canonical"]')?.href ?? window.location.href;
  }
  function waitFor(selector, onFound, { every = 100, timeout = 15e3 } = {}) {
    const start = Date.now();
    (function check() {
      const element = document.querySelector(selector);
      if (element) onFound(element);
      else if (Date.now() - start < timeout) setTimeout(check, every);
    })();
  }
  function onNavigate(onChange) {
    let current = window.location.href;
    new MutationObserver(() => {
      if (window.location.href === current) return;
      current = window.location.href;
      onChange(current);
    }).observe(document.body, { childList: true, subtree: true });
  }
  var _GM_addStyle = /* @__PURE__ */ (() => typeof GM_addStyle != "undefined" ? GM_addStyle : void 0)();
  var _GM_getValue = /* @__PURE__ */ (() => typeof GM_getValue != "undefined" ? GM_getValue : void 0)();
  var _GM_setValue = /* @__PURE__ */ (() => typeof GM_setValue != "undefined" ? GM_setValue : void 0)();
  var _GM_xmlhttpRequest = /* @__PURE__ */ (() => typeof GM_xmlhttpRequest != "undefined" ? GM_xmlhttpRequest : void 0)();
  const DEFAULTS = {
    baseURL: "",
    username: "",
    password: "",
    /** Fields no book page knows, sent with every import unless left empty. */
    interest: "",
    ownedPhysically: false,
    onAudiobookshelf: false,
    recommendedBy: "",
    /** Ask before overwriting a field that already has something in it. */
    confirmOverwrites: true
  };
  class Settings {
    constructor(storageKey = "bookTracker") {
      this.storageKey = storageKey;
      this.values = this.load();
    }
    load() {
      try {
        const saved = _GM_getValue(this.storageKey, null);
        return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
      } catch {
        return { ...DEFAULTS };
      }
    }
    save() {
      _GM_setValue(this.storageKey, JSON.stringify(this.values));
    }
    get(key) {
      return this.values[key];
    }
    set(key, value) {
      this.values[key] = value;
      this.save();
    }
    /** True once a book could actually be sent somewhere. */
    isConfigured() {
      return Boolean(this.values.baseURL && this.values.username);
    }
    /** The host with any trailing slash taken off, so paths can be appended. */
    origin() {
      return String(this.values.baseURL || "").trim().replace(/\/+$/, "");
    }
    /**
     * The fields the friend fills in once rather than per book. An empty one is
     * left out so the import does not overwrite what is on the shelf with a
     * blank, and the two flags are only sent when they are on for the same
     * reason: `false` would mean "they do not own it", which is a claim this
     * script is in no position to make about every book.
     */
    bookDefaults() {
      const defaults = {};
      if (this.values.interest !== "") defaults.interest = Number(this.values.interest);
      if (this.values.ownedPhysically) defaults.ownedPhysically = true;
      if (this.values.onAudiobookshelf) defaults.onAudiobookshelf = true;
      const names = String(this.values.recommendedBy || "").split(",").map((name) => name.trim()).filter(Boolean);
      if (names.length) defaults.recommendedBy = names;
      return defaults;
    }
  }
  class ReadingTracker {
    constructor(settings2) {
      this.settings = settings2;
    }
    /** Who the tracker thinks is calling, which is who the books get filed under. */
    async me() {
      const { id } = await this.request("GET", "/me()");
      return id;
    }
    /**
     * Sends a scraped book.
     *
     * @param dryRun ask what would change and write nothing
     * @returns {Promise<{action: string, book_ID: string, changes: Array}>}
     */
    importBook(book, { dryRun = false } = {}) {
      return this.request("POST", "/importBook", { book, dryRun });
    }
    get service() {
      return `${this.settings.origin()}/odata/v4/reading`;
    }
    /** The header Traefik's basicAuth checks, non-ASCII passwords included. */
    authorization() {
      const pair = `${this.settings.get("username")}:${this.settings.get("password")}`;
      return `Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(pair)))}`;
    }
    request(method, path, body) {
      return new Promise((resolve, reject) => {
        _GM_xmlhttpRequest({
          method,
          url: this.service + path,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: this.authorization()
          },
          data: body ? JSON.stringify(body) : void 0,
          timeout: 2e4,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(parse(response.responseText));
            } else {
              reject(new Error(messageFor(response)));
            }
          },
          onerror: () => reject(new Error(`Could not reach ${this.settings.origin()}`)),
          ontimeout: () => reject(new Error("The tracker took too long to answer"))
        });
      });
    }
  }
  function parse(text2) {
    try {
      return JSON.parse(text2);
    } catch {
      throw new Error("The tracker answered with something that is not JSON");
    }
  }
  function messageFor(response) {
    if (response.status === 401) return "Wrong username or password";
    if (response.status === 403) return "That friend may not write this book";
    if (response.status === 404) return "No tracker at that address — check the server URL";
    try {
      const { error } = JSON.parse(response.responseText);
      if (error?.message) return error.message;
    } catch {
    }
    return `The tracker answered ${response.status}`;
  }
  function el(tag, className, properties = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.assign(element, properties);
    return element;
  }
  function button(label, className = "bt-button") {
    return el("button", className, { type: "button", textContent: label });
  }
  function panel({ title, body, footer = [] }) {
    const backdrop = el("div", "bt-backdrop");
    const card = el("div", "bt-panel");
    const content = el("div", "bt-panel__body");
    const buttons = el("div", "bt-panel__footer");
    card.append(el("h2", null, { textContent: title }), content, buttons);
    content.append(body);
    backdrop.append(card);
    const close = () => {
      backdrop.dispatchEvent(new CustomEvent("bt-closed"));
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    for (const { label, quiet, onClick } of footer) {
      const element = button(label, quiet ? "bt-button bt-button--quiet" : "bt-button");
      element.addEventListener("click", () => {
        if (onClick?.() !== false) close();
      });
      buttons.append(element);
    }
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    document.addEventListener("keydown", onKey);
    document.body.append(backdrop);
    backdrop.classList.add("bt-backdrop--shown");
    return { close, onClose: (handler) => backdrop.addEventListener("bt-closed", handler) };
  }
  function field({ label, value, type = "text", hint, onInput }) {
    const wrapper = el("div", "bt-field");
    const input = el("input", null, { type, value: value ?? "" });
    wrapper.append(el("label", null, { textContent: label }), input);
    if (hint) wrapper.append(el("div", "bt-hint", { textContent: hint }));
    input.addEventListener("input", () => onInput(input.value));
    return wrapper;
  }
  function checkbox({ label, checked, onChange }) {
    const wrapper = el("div", "bt-field bt-field--check");
    const input = el("input", null, { type: "checkbox", checked: Boolean(checked) });
    const caption = el("label", null, { textContent: label });
    caption.addEventListener("click", () => input.click());
    input.addEventListener("change", () => onChange(input.checked));
    wrapper.append(input, caption);
    return wrapper;
  }
  function askWhatToKeep(changes) {
    return new Promise((resolve) => {
      const body = el("div");
      const keep = new Set(changes.map((change) => change.field));
      body.append(el("p", null, {
        textContent: "This book is already on your shelf. Untick anything the page should not overwrite."
      }));
      for (const change of changes) body.append(row(change, keep));
      let answered = false;
      const answer = (value) => {
        answered = true;
        resolve(value);
      };
      const { onClose } = panel({
        title: "Already on your shelf",
        body,
        footer: [
          { label: "Cancel", quiet: true, onClick: () => answer(null) },
          { label: "Update book", onClick: () => answer(keep) }
        ]
      });
      onClose(() => {
        if (!answered) answer(null);
      });
    });
  }
  function row(change, keep) {
    const wrapper = el("div", "bt-change");
    const tick = el("input", null, { type: "checkbox", checked: true });
    const values = el("div");
    values.append(el("div", "bt-change__name", { textContent: LABELS[change.field] ?? change.field }));
    const shown = el("div", "bt-change__values");
    if (change.existing) {
      shown.append(el("span", "bt-change__old", { textContent: change.existing }), " → ");
    }
    shown.append(el("span", "bt-change__new", { textContent: change.incoming || "(empty)" }));
    values.append(shown);
    tick.addEventListener("change", () => {
      if (tick.checked) keep.add(change.field);
      else keep.delete(change.field);
    });
    wrapper.append(tick, values);
    return wrapper;
  }
  let showing = null;
  function toast(message, { error = false, link, ms = 4e3 } = {}) {
    showing?.remove();
    const element = el("div", `bt-toast${error ? " bt-toast--error" : ""}`, { textContent: message });
    if (link) {
      element.append(" ", el("a", null, { href: link.href, textContent: link.label, target: "_blank", rel: "noreferrer" }));
    }
    document.body.append(element);
    requestAnimationFrame(() => element.classList.add("bt-toast--shown"));
    showing = element;
    setTimeout(() => {
      element.classList.remove("bt-toast--shown");
      setTimeout(() => element.remove(), 250);
    }, ms);
    return element;
  }
  function openSettings(settings2, tracker2) {
    const body = el("div");
    body.append(
      el("p", null, { textContent: "Books are filed under the friend these credentials belong to." }),
      ...connectionFields(settings2),
      testRow(tracker2),
      el("h2", null, { textContent: "Sent with every book" }),
      ...defaultFields(settings2)
    );
    panel({
      title: "Reading Tracker",
      body,
      footer: [{ label: "Done" }]
    });
  }
  function connectionFields(settings2) {
    return [
      field({
        label: "Server",
        value: settings2.get("baseURL"),
        hint: "The address you open the tracker at, e.g. https://books.example.com",
        onInput: (value) => settings2.set("baseURL", value)
      }),
      field({
        label: "Username",
        value: settings2.get("username"),
        onInput: (value) => settings2.set("username", value)
      }),
      field({
        label: "Password",
        type: "password",
        value: settings2.get("password"),
        hint: "Your Traefik login. Kept in this browser, in the userscript manager's storage.",
        onInput: (value) => settings2.set("password", value)
      })
    ];
  }
  function testRow(tracker2) {
    const wrapper = el("div", "bt-field");
    const test = el("button", "bt-button bt-button--quiet", { type: "button", textContent: "Test connection" });
    test.addEventListener("click", async () => {
      test.disabled = true;
      try {
        toast(`Signed in as ${await tracker2.me()}`);
      } catch (error) {
        toast(error.message, { error: true });
      } finally {
        test.disabled = false;
      }
    });
    wrapper.append(test);
    return wrapper;
  }
  function defaultFields(settings2) {
    return [
      field({
        label: "Interest",
        type: "number",
        value: settings2.get("interest"),
        hint: "How much you want to read it, which the up next score reads. Leave empty to skip.",
        onInput: (value) => settings2.set("interest", value)
      }),
      field({
        label: "Recommended by",
        value: settings2.get("recommendedBy"),
        hint: "Names, separated by commas.",
        onInput: (value) => settings2.set("recommendedBy", value)
      }),
      checkbox({
        label: "Mark as owned",
        checked: settings2.get("ownedPhysically"),
        onChange: (value) => settings2.set("ownedPhysically", value)
      }),
      checkbox({
        label: "Mark as on Audiobookshelf",
        checked: settings2.get("onAudiobookshelf"),
        onChange: (value) => settings2.set("onAudiobookshelf", value)
      }),
      checkbox({
        label: "Ask before overwriting a book that is already on the shelf",
        checked: settings2.get("confirmOverwrites"),
        onChange: (value) => settings2.set("confirmOverwrites", value)
      })
    ];
  }
  async function sendBook(book, { tracker: tracker2, settings: settings2 }) {
    if (!settings2.isConfigured()) {
      toast("Tell the script where the tracker is first", { error: true });
      openSettings(settings2, tracker2);
      return;
    }
    const preview = await tracker2.importBook(book, { dryRun: true });
    if (preview.action === "unchanged") {
      toast("Already up to date", { link: linkTo(settings2, preview.book_ID) });
      return;
    }
    const fields = await fieldsToWrite(preview, settings2);
    if (fields === null) {
      toast("Nothing sent");
      return;
    }
    report(await tracker2.importBook(book, { fields }), settings2);
  }
  async function fieldsToWrite(preview, settings2) {
    if (preview.action !== "updated" || !settings2.get("confirmOverwrites")) return void 0;
    const keep = await askWhatToKeep(preview.changes);
    if (!keep) return null;
    if (!keep.size) return null;
    return [...keep];
  }
  function report(result, settings2) {
    const link = linkTo(settings2, result.book_ID);
    if (result.action === "created") toast("Added to your shelf", { link });
    else if (result.action === "updated") toast(`Updated ${result.changes.length} field(s)`, { link });
    else toast("Already up to date", { link });
  }
  function linkTo(settings2, bookId) {
    if (!bookId) return void 0;
    return { href: `${settings2.origin()}/#/list/Books`, label: "Open shelf" };
  }
  function wireButton(element, getBook, context) {
    element.addEventListener("click", async () => {
      if (element.disabled) return;
      const label = element.textContent;
      element.disabled = true;
      element.textContent = "Sending…";
      try {
        await sendBook(getBook(), context);
      } catch (error) {
        toast(error.message, { error: true, ms: 6e3 });
      } finally {
        element.disabled = false;
        element.textContent = label;
      }
    });
  }
  const CSS = `
.bt-button {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border: 0; border-radius: 999px;
    font: inherit; font-size: 14px; font-weight: 600; line-height: 1.2;
    color: #fff; background: #3d5a80; cursor: pointer;
}
.bt-button:hover { background: #2f4763; }
.bt-button[disabled] { opacity: .6; cursor: default; }
.bt-button--quiet { color: #3d5a80; background: #e3e9f2; }
.bt-button--quiet:hover { background: #d2dced; }

.bt-spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,.4); border-top-color: #fff;
    animation: bt-spin .7s linear infinite;
}
@keyframes bt-spin { to { transform: rotate(360deg); } }

.bt-toast {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
    max-width: 320px; padding: 12px 16px; border-radius: 8px;
    font: 500 14px/1.4 system-ui, sans-serif; color: #fff; background: #2f4763;
    box-shadow: 0 6px 20px rgba(0,0,0,.25);
    opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s;
}
.bt-toast--shown { opacity: 1; transform: none; }
.bt-toast--error { background: #98303a; }
.bt-toast a { color: #fff; text-decoration: underline; }

.bt-backdrop {
    position: fixed; inset: 0; z-index: 2147483646;
    display: none; align-items: center; justify-content: center;
    background: rgba(0,0,0,.45);
}
.bt-backdrop--shown { display: flex; }

.bt-panel {
    width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px);
    display: flex; flex-direction: column; overflow: hidden;
    border-radius: 12px; background: #fff; color: #1d2733;
    font: 14px/1.5 system-ui, sans-serif;
}
.bt-panel h2 { margin: 0; padding: 18px 20px; font-size: 17px; border-bottom: 1px solid #e3e7ed; }
.bt-panel__body { padding: 16px 20px; overflow-y: auto; }
.bt-panel__footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 14px 20px; border-top: 1px solid #e3e7ed;
}
.bt-panel p { margin: 0 0 14px; color: #55606e; }

.bt-field { margin-bottom: 14px; }
.bt-field label { display: block; margin-bottom: 4px; font-weight: 600; }
.bt-field input[type=text], .bt-field input[type=password], .bt-field input[type=number] {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    border: 1px solid #c6ced9; border-radius: 6px; font: inherit; background: #fff; color: inherit;
}
.bt-field--check { display: flex; align-items: center; gap: 8px; }
.bt-field--check label { margin: 0; font-weight: 400; }
.bt-hint { margin-top: 4px; font-size: 12px; color: #6b7686; }

.bt-change { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid #eef1f5; }
.bt-change:first-child { border-top: 0; }
.bt-change__name { font-weight: 600; }
.bt-change__values { font-size: 13px; word-break: break-word; }
.bt-change__old { color: #8a3b3b; text-decoration: line-through; }
.bt-change__new { color: #2c6b45; }
`;
  function addStyles() {
    _GM_addStyle(CSS);
  }
  const HEADER = ".book-title-author-and-series";
  function header() {
    return document.querySelector(HEADER);
  }
  function people(match) {
    const container = header();
    if (!container) return [];
    const found = [];
    for (const paragraph of container.querySelectorAll("p.font-body")) {
      if (!match.test(paragraph.textContent)) continue;
      found.push(...texts("a", paragraph));
    }
    return found;
  }
  function authors() {
    const container = header();
    if (!container) return [];
    const names = [];
    for (const paragraph of container.querySelectorAll("p.font-body")) {
      if (/translator|narrator/i.test(paragraph.textContent)) continue;
      names.push(...texts("a", paragraph));
    }
    return names.map(lastFirst);
  }
  function pages() {
    for (const element of document.querySelectorAll(".toggle-edition-info-link, .edition-info p")) {
      const match = /^(\d+)\s+pages$/.exec(element.textContent.trim());
      if (match) return Number(match[1]);
    }
    return null;
  }
  function seriesLinks() {
    return header()?.querySelectorAll("p.font-semibold.tracking-tight a") ?? [];
  }
  function reviews() {
    return document.querySelector("turbo-frame#community_reviews");
  }
  function published() {
    for (const paragraph of document.querySelectorAll(".edition-info p.text-sm")) {
      const label = paragraph.querySelector("span.font-semibold");
      if (label?.textContent.trim() !== "Edition Pub Date:") continue;
      const stated = paragraph.textContent.replace(label.textContent, "").trim();
      const parsed = Date.parse(stated);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    }
    return "";
  }
  const FIELDS = {
    title: () => text(`${HEADER} h3.font-serif`, `${HEADER} h3.font-semibold`),
    authors,
    narrator: () => people(/narrator/i).map(lastFirst)[0] ?? "",
    series: () => seriesLinks()[0]?.textContent.trim() ?? "",
    seriesIndex: () => firstNumber(seriesLinks()[1]?.textContent ?? ""),
    type: () => typeForPages(pages()),
    genres: () => texts(".book-page-tag-section span"),
    pages,
    publishedOn: published,
    goodreadsRating: () => firstNumber((reviews() ?? document).querySelector(".average-star-rating")?.textContent ?? ""),
    goodreadsRatingCount: () => firstNumber(
      /based on (\d+) reviews/.exec(reviews()?.querySelector('[aria-label*="based on"]')?.getAttribute("aria-label") ?? "")?.[1] ?? ""
    ),
    goodreadsURL: () => canonical().split("?")[0],
    coverURL: () => meta("og:image"),
    description: () => text(".blurb-pane .trix-content", '[data-testid="book-description"]')
  };
  const settings = new Settings("storygraphToBookTracker");
  const tracker = new ReadingTracker(settings);
  const TITLE = ".book-title-author-and-series h3";
  function mount() {
    if (document.querySelector(".bt-actions")) return;
    const header2 = document.querySelector(".book-title-author-and-series");
    if (!header2) return;
    const actions = el("div", "bt-actions");
    actions.style.cssText = "display:flex; gap:8px; margin:12px 0;";
    const send = el("button", "bt-button", { type: "button", textContent: "Add to Reading Tracker" });
    const configure = el("button", "bt-button bt-button--quiet", { type: "button", textContent: "Settings" });
    wireButton(send, () => ({ ...scrape(FIELDS), ...settings.bookDefaults() }), { tracker, settings });
    configure.addEventListener("click", () => openSettings(settings, tracker));
    actions.append(send, configure);
    header2.append(actions);
  }
  addStyles();
  waitFor(TITLE, mount);
  onNavigate(() => waitFor(TITLE, mount));

})();