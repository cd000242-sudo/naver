#!/usr/bin/env node
/**
 * [2026-08-12] 런타임 지문 핀 점검/재계산 도구.
 *
 * 왜: 해시 대상(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS)에 package.json 과
 *   src/runtime/version.generated.ts 가 들어 있다. 그래서 버전을 올리거나 npm 스크립트
 *   한 줄만 고쳐도 핀이 밀린다. 밀리면 테스트는 "해시 불일치"만 알려주고 어느 파일
 *   때문인지는 말해주지 않는다 — 실측(2026-08-12) 그 원인을 찾는 데 30분이 걸렸고,
 *   그동안 릴리스 게이트가 막혀 있었다.
 *
 * 하는 일
 *   --check (기본)  현재 핀과 재계산값을 비교하고, 다르면 핀 커밋 이후 바뀐
 *                   "해시 대상" 파일만 추려서 보여준다
 *   --write         재계산값을 핀 파일에 기록한다
 *
 * 주의: 핀은 "검토된 런타임"을 확정하는 값이다. --write 는 바뀐 내용을 확인한 뒤에만 쓴다.
 *   순서도 중요하다 — 버전업 → 빌드 → 핀 재계산 → 커밋. 핀을 먼저 박으면
 *   version.generated.ts 가 그 뒤에 바뀌어 다시 밀린다.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PIN_FILE = 'src/contentQualityV3/candidateRuntimeFingerprintPin.ts';
const WRITE = process.argv.includes('--write');

/** 해시 대상 목록을 소스에서 읽는다 — 목록을 두 곳에 두지 않는다. */
function readClosurePaths() {
  const source = readFileSync(resolve(ROOT, 'src/contentQualityV3/candidateRuntimeFingerprint.ts'), 'utf8');
  const start = source.indexOf('CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS');
  const end = source.indexOf(']);', start);
  if (start < 0 || end < 0) throw new Error('해시 대상 목록을 찾지 못했습니다');
  return new Set(
    [...source.slice(start, end).matchAll(/'([^']+)'/g)]
      .map(m => m[1])
      .filter(p => p.includes('/') || p.includes('.')),
  );
}

/** 핀이 마지막으로 갱신된 커밋 이후, 해시 대상 중 무엇이 바뀌었는지 */
function driftedFiles(closure) {
  try {
    const pinCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', PIN_FILE], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!pinCommit) return null;
    const subject = execFileSync('git', ['log', '-1', '--format=%h %s', pinCommit], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const changed = execFileSync('git', ['diff', '--name-only', pinCommit, 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').filter(Boolean);
    const uncommitted = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').filter(Boolean);
    const all = [...new Set([...changed, ...uncommitted])];
    // 해시 대상 중에는 git 이 추적하지 않는 생성 파일도 있다(src/runtime/version.generated.ts).
    // diff 로는 절대 안 잡히므로 따로 알려준다 — 안 그러면 "바뀐 대상 없음"이라 오도한다.
    const tracked = new Set(execFileSync('git', ['ls-files'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').filter(Boolean));
    const generated = [...closure].filter(f => !tracked.has(f));
    return { subject, hits: all.filter(f => closure.has(f)), generated };
  } catch {
    return null; // git 이 없거나 저장소가 아니어도 점검 자체는 계속한다
  }
}

async function main() {
  const module = await import(pathToFileURL(resolve(ROOT, 'src/contentQualityV3/candidateRuntimeFingerprint.ts')).href);
  const actual = await module.computeContentQualityV3CandidateRuntimeSha256(ROOT);
  const pinned = module.CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256;

  if (actual === pinned) {
    console.log(`✅ 지문 일치 — ${actual}`);
    return;
  }

  console.log('⚠️ 지문 불일치');
  console.log(`   핀   : ${pinned}`);
  console.log(`   계산 : ${actual}`);

  const drift = driftedFiles(readClosurePaths());
  if (drift) {
    console.log(`\n   핀 갱신 커밋: ${drift.subject}`);
    if (drift.hits.length === 0) {
      console.log('   그 이후 바뀐 해시 대상 없음 (git 추적 기준).');
    } else {
      console.log(`   그 이후 바뀐 해시 대상 ${drift.hits.length}개:`);
      drift.hits.forEach(f => console.log(`     ● ${f}`));
    }
    if (drift.generated?.length) {
      console.log(`   git 추적 밖 생성 파일 ${drift.generated.length}개 — 빌드마다 바뀐다:`);
      drift.generated.forEach(f => console.log(`     ○ ${f}`));
    }
  }

  if (!WRITE) {
    console.log('\n   위 변경이 검토된 것이면 --write 로 핀을 갱신하세요.');
    process.exitCode = 1;
    return;
  }

  const pinPath = resolve(ROOT, PIN_FILE);
  const before = readFileSync(pinPath, 'utf8');
  const after = before.replace(pinned, actual);
  if (after === before) throw new Error('핀 파일에서 기존 해시를 찾지 못했습니다');
  writeFileSync(pinPath, after);
  console.log(`\n   💾 핀 갱신 완료 → ${actual}`);
}

main().catch((e) => {
  console.error(`지문 점검 실패: ${e?.message || e}`);
  process.exitCode = 1;
});
