// ==UserScript==
// @name         Goodreads to Reading Tracker
// @namespace    https://github.com/laurinsorgend
// @version      1.0.101
// @author       laurin@sorgend.eu
// @description  Adds a button to a Goodreads book page that puts the book on your reading tracker shelf
// @supportURL   https://github.com/LaurinSorgend/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/LaurinSorgend/userscripts/main/goodreadsToBookTracker/dist/goodreadsToBookTracker.user.js
// @updateURL    https://raw.githubusercontent.com/LaurinSorgend/userscripts/main/goodreadsToBookTracker/dist/goodreadsToBookTracker.meta.js
// @match        https://www.goodreads.com/book/show/*
// @connect      *
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function isbnIn(text2) {
    const raw = String(text2 ?? "");
    const thirteen = new RegExp("(?<![0-9])97[89](?:-?\\d){10}(?![0-9])").exec(raw)?.[0];
    if (thirteen) return thirteen.replace(/-/g, "");
    const ten = new RegExp("(?<![0-9A-Za-z])\\d(?:-?\\d){8}-?[\\dXx](?![0-9A-Za-z])").exec(raw)?.[0];
    return ten ? ten.replace(/-/g, "").toUpperCase() : "";
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
      } catch (error) {
        console.debug(`Reading Tracker: could not read ${name}`, error);
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
  function waitFor(selector, onFound, { previous } = {}) {
    const start = Date.now();
    let cancelled = false;
    let timer = null;
    (function check() {
      if (cancelled) return;
      const element = document.querySelector(selector);
      const unchanged = previous && element === previous.element && element.textContent.trim() === previous.text;
      if (element && !unchanged) {
        onFound(element);
      } else if (Date.now() - start < 15e3) {
        timer = setTimeout(check, 100);
      } else {
        console.warn(`Reading Tracker: ${selector} did not appear, so the buttons were not added`);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }
  function onNavigate(onChange) {
    let current = window.location.href;
    const notify = () => {
      if (window.location.href === current) return;
      current = window.location.href;
      onChange(current);
    };
    new MutationObserver(notify).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("turbo:load", () => {
      current = window.location.href;
      onChange(current);
    });
    window.addEventListener("popstate", notify);
  }
  var _GM_addStyle = /* @__PURE__ */ (() => typeof GM_addStyle != "undefined" ? GM_addStyle : void 0)();
  var _GM_getValue = /* @__PURE__ */ (() => typeof GM_getValue != "undefined" ? GM_getValue : void 0)();
  var _GM_setValue = /* @__PURE__ */ (() => typeof GM_setValue != "undefined" ? GM_setValue : void 0)();
  var _GM_xmlhttpRequest = /* @__PURE__ */ (() => typeof GM_xmlhttpRequest != "undefined" ? GM_xmlhttpRequest : void 0)();
  const DEFAULTS = {
    baseURL: "",
    username: "",
    password: "",
    /** What the per-book panel opens on; no book page knows these. */
    interest: "",
    ownedPhysically: false,
    onAudiobookshelf: false,
    recommendedBy: "",
    /** Ask before overwriting a field that already has something in it. */
    confirmOverwrites: true
  };
  function parseOrigin(raw) {
    const value = String(raw ?? "").trim();
    if (!value) return "";
    try {
      const url = new URL(value);
      const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (url.protocol === "https:" || url.protocol === "http:" && local) {
        return url.origin;
      }
      return "";
    } catch {
      return "";
    }
  }
  class Settings {
    constructor(storageKey) {
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
    /** True once a book could actually be sent somewhere over a valid server URL. */
    isConfigured() {
      return Boolean(this.origin() && String(this.values.username || "").trim());
    }
    origin() {
      return parseOrigin(this.values.baseURL);
    }
    /** The book's page in the app, or the books list when the id is not known. */
    shelfLink(bookId) {
      const origin = this.origin();
      if (!origin) return void 0;
      return bookId ? { href: `${origin}/#/books/${bookId}`, label: "Open book" } : { href: `${origin}/#/list/Books`, label: "Open shelf" };
    }
    /**
     * The fields the friend fills in once rather than per book. Interest and
     * the two flags are not among them: they are asked per book in
     * `ui/details.js`, which opens on `askedDefaults()`.
     */
    bookDefaults() {
      const names = String(this.values.recommendedBy || "").split(",").map((name) => name.trim()).filter(Boolean);
      return names.length ? { recommendedBy: names } : {};
    }
    /** What the per-book panel opens on: the answers given most often. */
    askedDefaults() {
      return {
        interest: this.values.interest,
        ownedPhysically: Boolean(this.values.ownedPhysically),
        onAudiobookshelf: Boolean(this.values.onAudiobookshelf)
      };
    }
  }
  function todayISO(now = /* @__PURE__ */ new Date()) {
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  }
  function startPatch(input) {
    return {
      book_ID: input.book_ID,
      startedOn: input.startedOn,
      asAudiobook: input.asAudiobook
    };
  }
  class ReadingTracker {
    constructor(settings) {
      this.settings = settings;
    }
    /**
     * Who the tracker thinks is calling, which is who the books get filed
     * under. Asked again once the server or the credentials in the settings
     * change.
     */
    async me() {
      const caller = `${this.service} ${this.authorization()}`;
      if (this.user?.caller !== caller) {
        const { id } = await this.request("GET", "/me()");
        this.user = { caller, id };
      }
      return this.user.id;
    }
    /**
     * Sends a scraped book.
     *
     * @param dryRun ask what would change and write nothing
     * @param fields the fields to write; none means all of them
     * @returns {Promise<{action: string, book_ID: string, changes: Array}>}
     */
    importBook(book, { dryRun = false, fields } = {}) {
      return this.request("POST", "/importBook", { book, dryRun, fields });
    }
    /**
     * The book behind a scraped page as the shelf knows it, asked the same
     * way an import would: by dry run, so the matching rules stay on the
     * server. `onShelf` is false for a book that would be created — the dry
     * run reports `created` with no id rather than writing one.
     *
     * @returns {Promise<{onShelf: boolean, book_ID: string|null}>}
     */
    async findShelfBook(book) {
      const { action, book_ID } = await this.importBook(book, { dryRun: true });
      return { onShelf: action !== "created" && Boolean(book_ID), book_ID: book_ID ?? null };
    }
    /**
     * The friend's open session on a book, if there is one. The service is
     * read-all, so without the owner filter someone else's running session
     * would answer and the button would offer to close a book you never
     * started.
     *
     * @returns {Promise<{ID: string, startedOn: string|null, asAudiobook: boolean}|null>}
     */
    async openSession(bookId, ownerId) {
      const owner = String(ownerId).replace(/'/g, "''");
      const filter = `book_ID eq ${bookId} and finishedOn eq null and owner_ID eq '${owner}'`;
      const path = `/ReadingSessions?$filter=${encodeURIComponent(filter)}&$select=ID,startedOn,asAudiobook&$top=1`;
      const { value } = await this.request("GET", path);
      return value?.[0] ?? null;
    }
    /** Opens a session dated today. The owner is stamped by the server. */
    startSession(bookId) {
      return this.request(
        "POST",
        "/ReadingSessions",
        startPatch({ book_ID: bookId, startedOn: todayISO(), asAudiobook: false })
      );
    }
    /** Closes a session with a `finishPatch`-shaped body. */
    patchSession(id, patch) {
      return this.request("PATCH", `/ReadingSessions(${id})`, patch);
    }
    /** Writes a `finalComment`, the book's final verdict. The owner is stamped by the server. */
    createFinalComment(comment) {
      return this.request("POST", "/Comments", comment);
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
        const origin = this.settings.origin();
        if (!origin) {
          reject(new Error("Set a valid HTTPS server URL in Settings first"));
          return;
        }
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
              settle(resolve, reject, response.status, response.responseText);
            } else {
              reject(new Error(messageFor(response)));
            }
          },
          onerror: () => reject(new Error(`Could not reach ${origin}`)),
          onabort: () => reject(new Error("The request was aborted")),
          ontimeout: () => reject(new Error("The tracker took too long to answer"))
        });
      });
    }
  }
  function settle(resolve, reject, status, text2) {
    if (status === 204 || !String(text2 ?? "").trim()) {
      resolve(null);
      return;
    }
    try {
      resolve(JSON.parse(text2));
    } catch {
      reject(new Error("The tracker answered with something that is not JSON"));
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
  const MIN_INTEREST = 1;
  const MAX_INTEREST = 10;
  function interestOf(typed) {
    const text2 = String(typed ?? "").trim();
    const value = Number(text2);
    if (!text2 || !Number.isFinite(value)) {
      return null;
    }
    return Math.min(MAX_INTEREST, Math.max(MIN_INTEREST, Math.round(value)));
  }
  const MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];
  function isoDay(stated) {
    const text2 = (stated ?? "").trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text2);
    if (iso) {
      return dayOf(iso[1], Number(iso[2]) - 1, iso[3]);
    }
    const monthFirst = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text2);
    const dayFirst = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(text2);
    const parts = monthFirst ? [monthFirst[1], monthFirst[2], monthFirst[3]] : dayFirst ? [dayFirst[2], dayFirst[1], dayFirst[3]] : null;
    if (!parts) {
      return void 0;
    }
    const [month, day, year] = parts;
    const index = MONTHS.findIndex((name) => name.startsWith(month.toLowerCase()) && month.length >= 3);
    return index < 0 ? void 0 : dayOf(year, index, day);
  }
  function dayOf(year, month, day) {
    const numericYear = Number(year);
    const numericDay = Number(day);
    const date = new Date(Date.UTC(numericYear, month, numericDay));
    date.setUTCFullYear(numericYear);
    if (date.getUTCFullYear() !== numericYear || date.getUTCMonth() !== month || date.getUTCDate() !== numericDay) {
      return void 0;
    }
    const pad = (value) => String(value).padStart(2, "0");
    return `${year}-${pad(month + 1)}-${pad(day)}`;
  }
  function seriesOf(stated) {
    const text2 = (stated ?? "").trim().replace(/^\(([^()]*)\)$/, "$1").trim();
    if (!text2) {
      return void 0;
    }
    const trailing = /(\d+(?:\.\d+)?)$/.exec(text2);
    if (!trailing) {
      return { name: text2 };
    }
    const head = text2.slice(0, trailing.index);
    const separated = /(?:^|[\s,;])(?:(?:no|vol)\.\s*|(?:no|vol|book)\s+)$|#\s*$|[\s,;]+$/i.exec(head);
    const name = separated ? head.slice(0, separated.index).replace(/[\s,;:\-\u2013\u2014]+$/, "").trim() : "";
    return separated && name ? { name, index: Number(trailing[1]) } : { name: text2 };
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
  let closeActive = null;
  function panel({ title, body, footer = [] }) {
    closeActive?.();
    const backdrop = el("div", "bt-backdrop");
    const card = el("div", "bt-panel");
    const content = el("div", "bt-panel__body");
    const buttons = el("div", "bt-panel__footer");
    card.append(el("h2", null, { textContent: title }), content, buttons);
    content.append(body);
    backdrop.append(card);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (closeActive === close) closeActive = null;
      backdrop.dispatchEvent(new CustomEvent("bt-closed"));
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (event) => {
      if (!backdrop.isConnected) {
        close();
        return;
      }
      if (event.key === "Escape") close();
    };
    closeActive = close;
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
    return { onClose: (handler) => backdrop.addEventListener("bt-closed", handler) };
  }
  function field({ label, value, type = "text", hint, min, max, step, onInput }) {
    const wrapper = el("div", "bt-field");
    const input = el("input", null, { type, value: value ?? "" });
    if (min !== void 0) input.min = String(min);
    if (max !== void 0) input.max = String(max);
    if (step !== void 0) input.step = String(step);
    wrapper.append(el("label", null, { textContent: label }), input);
    if (hint) wrapper.append(el("div", "bt-hint", { textContent: hint }));
    input.addEventListener("input", () => onInput(input.value));
    return wrapper;
  }
  function textArea({ label, value, rows = 3, placeholder, onInput }) {
    const wrapper = el("div", "bt-field");
    const input = el("textarea", null, { value: value ?? "", rows, placeholder });
    wrapper.append(el("label", null, { textContent: label }), input);
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
  function askBookDetails({ title, defaults }) {
    return new Promise((resolve) => {
      const state = { ...defaults };
      const body = el("div");
      body.append(
        el("p", null, { textContent: `How much do you want to read ${title || "this book"}, and have you got it?` }),
        ...detailFields(state)
      );
      let answered = false;
      const answer = (value) => {
        answered = true;
        resolve(value);
      };
      const { onClose } = panel({
        title: "Before it goes on your shelf",
        body,
        footer: [
          { label: "Cancel", quiet: true, onClick: () => answer(null) },
          { label: "Send", onClick: () => answer(detailsToFields(state)) }
        ]
      });
      onClose(() => {
        if (!answered) answer(null);
      });
    });
  }
  function detailFields(state) {
    return [
      field({
        label: "Interest",
        type: "number",
        min: MIN_INTEREST,
        max: MAX_INTEREST,
        value: state.interest,
        hint: `${MIN_INTEREST} to ${MAX_INTEREST}, which the up next score reads. Leave empty to keep what the shelf holds.`,
        onInput: (value) => {
          state.interest = value;
        }
      }),
      checkbox({
        label: "I own a copy",
        checked: state.ownedPhysically,
        onChange: (value) => {
          state.ownedPhysically = value;
        }
      }),
      checkbox({
        label: "It is on Audiobookshelf",
        checked: state.onAudiobookshelf,
        onChange: (value) => {
          state.onAudiobookshelf = value;
        }
      })
    ];
  }
  function detailsToFields({ interest, ownedPhysically, onAudiobookshelf }) {
    const fields = {
      ownedPhysically: Boolean(ownedPhysically),
      onAudiobookshelf: Boolean(onAudiobookshelf)
    };
    const score = interestOf(interest);
    if (score !== null) fields.interest = score;
    return fields;
  }
  const t75 = "Finished on";
  const t76 = "Rating";
  const t78 = "Gave up";
  const t79 = "Stopped at %";
  const t80 = "Final comment";
  const t81 = "Optional, saved as your final comment on the book";
  const t82 = "{0} to {1}, optional";
  const t83 = "Rate it between 1 and 10, or leave the rating empty.";
  const t84 = "Pick the day you finished it.";
  const t85 = "That day has not come yet.";
  const t86 = "You started this on {0}, so it cannot have been finished before then.";
  const t87 = "Say how far you got, between 0 and 100.";
  const t741 = "Title";
  const t742 = "Author";
  const t743 = "Series";
  const t744 = "Number in series";
  const t745 = "Pages";
  const t746 = "Published";
  const t747 = "Cover";
  const t748 = "Description";
  const t749 = "ISBN";
  const t750 = "Interest";
  const t751 = "Owned";
  const t752 = "On Audiobookshelf";
  const t753 = "Narrator";
  const t754 = "Type";
  const t755 = "Genres";
  const t756 = "Rating";
  const t757 = "Ratings";
  const t758 = "Link";
  const t759 = "Country";
  const t760 = "Recommended by";
  const LABELS = {
    title: t741,
    authors: t742,
    narrator: t753,
    series: t743,
    seriesIndex: t744,
    type: t754,
    genres: t755,
    pages: t745,
    publishedOn: t746,
    goodreadsRating: t756,
    goodreadsRatingCount: t757,
    goodreadsURL: t758,
    isbn: t749,
    coverURL: t747,
    description: t748,
    country: t759,
    interest: t750,
    ownedPhysically: t751,
    onAudiobookshelf: t752,
    recommendedBy: t760
  };
  function askWhatToKeep(changes) {
    return new Promise((resolve) => {
      const body = el("div");
      const keep = new Set(changes.map((change) => change.field));
      body.append(
        el("p", null, {
          textContent: "This book is already on your shelf. Untick anything the page should not overwrite."
        })
      );
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
  function safeHref(href) {
    if (!href) return null;
    try {
      const url = new URL(String(href));
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch {
      return null;
    }
  }
  function toast(message, { error = false, link, ms = 4e3 } = {}) {
    showing?.remove();
    const element = el("div", `bt-toast${error ? " bt-toast--error" : ""}`, { textContent: message });
    const href = safeHref(link?.href);
    if (href) {
      element.append(" ", el("a", null, { href, textContent: link.label, target: "_blank", rel: "noreferrer" }));
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
  async function whileBusy(button2, busyLabel, action) {
    const label = button2.textContent;
    button2.disabled = true;
    button2.textContent = busyLabel;
    try {
      await action();
    } catch (error) {
      toast(error.message, { error: true, ms: 6e3 });
    } finally {
      button2.disabled = false;
      button2.textContent = label;
    }
  }
  function openSettings(settings, tracker, onClose) {
    const body = el("div");
    body.append(
      el("p", null, { textContent: "Books are filed under the friend these credentials belong to." }),
      ...connectionFields(settings),
      testRow(tracker),
      el("h2", null, { textContent: "What the per-book panel opens on" }),
      ...askedFields(settings),
      el("h2", null, { textContent: "Sent with every book" }),
      ...defaultFields(settings)
    );
    const modal = panel({
      title: "Reading Tracker",
      body,
      footer: [{ label: "Done" }]
    });
    if (onClose) modal.onClose(onClose);
  }
  function connectionFields(settings) {
    return [
      field({
        label: "Server",
        value: settings.get("baseURL"),
        hint: "The address you open the tracker at, e.g. https://books.example.com",
        onInput: (value) => settings.set("baseURL", value)
      }),
      field({
        label: "Username",
        value: settings.get("username"),
        onInput: (value) => settings.set("username", value)
      }),
      field({
        label: "Password",
        type: "password",
        value: settings.get("password"),
        hint: "Your Traefik login. Kept in this browser, in the userscript manager's storage.",
        onInput: (value) => settings.set("password", value)
      })
    ];
  }
  function testRow(tracker) {
    const wrapper = el("div", "bt-field");
    const test = button("Test connection", "bt-button bt-button--quiet");
    test.addEventListener("click", async () => {
      test.disabled = true;
      try {
        toast(`Signed in as ${await tracker.me()}`);
      } catch (error) {
        toast(error.message, { error: true });
      } finally {
        test.disabled = false;
      }
    });
    wrapper.append(test);
    return wrapper;
  }
  function askedFields(settings) {
    return [
      field({
        label: "Interest",
        type: "number",
        min: 1,
        max: 10,
        value: settings.get("interest"),
        hint: "1 to 10, how much you want to read it. Leave empty and the panel starts empty.",
        onInput: (value) => settings.set("interest", value)
      }),
      checkbox({
        label: "Owned by default",
        checked: settings.get("ownedPhysically"),
        onChange: (value) => settings.set("ownedPhysically", value)
      }),
      checkbox({
        label: "On Audiobookshelf by default",
        checked: settings.get("onAudiobookshelf"),
        onChange: (value) => settings.set("onAudiobookshelf", value)
      })
    ];
  }
  function defaultFields(settings) {
    return [
      field({
        label: "Recommended by",
        value: settings.get("recommendedBy"),
        hint: "Names, separated by commas.",
        onInput: (value) => settings.set("recommendedBy", value)
      }),
      checkbox({
        label: "Ask before overwriting a book that is already on the shelf",
        checked: settings.get("confirmOverwrites"),
        onChange: (value) => settings.set("confirmOverwrites", value)
      })
    ];
  }
  async function sendBook(book, { tracker, settings }) {
    if (!settings.isConfigured()) {
      toast("Tell the script where the tracker is first", { error: true });
      openSettings(settings, tracker);
      return;
    }
    if (!book?.title) {
      toast("Could not read the book title from this page", { error: true });
      return;
    }
    const details = await askBookDetails({ title: book.title, defaults: settings.askedDefaults() });
    if (!details) {
      toast("Nothing sent");
      return;
    }
    const sending = { ...book, ...details };
    const preview = await tracker.importBook(sending, { dryRun: true });
    if (preview.action === "unchanged") {
      toast("Already up to date", { link: settings.shelfLink(preview.book_ID) });
      return;
    }
    const fields = await fieldsToWrite(preview, settings);
    if (fields === null) {
      toast("Nothing sent");
      return;
    }
    const result = await tracker.importBook(sending, { fields });
    const message = result.action === "created" ? "Added to your shelf" : result.action === "unchanged" || !result.changes?.length ? "Already up to date" : `Updated ${result.changes.length} field(s)`;
    toast(message, { link: settings.shelfLink(result.book_ID) });
  }
  async function fieldsToWrite(preview, settings) {
    if (preview.action !== "updated" || !settings.get("confirmOverwrites")) return void 0;
    const keep = await askWhatToKeep(preview.changes);
    return keep?.size ? [...keep] : null;
  }
  function numberOf(value) {
    if (value === null || typeof value === "string" && value.trim() === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  const MIN_RATING = 1;
  const MAX_RATING = 10;
  const MIN_PERCENT = 0;
  const MAX_PERCENT = 100;
  function isPercentage(value) {
    const number = numberOf(value);
    return number !== null && number >= MIN_PERCENT && number <= MAX_PERCENT;
  }
  function isRating(value) {
    const number = numberOf(value);
    return number !== null && number >= MIN_RATING && number <= MAX_RATING;
  }
  function isRated(value) {
    const number = numberOf(value);
    return value !== null && String(value).trim() !== "" && number !== 0;
  }
  function finishProblem(input, startedOn, today) {
    if (!input.finishedOn) {
      return "finishNoDate";
    }
    if (input.finishedOn > today) {
      return "finishFuture";
    }
    if (startedOn && input.finishedOn < startedOn) {
      return "finishBeforeStart";
    }
    if (isRated(input.rating) && !isRating(input.rating)) {
      return "finishBadRating";
    }
    if (input.didNotFinish && !isPercentage(input.stoppedAt)) {
      return "finishBadPercentage";
    }
    return null;
  }
  function finishPatch(input) {
    const stopped = input.didNotFinish ? numberOf(input.stoppedAt) : null;
    return {
      finishedOn: input.finishedOn,
      personalRating: isRated(input.rating) ? String(numberOf(input.rating)) : null,
      asAudiobook: input.asAudiobook,
      didNotFinish: input.didNotFinish,
      didNotFinishAtPercentage: stopped !== null ? String(stopped) : null
    };
  }
  function finalComment(input, bookId) {
    const comment = input.comment.trim();
    return comment ? { book_ID: bookId, comment, isFinal: true } : null;
  }
  const HINTS = { finishNoDate: t84, finishFuture: t85, finishBeforeStart: t86, finishBadRating: t83, finishBadPercentage: t87 };
  function fill(text2, ...values) {
    return text2.replace(/\{(\d+)\}/g, (_, index) => values[index] ?? "");
  }
  function askFinished({ startedOn, asAudiobook }, bookId) {
    return new Promise((resolve) => {
      const state = { finishedOn: todayISO(), rating: "", didNotFinish: false, stoppedAt: "", comment: "" };
      const body = el("div");
      const hint = el("div", "bt-hint", { textContent: "" });
      const stoppedField = field({
        label: t79,
        type: "number",
        min: MIN_PERCENT,
        max: MAX_PERCENT,
        step: "any",
        value: state.stoppedAt,
        onInput: (value) => {
          state.stoppedAt = value;
        }
      });
      stoppedField.hidden = true;
      body.append(
        el("p", null, { textContent: "How did this reading end?" }),
        ...finishFields(state, () => {
          stoppedField.hidden = !state.didNotFinish;
        }),
        stoppedField,
        verdictField(state),
        hint
      );
      let answered = false;
      const answer = (value) => {
        answered = true;
        resolve(value);
      };
      const finish = () => {
        const problem = finishProblem(state, startedOn, todayISO());
        if (problem) {
          hint.textContent = fill(HINTS[problem], startedOn);
          return false;
        }
        const input = { ...state, asAudiobook };
        answer({ patch: finishPatch(input), comment: finalComment(input, bookId) });
        return void 0;
      };
      const { onClose } = panel({
        title: "Finish reading",
        body,
        footer: [
          { label: "Cancel", quiet: true, onClick: () => answer(null) },
          { label: "Finish", onClick: finish }
        ]
      });
      onClose(() => {
        if (!answered) answer(null);
      });
    });
  }
  function finishFields(state, onDnfChange) {
    return [
      field({
        label: t75,
        type: "date",
        value: state.finishedOn,
        onInput: (value) => {
          state.finishedOn = value;
        }
      }),
      field({
        label: t76,
        type: "number",
        min: MIN_RATING,
        max: MAX_RATING,
        step: "any",
        value: state.rating,
        hint: fill(t82, MIN_RATING, MAX_RATING),
        onInput: (value) => {
          state.rating = value;
        }
      }),
      checkbox({
        label: t78,
        checked: state.didNotFinish,
        onChange: (value) => {
          state.didNotFinish = value;
          onDnfChange();
        }
      })
    ];
  }
  function verdictField(state) {
    return textArea({
      label: t80,
      value: state.comment,
      placeholder: t81,
      onInput: (value) => {
        state.comment = value;
      }
    });
  }
  function createSessionControls({ tracker, settings, getBook }) {
    const button$1 = button("");
    button$1.hidden = true;
    let state = null;
    let pass = 0;
    button$1.addEventListener("click", () => {
      const current = state;
      if (!current) return;
      if (current.session) finishReading(current);
      else startReading(current);
    });
    async function refresh() {
      const mine = ++pass;
      button$1.hidden = true;
      state = null;
      if (!settings.isConfigured()) return;
      try {
        const next = await resolveState(tracker, getBook);
        if (mine !== pass || !button$1.isConnected) return;
        state = next;
        showButton(button$1, next);
      } catch (error) {
        if (mine !== pass || !button$1.isConnected) return;
        toast(error.message, { error: true, ms: 6e3 });
      }
    }
    async function startReading(current) {
      const { book_ID: bookId } = current;
      await whileBusy(button$1, "Working…", async () => {
        await tracker.startSession(bookId);
        toast("Reading started", { link: settings.shelfLink(bookId) });
      });
      await refresh();
    }
    async function finishReading(current) {
      const { session, book_ID: bookId } = current;
      const answer = await askFinished(session, bookId);
      if (!answer) return;
      const { patch, comment } = answer;
      await whileBusy(button$1, "Working…", async () => {
        await tracker.patchSession(session.ID, patch);
        if (comment) await tracker.createFinalComment(comment);
        const message = patch.didNotFinish ? "Marked as did not finish" : "Finished";
        toast(message, { link: settings.shelfLink(bookId) });
      });
      await refresh();
    }
    return { element: button$1, refresh };
  }
  async function resolveState(tracker, getBook) {
    const book = getBook();
    if (!book?.title) return null;
    const [shelf, me] = await Promise.all([tracker.findShelfBook(book), tracker.me()]);
    if (!shelf.onShelf) return null;
    const session = await tracker.openSession(shelf.book_ID, me);
    return { book_ID: shelf.book_ID, session };
  }
  function showButton(button2, state) {
    if (!state) return;
    button2.textContent = state.session ? "Finish reading" : "Start reading";
    button2.hidden = false;
  }
  const CSS = `
.bt-button {
    display: inline-flex; align-items: center; gap: 6px;
    min-height: 24px;
    padding: 8px 14px; border: 1px solid transparent; border-radius: 0;
    font: inherit; font-size: 16px; font-weight: 600; line-height: 1.25;
    color: #eff1f5; background: #8839ef; cursor: pointer;
}
.bt-button:hover { filter: brightness(.9); }
.bt-button:focus-visible { outline: 2px solid #1e66f5; outline-offset: 2px; }
.bt-button[disabled] { opacity: .65; cursor: default; filter: none; }
.bt-button--quiet {
    color: #4c4f69; background: #ccd0da; border-color: #9ca0b0;
}
.bt-button--quiet:hover { filter: brightness(.9); }

.bt-toast {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
    max-width: 320px; padding: 12px 16px; border-radius: 8px;
    font: 500 16px/1.4 system-ui, sans-serif; color: #fff; background: #2f4763;
    box-shadow: 0 6px 20px rgba(0,0,0,.25);
    opacity: 0; transform: translateY(8px); transition: opacity .2s, transform .2s;
}
.bt-toast--shown { opacity: 1; transform: none; }
.bt-toast--error { background: #98303a; }
.bt-toast a { color: #fff; text-decoration: underline; }

.bt-backdrop {
    position: fixed; inset: 0; z-index: 2147483646;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.45);
}

.bt-panel {
    width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px);
    display: flex; flex-direction: column; overflow: hidden;
    border-radius: 12px; background: #fff; color: #1d2733;
    font: 17px/1.5 system-ui, sans-serif;
}
.bt-panel h2 { margin: 0; padding: 18px 20px; font-size: 20px; border-bottom: 1px solid #e3e7ed; }
.bt-panel__body { padding: 16px 20px; overflow-y: auto; }
.bt-panel__footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 14px 20px; border-top: 1px solid #e3e7ed;
}
.bt-panel p { margin: 0 0 14px; color: #55606e; }

.bt-field { margin-bottom: 14px; }
.bt-field label { display: block; margin-bottom: 4px; font-weight: 600; }
.bt-field input[type=text], .bt-field input[type=password], .bt-field input[type=number], .bt-field input[type=date], .bt-field textarea {
    width: 100%; box-sizing: border-box; padding: 8px 10px;
    border: 1px solid #c6ced9; border-radius: 6px; font: inherit; background: #fff; color: inherit;
}
.bt-field textarea { resize: vertical; }
.bt-field--check { display: flex; align-items: center; gap: 8px; }
.bt-field--check label { margin: 0; font-weight: 400; }
.bt-hint { margin-top: 4px; font-size: 14px; color: #6b7686; }

.bt-change { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid #eef1f5; }
.bt-change:first-child { border-top: 0; }
.bt-change__name { font-weight: 600; }
.bt-change__values { font-size: 15px; word-break: break-word; }
.bt-change__old { color: #8a3b3b; text-decoration: line-through; }
.bt-change__new { color: #2c6b45; }
`;
  function addStyles() {
    _GM_addStyle(CSS);
  }
  function mountTracker({ name, anchor, ready, fields, matchPath }) {
    const settings = new Settings(name);
    const tracker = new ReadingTracker(settings);
    const getBook = () => ({ ...scrape(pageFields(fields)), ...settings.bookDefaults() });
    let mounted = null;
    let cancelWait = null;
    let lastReady = null;
    const isBookPage = () => !matchPath || matchPath.test(window.location.pathname);
    const mount = (element) => {
      lastReady = { element, text: element.textContent.trim() };
      if (mounted?.bar.isConnected) mounted.sessions.refresh();
      else mounted = mountBar(anchor, getBook, settings, tracker);
    };
    const scheduleMount = (previous) => {
      cancelWait?.();
      cancelWait = null;
      if (!isBookPage()) {
        mounted = null;
        return;
      }
      cancelWait = waitFor(ready, mount, { previous });
    };
    addStyles();
    scheduleMount(null);
    onNavigate(() => scheduleMount(lastReady));
  }
  function pageFields(fields) {
    return {
      ...fields,
      goodreadsURL: () => canonical().split("?")[0]
    };
  }
  function mountBar(anchor, getBook, settings, tracker) {
    const parent = document.querySelector(anchor);
    if (!parent) return null;
    parent.querySelectorAll(".bt-actions").forEach((stale) => stale.remove());
    const bar = el("div", "bt-actions");
    bar.style.cssText = "display:flex; gap:8px; margin:12px 0;";
    const sessions = createSessionControls({ tracker, settings, getBook });
    const send = button("Add to Reading Tracker");
    const configure = button("Settings", "bt-button bt-button--quiet");
    send.addEventListener("click", async () => {
      await whileBusy(send, "Sending…", () => sendBook(getBook(), { tracker, settings }));
      sessions.refresh();
    });
    configure.addEventListener("click", () => openSettings(settings, tracker, () => sessions.refresh()));
    bar.append(send, sessions.element, configure);
    parent.append(bar);
    sessions.refresh();
    return { bar, sessions };
  }
  const TITLE = "h1.Text__title1, .BookPageTitleSection h1";
  const SERIES = "h3.Text__title3 a, .BookPageTitleSection__series a";
  const NOT_AUTHORS = /illustrator|translator|editor|narrator|foreword|introduction|contributor|photographer/i;
  function contributors() {
    return [
      ...document.querySelectorAll(
        ".BookPageMetadataSection__contributor .ContributorLink, .BookPageMetadataSection__contributor a"
      )
    ].map((link) => ({
      name: link.querySelector(".ContributorLink__name")?.textContent.trim() ?? link.textContent.trim(),
      role: link.querySelector(".ContributorLink__role")?.textContent.trim() ?? ""
    })).filter((person) => person.name);
  }
  function pages() {
    const stated = text('p[data-testid="pagesFormat"]', ".BookDetails__info span", ".BookDetails__format");
    const match = /(\d[\d,]*)\s+pages/i.exec(stated);
    return match ? firstNumber(match[1]) : null;
  }
  function published() {
    const stated = text('p[data-testid="publicationInfo"]', ".BookDetails__row span", ".BookDetails__publication");
    const match = /published\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(stated);
    return match ? isoDay(`${match[1]} ${match[2]}, ${match[3]}`) : "";
  }
  function series() {
    return seriesOf(document.querySelector(SERIES)?.textContent);
  }
  function genres() {
    return texts(
      '[data-testid="genresList"] .Button__labelItem, .BookPageMetadataSection__genreButton .Button__labelItem'
    ).filter((genre) => genre !== "...more");
  }
  function isbn() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const found = isbnIn(JSON.parse(script.textContent)?.isbn);
        if (found) return found;
      } catch {
      }
    }
    for (const term of document.querySelectorAll(".EditionDetails dt, .DescListItem dt")) {
      if (/isbn/i.test(term.textContent)) return isbnIn(term.nextElementSibling?.textContent);
    }
    return "";
  }
  const FIELDS = {
    title: () => text(TITLE),
    authors: () => contributors().filter((person) => !NOT_AUTHORS.test(person.role)).map((person) => person.name),
    narrator: () => {
      const narrator = contributors().find((person) => /narrator/i.test(person.role));
      return narrator?.name ?? "";
    },
    series: () => series()?.name,
    seriesIndex: () => series()?.index,
    genres,
    pages,
    publishedOn: published,
    goodreadsRating: () => firstNumber(text(".RatingStatistics__rating", '[data-testid="averageRating"]')),
    goodreadsRatingCount: () => firstNumber(text('[data-testid="ratingsCount"]', ".RatingStatistics__meta span")),
    isbn,
    coverURL: () => document.querySelector(".BookCover__image img, .BookPage__leftColumn .ResponsiveImage")?.src || meta("og:image"),
    description: () => text('[data-testid="description"] .Formatted', ".BookPageMetadataSection__description .Formatted")
  };
  mountTracker({
    name: "goodreadsToBookTracker",
    anchor: ".BookActions, .BookPageTitleSection",
    ready: TITLE,
    fields: FIELDS
  });

})();