import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EXPERIENCE_CATEGORY_HINTS, buildKinAnswerBlock } from '../content/kinExperienceMaterial.js';
import { ARTICLE_TYPE_TO_HINT } from '../shared/categoryTaxonomy.js';
import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat.js';

const ROOT = path.resolve(__dirname, '..');

// CRLF-normalized read: fresh checkouts may differ in EOL, keep assertions EOL-free.
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8').replace(/\r/g, '');
}

const SAMPLE_ANSWERS = [
  '벽걸이로 설치하실 거면 브라켓이 기본 구성에 없어서 따로 구매하셔야 합니다. 설치 전에 벽 재질을 확인해두시는 게 좋습니다.',
  '침실에 두려고 하시면 소음을 꼭 확인하세요. 스펙표 데시벨보다 밤에는 크게 느껴져서 거실로 옮기는 경우가 많습니다.',
];

// [v2.11.182] KiN answer material ("겪은 사람 말투") — wiring locks.
// Question material (v2.11.133) is locked by contentSourceDensityLevers.test.ts;
// these lock the *answer* pipe: gate → injection → prompt arrival.
describe('배선 1: main.ts — 답변 재료 주입 게이트', () => {
  const code = read('main.ts');

  it('kinExperienceMaterial 모듈을 동적 임포트한다', () => {
    expect(code).toMatch(/await import\('\.\/content\/kinExperienceMaterial\.js'\)/);
  });

  it('SEO 모드가 답변 재료 대상에 포함된다 (질문 재료 3모드 + seo)', () => {
    expect(code).toMatch(/situationEligible \|\| situationMode === 'seo'/);
  });

  it('경험군 카테고리 게이트를 통과해야만 수집한다', () => {
    expect(code).toMatch(/isExperienceCategory\(kinCategoryHint\)/);
  });

  it('답변 재료를 rawText에 병합한다 (기존 자료 보존 append)', () => {
    expect(code).toMatch(/\$\{source\.rawText\}\\n\\n\$\{answerMaterial\.block\}/);
  });

  it('재료 0건 사유를 로그로 남긴다 (지식인 0건 추적 가능)', () => {
    expect(code).toMatch(/겪은 사람 말투 재료 없음/);
    expect(code).toMatch(/reason=\$\{answerMaterial\.reason\}/);
  });

  it('API 키 미설정 사유를 별도로 안내한다', () => {
    expect(code).toMatch(/네이버 검색 API 키 미설정/);
  });

  it('주입은 fact-check RAG 판정보다 앞에서 실행된다 (인용 모드가 최종 재료를 포착)', () => {
    const answerIdx = code.indexOf('collectKinExperienceAnswers');
    const ragIdx = code.indexOf('네이버 fact-check RAG 발동');
    expect(answerIdx).toBeGreaterThan(-1);
    expect(ragIdx).toBeGreaterThan(-1);
    expect(answerIdx).toBeLessThan(ragIdx);
  });

  it('기존 질문 재료(v2.11.133) 모드 게이트는 그대로 유지된다', () => {
    expect(code).toMatch(/situationMode === 'homefeed' \|\| situationMode === 'business' \|\| situationMode === 'mate'/);
    expect(code).toMatch(/collectKinReaderContext\(kinQuery\)/);
  });
});

describe('배선 2: 경험군 힌트 ↔ 카테고리 택소노미 정합 (죽은 게이트 방지)', () => {
  it('모든 경험군 힌트는 실제 택소노미가 발급하는 힌트 값이다', () => {
    const issuedHints = new Set(Object.values(ARTICLE_TYPE_TO_HINT));
    for (const hint of EXPERIENCE_CATEGORY_HINTS) {
      expect(issuedHints.has(hint), `"${hint}" 힌트는 ARTICLE_TYPE_TO_HINT가 발급하지 않음 — 게이트가 죽는다`).toBe(true);
    }
  });

  it('리빙 축(리빙·인테리어)이 경험군에 포함된다 — 사용자 핵심 요구', () => {
    expect(EXPERIENCE_CATEGORY_HINTS).toContain('리빙');
    expect(EXPERIENCE_CATEGORY_HINTS).toContain('인테리어');
  });

  it('뉴스·스펙 축(사회·경제·연예·IT)은 경험군이 아니다', () => {
    for (const hint of ['사회', '경제', '연예', 'IT']) {
      expect(EXPERIENCE_CATEGORY_HINTS).not.toContain(hint);
    }
  });
});

describe('배선 3: rawText → LLM 프롬프트 도달 경로 (무절단)', () => {
  it('contentGenerator는 rawText를 자르지 않고 프롬프트 빌더에 넘긴다', () => {
    const code = read('contentGenerator.ts');
    expect(code).toMatch(/const rawText = source\.rawText\?\.trim\(\) \|\| ''/);
    expect(code).toMatch(/buildContentJsonOutputFormat\(\{[\s\S]{0,200}rawText,/);
  });

  it('프롬프트 템플릿은 [원본 본문] 섹션에 rawText를 원문 그대로 싣는다', () => {
    const code = read('contentJsonPromptFormat.ts');
    expect(code).toMatch(/\[원본 본문 — 아래 내용을 바탕으로 작성하라\][\s\S]{0,100}\$\{rawText\}/);
  });
});

describe('적용 검증: 재료 블록이 최종 LLM 프롬프트에 실제로 실린다', () => {
  const kinBlock = buildKinAnswerBlock(SAMPLE_ANSWERS);

  it.each([['seo'], ['homefeed'], ['business'], ['mate']])(
    '%s 모드 프롬프트에 겪은 사람 말투 재료가 원문 그대로 포함된다',
    (mode) => {
      const prompt = buildContentJsonOutputFormat({
        contentMode: mode as never,
        mode: mode as never,
        source: { categoryHint: '리빙' },
        title: '소형 제습기 고르기',
        rawText: `기존 수집 자료입니다.\n\n${kinBlock}`,
        primaryKeyword: '제습기',
        subKeywords: '',
      });
      expect(prompt).toContain('겪은 사람들의 말');
      expect(prompt).toContain('[답변 1]');
      expect(prompt).toContain('브라켓');
      expect(prompt).toContain('1인칭 경험으로 바꾸');
    },
  );

  it('재료 블록이 rawText 말미에 있어도 잘리지 않는다 (긴 자료 + 블록)', () => {
    const longMaterial = '자료 문단입니다. '.repeat(500); // ~5,000자
    const prompt = buildContentJsonOutputFormat({
      contentMode: 'seo' as never,
      mode: 'seo' as never,
      source: {},
      title: '',
      rawText: `${longMaterial}\n\n${kinBlock}`,
      primaryKeyword: '제습기',
      subKeywords: '',
    });
    expect(prompt).toContain('[답변 2]');
    expect(prompt).toContain('소음');
  });
});
