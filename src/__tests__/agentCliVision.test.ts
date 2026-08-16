// src/__tests__/agentCliVision.test.ts
// 에이전트 CLI 사진 추론 — 프롬프트/스키마/파싱 순수 로직 + 스테이징 이름 규약

import { describe, it, expect } from 'vitest';
import {
  isAgentCliVisionProvider,
  buildAgentVisionPrompt,
  buildAgentVisionSchema,
  parseAgentVisionResults,
} from '../imageNarrative/visionInference/agentCliVisionAdapter.js';
import { stagedImageName } from '../agentCli/imageStaging.js';
import {
  CLAUDE_SUBSCRIPTION_IMAGE_READ_ARGS,
  CLAUDE_SUBSCRIPTION_ISOLATION_ARGS,
} from '../agentCli/subscriptionEnv.js';

describe('agent vision provider gate', () => {
  it('claude/codex만 지원, agy(agent-gemini)는 미지원', () => {
    expect(isAgentCliVisionProvider('agent-claude')).toBe(true);
    expect(isAgentCliVisionProvider('agent-codex')).toBe(true);
    expect(isAgentCliVisionProvider('agent-gemini')).toBe(false);
    expect(isAgentCliVisionProvider('gemini')).toBe(false);
  });
});

describe('staged image naming', () => {
  it('순서 기반 결정적 이름 + 확장자 보존/정규화', () => {
    expect(stagedImageName(0, 'C:\\x\\a.JPG')).toBe('photo-01.jpg');
    expect(stagedImageName(1, '/y/b.png')).toBe('photo-02.png');
    expect(stagedImageName(9, 'weird.xyz')).toBe('photo-10.jpg');
  });
});

describe('buildAgentVisionPrompt', () => {
  it('claude 변형은 Read 도구 지시 + 파일 목록을 포함한다', () => {
    const p = buildAgentVisionPrompt(['photo-01.jpg', 'photo-02.png'], 'food', undefined, 'agent-claude');
    expect(p).toContain('Read 도구');
    expect(p).toContain('photo-01.jpg');
    expect(p).toContain('photo-02.png');
    expect(p).toContain('2개');
  });

  it('codex 변형은 첨부 방식 지시를 쓴다 (Read 도구 지시 없음)', () => {
    const p = buildAgentVisionPrompt(['photo-01.jpg'], 'auto', undefined, 'agent-codex');
    expect(p).toContain('첨부된 사진');
    expect(p).not.toContain('Read 도구');
  });
});

describe('buildAgentVisionSchema', () => {
  it('results 배열 개수를 사진 수로 고정한다', () => {
    const s = buildAgentVisionSchema(3) as any;
    expect(s.properties.results.minItems).toBe(3);
    expect(s.properties.results.maxItems).toBe(3);
    expect(s.properties.results.items.required).toContain('description_ko');
  });
});

describe('parseAgentVisionResults (fail-closed)', () => {
  const good = JSON.stringify({
    results: [
      { index: 1, scene_type: 'food', location_hint: '서울 마포', food_items: ['파스타'], mood_keywords: ['아늑한'], description_ko: '크림 파스타가 담긴 접시.', confidence: 0.9 },
      { index: 2, scene_type: 'cafe', location_hint: '', food_items: [], mood_keywords: [], description_ko: '창가 자리의 커피 한 잔.', confidence: 0.8 },
    ],
  });

  it('정상 응답을 인덱스 순서로 매핑한다', () => {
    const r = parseAgentVisionResults(good, 2);
    expect(r[0]?.scene_type).toBe('food');
    expect(r[0]?.food_items).toEqual(['파스타']);
    expect(r[1]?.description_ko).toContain('커피');
  });

  it('마크다운 펜스가 감싸도 파싱한다', () => {
    const r = parseAgentVisionResults('```json\n' + good + '\n```', 2);
    expect(r[0]?.scene_type).toBe('food');
  });

  it('description_ko 없는 항목·누락 인덱스는 null (fail-closed)', () => {
    const partial = JSON.stringify({ results: [{ index: 1, scene_type: 'food', description_ko: '' }] });
    const r = parseAgentVisionResults(partial, 2);
    expect(r[0]).toBeNull();
    expect(r[1]).toBeNull();
  });

  it('비정상 scene_type은 auto로, confidence는 0~1로 보정한다', () => {
    const weird = JSON.stringify({
      results: [{ index: 1, scene_type: 'alien', location_hint: '', food_items: [], mood_keywords: [], description_ko: '사진.', confidence: 7 }],
    });
    const r = parseAgentVisionResults(weird, 1);
    expect(r[0]?.scene_type).toBe('auto');
    expect(r[0]?.confidence).toBe(1);
  });

  it('JSON이 아예 없으면 전원 null', () => {
    expect(parseAgentVisionResults('추론을 못 하겠습니다.', 2).every((x) => x === null)).toBe(true);
  });
});

describe('claude image-read isolation args', () => {
  it('기존 격리 args는 불변 (와일드카드 차단 유지)', () => {
    expect(CLAUDE_SUBSCRIPTION_ISOLATION_ARGS).toContain('--disallowedTools');
    expect(CLAUDE_SUBSCRIPTION_ISOLATION_ARGS).toContain('*');
  });

  it('이미지 변형은 Read만 허용하고 셸/쓰기/네트워크 도구를 명시 차단한다', () => {
    const joined = CLAUDE_SUBSCRIPTION_IMAGE_READ_ARGS.join(' ');
    expect(joined).toContain('--allowedTools Read');
    expect(joined).not.toContain("'*'");
    for (const banned of ['Bash', 'Edit', 'Write', 'WebFetch', 'WebSearch', 'Task']) {
      expect(joined).toContain(banned);
    }
    expect(joined).toContain('--no-session-persistence');
    expect(joined).toContain('--safe-mode');
  });
});
