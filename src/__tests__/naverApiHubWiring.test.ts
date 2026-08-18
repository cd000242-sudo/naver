// Codebase-level locks for the NAVER API HUB migration.
// These read the actual source files: a future edit that re-wires a retired API,
// hand-rolls a legacy header, or drops the settings field will fail here.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

/** Every .ts under src, except the gateway itself and tests. */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;          // stale compiled .js artifacts are not built
    if (full.includes(join('src', 'naver'))) continue; // the gateway is where this knowledge belongs
    out.push(full);
  }
  return out;
}

const FILES = collectSourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, 'utf-8') }));
const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, '/');

describe('종료된 API 를 부르는 코드가 남아 있지 않다', () => {
  it('shop/book/doc 검색 URL 을 직접 조립하는 곳이 0건', () => {
    const offenders = FILES.filter((f) =>
      /openapi\.naver\.com\/v1\/search\/(shop|book|doc)/.test(f.text)
      || /naverapihub\.apigw\.ntruss\.com\/search\/v1\/(shop|book|doc)/.test(f.text),
    ).map((f) => rel(f.path));
    expect(offenders).toEqual([]);
  });

  it('종료 목록은 게이트웨이 한 곳에서만 정의된다', () => {
    const gateway = readFileSync(join(SRC, 'naver', 'apiEndpoints.ts'), 'utf-8');
    expect(gateway).toMatch(/RETIRED_SEARCH_TYPES = \['shop', 'book', 'doc'\]/);
  });
});

describe('모든 네이버 호출이 단일 창구를 거친다', () => {
  it('게이트웨이 밖에서 legacy 인증 헤더를 직접 만들지 않는다', () => {
    // 예외 1건: naverDatalab.ts 의 보조 axios 인스턴스(/keywordstool, /search/{group})는
    // API HUB 대체 경로가 없어 기존 방식으로 남겨 둔 것. 검색 트렌드(/search)는 게이트웨이로 나간다.
    const ALLOWED = ['src/naverDatalab.ts'];
    const offenders = FILES
      .filter((f) => /['"]X-Naver-Client-(Id|Secret)['"]\s*:/.test(f.text))
      .map((f) => rel(f.path))
      .filter((p) => !ALLOWED.includes(p));
    expect(offenders).toEqual([]);
  });

  it('HUB 인증 헤더도 게이트웨이 밖에서 만들지 않는다', () => {
    const offenders = FILES
      .filter((f) => /['"]X-NCP-APIGW-API-KEY(-ID)?['"]\s*:/.test(f.text))
      .map((f) => rel(f.path));
    expect(offenders).toEqual([]);
  });

  it('다른 게이트웨이(naveropenapi.apigw.ntruss.com)로 새는 코드가 없다', () => {
    const offenders = FILES
      .filter((f) => f.text.includes('naveropenapi.apigw.ntruss.com'))
      .map((f) => rel(f.path));
    expect(offenders).toEqual([]);
  });
});

describe('설정 배선 — 칸만 만들고 저장에서 빠뜨리는 사고 차단', () => {
  const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf-8');
  const modal = readFileSync(join(SRC, 'renderer', 'utils', 'settingsModal.ts'), 'utf-8');
  const config = readFileSync(join(SRC, 'configManager.ts'), 'utf-8');

  it('설정 화면에 API HUB 입력칸이 있다', () => {
    expect(html).toContain('id="naver-hub-client-id"');
    expect(html).toContain('id="naver-hub-client-secret"');
  });

  it('입력칸을 읽어서 저장한다', () => {
    expect(modal).toContain("getInputByIds('settings-naver-hub-client-id', 'naver-hub-client-id')");
    expect(modal).toContain('naverHubClientId: naverHubClientId,');
    expect(modal).toContain('naverHubClientSecret: naverHubClientSecret,');
  });

  it('저장된 값을 다시 복원한다', () => {
    expect(modal).toContain('els.naverHubClientIdInput.value = config.naverHubClientId;');
    expect(modal).toContain('setApiInputValue(els.naverHubClientSecretInput, config.naverHubClientSecret)');
  });

  it('설정 파일 ↔ 카멜/케밥 매핑과 env 반영이 모두 있다', () => {
    expect(config).toContain("parsed.naverHubClientId || parsed['naver-hub-client-id']");
    expect(config).toContain("'naver-hub-client-id': normalizedConfig.naverHubClientId");
    expect(config).toContain('process.env.NAVER_HUB_CLIENT_ID = config.naverHubClientId.trim()');
    expect(config).toContain('process.env.NAVER_HUB_CLIENT_SECRET = config.naverHubClientSecret.trim()');
  });

  it('부분 저장으로 HUB 키가 유실되지 않도록 보존 목록에 들어 있다', () => {
    const preserved = config.match(/'naverHubClientId', 'naverHubClientSecret',/g) || [];
    expect(preserved.length).toBeGreaterThanOrEqual(3);
  });

  it('HUB 키도 민감정보로 취급된다 (암호화 · 마스킹 보존)', () => {
    const migrator = readFileSync(join(SRC, 'security', 'encryptionMigrator.ts'), 'utf-8');
    expect(migrator).toContain("'naverHubClientSecret'");
    const secretUtils = readFileSync(join(SRC, 'security', 'secretValueUtils.ts'), 'utf-8');
    expect(secretUtils).toContain("'naverHubClientSecret'");
  });

  it('키 발급 안내가 네이버클라우드(API HUB)를 가리킨다', () => {
    const guide = readFileSync(join(SRC, 'renderer', 'modules', 'apiGuideModals.ts'), 'utf-8');
    expect(guide).toContain('ncloud.com/product/applicationService/naverApiHub');
  });

  it('CSP 가 API HUB 게이트웨이 도메인을 허용한다', () => {
    const main = readFileSync(join(SRC, 'main.ts'), 'utf-8');
    expect(main).toContain('https://naverapihub.apigw.ntruss.com');
  });
});

describe('진입 조건이 모드를 가리지 않는다 — 기존 키가 죽어도 기능이 꺼지지 않는다', () => {
  it('네이버 호출 진입 게이트가 기존 키만 보지 않는다', () => {
    // `clientId && clientSecret` 형태의 게이트는 기존 키만 참조한다.
    // 유예 만료로 사용자가 기존 키를 지우면 HUB 키가 있어도 호출이 아예 일어나지 않는다.
    const NAVER_ENTRY_FILES = [
      'src/rssSearcher.ts',
      'src/sourceAssembler.ts',
      'src/crawler/sourceCollector.ts',
      'src/crawler/productSpecCrawler.ts',
      'src/agents/trendAnalyzer.ts',
      'src/analytics/keywordAnalyzer.ts',
    ];
    const legacyOnlyGate =
      /if\s*\([^)]*\b(naverClientId|clientId)\b\s*&&\s*[^)]*\b(naverClientSecret|clientSecret)\b/;
    const offenders = NAVER_ENTRY_FILES.filter((p) =>
      legacyOnlyGate.test(readFileSync(join(ROOT, p), 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });

  it('진입 판정 헬퍼가 두 모드를 모두 본다', () => {
    const creds = readFileSync(join(SRC, 'naver', 'apiCredentials.ts'), 'utf-8');
    expect(creds).toContain('export function naverSearchAvailable');
    expect(creds).toContain('export function describeNaverKeyPosture');
  });

  it('데이터랩 클라이언트가 기존 키 없이도 만들어진다', () => {
    const datalab = readFileSync(join(SRC, 'naverDatalab.ts'), 'utf-8');
    expect(datalab).toContain("if (naverSearchAvailable()) {");
    expect(datalab).toContain("return new NaverDatalabClient('', '');");
  });

  it('기존 키만 있으면 설정 적용 시 이관 경고가 나간다', () => {
    const config = readFileSync(join(SRC, 'configManager.ts'), 'utf-8');
    expect(config).toContain('describeNaverKeyPosture(');
    expect(config).toContain('posture.warning');
  });
});
