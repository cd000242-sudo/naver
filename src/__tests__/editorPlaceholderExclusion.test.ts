/**
 * [v2.11.135] 특정 블로그 "글쓰기 진입 후 무한 튕김" 고객 리포트 회귀 잠금.
 *
 * 근본 원인: 일부 에디터 변형은 placeholder 힌트를 실제 텍스트 노드로 렌더링
 * (<span class="se-placeholder">제목</span>, "본문에 #을 이용하여 태그를...").
 * 이를 내용으로 읽는 바람에:
 *  1) paste 검증: before에 있던 캡션 placeholder가 붙여넣기 후 사라지며
 *     startsWith 비교 붕괴 → EDITOR_PARTIAL_INSERT_UNRECOVERED 오탐
 *     (실측: beforeChars=48, afterChars=206 — 증가분 158 ≈ 원본 161자)
 *  2) freshness 게이트: 빈 에디터가 titleChars=2("제목")/bodyChars=36으로
 *     읽혀 EDITOR_DRAFT_CONTEXT_NOT_FRESH 영구 차단 (실측 리포트 2·3)
 * 수정: 3개 리더 전부 .se-placeholder 제거 후 측정.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { isPasteVisible } from '../automation/richTextPaste';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('placeholder 제외 — 3개 리더 소스 잠금', () => {
  it('richTextPaste.readEditorStats가 placeholder/blind를 제거하고 측정한다', () => {
    const code = read('automation/richTextPaste.ts');
    expect(code).toMatch(/cloneNode\(true\)[\s\S]{0,200}\.se-placeholder/);
    expect(code).toMatch(/\.se-blind, \.blind/);
  });

  it('readEditorTitleText가 placeholder("제목")를 내용으로 세지 않는다', () => {
    const code = read('automation/editorTitleHelpers.ts');
    expect(code).toMatch(/querySelectorAll\('\.se-placeholder'\)\.forEach\(\(placeholder\) => placeholder\.remove\(\)\)/);
  });

  it('collectPrePublishStats 본문 수집이 placeholder를 제거한다', () => {
    const code = read('automation/prePublishAssertion.ts');
    expect(code).toMatch(/closest\('\.se-placeholder'\)/);
    expect(code).toMatch(/querySelectorAll\('\.se-placeholder'\)\.forEach\(\(placeholder\) => placeholder\.remove\(\)\)/);
  });
});

describe('isPasteVisible — 라이브 리포트 시나리오 (기능 검증)', () => {
  const SECTION = '기자84가 AI와 연애를 한다면 어떤 모습일까요? SBS의 새로운 예능이 시청자에게 던진 질문은 단순한 호기심을 넘어 우리 시대의 관계 맺기를 돌아보게 합니다. 첫 방송에서 공개된 장면들은 예상보다 진지했고, 출연자들의 반응도 흥미로웠습니다.';

  it('placeholder가 측정에서 제외되면(전후 텍스트가 순수 append) 정상 통과한다', () => {
    const beforeText = '서론 문단입니다. 이미지가 위에 있습니다.';
    const before = { chars: beforeText.length, tables: 0, text: beforeText };
    const afterText = `${beforeText} ${SECTION}`;
    const after = { chars: afterText.length, tables: 0, text: afterText };
    expect(isPasteVisible(before, after, SECTION)).toBe(true);
  });

  it('[v2.11.140] before 캡션 placeholder가 paste 후 사라져도 정상 append면 통과한다', () => {
    // 실측 회귀(EDITOR_PARTIAL_INSERT_UNRECOVERED beforeChars=58, afterChars=219, cov 0.97):
    // 캡션 placeholder("사진 설명을 입력하세요.")가 before에 섞였다가 붙여넣기 후 사라지면,
    // 앵커 탐색을 beforeText.length 지점부터 시작해 앞쪽에 안착한 섹션 시작을 놓쳐 오탐했다.
    // 수정: before가 after에 남지 않으면(=placeholder 소멸) 앵커를 0부터 탐색 → 정상 통과.
    // 커버리지 게이트는 그대로라 본문 누락(cov<0.82)은 여전히 차단된다.
    const realBefore = '서론 문단입니다. 이미지가 위에 있습니다.';
    const before = {
      chars: realBefore.length + 13,
      tables: 0,
      text: `${realBefore} 사진 설명을 입력하세요.`,
    };
    const afterText = `${realBefore} ${SECTION}`;
    const after = { chars: afterText.length, tables: 0, text: afterText };
    expect(isPasteVisible(before, after, SECTION)).toBe(true);
  });

  it('[v2.11.140 안전잠금] 섹션이 기존 내용 앞/중간에 끼어들면(reorder) 여전히 차단한다', () => {
    const oldContent = '기존 본문이 상당히 길게 남아 있는 상황입니다. 이 내용은 붙여넣기 후에도 유지됩니다.';
    // (1) 섹션이 기존 내용 "앞"에 삽입 — before가 그대로 남아있지만 startsWith 깨짐 → reorder 차단
    const prepended = { chars: (SECTION + ' ' + oldContent).length, tables: 0, text: `${SECTION} ${oldContent}` };
    const beforeA = { chars: oldContent.length, tables: 0, text: oldContent };
    expect(isPasteVisible(beforeA, prepended, SECTION)).toBe(false);
    // (2) 섹션이 "중간"에 삽입 — 뒤에 밀려난 기존 내용이 trailing으로 남아 차단
    const mid = { chars: ('앞부분 ' + SECTION + ' ' + oldContent).length, tables: 0, text: `앞부분 ${SECTION} ${oldContent}` };
    const beforeB = { chars: ('앞부분 ' + oldContent).length, tables: 0, text: `앞부분 ${oldContent}` };
    expect(isPasteVisible(beforeB, mid, SECTION)).toBe(false);
  });

  it('[v2.11.140] 중간 글자가 렌더로 미세히 달라도 시작·끝+커버리지면 통과 (실측 headAt=47/tailAt=192/cov0.97 재현)', () => {
    // 에디터가 본문을 "모바일 단락 여러 개 + 하이라이트"로 렌더하며 중간 한 글자가 바뀌는
    // 상황 재현. 시작(첫 앵커)·끝(마지막 앵커)은 동일, 길이 동일(커버리지 유지).
    const before = 'ㄱ'.repeat(47); // 47자 캡션 잔존(beforePersists=Y) — 실측과 동일
    const expected = SECTION; // ~170자 본문
    const center = Math.floor(expected.length / 2); // 중간 앵커 구간, 첫/끝 21자 밖
    const swapped = expected[center] === '가' ? '나' : '가';
    const renderedSection = expected.slice(0, center) + swapped + expected.slice(center + 1);
    const afterText = `${before}${renderedSection}`; // 캡션 뒤 정상 append
    const beforeObj = { chars: before.length, tables: 0, text: before };
    const afterObj = { chars: afterText.length, tables: 0, text: afterText };
    expect(isPasteVisible(beforeObj, afterObj, expected)).toBe(true);
  });

  it('[v2.11.140 안전잠금] 큰 누락(커버리지<0.82)이면 끝 앵커 부재로 여전히 차단한다', () => {
    const before = 'ㄱ'.repeat(47);
    // 섹션 끝 40자가 실제로 안 들어온 truncation — 커버리지 게이트(0.82) 미달 → 차단
    const truncated = SECTION.slice(0, SECTION.length - 40);
    const afterText = `${before}${truncated}`;
    const beforeObj = { chars: before.length, tables: 0, text: before };
    const afterObj = { chars: afterText.length, tables: 0, text: afterText };
    expect(isPasteVisible(beforeObj, afterObj, SECTION)).toBe(false);
  });

  it('[v2.11.140] 끝 몇 글자만 누락되고(tailAt=-1) 커버리지 높으면(>=0.95) 통과 — 실측 headAt=1261/tailAt=-1/cov0.97 재현', () => {
    // 앞 섹션들이 이미 들어간 상태(1261자) 뒤에 새 섹션이 append되는데, 끝 몇 글자만
    // 미세하게 누락(끝 렌더 정규화/트렁케이션). 시작은 정확히 append, 커버리지 97%.
    const before = 'ㄱ'.repeat(1261);
    const expected = SECTION; // ~170자
    const rendered = expected.slice(0, expected.length - 5); // 끝 5자 누락 → cov ~0.97, 끝 앵커 불일치
    const afterText = `${before}${rendered}`;
    const beforeObj = { chars: before.length, tables: 0, text: before };
    const afterObj = { chars: afterText.length, tables: 0, text: afterText };
    expect(isPasteVisible(beforeObj, afterObj, expected)).toBe(true);
  });

  it('[v2.11.140b] 이미지 삽입 직후 몇 글자 프리픽스가 생겨도(루트 흔들림) 정확한 append면 통과', () => {
    // 실측(11:01 리포트): 이미지 2장 삽입 직후 섹션 붙여넣기 — cov=0.97, headAt=beforeLen
    // 정확 append인데 startsWith all-or-nothing reorder 게이트가 차단. 프리픽스 32자까지 허용.
    const before = 'ㄴ'.repeat(286);
    const afterText = `잔여캡션여섯${before}${SECTION}`; // 6자 프리픽스 + 정확한 append
    expect(isPasteVisible(
      { chars: before.length, tables: 0, text: before },
      { chars: afterText.length, tables: 0, text: afterText },
      SECTION,
    )).toBe(true);
  });

  it('[v2.11.140b] 진짜 reorder(옛 내용 앞에 섹션 통째 삽입)는 여전히 차단', () => {
    const before = 'ㄴ'.repeat(286);
    const afterText = `${SECTION}${before}`; // 섹션이 옛 내용 앞에 = 오배치
    expect(isPasteVisible(
      { chars: before.length, tables: 0, text: before },
      { chars: afterText.length, tables: 0, text: afterText },
      SECTION,
    )).toBe(false);
  });

  it('[v2.11.140b] 끝 앵커 뒤 잔여 장식 몇 글자(<=32)는 near-complete면 통과 — 실측 trailing 오탐 재현', () => {
    // 실측: cov=0.97, tail 정착, 끝 뒤 잔여 십수 자(스페이서/장식)로 trailing<=8 초과 차단.
    const before = 'ㄴ'.repeat(286);
    const afterText = `${before}${SECTION} · · · · · ·`; // 잔여 13자 장식
    expect(isPasteVisible(
      { chars: before.length, tables: 0, text: before },
      { chars: afterText.length, tables: 0, text: afterText },
      SECTION,
    )).toBe(true);
  });

  it('[v2.11.140b] mid-insertion(섹션 뒤로 옛 본문이 수십 자 이상 밀림)은 여전히 차단', () => {
    const beforeHead = 'ㄴ'.repeat(150);
    const beforeTail = 'ㄷ'.repeat(136); // 섹션 뒤로 밀린 옛 본문 136자
    const before = `${beforeHead}${beforeTail}`;
    const afterText = `${beforeHead}${SECTION}${beforeTail}`; // 중간 삽입
    expect(isPasteVisible(
      { chars: before.length, tables: 0, text: before },
      { chars: afterText.length, tables: 0, text: afterText },
      SECTION,
    )).toBe(false);
  });

  it('[v2.11.140] 팝업 부재 = 새 글 확정 — closeDraftPopup이 freshness 가드를 해제한다 (임시저장 1개 + 글감 힌트 오탐 차단)', () => {
    // 실측 사고(7/22 11:00): 크래시된 런이 임시저장("저장 1")을 남겨 draftCount===0
    // 지름길이 무효화 → 글감 힌트(titleChars=19/bodyChars=36, 이 변형은 .se-placeholder
    // 미사용)를 잔여 콘텐츠로 오인 → EDITOR_DRAFT_CONTEXT_NOT_FRESH 영구 차단.
    // 복원은 반드시 팝업을 거치므로 "팝업 없음"이 새 글 상태의 권위 신호다.
    const code = read('naverBlogAutomation.ts');
    const absentLogAt = code.indexOf('작성중인 글 팝업 없음 — 새 글 입력 가능');
    expect(absentLogAt).toBeGreaterThan(-1);
    // 팝업 부재 로그 직전 800자 안에서 두 플래그가 모두 해제되어야 한다.
    const disarmWindow = code.slice(Math.max(0, absentLogAt - 800), absentLogAt);
    expect(disarmWindow).toContain('this.pendingDraftConflictDialog = false');
    expect(disarmWindow).toContain('this.requiresFreshEditorContext = false');
    // 해제는 팝업-부재 경로에만 있어야 한다 — 감지 후 닫은(clicked) 경로는 가드 유지.
    const detectedArmAt = code.indexOf('outcome.detected');
    expect(detectedArmAt).toBeGreaterThan(-1);
  });

  it('[v2.11.140] 임시저장 카운트를 aria-label("임시저장된 글 보기, N개")로 우선 읽는다', () => {
    // 실측(스샷+모달 덤프): 헤더의 "저장"과 숫자가 별도 버튼이라 innerText "저장 N"
    // 매칭이 null로 빠져 draftCount===0 지름길이 무력화 → 작성중인 글 팝업(취소로 닫음)
    // + 저장 0 상태에서도 글감 힌트 오탐(19/36)으로 발행이 차단됐다.
    const code = read('naverBlogAutomation.ts');
    const readFnAt = code.indexOf('private async readTempSaveDraftCount');
    expect(readFnAt).toBeGreaterThan(-1);
    const fnBody = code.slice(readFnAt, readFnAt + 3000);
    const ariaAt = fnBody.indexOf("querySelectorAll('[aria-label]')");
    const innerTextAt = fnBody.indexOf("querySelectorAll('button, a, span, div, em, strong')");
    expect(ariaAt).toBeGreaterThan(-1);
    expect(innerTextAt).toBeGreaterThan(-1);
    expect(ariaAt).toBeLessThan(innerTextAt); // aria 우선

    // 소스와 동일한 정규식이 라이브 aria 문자열을 정확히 파싱하는지 잠금.
    const ariaRegex = /(?:임시\s*)?저장(?:된)?\s*글\s*보기[^0-9]*(\d+)\s*개/;
    expect(fnBody).toContain(String(ariaRegex).slice(1, -1));
    expect('임시저장된 글 보기, 0개'.match(ariaRegex)?.[1]).toBe('0');
    expect('임시저장된 글 보기, 3개'.match(ariaRegex)?.[1]).toBe('3');
    expect('저장된 글 보기 12개'.match(ariaRegex)?.[1]).toBe('12');
    expect('발행 설정 열기'.match(ariaRegex)).toBeNull();
  });
});
