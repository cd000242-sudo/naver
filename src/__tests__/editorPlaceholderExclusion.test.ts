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

  it('placeholder가 before에 섞이면 startsWith가 깨져 오탐된다 — 측정단 제거가 필요한 이유', () => {
    // 캡션 placeholder("사진 설명을 입력하세요.")가 paste 후 사라지는 실측 상황 재현.
    const realBefore = '서론 문단입니다. 이미지가 위에 있습니다.';
    const before = {
      chars: realBefore.length + 13,
      tables: 0,
      text: `${realBefore} 사진 설명을 입력하세요.`,
    };
    const afterText = `${realBefore} ${SECTION}`;
    const after = { chars: afterText.length, tables: 0, text: afterText };
    expect(isPasteVisible(before, after, SECTION)).toBe(false);
  });
});
