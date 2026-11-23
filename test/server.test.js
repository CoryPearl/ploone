import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.js';

test('Node server serves the app, local Three.js, and daily API safely', async t => {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const index = await fetch(base); assert.equal(index.status, 200); assert.match(await index.text(), /Ploon/);
  const module = await fetch(`${base}/vendor/three/three.module.js`); assert.equal(module.status, 200); assert.match(module.headers.get('content-type'), /javascript/);
  const decal = await fetch(`${base}/vendor/three/addons/geometries/DecalGeometry.js`); assert.equal(decal.status,200);assert.match(await decal.text(), /class DecalGeometry/);
  assert.equal((await fetch(`${base}/vendor/three/addons/..%2f..%2f..%2fpackage.json`)).status,403);
  const daily = await fetch(`${base}/api/daily`); assert.equal(daily.status, 200); assert.equal((await daily.json()).date, new Date().toISOString().slice(0, 10));
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fserver.js`)).status, 403);
  assert.equal((await fetch(`${base}/vendor/three/..%2f..%2fpackage.json`)).status, 403);
  assert.equal((await fetch(`${base}/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  const head = await fetch(base, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
});
