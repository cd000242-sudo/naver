/**
 * 내 블로그 동기화 묶음 압축(2026-10-01). 어드바이저 7일 홈판 제목 140줄을 싣자 묶음이 52KB 가 되어 암호화 · base64 뒤
 * 워커 상한 64KB 를 넘었다(실측). 잠그기 전에 gzip 으로 줄인다 — 이미 올라간 옛 묶음(압축 없음)도 그대로 열려야 한다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { packBundle, unpackBundle } from '../src/lib/syncPack.mjs';

const bundle = { syncedAt: '2026-10-01T00:00:00Z', daily: { homefeedWeek: Array.from({ length: 140 }, (_, i) => ({ day: '2026-09-30', rank: i % 20 + 1, title: `‘79세’ 윤여정, 조용히 전해진 소식… 눈물 바다 ${i}`, url: `http://blog.naver.com/jungbo125/2244169${i}` })) }, plan: null };

test('압축해 싸고 그대로 푼다 — 크기가 크게 준다', async () => {
  const packed = await packBundle(bundle);
  assert.equal(packed.v, 2);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(bundle).length / 2, '절반 이하로');
  assert.deepEqual(await unpackBundle(packed), bundle);
});
test('옛 묶음(압축 없음)은 그대로 돌려준다', async () => {
  assert.deepEqual(await unpackBundle(bundle), bundle);
  assert.equal(await unpackBundle(null), null);
});
test('깨진 압축 묶음은 null — 화면을 죽이지 않는다', async () => {
  assert.equal(await unpackBundle({ v: 2, z: '깨진값' }), null);
});
