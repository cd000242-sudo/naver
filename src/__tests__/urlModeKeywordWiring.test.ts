import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveUrlModeKeyword } from '../content/urlModeKeywordResolve';

describe('URL 모드 키워드 해석기', () => {
  it('검색량으로 확정하고 후보를 함께 돌려준다', async () => {
    const pick = await resolveUrlModeKeyword('본문'.repeat(200), '거제·통영 특별재난지역 선포', {
      inferCandidates: async () => '["특별재난지역","재난지원금","거제 폭우"]',
      lookupVolume: async (k) => ({ 특별재난지역: 8_100, 재난지원금: 74_000, '거제 폭우': 1_200 }[k] ?? null),
    });
    expect(pick.keyword).toBe('재난지원금');
    expect(pick.decidedBy).toBe('search-volume');
    expect(pick.candidates).toContain('특별재난지역');
  });

  it('검색량 조회기가 없으면 모델 1순위로 간다', async () => {
    const pick = await resolveUrlModeKeyword('본문'.repeat(200), undefined, {
      inferCandidates: async () => '["재난지원금","특별재난지역"]',
    });
    expect(pick.keyword).toBe('재난지원금');
    expect(pick.decidedBy).toBe('llm-first');
  });

  it('추론이 던져도 생성이 죽지 않고 미선정으로 물러난다', async () => {
    const pick = await resolveUrlModeKeyword('본문'.repeat(200), undefined, {
      inferCandidates: async () => { throw new Error('OpenAI 500'); },
    });
    expect(pick.decidedBy).toBe('none');
    expect(pick.keyword).toBe('');
  });

  it('검색량 조회가 일부 던져도 나머지로 확정한다', async () => {
    const pick = await resolveUrlModeKeyword('본문'.repeat(200), undefined, {
      inferCandidates: async () => '["가짜키워드","재난지원금"]',
      lookupVolume: async (k) => {
        if (k === '가짜키워드') throw new Error('광고 API 429');
        return 74_000;
      },
    });
    expect(pick.keyword).toBe('재난지원금');
    expect(pick.decidedBy).toBe('search-volume');
  });

  it('검색량 조회는 후보 3개까지만 부른다 (광고 API 호출 억제)', async () => {
    const lookup = vi.fn(async () => 100);
    await resolveUrlModeKeyword('본문'.repeat(200), undefined, {
      inferCandidates: async () => '["가나","다라","마바","사아","자차"]',
      lookupVolume: lookup,
    });
    expect(lookup).toHaveBeenCalledTimes(3);
  });
});

describe('생성 파이프라인 배선', () => {
  const generator = readFileSync(resolve(__dirname, '../contentGenerator.ts'), 'utf8');

  it('생성 시작 시점에 키워드를 확정한다', () => {
    expect(generator).toContain('await ensureUrlModePrimaryKeyword(source);');
    expect(generator).toContain('async function ensureUrlModePrimaryKeyword(source: ContentSource)');
  });

  it('사용자가 넣은 키워드는 덮어쓰지 않는다', () => {
    expect(generator).toContain('if (existing) return;');
  });

  it('OpenAI 키가 없으면 호출하지 않는다', () => {
    expect(generator).toContain("if (!apiKey) {");
    expect(generator).toContain('키워드 미선정으로 진행');
  });

  it('URL 지시문에 contentMode를 넘긴다 (모드 계약이 이기게)', () => {
    expect(generator).toContain('contentMode: (source as any).contentMode,');
  });
});
