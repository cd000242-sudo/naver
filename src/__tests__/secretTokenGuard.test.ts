import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  findSecretLikeTokens,
  looksLikeSecretToken,
  maskSecretToken,
  stripSecretLikeTokens,
} from '../content/secretTokenGuard';

/**
 * [2026-09-09 사장님 실측] 발행된 글 초반부에 40자 난수 문자열이 그대로 실려 나갔다.
 * 형식이 네이버 클라우드 Secret Key 와 같았다 — 공개 블로그라 그대로 노출이다.
 *
 * 사용자가 키를 엉뚱한 칸에 붙여넣는 실수는 막을 수 없으니, 재료 단계에서 지우고
 * 발행 직전에 한 번 더 막는다. 대신 한국어 본문·URL·해시태그를 오탐하면
 * 멀쩡한 글이 차단되므로 판정은 보수적이어야 한다.
 */

const REAL_CASE = 'Ew3otgfjiBcw7XT7kmpEMc8fkf4uoDylz08eI9q8';

describe('자격증명 의심 토큰 판정', () => {
  it('실제 유출된 문자열을 잡는다', () => {
    expect(looksLikeSecretToken(REAL_CASE)).toBe(true);
  });

  it('대소문자+숫자가 섞인 20자 이상만 잡는다', () => {
    expect(looksLikeSecretToken('aB3'.repeat(7))).toBe(true);
    expect(looksLikeSecretToken('aB3aB3')).toBe(false); // 너무 짧다
  });

  it('숫자만 있는 ID는 잡지 않는다 (네이버 글 번호)', () => {
    expect(looksLikeSecretToken('224405387230224405387230')).toBe(false);
  });

  it('소문자만 있는 긴 단어·슬러그는 잡지 않는다', () => {
    expect(looksLikeSecretToken('naverblogautomationtool')).toBe(false);
    expect(looksLikeSecretToken('better-life-naver-automation')).toBe(false);
  });

  it('구분자가 많은 식별자는 사람이 읽는 것으로 본다', () => {
    expect(looksLikeSecretToken('KakaoTalk_2026-08-19_1655_A3')).toBe(false);
  });
});

describe('본문에서 찾아내기', () => {
  it('한국어 문장 사이에 섞여 있어도 찾는다', () => {
    const body = `안녕하세요.\n${REAL_CASE}\n오늘은 거제 여행을 다녀왔어요.`;
    expect(findSecretLikeTokens(body)).toEqual([REAL_CASE]);
  });

  it('평범한 한국어 글에서는 아무것도 찾지 않는다', () => {
    const body = '토요일 하루를 여자친구와 거제에서 보내기로 하고, 근포땅굴과 꼬막 점심을 다녀왔어요.';
    expect(findSecretLikeTokens(body)).toEqual([]);
  });

  it('네이버 블로그 URL 은 오탐하지 않는다', () => {
    const body = '이전 글: https://blog.naver.com/leader_248/224405387230 참고하세요.';
    expect(findSecretLikeTokens(body)).toEqual([]);
  });

  it('같은 토큰이 여러 번 나와도 한 번만 센다', () => {
    expect(findSecretLikeTokens(`${REAL_CASE} ... ${REAL_CASE}`)).toHaveLength(1);
  });
});

describe('재료에서 지우기', () => {
  it('토큰만 지우고 문장은 살린다', () => {
    const { text, removed } = stripSecretLikeTokens(
      `1~4번은 호텔 도착 ${REAL_CASE} 5~8번은 저녁 식사`,
    );
    expect(removed).toEqual([REAL_CASE]);
    expect(text).toContain('1~4번은 호텔 도착');
    expect(text).toContain('5~8번은 저녁 식사');
    expect(text).not.toContain(REAL_CASE);
  });

  it('지울 것이 없으면 원문을 그대로 돌려준다', () => {
    const source = '거제 매미성에 다녀왔어요.';
    const { text, removed } = stripSecretLikeTokens(source);
    expect(text).toBe(source);
    expect(removed).toEqual([]);
  });
});

describe('로그 마스킹', () => {
  it('원문을 그대로 찍지 않는다 (로그가 또 다른 유출 경로가 되면 안 된다)', () => {
    const masked = maskSecretToken(REAL_CASE);
    expect(masked).not.toContain(REAL_CASE);
    expect(masked).toContain('Ew3o');
    expect(masked).toContain('40자');
  });
});

describe('배선 — 재료 단계와 발행 게이트 양쪽에서 막는다', () => {
  const context = readFileSync(
    new URL('../imageNarrative/context.ts', import.meta.url), 'utf8',
  );
  const gate = readFileSync(
    new URL('../automation/prePublishAssertion.ts', import.meta.url), 'utf8',
  );

  it('사진 참고 정보(메모 포함)를 모델에 넘기기 전에 지운다', () => {
    expect(context).toMatch(/stripSecretLikeTokens/);
    // 메모뿐 아니라 시간·인물·장소·상황 칸도 같은 실수가 가능하다.
    for (const field of ['timeHint', 'mainPeople', 'place', 'occasion', 'notes']) {
      expect(context.includes(`${field}: scrubSecrets(`)).toBe(true);
    }
  });

  it('지웠으면 마스킹해서 알린다 (조용히 지우면 원인을 모른다)', () => {
    expect(context).toMatch(/SecretGuard/);
    expect(context).toMatch(/maskSecretToken/);
  });

  it('발행 직전 게이트가 본문을 다시 검사한다', () => {
    expect(gate).toMatch(/name: 'secret-leak'/);
    expect(gate).toMatch(/findSecretLikeTokens\(stats\.bodyText \|\| ''\)/);
  });

  it('게이트 실패 문구에 원문을 그대로 싣지 않는다', () => {
    expect(gate).toMatch(/leakedSecrets\.map\(maskSecretToken\)/);
  });
});
