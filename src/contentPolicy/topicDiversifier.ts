import type {
  ContentPolicyConfig,
  ContentPolicyInput,
  IntentAnalysis,
  RecentPostRecord,
  UniquenessPlan,
} from './types';

const STRUCTURE_BY_ANGLE: Record<string, string> = {
  process: 'step_by_step',
  preparation_checklist: 'decision_checklist',
  cost_factors: 'cost_breakdown',
  storage_and_sorting: 'categorized_guide',
  donation_and_disposal: 'option_matrix',
  legal_and_privacy: 'risk_guide',
  common_mistakes: 'mistake_prevention',
  time_and_scheduling: 'timeline',
  first_party_case: 'case_study',
  faq: 'question_answer',
  local_guide: 'local_resource_guide',
  aftercare: 'follow_up_guide',
};

const FALLBACK_STRUCTURES = [
  'decision_checklist',
  'option_matrix',
  'question_answer',
  'timeline',
  'categorized_guide',
  'risk_guide',
];

function newestFirst(posts: RecentPostRecord[]): RecentPostRecord[] {
  return [...posts].sort((left, right) => {
    const leftTime = left.published_at ? Date.parse(left.published_at) : 0;
    const rightTime = right.published_at ? Date.parse(right.published_at) : 0;
    return rightTime - leftTime;
  });
}

function preferredAngles(intent: IntentAnalysis | undefined): string[] {
  if (!intent) return [];
  const preferred: string[] = [];
  if (intent.type.includes('urgent')) preferred.push('time_and_scheduling', 'preparation_checklist');
  if (intent.type.includes('comparison')) preferred.push('cost_factors', 'donation_and_disposal');
  if (intent.type.includes('aftercare')) preferred.push('aftercare');
  if (intent.type.includes('local')) preferred.push('local_guide');
  if (intent.type.includes('transactional')) preferred.push('preparation_checklist', 'cost_factors');
  return [...new Set(preferred)];
}

function leastUsedAngle(angles: string[], posts: RecentPostRecord[]): string {
  const counts = new Map<string, number>();
  for (const post of posts) counts.set(post.topic_angle, (counts.get(post.topic_angle) ?? 0) + 1);
  return [...angles].sort((left, right) => (counts.get(left) ?? 0) - (counts.get(right) ?? 0))[0];
}

function chooseStructure(angle: string, excluded: Set<string>): string {
  const preferred = STRUCTURE_BY_ANGLE[angle] ?? `${angle}_guide`;
  if (!excluded.has(preferred)) return preferred;
  return FALLBACK_STRUCTURES.find((structure) => !excluded.has(structure)) ?? `${preferred}_variant`;
}

export function buildUniquenessPlan(
  input: ContentPolicyInput,
  config: ContentPolicyConfig,
): UniquenessPlan;
export function buildUniquenessPlan(
  input: ContentPolicyInput,
  intent: IntentAnalysis,
  config: ContentPolicyConfig,
): UniquenessPlan;
export function buildUniquenessPlan(
  input: ContentPolicyInput,
  intentOrConfig: IntentAnalysis | ContentPolicyConfig,
  maybeConfig?: ContentPolicyConfig,
): UniquenessPlan {
  const config = maybeConfig ?? intentOrConfig as ContentPolicyConfig;
  const intent = maybeConfig ? intentOrConfig as IntentAnalysis : undefined;
  const posts = newestFirst(input.recent_posts ?? []);
  const recent = posts.slice(0, config.rotation.exclude_recent_structure_count);
  const recentAngles = new Set(recent.map((post) => post.topic_angle));
  const recentStructures = new Set(recent.map((post) => post.structure_type));
  const configuredAngles = [...config.rotation.topic_angles];
  const orderedCandidates = [
    ...preferredAngles(intent).filter((angle) => configuredAngles.includes(angle)),
    ...configuredAngles,
  ].filter((angle, index, values) => values.indexOf(angle) === index);
  const topicAngle = orderedCandidates.find((angle) => !recentAngles.has(angle))
    ?? leastUsedAngle(configuredAngles, posts);
  const structureType = chooseStructure(topicAngle, recentStructures);
  const differences = [
    `Uses topic angle "${topicAngle}" instead of the recent rotation.`,
    `Uses structure "${structureType}" instead of the recent rotation.`,
  ];

  if (intent?.primary_question) {
    differences.push(`Answers the selected question: ${intent.primary_question}`);
  }

  return {
    topic_angle: topicAngle,
    structure_type: structureType,
    difference_from_recent_posts: differences,
  };
}

export const diversifyTopic = buildUniquenessPlan;
export const createUniquenessPlan = buildUniquenessPlan;
