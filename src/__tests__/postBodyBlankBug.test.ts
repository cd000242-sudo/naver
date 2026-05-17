// BUG REPRO: "글 불러오기 후 본문 안 보임"
//
// 재현 조건:
//   1. normalizeReadableBodyText가 특정 본문 패턴을 전부 제거할 때
//   2. lightStructuredContent2에 bodyPlain이 없고 post.content만 본문을 들고 있는 상황에서,
//      저장 시점에 structuredContent.bodyPlain || structuredContent.content 가 모두 falsy일 때
//   3. loadGeneratedPostToFields에서 post.content를 그대로 읽지만,
//      normalizeReadableBodyText(rawContent) 결과가 빈 문자열일 때 fallback이 rawContent를 써야 함

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── 유틸 직접 임포트 ──────────────────────────────────────────────────────
// textFormatUtils는 순수 함수이므로 Node 환경에서 바로 임포트 가능.
// 단, 파일 상단에 DOM 의존 없음 확인 필요.
const textFormatUtilsPath = path.resolve(__dirname, '../renderer/utils/textFormatUtils.ts');
let normalizeReadableBodyText: (raw: string) => string;

// ts-node/vitest가 TypeScript를 트랜스파일하므로 dynamic import 사용
async function loadUtils() {
  const mod = await import('../renderer/utils/textFormatUtils.js');
  normalizeReadableBodyText = (mod as any).normalizeReadableBodyText;
}

// ─── lightStructuredContent 구조 재현 ─────────────────────────────────────
// postManager.ts L683~689의 lightStructuredContent2 형태
interface LightStructuredContent {
  selectedTitle: string;
  hashtags: string[];
  articleType: string;
  category: string;
  toneStyle: string;
  // bodyPlain 필드 없음 — 이것이 버그의 핵심
}

interface GeneratedPost {
  id: string;
  title: string;
  content: string;     // 유일한 본문 저장 위치
  hashtags: string[];
  headings: { title: string }[];
  structuredContent?: LightStructuredContent;
  createdAt: string;
}

// ─── 저장 시 본문 결정 로직 재현 (postManager.ts L701~710) ──────────────────
function resolveFullBody(structuredContent: any): string {
  const _rawBody = structuredContent?.bodyPlain || structuredContent?.content || '';
  return _rawBody
    ? String(_rawBody)
    : (structuredContent?.headings || [])
        .map((h: any) => {
          const bodyText = (h.content || h.summary || '').trim();
          return bodyText ? `${h.title || ''}\n${bodyText}` : (h.title || '');
        })
        .filter((s: string) => s.trim())
        .join('\n\n');
}

// ─── 불러오기 시 본문 결정 로직 재현 (postListUI.ts L1011~1013) ──────────────
function resolveLoadedBody(post: GeneratedPost, normalize: (s: string) => string): string {
  const rawContent = String(post.content || '');
  const normalized = normalize(rawContent);
  // v2.10.225 fallback: normalize가 빈 결과를 반환하면 raw로 복구
  return normalized.trim() ? normalized : rawContent;
}

describe('BUG: 글 불러오기 후 본문 안 보임', () => {
  // ─── 1. lightStructuredContent2에 bodyPlain 없음 확인 ──────────────────
  it('lightStructuredContent2에 bodyPlain 필드가 없다', () => {
    const light: LightStructuredContent = {
      selectedTitle: '테스트 제목',
      hashtags: ['#태그'],
      articleType: 'seo',
      category: '일상·생각',
      toneStyle: 'professional',
    };
    // bodyPlain 키가 없어야 함 (저장 구조 확인)
    expect(Object.keys(light)).not.toContain('bodyPlain');
    expect((light as any).bodyPlain).toBeUndefined();
  });

  // ─── 2. 저장 시 bodyPlain/content 둘 다 없을 때 본문이 비워지는 경로 ────
  it('structuredContent에 bodyPlain과 content 모두 없으면 post.content가 빈 문자열이 된다', () => {
    const emptyStructuredContent = {
      selectedTitle: '제목',
      hashtags: [],
      articleType: 'seo',
      // bodyPlain: 없음
      // content: 없음
      headings: [], // headings도 없을 때
    };
    const body = resolveFullBody(emptyStructuredContent);
    expect(body).toBe('');
    // 이 경우 post.content = '' 로 저장됨 → 불러올 때 본문 빈 화면
  });

  // ─── 3. headings.content로 복구되는 정상 케이스 ─────────────────────────
  it('bodyPlain이 없어도 headings[].content가 있으면 본문이 복구된다', () => {
    const structuredWithHeadings = {
      selectedTitle: '제목',
      hashtags: [],
      headings: [
        { title: '소제목1', content: '첫 번째 소제목 본문 내용입니다.' },
        { title: '소제목2', content: '두 번째 소제목 본문 내용입니다.' },
      ],
    };
    const body = resolveFullBody(structuredWithHeadings);
    expect(body).toContain('소제목1');
    expect(body).toContain('첫 번째 소제목 본문 내용입니다.');
    expect(body.length).toBeGreaterThan(0);
  });

  // ─── 4. normalizeReadableBodyText가 본문을 전부 제거하는 케이스 ────────
  it('normalizeReadableBodyText: 정상 본문은 내용을 보존한다', async () => {
    await loadUtils();
    const normalContent = '안녕하세요. 오늘은 좋은 날씨네요.\n\n건강 관리에 대해 알아보겠습니다.';
    const result = normalizeReadableBodyText(normalContent);
    expect(result.trim().length).toBeGreaterThan(0);
    expect(result).toContain('안녕하세요');
  });

  it('normalizeReadableBodyText: 빈 문자열 입력 → 빈 문자열 반환', async () => {
    await loadUtils();
    const result = normalizeReadableBodyText('');
    expect(result).toBe('');
  });

  it('normalizeReadableBodyText: 공백만 있는 본문 → 빈 문자열 반환', async () => {
    await loadUtils();
    const result = normalizeReadableBodyText('   \n\n   \n   ');
    // trim() 후 빈 문자열이어야 함
    expect(result.trim()).toBe('');
    // 이 경우 fallback 없으면 textarea가 비어서 본문 안 보임 버그 발생
  });

  it('normalizeReadableBodyText: AI 인용번호만 있는 본문 → 빈 문자열 반환 가능', async () => {
    await loadUtils();
    // 인용번호만으로 구성된 극단적 케이스 (실제로는 발생 안 하지만 경계값 테스트)
    const onlyCitations = '[1] [2, 3] [4]';
    const result = normalizeReadableBodyText(onlyCitations);
    // 인용번호 제거 후 공백만 남으면 trim() → 빈 문자열
    // fallback이 없다면 본문 빈 화면
    console.log('[TEST] citation-only result:', JSON.stringify(result));
    // 결과가 비어있을 수 있음 — fallback 필요성 확인
  });

  // ─── 5. v2.10.225 fallback이 제대로 동작하는지 확인 ─────────────────────
  it('loadGeneratedPostToFields: normalize가 빈 결과를 반환하면 rawContent로 fallback한다', async () => {
    await loadUtils();

    const post: GeneratedPost = {
      id: 'test_001',
      title: '테스트 글',
      content: '실제 경험을 바탕으로 작성된 내용입니다.',  // normalize가 이 구문을 제거할 수 있음
      hashtags: [],
      headings: [{ title: '소제목' }],
      createdAt: new Date().toISOString(),
    };

    const loaded = resolveLoadedBody(post, normalizeReadableBodyText);
    // normalize가 특정 구문을 제거해도, fallback으로 raw 반환
    expect(loaded.trim().length).toBeGreaterThan(0);
    // '실제 경험을 바탕으로' 구문이 정규식으로 제거되므로 나머지가 남아야 함
    // fallback이 없으면 빈 문자열 → 본문 안 보임 버그
  });

  it('CRITICAL: normalize가 전체 본문을 제거하면 raw fallback으로 본문이 보존된다', async () => {
    await loadUtils();

    // '실제 경험을 바탕으로' 패턴만으로 구성된 본문 (극단적 케이스)
    // normalizeReadableBodyText가 이 패턴을 전부 제거하면 빈 문자열 반환
    const edgeCaseContent = '실제 경험을 바탕으로, 최신 연구 결과, 전문 지식을 바탕으로';
    const normalized = normalizeReadableBodyText(edgeCaseContent);
    console.log('[TEST] edge-case normalized:', JSON.stringify(normalized));

    const post: GeneratedPost = {
      id: 'edge_001',
      title: '엣지케이스 글',
      content: edgeCaseContent,
      hashtags: [],
      headings: [],
      createdAt: new Date().toISOString(),
    };

    const loaded = resolveLoadedBody(post, normalizeReadableBodyText);

    if (normalized.trim().length === 0) {
      // normalize가 전부 제거했을 때 → fallback이 raw 반환해야 함
      expect(loaded).toBe(edgeCaseContent);
      console.log('[TEST] ✅ fallback 정상 동작: raw 반환됨');
    } else {
      // normalize 후에도 내용이 남아있으면 그걸 사용
      expect(loaded.trim().length).toBeGreaterThan(0);
      console.log('[TEST] normalize 후 내용 보존됨');
    }
  });

  // ─── 6. 저장-불러오기 전체 파이프라인 통합 테스트 ────────────────────────
  it('저장 시 bodyPlain이 있는 경우 → post.content에 전체 본문 보존', () => {
    const fullContent = '이것은 완전한 본문입니다.\n\n두 번째 문단입니다.\n세 번째 줄입니다.';
    const structuredContent = {
      selectedTitle: '제목',
      bodyPlain: fullContent,
      hashtags: [],
      headings: [{ title: '소제목', content: '소제목 본문' }],
    };

    const body = resolveFullBody(structuredContent);
    expect(body).toBe(fullContent);
    expect(body.length).toBe(fullContent.length);
  });

  it('저장 시 bodyPlain 없고 content 있는 경우 → content로 폴백', () => {
    const fullContent = '두 번째 폴백 본문입니다.';
    const structuredContent = {
      selectedTitle: '제목',
      content: fullContent,
      // bodyPlain: 없음
      hashtags: [],
      headings: [],
    };

    const body = resolveFullBody(structuredContent);
    expect(body).toBe(fullContent);
  });
});
