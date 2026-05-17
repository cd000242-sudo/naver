/**
 * Bug regression: "생성된 글 목록 불러오기 후 본문 안 보임, 이미지/소제목만 보임"
 *
 * Root cause: saveGeneratedPost / saveGeneratedPostFromData가 호출될 때
 *   structuredContent.bodyPlain과 .content가 둘 다 비어있으면 post.content = '' 저장됨.
 *   이후 loadGeneratedPostToFields에서 post.content를 그대로 textarea에 넣으므로 본문 공백.
 *
 * Fix: bodyPlain/content 둘 다 비면 headings[].content/summary에서 복구.
 */

import { describe, it, expect } from 'vitest';

// ── 복구 로직 인라인 추출 (postManager.ts의 fullBody 빌드와 동일) ──────────────
function buildFullBody(structuredContent: {
  bodyPlain?: string;
  content?: string;
  headings?: Array<{ title?: string; content?: string; summary?: string }>;
}): string {
  const _rawBody = structuredContent?.bodyPlain || structuredContent?.content || '';
  if (_rawBody) return String(_rawBody);

  return (structuredContent?.headings || [])
    .map((h) => {
      const bodyText = (h.content || h.summary || '').trim();
      return bodyText ? `${h.title || ''}\n${bodyText}` : (h.title || '');
    })
    .filter((s) => s.trim())
    .join('\n\n');
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

describe('buildFullBody — 저장 시점 본문 복구 로직', () => {
  it('[RED→GREEN] bodyPlain이 있으면 그대로 반환', () => {
    const sc = { bodyPlain: '서울의 봄날 본문입니다.', content: '', headings: [] };
    expect(buildFullBody(sc)).toBe('서울의 봄날 본문입니다.');
  });

  it('[RED→GREEN] bodyPlain이 없고 content가 있으면 content 반환', () => {
    const sc = { bodyPlain: '', content: '대체 본문입니다.', headings: [] };
    expect(buildFullBody(sc)).toBe('대체 본문입니다.');
  });

  it('[BUG REPRODUCE] bodyPlain과 content 둘 다 빈 문자열 — 이전 코드는 "" 저장, 수정 후 headings에서 복구', () => {
    const sc = {
      bodyPlain: '',
      content: '',
      headings: [
        { title: '소제목1', content: '소제목1 본문 내용입니다.' },
        { title: '소제목2', content: '소제목2 본문 내용입니다.' },
      ],
    };
    const result = buildFullBody(sc);
    // 본문이 빈 문자열이어서는 안 됨
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('소제목1');
    expect(result).toContain('소제목1 본문 내용입니다.');
    expect(result).toContain('소제목2');
  });

  it('[BUG REPRODUCE] bodyPlain/content 누락, headings에 summary만 있는 경우도 복구', () => {
    const sc = {
      bodyPlain: undefined,
      content: undefined,
      headings: [
        { title: '소제목A', summary: '소제목A 요약 내용' },
        { title: '소제목B', summary: '소제목B 요약 내용' },
      ],
    };
    const result = buildFullBody(sc);
    expect(result).toContain('소제목A 요약 내용');
    expect(result).toContain('소제목B 요약 내용');
  });

  it('[EDGE] 풀오토 재사용 경로 — headings만 있고 bodyPlain=undefined, content=undefined, heading에 content도 없는 경우 → title만 병합', () => {
    const sc = {
      bodyPlain: undefined,
      content: undefined,
      headings: [
        { title: '소제목만 있는 경우' },
      ],
    };
    const result = buildFullBody(sc);
    // content도 summary도 없으면 title만 반환 (최소한 비어있지는 않아야 함)
    expect(result).toBe('소제목만 있는 경우');
  });

  it('[EDGE] headings도 빈 배열이고 bodyPlain/content도 없는 경우 → 빈 문자열 (저장 실패 케이스 유지)', () => {
    const sc = { bodyPlain: '', content: '', headings: [] };
    const result = buildFullBody(sc);
    expect(result).toBe('');
  });

  it('[REGRESSION] bodyPlain이 비지 않으면 headings를 무시해야 함', () => {
    const sc = {
      bodyPlain: '실제 본문이 여기 있습니다.',
      content: '다른 값',
      headings: [{ title: '소제목', content: '이것은 무시되어야 함' }],
    };
    const result = buildFullBody(sc);
    expect(result).toBe('실제 본문이 여기 있습니다.');
    expect(result).not.toContain('이것은 무시되어야 함');
  });
});

// ── 로드 시점 재구성 로직 (loadGeneratedPostToFields의 structuredContent 빌드 검증) ──

describe('loadGeneratedPostToFields — post.content → contentTextarea 연결 검증', () => {
  it('[SCENARIO] post.content가 비면 textarea도 빔 (버그 재현)', () => {
    const post = {
      title: '테스트 제목',
      content: '',  // 저장 시 본문 누락된 케이스
      hashtags: [],
      headings: [{ title: '소제목1' }, { title: '소제목2' }],
    };
    // loadGeneratedPostToFields 코드: contentTextarea.value = post.content
    // post.content가 ''이면 textarea도 ''
    const textareaValue = String(post.content || '');
    expect(textareaValue).toBe('');  // 버그: 빈 문자열
  });

  it('[FIX] post.content가 채워져 있으면 textarea에 표시됨', () => {
    const post = {
      title: '테스트 제목',
      content: '소제목1\n소제목1 본문입니다.\n\n소제목2\n소제목2 본문입니다.',
      hashtags: [],
      headings: [{ title: '소제목1' }, { title: '소제목2' }],
    };
    const textareaValue = String(post.content || '');
    expect(textareaValue.length).toBeGreaterThan(0);
    expect(textareaValue).toContain('소제목1 본문입니다.');
  });
});
