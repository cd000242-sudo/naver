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
});
