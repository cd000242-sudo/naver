import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-01] 체류시간 조사 두 번째 건.
 *
 * 실측 글 [B]에서 "[ 한 줄 판정: … ]" 이 3섹션 전부에 반복됐다.
 * 모델의 일탈이 아니라 우리가 시킨 것이었다.
 *
 *   promptLoader:647  "한줄 판정 형식: 매 H3 마지막에 [▶ 한 줄 판정: …] 단독 줄"
 *   promptLoader:649  "H3마다 한줄 판정 단독 줄"
 *
 * 사정거리가 넓다. expert_review 는 사용자가 굳이 고르는 옵션이 아니라
 * health · tech · finance 세 카테고리의 기본 톤이다(personaBuilder :86 · :102 · :126).
 * 톤을 안 건드린 사용자 전원에게 매 H3마다 라벨이 강제되고 있었다.
 *
 * 체류시간에 닿는 지점은 라벨이 아니라 그 라벨이 강제한 내용이다.
 * :647 이 그 문장을 "한 문장 요약" 으로 규정하므로 구조상 앞 섹션의 재진술이다.
 * 매 섹션 끝에 새 정보 0 인 줄이 박히면 독자는 두 번째에서 템플릿을 알아채고
 * 세 번째부터 스킵한다.
 *
 * 같은 병을 앓는 톤이 넷 더 있다(storyteller · mentor · self_interview · data_verified).
 * "매 H2/H3 반드시" 를 전부 "글 전체에서 1~2회, 실제로 맞는 자리에만" 으로 완화한다.
 * 어법은 새로 만들지 않고 :792 의 "내용에 실제로 맞는 것" 을 이식한다.
 */
const prompt = () => readFileSync(resolve(__dirname, '..', 'promptLoader.ts'), 'utf-8');

describe('매 섹션 강제 템플릿을 걷어낸다', () => {
  it('expert_review 가 매 H3 판정 라벨을 강제하지 않는다', () => {
    const src = prompt();
    expect(src).not.toMatch(/매\s*H3\s*마지막에\s*\[/u);
    expect(src).not.toMatch(/H3마다\s*한줄\s*판정\s*단독\s*줄/u);
  });

  it('대괄호 라벨 형식 자체를 지시하지 않는다', () => {
    expect(prompt()).not.toMatch(/\[▶\s*한 줄 판정/u);
  });

  it('다른 톤들도 매 섹션 반복을 강제하지 않는다', () => {
    const src = prompt();
    for (const pattern of [
      /소제목 단위로 Before→During→After 3단 구조 필수/u,
      /매 H2에 단계 번호 또는 action item 1회\+/u,
      /매 H2 1회\+ Q:\/A: 패턴/u,
      /매 H2당 정량 수치 2개\+/u,
    ]) {
      expect(src).not.toMatch(pattern);
    }
  });

  it('판정 · 구조 자체를 금지하지는 않는다 — 자리에 맞으면 쓴다', () => {
    // 이 완화는 "쓰지 마라" 가 아니라 "매번 박지 마라" 다.
    expect(prompt()).toMatch(/실제로 맞는|맞는 자리|1~2회/u);
  });
});
