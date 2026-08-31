/**
 * 소제목 골격 균일도 감지.
 *
 * 사람이 쓴 목차는 문형이 섞인다. 어떤 줄은 질문이고 어떤 줄은 단정이며,
 * 길이도 들쭉날쭉하다. 반대로 한 골격을 여섯 번 반복하면 그 자체가 기계 서명이다.
 *
 * headings-seo.prompt 는 이미 "소제목 전부를 같은 문형으로 맞추는 것" 을 금지하고 있다.
 * 그런데도 실측에서 6/6 이 같았다 — 산문 지시는 흘리고, 재는 장치가 있어야 지켜진다.
 *
 * 완전히 균일할 때만 잡는다. 하나라도 예외가 있으면 사람이 쓴 목차의 자연스러운
 * 편차 범위이므로 건드리지 않는다. 경고만 내고 소제목을 고쳐 쓰지 않는다.
 */

export interface HeadingSkeletonReport {
  checked: number;
  /** 모든 소제목이 "앞부분, 뒷부분" 쉼표 골격을 공유한다. */
  uniformComma: boolean;
  /** 모든 소제목이 같은 종결 형태(전부 명사형 또는 전부 질문형)다. */
  uniformEnding: boolean;
  /** 모든 소제목이 숫자로 시작하는 나열을 앞세운다. */
  uniformNumberLead: boolean;
}

/**
 * 판정 하한.
 *
 * 소제목 2~3개는 우연히 같은 꼴이 될 수 있다. 그때 경고를 내면 정상 글을 괴롭힌다.
 * 넷부터는 우연으로 보기 어렵다.
 */
const MIN_HEADINGS = 4;

/**
 * 명사형 종결 — 마지막 어절이 서술어 없이 명사로 끝난다.
 *
 * 마지막 어절만 떼어 본다. 앞에 붙는 글자를 요구하면 "겹치는 구간" 처럼
 * 명사 앞이 공백인 경우를 통째로 놓친다(실측에서 이걸로 6/6 을 못 잡았다).
 */
const ENDING_NOUNS = /(?:것|점|법|편|축|줄|칸|길이|지점|구간|조건|기준|이유|차이|순서|방법|사람|자리|대목|경우|시점|범위|한계|목록|정리)$/u;

function endsWithNoun(heading: string): boolean {
  const lastWord = heading.split(/\s+/u).pop() ?? '';
  return ENDING_NOUNS.test(lastWord);
}

const QUESTION_ENDING = /(?:까|나요|는가|을까|ㄹ까|\?)\s*$/u;

const NUMBER_LEAD = /^[^,]{0,30}\d/u;

function hasCommaSkeleton(heading: string): boolean {
  // "앞부분, 뒷부분" — 쉼표 양쪽에 실질 내용이 있어야 골격이다.
  const at = heading.indexOf(',');
  if (at <= 0) return false;
  return heading.slice(at + 1).trim().length >= 4;
}

export function analyzeHeadingSkeletons(headings: readonly string[] | undefined): HeadingSkeletonReport {
  const list = (headings ?? [])
    .map((heading) => String(heading || '').trim())
    .filter(Boolean);

  if (list.length < MIN_HEADINGS) {
    return { checked: 0, uniformComma: false, uniformEnding: false, uniformNumberLead: false };
  }

  const everyNoun = list.every(endsWithNoun);
  const everyQuestion = list.every((heading) => QUESTION_ENDING.test(heading));

  return {
    checked: list.length,
    uniformComma: list.every(hasCommaSkeleton),
    uniformEnding: everyNoun || everyQuestion,
    uniformNumberLead: list.every((heading) => NUMBER_LEAD.test(heading)),
  };
}

/** 무엇이 같은지 말해준다 — "다양하게 쓰세요" 로는 고칠 수 없다. */
export function describeHeadingSkeletonWarnings(report: HeadingSkeletonReport): string[] {
  if (!report.checked) return [];
  const lines: string[] = [];
  if (report.uniformComma) {
    lines.push(`소제목 ${report.checked}개가 전부 "앞부분, 뒷부분" 쉼표 골격입니다 — 하나는 쉼표 없이 한 문장으로 쓰면 기계 티가 줄어듭니다.`);
  }
  if (report.uniformEnding) {
    lines.push(`소제목 ${report.checked}개의 종결이 전부 같습니다 — 질문형과 단정형을 섞어야 사람이 쓴 목차로 읽힙니다.`);
  }
  if (report.uniformNumberLead) {
    lines.push(`소제목 ${report.checked}개가 전부 숫자를 앞세웁니다 — 수치가 없는 축을 하나쯤 두세요.`);
  }
  return lines;
}
