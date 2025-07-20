// ==UserScript==
// @name         Storygraph to Goodreads Search
// @namespace    https://github.com/laurinsorgend
// @version      1.2
// @description  Adds a button to redirect from Storygraph page to a Goodreads search with the book title and author
// @author       laurin@sorgend.eu
// @match        https://app.thestorygraph.com/books/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=thestorygraph.com
// @grant        none
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/storygraphToGoodreads/storygraphToGoodreads.meta.js
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/storygraphToGoodreads/storygraphToGoodreads.user.js
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// ==/UserScript==

(function() {
    'use strict';

    function createButton() {
        const button = document.createElement('button');
        button.className = 'mt-6 pt-2 pb-2 border-2 border-darkGrey w-full dark:border-darkerGrey bg-grey dark:bg-darkestGrey inline text-xs text-darkerGrey dark:text-lightGrey hover:bg-darkGrey dark:hover:bg-darkerGrey goodreads-search-btn';
        button.title = 'Search on Goodreads';
        button.setAttribute('aria-label', 'Search for this book on Goodreads');
        button.innerHTML = `
            <div class="text-center">
                <span>Search on Goodreads</span>
            </div>
        `;
        return button;
    }

    function getBookInfo() {
        const titleElement = document.querySelector('h3.font-serif');
        const authorElement = document.querySelector('.book-title-author-and-series p.font-body');

        if (!titleElement || !authorElement) return null;

        try {
            const title = titleElement.childNodes[0].textContent.trim();
            const authors = Array.from(authorElement.querySelectorAll('a'))
                .filter(a => !a.textContent.includes('Translator') && !a.textContent.includes('Narrator'))
                .map(a => a.textContent.trim())
                .join(' ');

            return { title, authors };
        } catch (error) {
            return null;
        }
    }

    function addButton() {
        if (document.querySelector('.goodreads-search-btn')) return;

        const coverParent = document.querySelector('.book-cover')?.parentElement;
        if (!coverParent) return;

        const button = createButton();
        coverParent.appendChild(button);

        button.addEventListener('click', () => {
            const bookInfo = getBookInfo();
            if (!bookInfo) {
                alert('Could not find book information');
                return;
            }

            const query = encodeURIComponent(`${bookInfo.title} ${bookInfo.authors}`);
            window.open(`https://www.goodreads.com/search?q=${query}`, '_blank');
        });
    }

    function waitForElements(callback, timeout = 10000) {
        const startTime = Date.now();

        function check() {
            const hasRequiredElements = document.querySelector('.book-cover') &&
                                      document.querySelector('h3.font-serif') &&
                                      document.querySelector('.book-title-author-and-series p.font-body');

            if (hasRequiredElements) {
                callback();
            } else if (Date.now() - startTime < timeout) {
                requestAnimationFrame(check);
            }
        }

        check();
    }

    function handleRouteChange() {
        if (window.location.pathname.startsWith('/books/')) {
            waitForElements(addButton);
        }
    }

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        setTimeout(handleRouteChange, 0);
    };

    history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        setTimeout(handleRouteChange, 0);
    };

    window.addEventListener('popstate', handleRouteChange);

    const observer = new MutationObserver((mutations) => {
        const hasSignificantChanges = mutations.some(mutation =>
            mutation.type === 'childList' &&
            mutation.addedNodes.length > 0 &&
            Array.from(mutation.addedNodes).some(node =>
                node.nodeType === Node.ELEMENT_NODE &&
                (node.matches && node.matches('main, .book-cover, h3.font-serif') ||
                 node.querySelector && node.querySelector('main, .book-cover, h3.font-serif'))
            )
        );

        if (hasSignificantChanges && window.location.pathname.startsWith('/books/')) {
            waitForElements(addButton);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    handleRouteChange();

})();