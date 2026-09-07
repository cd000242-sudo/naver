import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { oldSelection, discoverySelection, patchCoupangWorker } from '../coupang-worker-patch.mjs';
import { assessCoupangDiscovery } from '../../spa/src/lib/coupangDiscovery.mjs';

test('patch is bounded, invalidates the filtered cache, and preserves unrelated Worker code', () => {
  const source = `// unrelated endpoint\nconst key = 'https://leword-cache.invalid/coupang-board-v10';\n  ${oldSelection}\n// keep secrets/bindings untouched`;
  const patched = patchCoupangWorker(source);
  assert.ok(patched.includes('coupang-board-v11-discovery'));
  assert.equal(patched.replace(discoverySelection, oldSelection).replace('coupang-board-v11-discovery', 'coupang-board-v10'), source);
  assert.equal(patchCoupangWorker(patched), patched);
  assert.throws(() => patchCoupangWorker('unexpected current worker'), /structure changed/);
  assert.throws(() => patchCoupangWorker(source + oldSelection), /structure changed/);
});
test('high-competition zero-demand product survives API pool and becomes discovery candidate', () => {
  const row = { name: '테스트 접이식 수납 바구니', keyword: '테스트 바구니', source: '생활용품', bestRank: 1,
    price: 15000, url: 'https://www.coupang.com/vp/products/123', measuredAt: new Date().toISOString(),
    searchVolume: 0, serpTop: { sampled: 10, exact: 10 } };
  const pool = vm.runInNewContext(`${discoverySelection}\nboard`, { merged: [row] });
  assert.equal(pool.length, 1);
  assert.equal(assessCoupangDiscovery(pool[0]).status, 'candidate');
});
test('pool stays bounded and stale accumulated rows cannot live forever', () => {
  const now = Date.now();
  const rows = Array.from({ length: 100 }, (_, i) => ({ name: `${i}`, measuredAt: new Date(now - i * 1000).toISOString(), serpTop: { exact: i % 10 } }));
  const stale = [{ measuredAt: new Date(now - 86400001).toISOString() }, { measuredAt: 'invalid' }, { measuredAt: new Date(now + 60000).toISOString() }];
  const pool = vm.runInNewContext(`${discoverySelection}\nboard`, { merged: [...stale, ...rows].reverse() });
  assert.equal(pool.length, 80);
  assert.equal(pool[0].name, '0');
  assert.equal(pool[79].name, '79');
  assert.equal(rows.length, 100);
});
