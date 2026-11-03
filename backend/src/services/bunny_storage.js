/**
 * Armazenamento dos anexos dos pedidos de desconto.
 *
 * Com as variaveis BUNNY_* preenchidas, o arquivo vai para uma Storage Zone do
 * Bunny.net (upload pela Storage API, leitura pela Pull Zone/CDN). Sem elas, o
 * arquivo fica numa pasta local (UPLOADS_DIR, padrao backend/uploads) e e
 * servido pela propria API em /uploads. O nome e sempre um UUID, entao a URL
 * nao e adivinhavel.
 */

const https  = require('https');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const BUNNY_ACCESS_KEY   = process.env.BUNNY_ACCESS_KEY || '';
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE || '';
const BUNNY_FOLDER       = process.env.BUNNY_FOLDER || 'anexos-desconto';
const BUNNY_CDN_BASE     = (process.env.BUNNY_CDN_BASE || '').replace(/\/+$/, '');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4444}`).replace(/\/+$/, '');

function bunnyEnabled() {
  return Boolean(BUNNY_ACCESS_KEY && BUNNY_STORAGE_ZONE && BUNNY_CDN_BASE);
}

function newFileName(originalName) {
  const ext = path.extname(String(originalName || '')).toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${crypto.randomUUID()}${ext}`;
}

function uploadLocal(buffer, filename) {
  fs.mkdirSync(path.join(UPLOADS_DIR, BUNNY_FOLDER), { recursive: true });
  fs.writeFileSync(path.join(UPLOADS_DIR, BUNNY_FOLDER, filename), buffer);
  return `${PUBLIC_API_URL}/uploads/${BUNNY_FOLDER}/${filename}`;
}

/**
 * Faz upload de um Buffer.
 * @param {Buffer} buffer  Conteúdo do arquivo
 * @param {string} originalName  Nome original (para preservar extensão)
 * @returns {Promise<string>}  URL pública do arquivo
 */
function uploadFile(buffer, originalName) {
  const filename = newFileName(originalName);
  if (!bunnyEnabled()) return Promise.resolve(uploadLocal(buffer, filename));

  const remotePath = `/${BUNNY_STORAGE_ZONE}/${BUNNY_FOLDER}/${filename}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'PUT',
        hostname: BUNNY_STORAGE_HOST,
        path: remotePath,
        headers: {
          AccessKey: BUNNY_ACCESS_KEY,
          'Content-Type': 'application/octet-stream',
          'Content-Length': buffer.length,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(`${BUNNY_CDN_BASE}/${BUNNY_FOLDER}/${filename}`);
          } else {
            reject(new Error(`Bunny.net upload falhou: ${res.statusCode} ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

/**
 * Remove um arquivo pelo caminho relativo ou URL pública.
 * @param {string} urlOrFilename  URL completa ou só o nome do arquivo
 * @returns {Promise<void>}
 */
function deleteFile(urlOrFilename) {
  const filename = path.basename(String(urlOrFilename || ''));
  if (!filename) return Promise.resolve();

  if (!bunnyEnabled()) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, BUNNY_FOLDER, filename)); } catch { /* ja nao existe */ }
    return Promise.resolve();
  }

  const remotePath = `/${BUNNY_STORAGE_ZONE}/${BUNNY_FOLDER}/${filename}`;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'DELETE',
        hostname: BUNNY_STORAGE_HOST,
        path: remotePath,
        headers: { AccessKey: BUNNY_ACCESS_KEY },
      },
      (res) => {
        res.resume(); // drena a resposta
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Bunny.net delete falhou: ${res.statusCode}`));
        }
      }
    );
    req.on('error', reject);
    req.end();
  });
}

module.exports = { uploadFile, deleteFile, bunnyEnabled, UPLOADS_DIR };
