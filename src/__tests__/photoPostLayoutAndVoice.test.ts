import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사장님 실측] 발행글 세 가지 지적.
 *   1) 썸네일과 1번 소제목 첫 이미지가 같은 사진으로 두 번 나온다.
 *   2) "이미지 4장 → 글 3덩이" 가 아니라 이미지와 글이 번갈아 나와야 읽힌다.
 *   3) "~했어요/~했습니다" 만 있고 감정이 없다. 감탄사·반응이 있어야 사람 글로 읽힌다.
 */

describe('1) 이미지 중복 삽입 방지', () => {
  const editor = read('automation/editorHelpers.ts');

  it('ImageManager 경로에도 usedImagePaths 필터가 있다', () => {
    // 폴백 경로에만 있고 ImageManager 경로에는 등록만 있던 것이 중복의 뿌리였다.
    expect(editor).toMatch(/headingImages = headingImages\.filter\(\(img: any\) => \{[\s\S]*?usedImagePaths\.has\(imgPath\)/);
  });

  it('필터가 등록보다 먼저 온다 (등록 후 걸러내면 아무 효과가 없다)', () => {
    const filterIdx = editor.indexOf('headingImages = headingImages.filter');
    const registerIdx = editor.indexOf('이 소제목에서 사용하기로 한 이미지를 usedImagePaths에 등록');
    expect(filterIdx).toBeGreaterThan(-1);
    expect(registerIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeLessThan(registerIdx);
  });

  it('제외된 장수를 로그로 남긴다 (조용히 사라지면 진단 불가)', () => {
    expect(editor).toMatch(/중복제거.*이미 삽입된 이미지/);
  });
});

describe('2) 이미지·본문 교차 배치 배선', () => {
  const editor = read('automation/editorHelpers.ts');

  it('교차 계획기를 쓴다', () => {
    expect(editor).toMatch(/import \{ planImageTextInterleave \} from '\.\/imageTextInterleavePlan\.js';/);
    expect(editor).toMatch(/const interleaveSteps = planImageTextInterleave<any>\(allSectionImages, cleanBody\);/);
  });

  it('첫 삽입이 전체가 아니라 첫 묶음만 넣는다 (회귀 잠금)', () => {
    expect(editor).toMatch(/await self\.insertImagesAtCurrentCursor\(firstStepImages, page, imageFrame/);
    // 예전처럼 allSectionImages 를 통째로 넣는 호출이 남아 있으면 교차가 무의미해진다.
    expect(editor).not.toMatch(/await self\.insertImagesAtCurrentCursor\(allSectionImages, page, imageFrame/);
  });

  it('단계가 1개면 기존 경로를 그대로 탄다', () => {
    // 사진 1장 이하 / 문단 1개 이하에서는 예전 동작이 유지되어야 한다.
    expect(editor).toMatch(/if \(interleaveSteps\.length > 1\) \{/);
    expect(editor).toMatch(/이미지 뒤에 리치 입력 처리/);
  });

  it('본문 사이 이미지 삽입 뒤에도 캐럿을 다시 잡는다', () => {
    // 이미지 직후 캐럿 유실은 이 앱에서 본문 누락의 단골 원인이다.
    const block = editor.slice(editor.indexOf('번째 묶음'), editor.indexOf('번째 조각 입력'));
    expect(block).toMatch(/ensureTailTypingReady/);
    expect(block).toMatch(/focusLastEditableLine/);
  });
});

describe('3) 감정이 담긴 문장 요구', () => {
  const builder = read('imageNarrative/narrativeBuilder/builder.ts');

  it('감정 반응을 섹션마다 요구한다', () => {
    expect(builder).toMatch(/\[감정 반응\]/);
    expect(builder).toMatch(/섹션마다 최소 1번/);
  });

  it('좋았던 것만 쓰지 못하게 막는다', () => {
    expect(builder).toMatch(/아쉬웠던 점·망설였던 순간·예상과 달랐던 부분/);
  });

  it('감탄사 남용도 함께 막는다', () => {
    expect(builder).toMatch(/3번 넘게 쓰지 않는다/);
  });

  it('감정 때문에 없는 사실을 지어내지 못하게 한다', () => {
    expect(builder).toMatch(/감정을 위해 없는 사실을 만들지 말 것/);
  });
});

/**
 * [2026-09-09 사장님] "소제목도 내 경험과 어우러져 문장형으로 깔끔하게 나오면 좋겠어",
 * "문장형으로 하되 어색하면 안 된다고 끝맺음은 정확하거나 여운이 남게".
 *
 * 실측 발행글 소제목: "근포땅굴 도착 / 역광 속 땅굴 / 점심 꼬막 한상 / 오후 매미성 풍경"
 * — 전부 명사 라벨이었다. 뿌리는 프롬프트의 "소제목(##)은 2~4어절로 명확하게".
 */
describe('4) 사진 글 소제목 — 문장형 + 자연스러운 끝맺음', () => {
  const basePrompt = readFileSync(
    new URL('../prompts/imageNarrative/base.prompt', import.meta.url),
    'utf8',
  );
  const builder = read('imageNarrative/narrativeBuilder/builder.ts');
  const repair = read('content/headingStyleRepair.ts');

  it('2~4어절 명사 라벨 규칙이 사라졌다 (회귀 잠금)', () => {
    expect(basePrompt).not.toMatch(/소제목\(##\)은 2~4어절로 명확하게\./);
    expect(basePrompt).not.toMatch(/"heading": "소제목 \(2~4어절\)"/);
  });

  it('글자수 기준을 준다', () => {
    expect(basePrompt).toMatch(/함축된\*\* 한 마디로 쓴다 \(12~30자\)/);
    expect(builder).toMatch(/\[소제목\][\s\S]*?한 마디\(12~30자\)/);
  });

  /*
   * [2026-09-09 사장님] "'…근포마을을 마주했어요' 보다 '…마주한 근포마을' 이런 소제목이
   * 낫지 않니?" 읽는 맛 말고도 이유가 있다 — isSemiAutoHeadingCandidate 의
   * clearSentenceEnding 이 습니다/해요/했어요 종결을 소제목이 아니라고 배제하므로,
   * 종결어미로 끝난 소제목은 붙여넣기 동기화에 아예 보이지 않고 섹션이 통째로 사라진다.
   */
  it('끝맺음을 명사(체언)로 못 박는다', () => {
    for (const source of [basePrompt, builder]) {
      expect(source).toMatch(/끝맺음[^\n]*명사\(체언\)로/);
      expect(source).toMatch(/마주한 근포마을/);
    }
  });

  it('옛 "두 갈래 종결" 지시가 되살아나지 못하게 막는다 (회귀 잠금)', () => {
    for (const source of [basePrompt, builder]) {
      expect(source).not.toMatch(/정확한 종결/);
      expect(source).not.toMatch(/같은 종결로 통일하지/);
    }
  });

  it('명사 종결을 두 낱말 라벨로 오해하지 않게 막아 둔다', () => {
    expect(basePrompt).toMatch(/두 낱말 라벨/);
    expect(builder).toMatch(/명사 라벨\("근포땅굴 도착"\)/);
  });

  it('어색함을 구체적으로 금지한다 (번역투·광고·상투구)', () => {
    expect(basePrompt).toMatch(/번역투/);
    expect(basePrompt).toMatch(/광고 문구/);
    expect(basePrompt).toMatch(/정보성 상투구/);
  });

  it('소제목에도 사진에 없는 사실을 넣지 못하게 한다', () => {
    expect(basePrompt).toMatch(/소제목에도 사진에 없는 사실을 넣지 않는다/);
  });

  /**
   * [2026-09-09 사장님] "소제목은 대충 짓는 게 아니라 함축적으로 그 장소에 대한
   * 의미가 담겨 있어야 돼."
   * 실측: "초록빛 동굴을 뒤로한 점심 한 상" — 꼬막집 섹션인데 앞 장소를 끌어왔다.
   */
  it('그 장소가 어떤 곳인지 함축하라고 요구한다', () => {
    for (const source of [basePrompt, builder]) {
      expect(source).toMatch(/그 장소가 어떤 곳이었는지가 함축된/);
      expect(source).toMatch(/앞 섹션/);
      expect(source).toMatch(/끌어오지/);
    }
  });

  it('어디에 붙여도 되는 분위기 낱말 나열을 막는다', () => {
    expect(basePrompt).toMatch(/어디에 붙여도 말이 되는 소제목은 실패/);
    expect(builder).toMatch(/분위기 낱말 나열은 실패/);
  });

  it('숫자를 한글로 쓰지 못하게 한다 ("열 분 기다려" 실측)', () => {
    for (const source of [basePrompt, builder]) {
      expect(source).toMatch(/열 분 기다려/);
      expect(source).toMatch(/10분 기다려/);
    }
  });

  it('명사구 보정기가 사진 글 소제목을 되돌리지 않는다', () => {
    // 9/3 에 검색형 글에서 문장형을 걷어낸 보정기다. 사진 글은 정반대 요청이라 제외해야 한다.
    expect(repair).toMatch(/value === 'image-narrative'\) return false;/);
  });
});
