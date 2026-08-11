/**
 * 사이트 다운로드 링크 자동 갱신 회귀 (2026-08-12 실측 사고)
 *
 * 사고: leaderspro.kr 의 downloads.naver.windows.url 이 **빈 문자열**이었고 표기는
 *   v2.11.66 에 멈춰 있었다. 릴리스 스크립트가 자체 서버(141.164.59.17)로 179MB 를
 *   청크 업로드하는 구조였는데 그 서버는 443/80/22 가 전부 무응답이었다.
 *   같은 PC 에서 leaderspro.kr:443 은 열렸으므로 네트워크가 아니라 서버가 죽은 것이다.
 *   그동안 릴리스는 성공했지만 사이트 다운로드는 계속 비어 있었다 — 조용한 실패였다.
 *
 * 같은 사이트의 orbit 제품과 naver 의 mac 링크는 이미 GitHub 공개 릴리스를 가리킨다.
 * 윈도우만 옛 방식에 남아 있었다.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(__dirname, '..', '..');
const require_ = createRequire(__filename);

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

const syncSource = readSource('scripts/sync-site-download.js');
const sync = require_(join(root, 'scripts/sync-site-download.js')) as {
  nextVersionLabel(before: string, tag: string): string;
  nextDetailLabel(before: string, version: string): string;
  buildDownloadUrl(version: string): string;
};

describe('릴리스 파이프라인 배선', () => {
  it('release:upload 가 죽은 서버 업로드가 아니라 링크 갱신을 부른다', () => {
    const pkg = JSON.parse(readSource('package.json'));
    expect(pkg.scripts['release:upload']).toContain('sync-site-download.js');
    expect(pkg.scripts['release:upload']).not.toContain('upload-release-to-leaderspro');
  });

  it('release:publish 가 링크 갱신을 거쳐 간다', () => {
    const pkg = JSON.parse(readSource('package.json'));
    expect(pkg.scripts['release:publish']).toContain('release:upload');
  });

  it('갱신 스크립트는 응답 없는 자체 서버를 다시 부르지 않는다', () => {
    // 주석에 사고 원인으로 주소를 남기는 건 허용한다 — 막을 것은 "호출"이다
    expect(syncSource).not.toMatch(/https?:\/\/[^\s'"]*141\.164/);
    expect(syncSource).not.toMatch(/https?:\/\/[^\s'"]*sslip\.io/);
    expect(syncSource).not.toContain('upload-chunk');
  });
});

describe('다운로드 링크 생성', () => {
  it('패키징 산출물과 정확히 같은 파일명을 가리킨다', () => {
    // release_final 에 떨어지는 이름 · clean-old-releases.js 가 지우는 이름과 같아야 한다
    expect(sync.buildDownloadUrl('2.11.186'))
      .toBe('https://github.com/cd000242-sudo/naver/releases/download/v2.11.186/Better-Life-Naver-Setup-2.11.186.exe');
  });

  it('저장 전에 자산이 실제로 있는지 먼저 확인한다 — 죽은 링크를 올리지 않는다', () => {
    expect(syncSource).toContain('assertAssetExists');
    expect(syncSource.indexOf('await assertAssetExists')).toBeLessThan(syncSource.indexOf('await gasSave'));
  });

  it('저장 응답만 믿지 않고 다시 읽어 확인한다', () => {
    expect(syncSource.indexOf('await gasSave')).toBeLessThan(syncSource.lastIndexOf('await gasGet'));
  });
});

describe('표기 형식 보존 — 사이트 문구를 망가뜨리지 않는다', () => {
  it('제품 설명은 두고 버전 숫자만 바꾼다', () => {
    expect(sync.nextVersionLabel('네이버 블로그 자동화 · v2.11.66', 'v2.11.186'))
      .toBe('네이버 블로그 자동화 · v2.11.186');
  });

  it('버전 표기가 없던 라벨에는 뒤에 붙인다', () => {
    expect(sync.nextVersionLabel('네이버 블로그 자동화', 'v2.11.186'))
      .toBe('네이버 블로그 자동화 · v2.11.186');
  });

  it('detail 의 확장자 표기를 유지한다', () => {
    expect(sync.nextDetailLabel('2.11.66 · exe', '2.11.186')).toBe('2.11.186 · exe');
  });

  it('detail 이 비어 있으면 기본 형식을 만든다', () => {
    expect(sync.nextDetailLabel('', '2.11.186')).toBe('2.11.186 · exe');
  });
});

describe('토큰 취급', () => {
  it('토큰을 소스에 박지 않는다', () => {
    expect(syncSource).toMatch(/process\.env\.LEADERSPRO_ADMIN_TOKEN/);
    // 32자 이상의 영숫자 리터럴 = 하드코딩된 비밀값 의심
    const literals = syncSource.match(/['"][A-Za-z0-9]{32,}['"]/g) || [];
    expect(literals).toHaveLength(0);
  });

  it('토큰이 없으면 릴리스를 실패시키지 않고 건너뛴다', () => {
    expect(syncSource).toContain('링크 갱신을 건너뜁니다');
  });
});
