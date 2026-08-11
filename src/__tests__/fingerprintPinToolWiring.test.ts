/**
 * 지문 핀 재계산 도구 회귀 (2026-08-12 실측 사고)
 *
 * 사고: package.json 의 npm 스크립트 한 줄을 고쳤더니 런타임 지문이 밀려 릴리스 게이트가
 *   막혔다. 해시 대상에 package.json 과 src/runtime/version.generated.ts 가 들어 있어
 *   버전업이나 스크립트 수정만으로도 밀린다. 그런데 실패 메시지는 "해시 불일치"뿐이라
 *   어느 파일 때문인지 알 수 없었고, 재계산 도구도 없어 원인 규명에 30분이 걸렸다.
 *
 * 이 테스트는 도구가 살아 있고 배선돼 있는지만 지킨다.
 * 핀 값 자체의 정합성은 contentQualityV3RuntimeFingerprint.test.ts 가 지킨다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

const tool = readSource('scripts/fingerprint-pin.mjs');

describe('지문 핀 도구', () => {
  it('npm 명령으로 배선돼 있다', () => {
    const pkg = JSON.parse(readSource('package.json'));
    expect(pkg.scripts['fingerprint:pin']).toContain('fingerprint-pin.mjs');
  });

  it('기본 동작은 점검이고, 쓰기는 명시적으로 요구해야 한다', () => {
    // 실수로 핀이 조용히 덮어써지면 "검토된 런타임"이라는 보증이 무의미해진다
    expect(tool).toContain("includes('--write')");
    expect(tool).toContain('const WRITE');
  });

  it('불일치일 때 어느 해시 대상이 바뀌었는지 알려준다 — 이번 사고의 핵심', () => {
    expect(tool).toContain('바뀐 해시 대상');
    expect(tool).toContain('driftedFiles');
  });

  it('해시 대상 목록을 스스로 갖지 않고 소스에서 읽는다 — 목록이 두 곳에 갈리지 않게', () => {
    expect(tool).toContain('CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS');
    expect(tool).toContain('candidateRuntimeFingerprint.ts');
  });

  it('해시 값을 소스에 박지 않는다 — 핀 파일이 유일한 출처다', () => {
    expect(tool).not.toMatch(/['"][0-9a-f]{64}['"]/);
  });

  it('점검 실패를 종료 코드로 알린다 — 조용히 통과하지 않는다', () => {
    expect(tool).toContain('process.exitCode = 1');
  });

  /**
   * [2026-08-12] v2.11.187 릴리스 중 발견.
   * 해시 대상에는 src/runtime/version.generated.ts 처럼 git 이 추적하지 않는 생성 파일이 있다.
   * diff 로는 절대 안 잡히므로, 버전업만 한 경우 도구가 "바뀐 대상 없음"이라 답해
   * 원인을 줄끝 문제로 오도할 뻔했다.
   */
  it('git 추적 밖 생성 파일도 따로 알려준다', () => {
    expect(tool).toContain("['ls-files']");
    expect(tool).toContain('추적 밖 생성 파일');
    expect(tool).not.toContain('줄끝/인코딩 차이를 의심');
  });
});
