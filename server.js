import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { dailyChallenge } from './public/js/core/seed.js';
import { createLeaderboard, verifyInWorker } from './lib/leaderboard.js';
import { raceScope } from './lib/verify-race.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, 'public');
const vendorRoot = path.join(root, 'node_modules/three/build');
const addonRoot = path.join(root, 'node_modules/three/examples/jsm');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0, failed = false; const chunks = [];
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > 512 * 1024) { failed = true; reject(Object.assign(new Error('Race recording is too large.'), { status: 413 })); }
      else chunks.push(chunk);
    });
    req.once('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON.'), { status: 400 })); }
    });
    req.once('error', reject);
  });
}

export function createServer({ leaderboardFile = process.env.LEADERBOARD_FILE || path.join(root, 'data', 'leaderboards.json') } = {}) {
  const leaderboard = createLeaderboard(leaderboardFile);
  return http.createServer(async (req, res) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/leaderboard') {
        const json = (status, value) => { res.writeHead(status, { ...headers, 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(value)); };
        if (!['GET', 'HEAD', 'POST'].includes(req.method)) { headers.Allow = 'GET, HEAD, POST'; json(405, { error: 'Method not allowed.' }); return; }
        const cookie = /(?:^|;\s*)ploon-pilot=([a-f0-9-]{36})(?:;|$)/.exec(req.headers.cookie || '');
        const pilotId = cookie?.[1] || randomUUID();
        if (!cookie) headers['Set-Cookie'] = `ploon-pilot=${pilotId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`;
        try {
          if (req.method === 'POST') {
            if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') { json(415, { error: 'Send a JSON race recording.' }); return; }
            const run = await readJSON(req);
            if (!run || typeof run !== 'object' || Array.isArray(run) || (run.name !== undefined && (typeof run.name !== 'string' || run.name.length > 20 || /[\u0000-\u001f]/.test(run.name)))) { json(400, { error: 'Use a pilot name of up to 20 characters.' }); return; }
            const verified = await verifyInWorker(run);
            const name = run.name?.trim().replace(/\s+/g, ' ') || `Pilot ${pilotId.slice(0, 4).toUpperCase()}`;
            const result = await leaderboard.submit({ ...verified, name, pilotId });
            json(200, { ...result, time: verified.time }); return;
          }
          let scope;
          try { scope = raceScope(url.searchParams.get('seed') || dailyChallenge().seed, url.searchParams.get('aircraft') || 'f16'); }
          catch (error) { json(400, { error: error.message }); return; }
          json(200, { ...scope, ...await leaderboard.standings(scope.seed, scope.aircraft, pilotId) });
        } catch (error) { json(error.status || 503, { error: error.status ? error.message : 'The leaderboard is unavailable. Try again shortly.' }); }
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }); res.end(); return;
      }
      if (url.pathname === '/api/daily') {
        res.writeHead(200, { ...headers, 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(dailyChallenge())); return;
      }
      const vendor = url.pathname.startsWith('/vendor/three/');
      const addon = url.pathname.startsWith('/vendor/three/addons/');
      const base = addon ? addonRoot : vendor ? vendorRoot : publicRoot;
      const requested = decodeURIComponent(addon ? url.pathname.slice('/vendor/three/addons/'.length) : vendor ? url.pathname.slice('/vendor/three/'.length) : url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(base, '.' + (requested.startsWith('/') ? requested : '/' + requested));
      if (!file.startsWith(base + path.sep)) { res.writeHead(403, headers); res.end('Forbidden'); return; }
      if (!(await stat(file)).isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
      const body = await readFile(file);
      res.writeHead(200, { ...headers, 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : error instanceof URIError ? 400 : 500;
      res.writeHead(status, headers); res.end(status === 404 ? 'Not found' : 'Request failed');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Ploon is ready at http://localhost:${port}`));
}
