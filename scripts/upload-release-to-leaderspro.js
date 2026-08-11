#!/usr/bin/env node
/**
 * ⛔ [2026-08-12] 폐기 — 대상 서버가 내려갔다. 대신 scripts/sync-site-download.js 를 쓴다.
 *   실측: 141.164.59.17 은 443/80/22 가 전부 무응답(같은 PC 에서 leaderspro.kr:443 은 정상).
 *   사이트는 Apps Script 로 옮겨갔고, 다운로드는 GitHub 공개 릴리스를 직접 가리킨다.
 *   서버가 되살아나 파일 직접 서빙이 다시 필요해질 때를 대비해 규약 기록용으로만 남긴다.
 *
 * [2026-08-04] 릴리스 설치 파일을 leaderspro.kr 다운로드 슬롯에 자동 업로드.
 *
 * 매 릴리스마다 관리자 페이지에서 손으로 올리던 작업을 대체한다.
 * 규약은 leaderspro.kr/admin의 uploadLewordDownloadFile()과 동일하다:
 *   POST {API}/v1/admin/downloads/upload-chunk?product&kind&filename&uploadId&chunkIndex&totalChunks&updatedBy
 *   Content-Type: application/octet-stream + X-LeadersPro-Admin-Token
 *   1MB 청크를 순서대로 보내고, 마지막 응답의 done=true로 완료를 확인한다.
 *
 * 토큰은 소스에 두지 않는다 — .env.release(gitignore 대상) 또는 환경변수에서 읽는다.
 * 토큰이 없으면 조용히 건너뛰지 않고 명시적으로 실패한다.
 *
 * 사용법:
 *   node scripts/upload-release-to-leaderspro.js            # 현재 package.json 버전 업로드
 *   node scripts/upload-release-to-leaderspro.js --dry-run  # 대상만 확인
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release_final');
const API_BASE = process.env.LEADERSPRO_API_BASE || 'https://141.164.59.17.sslip.io';
const PRODUCT = 'naver';
const KIND = 'windows';
const CHUNK_BYTES = 1024 * 1024;
const MAX_CHUNK_RETRIES = 3;

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
  throw new Error(
    'LEADERSPRO_ADMIN_TOKEN이 없습니다. .env.release에 넣거나 환경변수로 지정하세요 '
    + '(토큰은 소스에 커밋하지 않습니다).',
  );
}

function readVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  return String(pkg.version || '').trim();
}

function findInstaller(version) {
  const name = `Better-Life-Naver-Setup-${version}.exe`;
  const full = path.join(RELEASE_DIR, name);
  if (!fs.existsSync(full)) {
    throw new Error(`설치 파일이 없습니다: ${full} — 먼저 패키징하세요.`);
  }
  return { name, full, size: fs.statSync(full).size };
}

function createUploadId() {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

function chunkUrl(filename, uploadId, chunkIndex, totalChunks) {
  const params = new URLSearchParams({
    product: PRODUCT,
    kind: KIND,
    filename,
    uploadId,
    chunkIndex: String(chunkIndex),
    totalChunks: String(totalChunks),
    updatedBy: 'release-script',
  });
  return `${API_BASE}/v1/admin/downloads/upload-chunk?${params.toString()}`;
}

async function sendChunk(url, body, token) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-LeadersPro-Admin-Token': token,
        },
        body,
      });
      const payload = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        // 권한 문제는 재시도해도 달라지지 않는다 — 즉시 중단.
        throw Object.assign(
          new Error(`업로드 권한 거부(HTTP ${res.status}): ${payload.message || payload.error || '토큰을 확인하세요.'}`),
          { fatal: true },
        );
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${payload.message || payload.error || '업로드 실패'}`);
      return payload;
    } catch (err) {
      if (err && err.fatal) throw err;
      lastError = err;
      if (attempt < MAX_CHUNK_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError || new Error('청크 업로드 실패');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const version = readVersion();
  const installer = findInstaller(version);
  const totalChunks = Math.max(1, Math.ceil(installer.size / CHUNK_BYTES));

  console.log(`[Upload] leaderspro.kr — product=${PRODUCT} kind=${KIND}`);
  console.log(`[Upload] 파일: ${installer.name} (${(installer.size / 1048576).toFixed(1)}MB, ${totalChunks}청크)`);

  if (dryRun) {
    console.log('[Upload] --dry-run: 실제 업로드는 하지 않습니다.');
    return;
  }

  const token = loadToken();
  const uploadId = createUploadId();
  const fd = fs.openSync(installer.full, 'r');
  let payload = null;
  const startedAt = Date.now();

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * CHUNK_BYTES;
      const length = Math.min(CHUNK_BYTES, installer.size - start);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);

      payload = await sendChunk(
        chunkUrl(installer.name, uploadId, chunkIndex, totalChunks),
        buffer,
        token,
      );

      if (chunkIndex % 20 === 0 || chunkIndex === totalChunks - 1) {
        const percent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
        console.log(`[Upload] ${percent}% (${chunkIndex + 1}/${totalChunks})`);
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  if (!payload || !payload.done) {
    throw new Error('업로드가 완료로 확인되지 않았습니다 (done 플래그 없음). 관리자 페이지에서 상태를 확인하세요.');
  }

  const meta = payload.download || {};
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`[Upload] ✅ 완료: ${meta.filename || installer.name} (${elapsed}초)`);
  console.log(`[Upload] 다운로드 경로: ${meta.url || `/download/${PRODUCT}/${KIND}`}`);
}

main().catch((err) => {
  console.error(`[Upload] ❌ 실패: ${err.message}`);
  process.exit(1);
});
