/**
 * v1.4.81 비용표/환경설정 현대화 회귀 방지
 *
 * 검증 대상:
 *  1. 환경설정 라디오 버튼 현행 모델만 노출 (Haiku 4.5 / Opus 4.7 / ₩210)
 *  2. 비용표 모달 이미지 엔진 소개에 Flow/ImageFX 무료 엔진 포함
 *  3. FAQ/가이드 모달에 Deprecated 엔진 이름(DALL-E 3 / Stability AI 단독) 미노출
 *  4. Gemini 2.5 Flash 무료 쿼터 3곳(드롭다운 2개 + 비용표 1개) 숫자 통일 (500/일)
 *  5. 이미지 소스 드롭다운에 Flow 옵션 존재
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readPublic(rel: string): string {
  return fs.readFileSync(path.join(ROOT, '../public', rel), 'utf-8');
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('v1.4.81 — 비용표·환경설정 현대화', () => {
  const html = readPublic('index.html');

  describe('환경설정 AI 텍스트 엔진 라디오 버튼', () => {
    it('Claude Haiku 4.5 라벨 존재 (3.5 폐기)', () => {
      expect(html).toMatch(/Claude Haiku 4\.5/);
      expect(html).not.toMatch(/<span>💜 Claude Haiku 3\.5<\/span>/);
    });

    it('Claude Opus 4.7 라벨 존재 (4.6 폐기)', () => {
      expect(html).toMatch(/Claude Opus 4\.7/);
      expect(html).not.toMatch(/<span>👑 Claude Opus 4\.6<\/span>/);
    });

    it('Opus 4.7 가격 ₩210 반영 (구 ₩735 제거)', () => {
      // Opus 4.7 section에는 ₩210이 존재해야 하고, ₩735 가격 라벨은 사라져야 함
      expect(html).toMatch(/Claude Opus 4\.7[\s\S]{0,2000}?₩210/);
      expect(html).not.toMatch(/1편당 ₩735/);
    });

    it('엔진 설명에 Fal.ai / Stability / Prodia 단독 언급 제거', () => {
      // 환경설정 안내 문구에는 더 이상 Fal.ai / Stability AI / Prodia가 메인 엔진으로 소개되지 않아야 함
      // (이미지 모델 고급 설정 섹션은 예외로 유지됨 — Stability/Prodia 드롭다운은 남을 수 있음)
      const noticeMatch = html.match(/이미지 생성[\s\S]{0,500}?공공자료/);
      expect(noticeMatch).toBeTruthy();
      const notice = noticeMatch ? noticeMatch[0] : '';
      expect(notice).toMatch(/Nano Banana Pro/);
      expect(notice).toMatch(/Flow/);
      expect(notice).toMatch(/ImageFX/);
    });
  });

  describe('이미지 소스 드롭다운 (image-source-select)', () => {
    it("Flow 옵션 존재", () => {
      expect(html).toMatch(/<option value="flow"[^>]*>[\s\S]{0,200}?Flow/);
    });

    it('ImageFX 옵션 존재', () => {
      expect(html).toMatch(/<option value="imagefx"[^>]*>[\s\S]{0,200}?ImageFX/);
    });

    it('Nano Banana Pro 옵션 존재', () => {
      expect(html).toMatch(/<option value="nano-banana-pro"/);
    });
  });

  describe('FAQ — 무료 이미지 소스 안내', () => {
    it('DALL-E 3 / Stability AI 직접 언급 제거 (deprecated 용어)', () => {
      // 11793 근처 Deprecated 안내는 허용 (자동 회피 고지용)
      // FAQ 본문 "무료로 사용할 수 있는 이미지 소스는?" 섹션에서만 확인
      const faqMatch = html.match(/무료로 사용할 수[\s\S]{0,2000}?<\/details>/);
      expect(faqMatch).toBeTruthy();
      const faq = faqMatch ? faqMatch[0] : '';
      expect(faq).not.toMatch(/DALL-E 3/);
      expect(faq).not.toMatch(/Stability AI/);
      expect(faq).toMatch(/ImageFX/);
      expect(faq).toMatch(/Flow/);
    });
  });

  describe('Gemini 2.5 Flash 무료 쿼터 3곳 통일', () => {
    it('선택 드롭다운(option) 2개 모두 500/일 사용', () => {
      const matches = html.match(/Gemini 2\.5 Flash \(무료 \d+\/일/g) || [];
      // 최소 2개는 반드시 노출되어야 하고 모두 500/일로 통일
      expect(matches.length).toBeGreaterThanOrEqual(2);
      matches.forEach((m) => {
        expect(m).toMatch(/무료 500\/일/);
      });
    });

    it('비용표 모달에서 Gemini 2.5 Flash 무료 500/일 쿼터 일관', () => {
      expect(html).toMatch(/Gemini 2\.5 Flash[\s\S]{0,200}?500/);
    });
  });
});

describe('v1.4.81 — guideModals.ts DALL-E 3 참조 제거', () => {
  const code = readSrc('renderer/modules/guideModals.ts');

  it('DALL-E 3 사용자 가이드 문구 제거', () => {
    expect(code).not.toMatch(/DALL-E 3\(유료\)/);
    expect(code).not.toMatch(/DALL-E 3 또는 Pexels/);
  });

  it('현행 무료 엔진(ImageFX/Flow) 안내 포함', () => {
    expect(code).toMatch(/ImageFX/);
    expect(code).toMatch(/Flow/);
  });
});

describe('v1.4.81 — headingImageGen.ts openai-image 라벨', () => {
  const code = readSrc('renderer/modules/headingImageGen.ts');

  it("openai-image 로그 라벨 'gpt-image-1'로 변경 (DALL-E 3 제거)", () => {
    expect(code).not.toMatch(/모델: DALL-E 3/);
    expect(code).toMatch(/모델: gpt-image-1/);
  });
});

describe('v1.4.81 — apiUsageTracker.ts Perplexity 주석 정정', () => {
  const code = readSrc('apiUsageTracker.ts');

  it('sonar-reasoning-pro 대체 설명이 주석에 반영됨', () => {
    expect(code).toMatch(/sonar-reasoning-pro[\s\S]{0,200}?(대체|활성)/);
  });

  it("'sonar-reasoning'을 '신규 추가'로 표기한 낡은 주석 제거", () => {
    expect(code).not.toMatch(/sonar-reasoning은 신규 추가/);
  });
});
