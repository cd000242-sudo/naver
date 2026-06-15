const REPEATED_HOOK_BLOCK =
  /댓글창이[^\n]*\n같은 걸 보고도 어떤 사람은 "별거 없다"고 하고, 어떤 사람은 "왜 나만 다르지\?"라고 하더라고요\.\n근데 가만 보면 갈리는 지점이 딱 세 가지예요\.\n내 상황이[^\n]*\n기대하는 결과가 "바로"인지, 아니면 "천천히"인지\.\n지금 당장 해도 되는 타입인지, 잠깐 멈추는 게 나은 타입인지\.\n아래에서 3분 안에 체크하고 바로 결론 내릴 수 있게 정리해둘게요\.\n*/g;

const KOREAN_ORDINAL_PATTERN = '(?:첫째|첫쨰|둘째|셋째|넷째|다섯째)';

export function stripRepeatedHookBlocks(text: string): string {
  if (!text) return text;

  return String(text)
    .replace(REPEATED_HOOK_BLOCK, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function enforceOrdinalLineBreaks(text: string): string {
  if (!text) return text;

  let out = String(text);
  out = out.replace(
    new RegExp(`([^\\n])\\s*(${KOREAN_ORDINAL_PATTERN})\\s*,`, 'g'),
    '$1\n$2,',
  );
  out = out.replace(
    new RegExp(`(^|\\n)\\s*(${KOREAN_ORDINAL_PATTERN})\\s*,`, 'g'),
    '$1$2,',
  );
  return out;
}
