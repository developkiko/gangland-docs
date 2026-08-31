import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(fileURLToPath(import.meta.url));

const MIME = {
  '.png': 'image/png', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.ini': 'text/plain', '.txt': 'text/plain', '.lua': 'text/plain',
};

// Раздача web/extracted в dev-режиме без копирования в public/
function extractedAssets() {
  const extracted = path.join(webDir, 'extracted');
  return {
    name: 'extracted-assets',
    configureServer(server: { middlewares: { use: (p: string, fn: (req: any, res: any) => void) => void } }) {
      server.middlewares.use('/extracted', (req, res) => {
        const rel = decodeURIComponent((req.url || '').split('?')[0]);
        const file = path.join(extracted, rel);
        if (!file.startsWith(extracted) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          return res.end('not found');
        }
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [extractedAssets()],
  build: { target: 'esnext' },
});
