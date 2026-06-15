import { describe, expect, it } from 'vitest';
import {
  enforceOrdinalLineBreaks,
  stripRepeatedHookBlocks,
} from '../automation/bodyTextCleanupPolicy';

describe('bodyTextCleanupPolicy', () => {
  it('removes the repeated conversational hook block without touching surrounding body', () => {
    const repeated = [
      '댓글창이 갑자기 조용해지는 순간이 있죠.',
      '같은 걸 보고도 어떤 사람은 "별거 없다"고 하고, 어떤 사람은 "왜 나만 다르지?"라고 하더라고요.',
      '근데 가만 보면 갈리는 지점이 딱 세 가지예요.',
      '내 상황이 지금 어떤지부터 봐야 합니다.',
      '기대하는 결과가 "바로"인지, 아니면 "천천히"인지.',
      '지금 당장 해도 되는 타입인지, 잠깐 멈추는 게 나은 타입인지.',
      '아래에서 3분 안에 체크하고 바로 결론 내릴 수 있게 정리해둘게요.',
    ].join('\n');

    expect(stripRepeatedHookBlocks(`앞 문단\n\n${repeated}\n\n뒤 문단`)).toBe('앞 문단\n\n뒤 문단');
  });

  it('keeps plain body text unchanged except trimming outer whitespace', () => {
    expect(stripRepeatedHookBlocks('\n\n본문입니다.\n\n')).toBe('본문입니다.');
  });

  it('moves Korean ordinal markers to their own lines', () => {
    expect(enforceOrdinalLineBreaks('문장 첫째, 배치 둘째, 비용 셋째, 안전')).toBe(
      '문장\n첫째, 배치\n둘째, 비용\n셋째, 안전',
    );
  });

  it('does not add duplicate spaces before ordinal markers already at line start', () => {
    expect(enforceOrdinalLineBreaks('첫째, 배치\n  둘째, 비용')).toBe('첫째, 배치\n둘째, 비용');
  });
});
