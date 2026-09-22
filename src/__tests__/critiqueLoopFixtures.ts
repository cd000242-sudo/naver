// [2026-09-22 Critique Loop] Shared offline fixtures + scripted routes for the loop tests ($0).
import type { StructuredContent } from '../contentGenerator';
import type { SourceDocument } from '../content/sourceDocument';
import type { QualityRoute } from '../quality/critique/types';
import type { LoopStage } from '../quality/critique/loopContext';

export const S1_TEXT = '청년도약계좌는 만 19세부터 34세까지 가입할 수 있고, 총급여 7,500만원 이하 요건을 봅니다. 병역을 이행했다면 최대 6년까지 연령 계산에서 뺍니다.';
export const S2_TEXT = '납입은 월 최대 50만원까지 자유롭게 할 수 있습니다. 정부기여금은 일반형 6%, 우대형 12%가 붙습니다. 이 구조는 단순한 편이라 처음 보는 분도 금방 이해합니다.';
export const S3_TEXT = '2차 모집은 10월 7일부터 16일까지 접수합니다. 은행 앱에서 신청하고 소득 확인은 국세청 자료로 이뤄집니다.';
export const S4_TEXT = '기존 계좌를 먼저 해지하면 혜택이 사라질 수 있습니다. 갈아타기는 신규 계좌 개설 뒤에 기존 계좌를 정리하는 순서가 안전합니다.';

export function policyArticle(overrides: Partial<StructuredContent> = {}): StructuredContent {
  const headings = [
    { title: '누가 가입할 수 있나', content: S1_TEXT, summary: '', keywords: [], imagePrompt: '' },
    { title: '납입 한도와 정부기여금', content: S2_TEXT, summary: '', keywords: [], imagePrompt: '' },
    { title: '2차 신청 기간과 방법', content: S3_TEXT, summary: '', keywords: [], imagePrompt: '' },
    { title: '갈아타기 순서', content: S4_TEXT, summary: '', keywords: [], imagePrompt: '' },
  ];
  const introduction = '청년도약계좌 조건이 헷갈리는 이유는 나이·소득·신청 기간이 한꺼번에 나오기 때문입니다. 세 가지를 순서대로 정리합니다.';
  const conclusion = '조건을 먼저 확인하고 기간 안에 신청하는 것이 핵심입니다.';
  const bodyPlain = [introduction, ...headings.map((h) => `${h.title}\n\n${h.content}`), conclusion].join('\n\n');
  return {
    status: 'success', generationTime: '0', selectedTitle: '2026 청년도약계좌 조건, 3년 만기에 정부기여금 최대 12%',
    titleAlternatives: [], titleCandidates: [], bodyHtml: '', bodyPlain, headings, hashtags: ['청년도약계좌', '청년도약계좌조건', '재테크'],
    images: [], metadata: {} as never, quality: {} as never, introduction, conclusion,
    cta: { text: '조건이 맞는지 은행 앱에서 확인해 보세요.' },
    ...overrides,
  } as StructuredContent;
}

export function policyDocuments(): SourceDocument[] {
  const body = '청년도약계좌는 만 19세부터 34세까지 가입할 수 있으며 총급여 7,500만원 이하 요건을 봅니다. 병역 이행 시 최대 6년까지 연령 계산에서 제외합니다. '
    + '월 최대 50만원까지 납입할 수 있고 정부기여금은 일반형 6%, 우대형 12%입니다. 2차 모집은 10월 7일부터 16일까지 접수합니다. 소득 확인은 국세청 2025년 확정소득 기준입니다. '
    + '가입기간은 3년이며 만기 시 이자소득 비과세 혜택이 있습니다. 서민금융진흥원에 따르면 기존 계좌 해지 후 신규 가입 시 혜택이 소멸될 수 있습니다.';
  return [
    { id: 'S01', title: '2026 청년도약계좌 2차 모집 안내', sourceType: 'news' as never, sourceName: '서민금융진흥원', domain: 'kinfa.or.kr', url: 'https://kinfa.or.kr/notice/1', pubDate: '2026-09-20', dateStatus: 'KNOWN', body, sourceTier: 'OFFICIAL' as never, relevance: { accepted: true, score: 0.9 } },
    { id: 'S02', title: '청년도약계좌 갈아타기 후기', sourceType: 'blog' as never, sourceName: '네이버 블로그', domain: 'blog.naver.com', url: 'https://blog.naver.com/x/1', pubDate: '2026-09-21', dateStatus: 'KNOWN', body: '갈아타기는 신규 계좌를 먼저 만들고 기존 계좌를 정리하는 순서가 안전합니다. 먼저 해지하면 정부기여금이 날아갑니다.', sourceTier: 'BLOG' as never, relevance: { accepted: true, score: 0.8 } },
  ];
}

export type StageScript = Partial<Record<LoopStage, (prompt: string, callIndex: number) => string>>;

export interface ScriptedRoutes {
  readonly resolveRoute: (stage: LoopStage) => Promise<QualityRoute | null>;
  readonly calls: Array<{ stage: LoopStage; prompt: string }>;
}

export const PASS_JSON = JSON.stringify({ status: 'PASS', issues: [], researchQueries: [] });
export const JUDGE_PASS = JSON.stringify({ decision: 'PASS', blockingIssues: [], advisory: [] });

/** Routes whose answers are scripted per stage; unlisted stages answer PASS / judge PASS. */
export function scriptedRoutes(script: StageScript, missing: LoopStage[] = []): ScriptedRoutes {
  const calls: Array<{ stage: LoopStage; prompt: string }> = [];
  const perStage = new Map<LoopStage, number>();
  return {
    calls,
    resolveRoute: async (stage) => {
      if (missing.includes(stage)) return null;
      return {
        engine: 'fake-engine', subscription: true,
        callModel: async (prompt: string) => {
          calls.push({ stage, prompt });
          const n = perStage.get(stage) ?? 0;
          perStage.set(stage, n + 1);
          const fn = script[stage];
          if (fn) return fn(prompt, n);
          return stage === 'judge' ? JUDGE_PASS : PASS_JSON;
        },
      };
    },
  };
}

export const stagesOf = (routes: ScriptedRoutes): LoopStage[] => routes.calls.map((c) => c.stage);
