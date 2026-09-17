// [2026-09-17] 발행 직전 headings[].content 재파싱 — 번호·마커가 앞 섹션 꼬리에 남지 않고, 번호는 인용구 제목으로.
// 라이브 2건: v2.11.291 "4." 한 줄(나나 글), v2.11.292 "01 2." 배지(양수진 글, "## 2. 제목" 줄).
import { describe, expect, it } from 'vitest';
import { reparseHeadingContentsFromBody } from '../renderer/modules/fullAutoFlow';

const A = '양수진이 공개한 두 업소의 폐업증명서';
const B = '2013년 판결은 퇴직금 미지급 사건이었다';
const C = '업종 표기와 판결문 서술을 함께 읽으면';

describe('reparseHeadingContentsFromBody', () => {
  it('"## 2. 제목" 줄: 앞 섹션 꼬리에 "## 2." 가 남지 않고, 번호가 publishTitle 로 간다', () => {
    const body = ['도입.', '', `## 1. ${A}`, '', '첫 섹션 본문입니다. 자세히 살펴볼 부분입니다.', '', `## 2. ${B}`, '', '둘째 섹션 본문입니다. 그렇게 본 이유입니다.', '', `## 3. ${C}`, '', '셋째 섹션 본문입니다. 함께 읽을 부분이에요.'].join('\n');
    const headings = [{ title: A, content: '' }, { title: B, content: '' }, { title: C, content: '' }];
    reparseHeadingContentsFromBody(headings as any, body);
    expect(headings[0].content).toBe('첫 섹션 본문입니다. 자세히 살펴볼 부분입니다.');
    expect(headings[1].content).toBe('둘째 섹션 본문입니다. 그렇게 본 이유입니다.');
    expect(headings[2].content).toBe('셋째 섹션 본문입니다. 함께 읽을 부분이에요.');
    expect((headings[0] as any).publishTitle).toBe(`1. ${A}`);
    expect((headings[1] as any).publishTitle).toBe(`2. ${B}`);
    expect((headings[2] as any).publishTitle).toBe(`3. ${C}`);
    // 이미지 키인 title 은 그대로
    expect(headings[1].title).toBe(B);
  });

  it('"4. 제목" 플레인 번호 줄도 같다 (v2.11.291 실측)', () => {
    const body = [`3. ${A}`, '', '검찰은 범행의 중대성을 봤습니다. 다시 다투고 있는 재판입니다.', '', `4. ${B}`, '', '피고인 측은 반성한다고 밝혔습니다.'].join('\n');
    const headings = [{ title: A, content: '' }, { title: B, content: '' }];
    reparseHeadingContentsFromBody(headings as any, body);
    expect(headings[0].content).toBe('검찰은 범행의 중대성을 봤습니다. 다시 다투고 있는 재판입니다.');
    expect((headings[1] as any).publishTitle).toBe(`4. ${B}`);
  });

  it('제목 앞에 진짜 단어가 있으면 제목 위치에서 자르고 번호도 붙이지 않는다', () => {
    const body = [`앞말 ${A}`, '', '본문 하나입니다. 충분히 깁니다.', '', `언급 ${B}`, '', '본문 둘입니다. 충분히 깁니다.'].join('\n');
    const headings = [{ title: A, content: '' }, { title: B, content: '' }];
    reparseHeadingContentsFromBody(headings as any, body);
    expect(headings[0].content).toBe('본문 하나입니다. 충분히 깁니다.\n\n언급');
    expect((headings[0] as any).publishTitle).toBeUndefined();
  });

  it('번호 없는 마커("## 제목")는 자르기만 하고 publishTitle 을 만들지 않는다; 이미 번호가 있는 제목은 중복하지 않는다', () => {
    const body = [`## ${A}`, '', '본문 하나입니다. 충분히 깁니다.', '', `## 2. 2. ${B}`, '', '본문 둘입니다. 충분히 깁니다.'].join('\n');
    const headings = [{ title: A, content: '' }, { title: `2. ${B}`, content: '' }];
    reparseHeadingContentsFromBody(headings as any, body);
    expect(headings[0].content).toBe('본문 하나입니다. 충분히 깁니다.');
    expect((headings[0] as any).publishTitle).toBeUndefined();
    expect((headings[1] as any).publishTitle).toBeUndefined();
  });

  it('10자 이하 조각은 기존 content 를 덮지 않는다 (기존 임계값 유지)', () => {
    const body = [`1. ${A}`, '', '짧음', '', `2. ${B}`, '', '둘째 섹션 본문입니다. 충분히 깁니다.'].join('\n');
    const headings = [{ title: A, content: '원래 내용' }, { title: B, content: '' }];
    reparseHeadingContentsFromBody(headings as any, body);
    expect(headings[0].content).toBe('원래 내용');
  });
});
