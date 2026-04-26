import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { resolve } from 'path';

const userscriptName = 'goodreadsToGoogleSheets';

function generateMetaJs() {
  return {
    name: 'generate-meta-js',
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const userJsPath = resolve(distDir, 'monkey.user.js');
      const targetUserJsPath = resolve(distDir, `${userscriptName}.user.js`);
      
      if (existsSync(userJsPath)) {
        renameSync(userJsPath, targetUserJsPath);
        console.log(`Renamed monkey.user.js to ${userscriptName}.user.js`);
        
        const userJsContent = readFileSync(targetUserJsPath, 'utf-8');
        const metaMatch = userJsContent.match(/(\/\/ ==UserScript==[\s\S]*?==\/UserScript==)/);
        if (metaMatch) {
          const metaJsPath = resolve(distDir, `${userscriptName}.meta.js`);
          writeFileSync(metaJsPath, metaMatch[1] + '\n');
          console.log(`Generated ${userscriptName}.meta.js`);
        }
      }
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'Goodreads to Google Sheets',
        namespace: 'https://github.com/laurinsorgend',
        version: '1.0',
        description: 'Adds a button to send book information directly to Google Sheets using Googles API',
        author: 'laurin@sorgend.eu',
        match: ['https://www.goodreads.com/book/show/*'],
        grant: [
          'GM_xmlhttpRequest',
          'GM_getValue',
          'GM_setValue',
          'GM_addStyle',
          'GM_info'
        ],
        require: [
          'https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/10.9.0/jsrsasign-all-min.js'
        ],
        updateURL: `https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/dist/${userscriptName}.meta.js`,
        downloadURL: `https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/dist/${userscriptName}.user.js`,
        supportURL: 'https://github.com/laurinsorgend/userscripts/issues',
        'run-at': 'document-idle'
      },
    }),
    generateMetaJs()
  ],
});