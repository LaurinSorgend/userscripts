// ==UserScript==
// @name         Goodreads Copy Book Info
// @namespace    https://github.com/laurinsorgend
// @version      1.4
// @description  Adds a button to copy book information in a format ready for spreadsheet pasting
// @author       laurin@sorgend.eu
// @match        https://www.goodreads.com/book/show/*
// @grant        GM_setClipboard
// @grant        GM_getResourceText
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
    
    function log(...args) {
        if (DEBUG) {
            console.log(`[Goodreads Copy Info]`, ...args);
        }
    }
    
    function error(...args) {
        console.error(`[Goodreads Copy Info Error]`, ...args);
    }

    function addStyles() {
        try {
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
                .grcopy-notification.show {
                    opacity: 1;
                }
            `;
            
            if (typeof GM_addStyle === 'function') {
                GM_addStyle(css);
            } else {
                const styleNode = document.createElement('style');
                styleNode.appendChild(document.createTextNode(css));
                document.head.appendChild(styleNode);
            }
            log('Styles added successfully');
        } catch (e) {
            error('Failed to add styles', e);
        }
    }

    /**
     * Cross-browser clipboard function
     * @param {string} text - Text to copy to clipboard
     */
    function copyToClipboard(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
            return true;
        } else {
            try {
                navigator.clipboard.writeText(text).catch(e => {
                    error('Failed to copy with navigator clipboard API', e);
                    
                    const el = document.createElement('textarea');
                    el.value = text;
                    el.setAttribute('readonly', '');
                    el.style.position = 'absolute';
                    el.style.left = '-9999px';
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                });
                return true;
            } catch (e) {
                error('All clipboard methods failed', e);
                return false;
            }
        }
    }

    /**
     * Wait for an element to be present in the DOM
     * @param {string} selector - CSS selector to find the element
     * @param {function} callback - Function to execute when element is found
     * @param {number} checkFrequencyInMs - How often to check for the element
     * @param {number} timeoutInMs - How long to keep trying before giving up
     */
    function waitForElement(selector, callback, checkFrequencyInMs = 100, timeoutInMs = 15000) {
        const startTimeInMs = Date.now();
        log(`Waiting for element: ${selector}`);
        
        function checkForElement() {
            const element = document.querySelector(selector);
            if (element) {
                log(`Element found: ${selector}`);
                callback(element);
                return;
            } else {
                if (timeoutInMs && Date.now() - startTimeInMs > timeoutInMs) {
                    error(`Timed out waiting for element: ${selector}`);
                    if (selector === 'h1.Text__title1') {
                        const altTitleElement = document.querySelector('.BookPageTitleSection h1');
                        if (altTitleElement) {
                            log(`Found alternative title element`);
                            callback(altTitleElement);
                            return;
                        }
                    }
                    if (selector === '.BookActions') {
                        const altButtonBar = document.querySelector('.BookPage__rightColumn');
                        if (altButtonBar) {
                            log(`Found alternative button bar element`);
                            callback(altButtonBar);
                            return;
                        }
                    }
                    return;
                }
                setTimeout(checkForElement, checkFrequencyInMs);
            }
        }
        
        checkForElement();
    }

    /**
     * Show a notification to the user
     * @param {string} message - The message to display
     * @param {number} duration - How long to show the message (ms)
     */
    function showNotification(message, duration = 2000) {
        try {
            const existingNotification = document.querySelector('.grcopy-notification');
            if (existingNotification) {
                existingNotification.remove();
            }

            const notification = document.createElement('div');
            notification.className = 'grcopy-notification';
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => notification.classList.add('show'), 10);

            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        } catch (e) {
            error('Failed to show notification', e);
        }
    }

    function addCopyButton() {
        try {
            log('Adding copy button...');
            
            let buttonBar = document.querySelector('.BookActions');
            
            if (!buttonBar) {
                buttonBar = Array.from(document.querySelectorAll('div[class*="BookActions"]')).find(el => 
                    el.className.includes('BookActions')
                );
            }
            
            if (!buttonBar) {
                error("BookActions element not found, trying alternative approach");
                buttonBar = document.querySelector('.BookPage__rightColumn');
                
                if (!buttonBar) {
                    error("Failed to find button container");
                    return;
                }
            }
            
            log('Found button bar:', buttonBar);
            
            let templateButton = document.querySelector('.BookActions__button');
            
            if (!templateButton) {
                templateButton = document.querySelector('.Button--secondary');
                
                if (!templateButton) {
                    log('Creating custom button without template');
                    const customButton = document.createElement('div');
                    customButton.className = 'BookActions__button';
                    customButton.innerHTML = '<div class="Button__container Button__container--block"><button type="button" class="Button Button--secondary Button--medium Button--block"><span class="Button__labelItem">Copy Info</span></button></div>';
                    
                    buttonBar.appendChild(customButton);
                    
                    const actualButton = customButton.querySelector("button");
                    if (actualButton) {
                        actualButton.addEventListener('click', handleCopyButtonClick);
                        log('Custom button added successfully');
                        return;
                    } else {
                        error('Failed to create custom button');
                        return;
                    }
                }
            }
            
            log('Found template button:', templateButton);
            
            const copyButton = templateButton.cloneNode(true);
            copyButton.innerHTML = '<div class="Button__container Button__container--block"><button type="button" class="Button Button--secondary Button--medium Button--block"><span class="Button__labelItem">Copy Info</span></button></div>';

            const actualButton = copyButton.querySelector("button");
            if (!actualButton) {
                error("Failed to get button element");
                return;
            }

            actualButton.addEventListener('click', handleCopyButtonClick);
            buttonBar.appendChild(copyButton);
            log("'Copy Info' button added successfully");
        } catch (e) {
            error("Failed to add copy button", e);
        }
    }
    
    function handleCopyButtonClick() {
        try {
            log('Copy button clicked');
            const bookInfo = getBookInfo();
            
            if (!bookInfo) {
                showNotification("Error: Failed to get book info", 3000);
                return;
            }
            
            const success = copyToClipboard(bookInfo);
            
            if (success) {
                const buttonLabel = this.querySelector(".Button__labelItem");
                if (buttonLabel) {
                    const originalText = buttonLabel.textContent;
                    buttonLabel.textContent = 'Copied!';
                    
                    setTimeout(() => {
                        buttonLabel.textContent = originalText;
                    }, 1500);
                }
                
                showNotification("Book info copied to clipboard!");
            } else {
                showNotification("Error copying to clipboard", 3000);
            }
        } catch (e) {
            error("Error copying book info", e);
            showNotification("Error copying book info. See console for details.", 3000);
        }
    }

    /**
     * Safely extracts text from a DOM element using multiple selector strategies
     * @param {string} primarySelector - First CSS selector to try
     * @param {string[]} fallbackSelectors - Array of backup selectors to try if primary fails
     * @param {RegExp} [regex] - Optional regex to extract specific information from text
     * @param {number} [matchGroup] - Which regex match group to return (defaults to 1)
     * @returns {string} The extracted text or empty string if not found
     */
    function safelyGetText(primarySelector, fallbackSelectors = [], regex = null, matchGroup = 1) {
        try {

            let element = document.querySelector(primarySelector);
            
            let index = 0;
            while (!element && index < fallbackSelectors.length) {
                element = document.querySelector(fallbackSelectors[index]);
                index++;
            }
            
            if (!element) {
                return '';
            }
            
            const text = element.textContent.trim();
            
            if (regex && text) {
                const match = text.match(regex);
                return match ? match[matchGroup] : '';
            }
            
            return text;
        } catch (e) {
            error(`Error extracting text with selector ${primarySelector}`, e);
            return '';
        }
    }

    /**
     * Extract book information from the Goodreads page
     * @returns {string} Tab-separated string of book information
     */
    function getBookInfo() {
        log('Extracting book information...');
        
        const title = safelyGetText('h1.Text__title1', [
            '.BookPageTitleSection h1', 
            '.BookPageTitleSection__title'
        ]);
        
        log('Title:', title);
        
        if (!title) {
            error("Could not find book title");
            return null;
        }

        let seriesName = '';
        let seriesNumber = '';

        try {
            let seriesElements = document.querySelectorAll('h3.Text__title3 a');
            
            if (!seriesElements || seriesElements.length === 0) {
                seriesElements = document.querySelectorAll('.BookPageTitleSection__series a');
            }
            
            if (seriesElements && seriesElements.length > 0) {
                const seriesElement = seriesElements[0];
                const seriesText = seriesElement.textContent.trim();
                const regex = /\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/;
                const match = seriesText.match(regex);
                if (match) {
                    seriesName = seriesText.slice(0, seriesText.lastIndexOf(match[0])).trim();
                    seriesNumber = match[1];
                }
                else {
                    seriesName = seriesText.trim();
                    seriesNumber = '';
                }
                log('Series name:', seriesName);
                log('Series number:', seriesNumber);
            }
        } catch (e) {
            error("Error parsing series info", e);
        }

        let pages = '';
        try {
            const pagesElement = document.querySelector('p[data-testid="pagesFormat"]');
            if (pagesElement) {
                const pagesMatch = pagesElement.textContent.match(/(\d+)\s+pages/);
                if (pagesMatch) {
                    pages = pagesMatch[1];
                }
            }

            if (!pages) {
                const formatText = safelyGetText('.BookDetails__info span', ['.BookDetails__format']);
                if (formatText) {
                    const pagesMatch = formatText.match(/(\d+)\s+pages/);
                    if (pagesMatch) {
                        pages = pagesMatch[1];
                    }
                }
            }
            
            if (!pages) {
                const detailsElements = document.querySelectorAll('.BookDetails .BookDetails__list span, .BookDetails__metadata span');
                for (let i = 0; i < detailsElements.length; i++) {
                    const text = detailsElements[i].textContent;
                    if (text.includes('pages')) {
                        pages = text.replace(/\D/g, '');
                        break;
                    }
                }
            }
            
            log('Pages:', pages);
        } catch (e) {
            error("Error parsing page count", e);
        }

        let rating = '';
        try {
            rating = safelyGetText('.RatingStatistics__rating', [
                '[data-testid="averageRating"]',
                '.BookPageMetadataSection__ratingStats span'
            ]);
            log('Rating:', rating);
        } catch (e) {
            error("Error parsing rating", e);
        }

        let authorFullName = '';
        let authorLastFirst = '';
        try {
            authorFullName = safelyGetText('.ContributorLink__name', [
                '.BookPageMetadataSection__contributor a',
                '.AuthorLink__name'
            ]);

            if (authorFullName) {
                const nameParts = authorFullName.split(' ');
                if (nameParts.length > 1) {
                    const lastName = nameParts.pop();
                    const firstName = nameParts.join(' ');
                    authorLastFirst = `${lastName}, ${firstName}`;
                } else {
                    authorLastFirst = authorFullName;
                }
            }
            log('Author (Last, First):', authorLastFirst);
        } catch (e) {
            error("Error parsing author", e);
        }

        let publishDate = '';
        try {
            const pubInfoElement = document.querySelector('p[data-testid="publicationInfo"]');
            if (pubInfoElement) {
                const pubText = pubInfoElement.textContent.trim();
                const fullDateMatch = pubText.match(/(?:First |)published\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
                if (fullDateMatch) {
                    publishDate = `${fullDateMatch[1]} ${fullDateMatch[2]}, ${fullDateMatch[3]}`;
                } else {
                    const yearMatch = pubText.match(/(?:First |)published\s+(\d{4})/i);
                    if (yearMatch) {
                        publishDate = yearMatch[1];
                    }
                }
            }
            
            if (!publishDate) {
                const altPubText = safelyGetText('.BookDetails__row span', ['.BookDetails__publication']);
                if (altPubText) {
                    const altFullDateMatch = altPubText.match(/(?:First |)published\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
                    if (altFullDateMatch) {
                        publishDate = `${altFullDateMatch[1]} ${altFullDateMatch[2]}, ${altFullDateMatch[3]}`;
                    } else {
                        const altYearMatch = altPubText.match(/(?:First |)published\s+(\d{4})/i);
                        if (altYearMatch) {
                            publishDate = altYearMatch[1];
                        }
                    }
                }
            }
            
            log('Publication date:', publishDate);
        } catch (e) {
            error("Error parsing publication date", e);
        }

        const options = {
            year: "numeric",
            month: "short",
            day: "numeric"
        };
        const currentDate = new Date().toLocaleDateString("en-UK", options);

        // Book | Series Name | Series | Type | Pages | Rating | GoodReads | Author | Narrator | Published | Times Read | Plan | Date Added | Recommended By | Link
        let type = '';
        if (pages) {
            const pageNumber = parseInt(pages, 10);
            if (pageNumber <= 40) {
                type = 'Short Story';
            } else if (pageNumber <= 300) {
                type = 'Novella';
            } else if (pageNumber > 300) {
                type = 'Novel';
            }
        }
        
        const personalRating = '';
        const goodreadsLink = window.location.href;
        const narrator = ''; 
        const timesRead = ''; 
        const plan = '99'; 
        const recommendedBy = '';  

        const result = [
            title,
            seriesName,
            seriesNumber,
            type,
            pages,
            personalRating,
            rating,
            authorLastFirst,
            narrator,
            publishDate,
            timesRead,
            plan,
            currentDate,
            recommendedBy,
            goodreadsLink
        ].join('\t');

        log("Successfully extracted book information");
        return result;
    }

    function initialize() {
        log(`Script version ${GM_info?.script?.version || '1.4'} initializing...`);
        try {
            addStyles();
            
            waitForElement('h1.Text__title1, .BookPageTitleSection h1', () => {
                log('Book title found, adding button...');
                setTimeout(() => {
                    addCopyButton();
                }, 500);
            }, 100, 20000);
        } catch (e) {
            error("Error during initialization", e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 500);
    }
})();