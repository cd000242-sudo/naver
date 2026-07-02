/**
 * richPasteMarkdownHeadingStrip.test.ts
 *
 * [2026-07-02] 챗봇이 붙여넣기용으로 소제목 앞에 붙이는 마크다운 헤딩(`## `)이
 * 네이버에 타이핑될 때 리터럴 '#'로 새어나오지 않음을 증명한다.
 * buildMobileRichHtml(모든 타이핑 본문의 단일 choke point)이 `#{1,4} ` 접두를
 * 스타일 헤딩으로 변환하며 마커를 제거해야 한다. (extractor의 `#{1,4}`와 정렬)
 */
import { describe, it, expect } from 'vitest';
import { buildMobileRichHtml } from '../automation/richTextPaste';

describe('리치입력 마크다운 헤딩 마커 제거 (## 누출 방지)', () => {
  it('## / ### / #### 헤딩은 마커 없이 스타일 헤딩으로 변환된다 (## 리터럴 0)', () => {
    const text = [
      '## 라이머의 말이 다시 주목된 이유',
      '',
      '라이머와 안현모의 이름이 다시 함께 언급됐습니다.',
      '',
      '### 더 작은 소제목',
      '',
      '본문 문단 내용입니다.',
      '',
      '#### 네 번째 레벨 소제목',
      '',
      '마지막 문단.',
    ].join('\n');

    const { html, plainText } = buildMobileRichHtml(text);

    // 핵심: 타이핑되는 html/plain 어디에도 '##' 리터럴이 없어야 한다.
    expect(html).not.toContain('##');
    expect(plainText).not.toContain('##');
    // 4개짜리도 처리 — 리터럴 '#'로 시작하는 조각이 남으면 안 됨
    expect(html).not.toMatch(/#{2,4}\s/);
    // 소제목 텍스트 자체는 보존
    expect(plainText).toContain('라이머의 말이 다시 주목된 이유');
    expect(plainText).toContain('더 작은 소제목');
    expect(plainText).toContain('네 번째 레벨 소제목');
    // data-rich-heading으로 스타일 헤딩 렌더 확인
    expect(html).toContain('data-rich-heading="true"');
  });

  it('공백 없는 해시태그(#단어)는 헤딩으로 오인·제거되지 않는다 (오탐 방지)', () => {
    const { html, plainText } = buildMobileRichHtml('#라이머 #안현모 관련 이야기입니다.');
    // 해시태그는 헤딩이 아니므로 텍스트에 보존되어야 함
    expect(plainText).toContain('#라이머');
    expect(plainText).toContain('#안현모');
    expect(html).toContain('#라이머');
  });
});
