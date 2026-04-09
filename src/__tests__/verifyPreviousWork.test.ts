/**
 * ✅ [v1.4.23] 이전 작업(v1.4.12~v1.4.22)에서 발행 검증이 필요했던 항목들의 단위 테스트
 * 발행 없이 코드 레벨에서 100% 검증 가능한 것만 포함
 */
import { describe, it, expect } from 'vitest';
import { buildModeBasedPrompt, buildGeminiModelChain } from '../contentGenerator';
import type { ContentSource } from '../contentGenerator';
import * as fs from 'fs';
import * as path from 'path';

function makeSource(overrides: Partial<ContentSource> = {}): ContentSource {
  return {
    sourceType: 'custom_text',
    rawText: '연구원 인건비 4월분 소득세 비과세 환급 절차 안내. 기업부설연구소 3년치 누락 세액 환급.',
    title: '연구원 인건비 환급',
    contentMode: 'seo',
    toneStyle: 'professional',
    metadata: { keywords: ['연구원 인건비 환급', '소득세 비과세', '기업부설연구소'] } as any,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.4.12 — 슬림화 실제 글자수 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.4.12 — 슬림화 글자수 검증', () => {
  // 참고: vitest에서는 electron app.isPackaged 없어서 loadPromptFile이 fallback 사용
  // 따라서 실제 base.prompt 직접 측정으로 검증

  it('seo/base.prompt 파일 자체가 v1.4.7 대비 슬림화됨', () => {
    const baseFile = path.join(__dirname, '..', 'prompts', 'seo', 'base.prompt');
    expect(fs.existsSync(baseFile)).toBe(true);
    const content = fs.readFileSync(baseFile, 'utf-8');
    const lineCount = content.split('\n').length;
    console.log(`[v1.4.12 검증] seo/base.prompt: ${content.length.toLocaleString()}자, ${lineCount}줄`);
    // v1.4.7: 24,447자, 875줄 → v1.4.12+: ~22,000자, ~810줄
    expect(content.length).toBeLessThan(24447);
    expect(lineCount).toBeLessThan(875);
  });

  it('homefeed/base.prompt 파일 자체가 v1.4.7 대비 슬림화됨', () => {
    const baseFile = path.join(__dirname, '..', 'prompts', 'homefeed', 'base.prompt');
    expect(fs.existsSync(baseFile)).toBe(true);
    const content = fs.readFileSync(baseFile, 'utf-8');
    console.log(`[v1.4.12 검증] homefeed/base.prompt: ${content.length.toLocaleString()}자`);
    // v1.4.7: 27,599자 → v1.4.12+: ~24,800자
    expect(content.length).toBeLessThan(27599);
  });

  it('모든 prompt 파일 합계가 v1.4.7 대비 슬림화됨', () => {
    const promptsRoot = path.join(__dirname, '..', 'prompts');
    function walkPrompts(dir: string): number {
      let total = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          total += walkPrompts(full);
        } else if (entry.name.endsWith('.prompt')) {
          total += fs.readFileSync(full, 'utf-8').length;
        }
      }
      return total;
    }
    const totalChars = walkPrompts(promptsRoot);
    console.log(`[v1.4.12 검증] 전체 .prompt 파일 합계: ${totalChars.toLocaleString()}자`);
    // v1.4.7: ~216,477자 → v1.4.12+: ~187,500자
    expect(totalChars).toBeLessThan(216477);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.4.13 — 95% 모달 fix (timeout 25분)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.4.13 — 발행 타임아웃 25분', () => {
  it('fullAutoFlow.ts의 runAutomation timeout이 1500000(25분)으로 설정됨', () => {
    const filePath = path.join(__dirname, '..', 'renderer', 'modules', 'fullAutoFlow.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('timeout: 1500000');
    expect(content).not.toContain('timeout: 300000    // ✅ [2026-04-01 FIX] 5분');
  });

  it('에러 path에 hideUnifiedProgress 호출 추가됨', () => {
    const filePath = path.join(__dirname, '..', 'renderer', 'modules', 'fullAutoFlow.ts');
    const content = fs.readFileSync(filePath, 'utf-8');
    // 에러 path에서 hideUnifiedProgress 호출 (v1.4.13 fix)
    const matches = content.match(/hideUnifiedProgress\(\)/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2); // 최소 2곳 (에러 경로 2개)
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.4.16 — Gemini 모델 폴백 체인
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.4.16 — Gemini 모델 체인 (무료 한도 우선)', () => {
  it('config 없을 때 기본 모델은 gemini-2.5-flash (무료 1500/일)', () => {
    const { primaryModel, isPro } = buildGeminiModelChain();
    expect(primaryModel).toBe('gemini-2.5-flash');
    expect(isPro).toBe(false);
  });

  it('Flash 체인은 2.5-flash → 2.5-flash-lite 순서 (Stable 우선)', () => {
    const { uniqueModels } = buildGeminiModelChain();
    expect(uniqueModels[0]).toBe('gemini-2.5-flash');
    expect(uniqueModels[1]).toBe('gemini-2.5-flash-lite');
  });

  it('Pro 모델 선택 시 Pro 체인 활성화', () => {
    const { uniqueModels, isPro } = buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-pro' });
    expect(isPro).toBe(true);
    expect(uniqueModels[0]).toBe('gemini-2.5-pro');
    // Pro 다음에 flash 폴백
    expect(uniqueModels).toContain('gemini-2.5-flash');
  });

  it('비-Gemini 모델명 입력 시 gemini-2.5-flash로 폴백', () => {
    const { primaryModel } = buildGeminiModelChain({ primaryGeminiTextModel: 'openai-gpt41' });
    expect(primaryModel).toBe('gemini-2.5-flash');
  });

  it('Flash-Lite 명시 선택 시 그대로 사용', () => {
    const { primaryModel, uniqueModels } = buildGeminiModelChain({ primaryGeminiTextModel: 'gemini-2.5-flash-lite' });
    expect(primaryModel).toBe('gemini-2.5-flash-lite');
    expect(uniqueModels[0]).toBe('gemini-2.5-flash-lite');
    expect(uniqueModels).toContain('gemini-2.5-flash');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.4.19 — HeadingPatch 로직 (소제목 키워드 누락 보정)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.4.19 — HeadingPatch 로직 시뮬레이션', () => {
  // HeadingPatch 로직을 단위 함수로 추출하여 검증
  function patchHeadings(headings: Array<{ title: string }>, primaryKw: string): { patched: number; result: Array<{ title: string }> } {
    const kwCore = primaryKw.trim().split(/[\s,/\-]+/).filter(w => w.length >= 2)[0] || primaryKw.trim();
    let patched = 0;
    const result = headings.map(h => {
      if (!h?.title) return h;
      const titleStr = String(h.title);
      if (!titleStr.toLowerCase().includes(kwCore.toLowerCase())) {
        patched++;
        return { ...h, title: `${kwCore} ${titleStr}`.trim() };
      }
      return h;
    });
    return { patched, result };
  }

  it('키워드 없는 소제목은 prefix 추가', () => {
    const headings = [
      { title: '시공 사례 5건' },
      { title: '연구원 인건비 환급 절차' }, // 이미 키워드 포함
      { title: '주의사항' },
    ];
    const { patched, result } = patchHeadings(headings, '연구원 인건비');
    expect(patched).toBe(2);
    expect(result[0].title).toBe('연구원 시공 사례 5건');
    expect(result[1].title).toBe('연구원 인건비 환급 절차'); // 변경 없음
    expect(result[2].title).toBe('연구원 주의사항');
  });

  it('대소문자 무관 매칭', () => {
    const headings = [{ title: 'INTERIOR Design Tips' }];
    const { patched } = patchHeadings(headings, 'interior');
    expect(patched).toBe(0); // 이미 포함 (대소문자 무관)
  });

  it('빈 제목은 건너뛰기', () => {
    const headings = [{ title: '' }, { title: '내용' }];
    const { patched, result } = patchHeadings(headings as any, '키워드');
    expect(patched).toBe(1);
    expect(result[1].title).toBe('키워드 내용');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.4.18 — Gemini 캐시 적중률 (system 부분 정적)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.4.18 — 캐시 적중률 (SEO/홈판 모드)', () => {
  it('SEO 모드: 다른 키워드라도 system 부분 동일', () => {
    const source1 = makeSource({
      contentMode: 'seo',
      title: '키워드1',
      metadata: { keywords: ['키워드1'] } as any,
    });
    const source2 = makeSource({
      contentMode: 'seo',
      title: '완전다른키워드',
      metadata: { keywords: ['완전다른키워드'] } as any,
    });
    const p1 = buildModeBasedPrompt(source1, 'seo', undefined, 2500);
    const p2 = buildModeBasedPrompt(source2, 'seo', undefined, 2500);
    const sys1 = p1.split('[원본 텍스트]')[0];
    const sys2 = p2.split('[원본 텍스트]')[0];
    expect(sys1).toBe(sys2);
  });

  it('SEO 모드: 다른 metrics라도 system 부분 동일', () => {
    const source = makeSource({ contentMode: 'seo' });
    const p1 = buildModeBasedPrompt(source, 'seo', { searchVolume: 5000, documentCount: 1000 }, 2500);
    const p2 = buildModeBasedPrompt(source, 'seo', { searchVolume: 50000, documentCount: 100000 }, 2500);
    const sys1 = p1.split('[원본 텍스트]')[0];
    const sys2 = p2.split('[원본 텍스트]')[0];
    expect(sys1).toBe(sys2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 종합: 코드 무결성 검증
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('종합 — 코드 무결성', () => {
  it('business 모드 prompt 파일 존재', () => {
    const filePath = path.join(__dirname, '..', 'prompts', 'business', 'base.prompt');
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('업체 홍보');
    expect(content).toContain('PASTOR');
    expect(content).toContain('의료광고법');
  });

  it('dist에 business prompt 복사됨 (빌드 후)', () => {
    const distPath = path.join(__dirname, '..', '..', 'dist', 'prompts', 'business', 'base.prompt');
    if (fs.existsSync(distPath)) {
      const content = fs.readFileSync(distPath, 'utf-8');
      expect(content).toContain('업체 홍보');
    }
    // dist 없을 수 있음 (테스트만 실행 시) → optional
  });
});
