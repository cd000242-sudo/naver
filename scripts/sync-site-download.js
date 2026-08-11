#!/usr/bin/env node
/**
 * [2026-08-12] 릴리스 후 leaderspro.kr 네이버 다운로드 링크를 새 버전으로 갱신.
 *
 * 왜 파일 업로드(upload-release-to-leaderspro.js)를 대신하는가:
 *   그 스크립트는 자체 서버 141.164.59.17 로 179MB 를 청크 업로드한다. 실측(2026-08-12)
 *   결과 그 서버는 443/80/22 가 전부 무응답이다 — 같은 PC 에서 leaderspro.kr:443 은
 *   정상이므로 네트워크가 아니라 서버가 내려간 상태다. 그동안 사이트의
 *   downloads.naver.windows.url 은 빈 문자열로 남아 있었고 표기는 v2.11.66 에 멈춰 있었다.
 *
 *   사이트는 이미 Apps Script 로 옮겨갔다(실측: leaderspro.kr 이 GAS 만 호출한다).
 *   같은 제품의 mac-arm/mac-intel 링크도 이미 GitHub 릴리스를 직접 가리킨다.
 *   따라서 윈도우도 GitHub 공개 릴리스를 가리키게 맞춘다 — 업로드 없이 끝난다.
 *
 * 동작
 *   1) GAS 에서 사이트 콘텐츠를 통째로 받는다
 *   2) downloads.naver 의 version / windows.detail / windows.url 만 바꾼다
 *   3) 전체 객체를 되돌려 저장한다 (다른 설정을 건드리지 않으려고 merge 가 아니라 원본 수정)
 *   4) 다시 읽어 실제로 반영됐는지 확인한다
 *
 * 안전
 *   · 링크를 넣기 전에 GitHub 자산이 실제로 존재하는지 확인한다 (죽은 링크 방지)
 *   · 실패해도 릴리스를 되돌리지 않는다 — GitHub 릴리스가 끝난 뒤에 도는 단계다
 *   · 토큰을 로그에 찍지 않는다
 *
 * 사용
 *   node scripts/sync-site-download.js         실제 갱신
 *   node scripts/sync-site-download.js --dry   미리보기
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const GAS_URL = process.env.LEADERSPRO_GAS_URL
  || 'https://script.google.com/macros/s/AKfycbxBOGkjVj4p-6XZ4SEFYKhW3FBmo5gt7Fv6djWhB1TljnDDmx_qlfZ4YdlJNohzIZ8NJw/exec';

/** 제품 키 — 관리자 EDITOR_PRODUCT_DEFS 기준 (naver / leword / orbit) */
const PRODUCT_ID = 'naver';
const CHOICE = 'windows';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0';

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  return String(pkg.version || '').trim();
}

function readRepoSlug() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const publish = Array.isArray(pkg.build?.publish) ? pkg.build.publish[0] : pkg.build?.publish;
  return {
    owner: publish?.owner || 'cd000242-sudo',
    repo: publish?.repo || 'naver',
  };
}

/** 토큰은 소스에 두지 않는다 — 환경변수 또는 .env.release(gitignore 대상)에서만 읽는다. */
function loadToken() {
  const fromEnv = String(process.env.LEADERSPRO_ADMIN_TOKEN || '').trim();
  if (fromEnv) return fromEnv;

  const envFile = path.join(ROOT, '.env.release');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
      const match = /^\s*LEADERSPRO_ADMIN_TOKEN\s*=\s*(.+?)\s*$/.exec(line);
      if (match) return match[1].trim();
    }
  }
  return '';
}

/** 기존 표기 형식을 유지하며 버전 숫자만 교체한다. */
function nextVersionLabel(before, tag) {
  return before.includes('v') ? before.replace(/v\d+\.\d+\.\d+/, tag) : `${before} · ${tag}`.trim();
}

function nextDetailLabel(before, version) {
  return before.includes('·') ? before.replace(/\d+\.\d+\.\d+/, version) : `${version} · exe`;
}

function buildDownloadUrl(version) {
  const { owner, repo } = readRepoSlug();
  const exe = `Better-Life-Naver-Setup-${version}.exe`;
  return `https://github.com/${owner}/${repo}/releases/download/v${version}/${exe}`;
}

async function withRetry(what, fn) {
  let lastErr;
  for (let i = 1; i <= 3; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (/unauthorized/i.test(err?.message || '')) throw err; // 인증 실패는 재시도해도 소용없다
      if (i < 3) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

/** 링크를 넣기 전에 자산이 실제로 받아지는지 확인한다 — 죽은 링크를 사이트에 올리지 않는다. */
async function assertAssetExists(url) {
  const res = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GitHub 자산을 찾을 수 없습니다 (HTTP ${res.status}): ${url}`);
  const size = Number(res.headers.get('content-length') || 0);
  return size;
}

async function gasGet() {
  return withRetry('조회', async () => {
    const res = await fetch(`${GAS_URL}?action=site-content&ts=${Date.now()}`, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) throw new Error(`콘텐츠 조회 실패 HTTP ${res.status}`);
    const json = await res.json();
    if (!(json.ok || json.success) || !json.content) throw new Error('콘텐츠 응답 형식이 예상과 다릅니다');
    return json.content;
  });
}

async function gasSave(content, adminToken) {
  return withRetry('저장', async () => {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8', 'User-Agent': UA },
      body: JSON.stringify({ action: 'site-content-save', adminToken, content }),
      redirect: 'follow',
      signal: AbortSignal.timeout(120000),
    });
    const json = await res.json().catch(() => ({}));
    if (!(json.ok || json.success)) {
      const msg = json.error || json.message || `저장 실패 HTTP ${res.status}`;
      if (/unauthorized/i.test(msg)) throw new Error(`${msg} (LEADERSPRO_ADMIN_TOKEN 확인 필요)`);
      throw new Error(msg);
    }
    return json;
  });
}

async function main() {
  const version = readVersion();
  const tag = `v${version}`;
  const downloadUrl = buildDownloadUrl(version);

  console.log(`\n🔗 [sync-site] leaderspro.kr 네이버 다운로드 링크 → ${tag}${DRY ? ' (dry-run)' : ''}`);

  const sizeBytes = await assertAssetExists(downloadUrl);
  console.log(`   자산 확인 : ${(sizeBytes / 1048576).toFixed(1)}MB`);

  const content = await gasGet();
  const product = content?.downloads?.[PRODUCT_ID];
  if (!product) throw new Error(`downloads.${PRODUCT_ID} 를 찾지 못했습니다`);

  const before = {
    version: product.version || '',
    detail: product.downloads?.[CHOICE]?.detail || '',
    url: product.downloads?.[CHOICE]?.url || '',
  };

  if (before.url === downloadUrl) {
    console.log(`   ✅ 이미 최신입니다 (${version}) — 변경 없음`);
    return;
  }

  console.log(`   version : ${before.version}`);
  console.log(`           → ${nextVersionLabel(before.version, tag)}`);
  console.log(`   detail  : ${before.detail}  →  ${nextDetailLabel(before.detail, version)}`);
  console.log(`   url     : ${before.url ? before.url.slice(0, 78) : '(비어 있음)'}`);
  console.log(`           → ${downloadUrl.slice(0, 78)}`);

  if (DRY) {
    console.log('   (dry-run — 저장하지 않음)');
    return;
  }

  const token = loadToken();
  if (!token) {
    console.warn('   ⏭️ LEADERSPRO_ADMIN_TOKEN 미설정 — 링크 갱신을 건너뜁니다.');
    console.warn('      .env.release 에 한 줄 추가하면 자동으로 동작합니다:');
    console.warn('      LEADERSPRO_ADMIN_TOKEN=<GAS 관리자 토큰>');
    return;
  }

  // 원본 객체를 그대로 두고 필요한 필드만 교체 — 다른 사이트 설정을 건드리지 않는다
  product.version = nextVersionLabel(before.version, tag);
  product.downloads = product.downloads || {};
  product.downloads[CHOICE] = {
    ...(product.downloads[CHOICE] || {}),
    label: product.downloads[CHOICE]?.label || 'Windows',
    detail: nextDetailLabel(before.detail, version),
    url: downloadUrl,
  };
  content.updatedAt = new Date().toISOString();

  await gasSave(content, token);
  console.log('   💾 저장 완료 — 반영 확인 중...');

  // 저장 성공 응답만 믿지 않고 다시 읽어 확인한다
  const verify = await gasGet();
  const savedUrl = verify?.downloads?.[PRODUCT_ID]?.downloads?.[CHOICE]?.url || '';
  if (savedUrl === downloadUrl) {
    console.log(`   ✅ 반영 확인 — 사이트가 ${tag} 를 가리킵니다`);
  } else {
    console.warn(`   ⚠️ 저장은 됐는데 조회 결과가 다릅니다: ${savedUrl.slice(0, 70)}`);
    process.exitCode = 1;
  }
}

module.exports = { nextVersionLabel, nextDetailLabel, buildDownloadUrl };

if (require.main === module) {
  main().catch((e) => {
    // 릴리스는 이미 성공한 뒤다 — 이 단계 실패가 릴리스를 되돌리면 안 된다
    console.warn(`🔗 [sync-site] 갱신 실패(릴리스는 정상): ${e?.message || e}`);
    console.warn('   관리자 페이지에서 수동으로 링크를 바꾸시면 됩니다.');
    process.exitCode = 1;
  });
}
