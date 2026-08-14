import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { resolve } from 'path';

const userscriptName = 'goodreadsToObsidian';

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
        name: 'Goodreads to Obsidian',
        namespace: 'https://github.com/laurinsorgend',
        version: '1.0',
        description: 'Adds a button to create/update a book note in your Obsidian vault via the Local REST API plugin',
        author: 'laurin@sorgend.eu',
        match: ['https://www.goodreads.com/book/show/*'],
        grant: [
          'GM_xmlhttpRequest',
          'GM_getValue',
          'GM_setValue',
          'GM_addStyle',
          'GM_info'
        ],
        updateURL: `https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToObsidian/dist/${userscriptName}.meta.js`,
        downloadURL: `https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToObsidian/dist/${userscriptName}.user.js`,
        supportURL: 'https://github.com/laurinsorgend/userscripts/issues',
        'run-at': 'document-idle'
      },
      build: {
        // shared/SettingsUI.js still imports GoogleSheetsManager.js (for the
        // Sheets-backend scripts' Test & Load Columns button), which pulls in
        // jsrsasign transitively even though this script never uses it —
        // externalize it to a CDN global instead of bundling ~500KB of crypto.
        externalGlobals: {
          jsrsasign: ['KJUR', 'https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/10.9.0/jsrsasign-all-min.js'],
        },
      },
    }),
    generateMetaJs()
  ],
});
