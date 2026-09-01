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
  /** 모든 소제목이 같은 낱말로 시작한다면 그 낱말. 아니면 빈 문자열. */
  sharedPrefix: string;
  /** 어미 없이 끊긴 소제목들. */
  incomplete: string[];
}

/**
 * 판정 하한.
 *
 * 소제목 2개는 우연히 같은 꼴이 될 수 있다. 셋부터는 우연으로 보기 어렵다.
 *
 * [2026-09-01] 4 -> 3. 사장님이 준 자취방 인테리어 글은 소제목이 3개였고 셋 다
 * 같은 골격이었는데, 하한이 4라 감지기가 침묵했다. 제목까지 세면 4개지만
 * 제목이 없는 호출 경로도 있어 하한 자체를 내린다.
 */
const MIN_HEADINGS = 3;

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

/*
 * [2026-09-01 실측] 소제목 4개가 전부 "추석" 으로 시작했다. 둘은 문법적으로 붙지도
 * 않는다("추석 성에가"). 키워드를 앞에 박느라 말이 무너진 자리다.
 * human-writing-anti-pattern 이 이미 금지했는데도 4/4 였다 — 재는 장치가 필요하다.
 */
function findSharedPrefix(list: readonly string[]): string {
  const firsts = list.map((h) => h.split(/\s+/u)[0] ?? '');
  const head = firsts[0];
  if (!head || head.length < 2) return '';
  return firsts.every((word) => word === head) ? head : '';
}

/*
 * 말이 끊긴 소제목. 마지막 어절이 어미 없이 어간으로 끝나면 문장이 완성되지 않은 것이다.
 * "…자리와 남겨" 처럼 저비용 모델에서 나오는 마무리 붕괴를 잡는다.
 * 명사로 끝나는 소제목은 정상이므로, 용언 어간으로 끝나는 경우만 본다.
 */
const VERB_STEM_TAIL = /(?:겨|여|어|아|워|러)$/u;
const SAFE_NOUN_TAIL = /(?:것|점|법|편|축|줄|칸|자리|순서|주기|기준|조건|이유|차이|방법|사람|구간|지점|일|때|곳|글|수|중|후|전|용기|용량)$/u;

function isIncompleteHeading(heading: string): boolean {
  const last = heading.split(/\s+/u).pop() ?? '';
  if (!last || last.length < 2) return false;
  if (SAFE_NOUN_TAIL.test(last)) return false;
  return VERB_STEM_TAIL.test(last);
}

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
    return {
      checked: 0, uniformComma: false, uniformEnding: false, uniformNumberLead: false,
      sharedPrefix: '', incomplete: [],
    };
  }

  const everyNoun = list.every(endsWithNoun);
  const everyQuestion = list.every((heading) => QUESTION_ENDING.test(heading));

  return {
    checked: list.length,
    uniformComma: list.every(hasCommaSkeleton),
    uniformEnding: everyNoun || everyQuestion,
    uniformNumberLead: list.every((heading) => NUMBER_LEAD.test(heading)),
    sharedPrefix: findSharedPrefix(list),
    incomplete: list.filter(isIncompleteHeading),
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
  if (report.sharedPrefix) {
    lines.push(`소제목 ${report.checked}개가 전부 "${report.sharedPrefix}" 로 시작합니다 — 주제어를 모든 소제목에 박으면 기계가 쓴 목차로 읽힙니다.`);
  }
  for (const heading of report.incomplete) {
    lines.push(`소제목의 말이 끊겼습니다: "${heading}"`);
  }
  return lines;
}
