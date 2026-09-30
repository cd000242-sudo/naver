/**
 * 내 블로그 동기화 묶음 압축(2026-10-01) — 잠그기(keySync) 전에 gzip 으로 줄이고, 열 때 푼다.
 * 어드바이저 7일 홈판 제목 140줄을 싣자 묶음이 52KB → 암호화 · base64 뒤 워커 상한 64KB 를 넘었다(실측).
 * 형식: { v: 2, z: '<gzip 의 base64>' }. v 가 없으면 옛 묶음(압축 없음)이라 그대로 돌려준다.
 * 브라우저에 압축 기능(CompressionStream)이 없으면 압축 없이 그대로 싼다 — 예전과 같다.
 */
function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function packBundle(bundle) {
  if (typeof CompressionStream === 'undefined') return bundle;
  const stream = new Blob([JSON.stringify(bundle)]).stream().pipeThrough(new CompressionStream('gzip'));
  return { v: 2, z: toBase64(new Uint8Array(await new Response(stream).arrayBuffer())) };
}

export async function unpackBundle(packed) {
  if (!packed || typeof packed !== 'object') return null;
  if (packed.v !== 2 || typeof packed.z !== 'string') return packed;
  try {
    const stream = new Blob([fromBase64(packed.z)]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  } catch { return null; }
}
