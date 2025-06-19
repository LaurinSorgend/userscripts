// ==UserScript==
// @name         Storygraph to Goodreads Search
// @namespace    https://github.com/laurinsorgend
// @version      1.0
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
        button.className = 'mt-6 pt-2 pb-2 border-2 border-darkGrey w-full dark:border-darkerGrey bg-grey dark:bg-darkestGrey inline text-xs text-darkerGrey dark:text-lightGrey hover:bg-darkGrey dark:hover:bg-darkerGrey';
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
            console.error('Error extracting book info:', error);
            return null;
        }
    }

    function init() {
        const coverParent = document.querySelector('.book-cover')?.parentElement;
        if (!coverParent) return;

        const button = createButton();
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'extra-buttons';
        buttonContainer.appendChild(button);
        coverParent.appendChild(buttonContainer);

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

    window.addEventListener('load', init);
})();