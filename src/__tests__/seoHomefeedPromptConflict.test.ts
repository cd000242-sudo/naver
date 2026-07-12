import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('SEO/Homefeed prompt conflict guard', () => {
  it('removes fixed density, forced title-front, and mandatory first-person rules from base prompts', () => {
    const seo = read('prompts/seo/base.prompt');
    const homefeed = read('prompts/homefeed/base.prompt');

    expect(seo).not.toMatch(/제목 앞 3자|메인\s*키워드.*밀도\s*1\.5~3%|1인칭 경험 흔적 의무/);
    expect(homefeed).not.toMatch(/메인\s*키워드.*밀도\s*1\.5~3%|1인칭 경험 흔적 의무|검증 가능한 숫자.*최소 5개/);
  });

  it('does not require fabricated experience in SEO category prompts', () => {
    const categoryFiles = [
      'entertainment', 'fashion', 'food', 'health', 'it', 'life', 'living',
      'parenting', 'pet', 'society', 'sports', 'tips', 'travel',
    ];

    for (const category of categoryFiles) {
      const prompt = read(`prompts/seo/${category}.prompt`);
      expect(prompt, category).not.toContain('필수 경험 표현');
      expect(prompt, category).not.toMatch(/구체적 에피소드 필수/);
    }
  });

  it('keeps tables and FAQ conditional instead of mandatory templates', () => {
    const homefeedTravel = read('prompts/homefeed/travel.prompt');
    const homefeedLiving = read('prompts/homefeed/living.prompt');
    const aiTab = read('prompts/seo/ai-tab-friendly.prompt');

    expect(homefeedTravel).not.toMatch(/총\s*비용\s*표.*필수|비용.*표.*반드시/);
    expect(homefeedLiving).not.toMatch(/총\s*비용.*표.*필수|비용.*표.*반드시/);
    expect(aiTab).not.toMatch(/3~4개.*반드시 질문형|구조 블록.*최소 2개/);
  });

  it('does not offer title formulas that validators immediately reject as clickbait', () => {
    const formulas = read('contentTitleFormulas.ts');
    expect(formulas).not.toContain('화제/난리/반응');
    expect(formulas).not.toContain('충격적인 대사');
  });

  it('does not reintroduce fixed engagement or title-hook formulas through late overlays', () => {
    const homefeedOverlay = read('prompts/shared/homefeed-90-quality.prompt');
    const exposurePattern = read('content/homefeedExposurePattern.ts');
    const loader = read('promptLoader.ts');

    expect(homefeedOverlay).not.toMatch(/저장 장치.*반드시|댓글 장치.*쓴다|공유 장치.*둔다/);
    expect(exposurePattern).not.toMatch(/도입 4단 구성|댓글 유도 문장\(/);
    expect(loader).not.toContain('후킹/심리 트리거로 채워');
    expect(loader).not.toContain('70/30 전략');
  });

  it('keeps full-auto output structural without forcing fabricated content', () => {
    const automation = read('prompts/automation.prompt');

    expect(automation).toContain('[완전자동 발행 시스템 출력 규칙]');
    expect(automation).not.toMatch(/소제목은 정확히 5개|모든 content에.*1인칭 경험|1인칭 경험 흔적.*의무/);
    expect(automation).not.toMatch(/모든 소제목에.*숫자.*의무|감정축.*최소 3개|다음 H2 갈고리/);
    expect(automation).toContain('입력 자료에서 확인된 사실만');
  });

  it('does not force unsupported usage claims into shopping titles', () => {
    const loader = read('promptLoader.ts');
    expect(loader).not.toContain('후킹 키워드 (반드시 1개만 선택');
    expect(loader).not.toContain('- 경험: "실사용 후기", "솔직후기", "직접 써본"');
    expect(loader).not.toContain('- 시간: "1개월 사용기", "2주 써보니", "한달 후기"');
  });
});
