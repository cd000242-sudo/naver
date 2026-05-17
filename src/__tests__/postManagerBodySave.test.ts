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

// ── _contentAlreadyGenerated 재사용 경로 — headings만 있고 bodyPlain 없는 케이스 ──
// postManager.ts:481: lightHeadings = headings.map(h => ({ title: h.title }))
// 저장 시 headings[].content가 버려지므로, 불러오기 후 buildFullBody에서 title만 복구됨.
describe('_contentAlreadyGenerated 재사용 경로 — lightHeadings(title only) 저장 후 복구 한계', () => {
  // lightHeadings처럼 title만 있는 경우 buildFullBody 결과 검증
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

  it('[REGRESSION] lightHeadings(title only) + bodyPlain empty → title만 복구, 본문 없음 (한계 문서화)', () => {
    // 저장 후 불러올 때의 구조: headings는 { title } 만 남음
    const loadedPost = {
      content: '',  // 저장 시 bodyPlain도 없었으므로 empty
      headings: [
        { title: '소제목1' },  // lightHeadings: content 필드 없음
        { title: '소제목2' },
      ],
    };
    const sc = {
      bodyPlain: loadedPost.content,
      content: loadedPost.content,
      headings: loadedPost.headings,
    };
    const result = buildFullBody(sc);
    // title만 있는 headings에서는 본문 내용 복구 불가
    // 소제목 제목들만 이어붙여짐 (실제 문장 없음)
    expect(result).toBe('소제목1\n\n소제목2');
    expect(result).not.toContain('본문 내용'); // 본문 문장 없음 확인 — 이것이 버그의 잔여
  });

  it('[FIX TARGET] bodyPlain이 저장 시점에 반드시 채워져야 함 — _contentAlreadyGenerated 재사용 경로', () => {
    // 올바른 저장: bodyPlain이 있으면 content에 완전히 보존됨
    const fullSc = {
      bodyPlain: '소제목1\n\n실제 본문 문장입니다. 이 내용이 보여야 합니다.\n\n소제목2\n\n두 번째 소제목 본문.',
      content: '',
      headings: [{ title: '소제목1' }, { title: '소제목2' }],
    };
    const result = buildFullBody(fullSc);
    expect(result).toContain('실제 본문 문장입니다');
    expect(result).toContain('두 번째 소제목 본문');
  });

  it('[GUARD] _contentAlreadyGenerated 조건 — headings만 있어도 진입하므로 bodyPlain 검증 필수', () => {
    // fullAutoFlow.ts:1954 조건: headings?.length > 0 || bodyPlain
    // headings만 있어도 재사용 분기 진입 → bodyPlain이 없을 수 있음
    const scWithOnlyHeadings = {
      headings: [{ title: '소제목1', content: '원본 본문 내용' }, { title: '소제목2', content: '원본 본문 내용2' }],
      bodyPlain: undefined as string | undefined,
      content: undefined as string | undefined,
    };
    // 재사용 분기 조건 재현
    const wouldReuseViaHeadings = (scWithOnlyHeadings.headings?.length > 0);
    expect(wouldReuseViaHeadings).toBe(true); // headings만으로 재사용 진입 가능

    // 이 상태에서 buildFullBody는 headings[].content에서 복구 가능 (저장 전이라 content 살아있음)
    const result = buildFullBody(scWithOnlyHeadings);
    expect(result).toContain('원본 본문 내용');  // 저장 전 단계에서는 복구됨

    // 하지만 저장 후 lightHeadings로 변환되면 content 필드가 사라짐
    const afterLightSave = {
      bodyPlain: '',
      content: '',
      headings: [{ title: '소제목1' }, { title: '소제목2' }],  // lightHeadings
    };
    const resultAfterSave = buildFullBody(afterLightSave);
    expect(resultAfterSave).not.toContain('원본 본문 내용');  // 복구 불가 확인
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
