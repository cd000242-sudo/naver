export type PolicyDecision = 'PASS' | 'REWRITE' | 'BLOCK';

export type IntentType =
  | 'informational'
  | 'local'
  | 'transactional'
  | 'comparison'
  | 'urgent'
  | 'aftercare';

export type SimilarityRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export type ExposureStatus =
  | 'PENDING_INDEX'
  | 'INDEXED'
  | 'MISSING_SUSPECT'
  | 'MISSING_CONFIRMED'
  | 'CHECK_ERROR';

export type ExposureMethod =
  | 'url_access'
  | 'exact_title_search'
  | 'blog_search_tab'
  | 'integrated_search'
  | 'internal_record'
  | 'third_party';

export type ExposureOutcome = 'FOUND' | 'NOT_FOUND' | 'ERROR';

export type PublicationRunState = 'ACTIVE' | 'PAUSED';

export interface SourceMaterial {
  type: 'first_party' | 'official' | 'reference' | 'user_provided';
  title: string;
  content: string;
  url?: string;
  source_id?: string;
}

export interface RecentPostRecord {
  article_id: string;
  title: string;
  intro: string;
  headings: string[];
  body: string;
  topic_angle: string;
  structure_type: string;
  business_facts?: string[];
  related_questions?: string[];
  published_at?: string;
  exposure_status?: ExposureStatus;
  template_id?: string;
  url?: string;
}

export interface ContentPolicyInput {
  primary_keyword: string;
  secondary_keywords?: string[];
  region?: string;
  service?: string;
  target_reader: string;
  search_intent_hint?: string;
  content_goal?: string;
  business_facts: string[];
  source_materials?: SourceMaterial[];
  related_questions?: string[];
  recent_posts?: RecentPostRecord[];
  fixed_disclosures?: string[];
  forbidden_claims?: string[];
  cta?: string;
  template_id?: string;
  account_id?: string;
  blog_id?: string;
}

export interface ArticleHeading {
  title: string;
  content: string;
}

export interface ArticleFaq {
  question: string;
  answer: string;
}

export interface ArticleDraft {
  title: string;
  summary: string;
  introduction: string;
  headings: ArticleHeading[];
  body_markdown: string;
  faq: ArticleFaq[];
  cta: string;
  source_ids?: string[];
}

export interface IntentAnalysis {
  type: IntentType[];
  primary_question: string;
  supporting_questions: string[];
  keyword_intent_mismatch: boolean;
  mismatch_reasons: string[];
}

export interface UniquenessPlan {
  topic_angle: string;
  structure_type: string;
  difference_from_recent_posts: string[];
}

export interface SimilarityReport {
  risk: SimilarityRisk;
  most_similar_article_id: string | null;
  title_jaccard: number;
  intro_ngram_cosine: number;
  body_embedding_cosine: number;
  heading_overlap: number;
  exact_sentence_reuse_ratio: number;
  matched_patterns: string[];
  embedding_model: string;
  compared_post_count: number;
}

export interface QualityReport {
  total_score: number;
  intent_score: number;
  reader_value_score: number;
  originality_score: number;
  first_party_score: number;
  readability_score: number;
  spam_safety_score: number;
  unsupported_claims: string[];
  keyword_intent_mismatch: boolean;
  fatal_errors: string[];
}

export interface PolicyPublicationResult {
  allowed: boolean;
  template_id: string;
  monitor_required: boolean;
  manual_review_required: boolean;
}

export interface PolicyStageTrace {
  stage:
    | 'InputValidator'
    | 'SearchIntentAnalyzer'
    | 'TopicDiversifier'
    | 'OutlineGenerator'
    | 'DraftGenerator'
    | 'SimilarityGuard'
    | 'QualityGate'
    | 'PublishGuard'
    | 'ExposureMonitor';
  status: 'PASS' | 'REWRITE' | 'BLOCK' | 'SKIP';
  reasons: string[];
}

export interface ContentPolicyResult {
  decision: PolicyDecision;
  block_reasons: string[];
  intent: IntentAnalysis;
  uniqueness_plan: UniquenessPlan;
  article: {
    title: string;
    summary: string;
    body_markdown: string;
    faq: ArticleFaq[];
    cta: string;
  };
  quality_report: QualityReport;
  similarity_report: SimilarityReport;
  publication: PolicyPublicationResult;
  rewrite_count: number;
  policy_version: string;
  prompt_version: string;
  model_version: string;
  input_hash: string;
  stage_trace: PolicyStageTrace[];
}

export interface ContentPolicyConfig {
  version: number;
  policy_name: string;
  inputs: {
    required: string[];
    recommended: string[];
  };
  intent: {
    min_score: number;
    answer_within_body_ratio: number;
    allowed_types: IntentType[];
    fatal_mismatch: boolean;
  };
  content: {
    headings_min: number;
    headings_max: number;
    faq_min: number;
    faq_max: number;
    cta_max_count: number;
    fixed_keyword_density: boolean;
    primary_keyword_in_title_max: number;
    prohibit_keyword_stuffing: boolean;
    prohibit_fabricated_firsthand_experience: boolean;
    prohibit_unsupported_prices_and_results: boolean;
  };
  rotation: {
    exclude_recent_structure_count: number;
    topic_angles: string[];
  };
  similarity: {
    compare_recent_posts_min: number;
    compare_recent_posts_recommended: number;
    title_token_jaccard_max: number;
    intro_char_ngram_cosine_max: number;
    exact_sentence_reuse_ratio_max: number;
    body_embedding_cosine_max: number;
    heading_overlap_max: number;
    repeated_opening_window: number;
    repeated_opening_max_occurrences: number;
    rewrite_limit: number;
    whitelist_fields: string[];
  };
  quality_gate: {
    pass_score: number;
    weights: {
      intent_match: number;
      reader_value: number;
      originality: number;
      first_party_information: number;
      readability_and_accuracy: number;
      anti_spam_safety: number;
    };
    fatal_errors: string[];
  };
  publication: {
    require_decision: 'PASS';
    min_interval_minutes_env: string;
    daily_cap_env: string;
    prevent_consecutive_same_template: boolean;
    prevent_consecutive_same_structure: boolean;
    prevent_consecutive_same_angle: boolean;
    disallow_when_paused: boolean;
  };
  monitoring: {
    allowed_statuses: ExposureStatus[];
    minimum_cross_checks: number;
    single_third_party_result_is_not_final: boolean;
    on_first_confirmed_missing: 'PAUSE_SAME_TEMPLATE';
    on_two_consecutive_confirmed_missing: 'PAUSE_ALL';
    auto_delete_on_missing: boolean;
    auto_republish_on_missing: boolean;
    require_root_cause_analysis: boolean;
    require_manual_test_before_resume: boolean;
  };
  logging: {
    required_fields: string[];
  };
}

export interface ExposureCheck {
  method: ExposureMethod;
  outcome: ExposureOutcome;
  checked_at: string;
  details?: string;
}

export interface MonitoredPublication {
  article_id: string;
  title: string;
  blog_id?: string;
  primary_keyword?: string;
  template_id: string;
  structure_type: string;
  topic_angle: string;
  published_at: string;
  exposure_status: ExposureStatus;
  exposure_checks: ExposureCheck[];
}

export interface PublicationHistoryEntry {
  article_id: string;
  account_id: string;
  published_at: string;
  template_id: string;
  structure_type: string;
  topic_angle: string;
  exposure_status?: ExposureStatus;
}

export interface PublicationState {
  status: PublicationRunState;
  pause_reason?: string;
  paused_at?: string;
  pause_incident?: {
    article_id: string;
    blog_id?: string;
    primary_keyword?: string;
    template_id: string;
    structure_type: string;
    detected_at: string;
  };
  resume_approval?: {
    approved_by: string;
    approved_at: string;
    root_cause_reviewed: boolean;
    manual_test_verified: boolean;
    manual_test_article_id?: string;
  };
  manual_test_evidence?: {
    article_id: string;
    incident_article_id?: string;
    blog_id: string;
    primary_keyword: string;
    url: string;
    title: string;
    verified_at: string;
    passed: boolean;
    checks: ExposureCheck[];
  };
  paused_templates: string[];
  paused_structures: string[];
  confirmed_missing_streak: number;
  history: PublicationHistoryEntry[];
}

export type RecentPostsLoadResult =
  | { ok: true; posts: RecentPostRecord[]; source: string }
  | { ok: false; code: 'RECENT_POSTS_UNAVAILABLE' | 'RECENT_POSTS_CORRUPT'; message: string };

export interface AuditRecord {
  article_id: string;
  primary_keyword?: string;
  primary_question?: string;
  source_ids?: string[];
  account_id?: string;
  blog_id?: string;
  created_at: string;
  input_hash: string;
  selected_intent: IntentType[];
  topic_angle: string;
  structure_type: string;
  template_id: string;
  similarity_scores: SimilarityReport;
  quality_score: number;
  quality_scores?: QualityReport;
  unsupported_claims?: string[];
  rewrite_count: number;
  decision: PolicyDecision;
  block_reasons: string[];
  prompt_version: string;
  model_version: string;
  policy_version: string;
  publish_time?: string;
  exposure_status?: ExposureStatus;
  exposure_checks?: ExposureCheck[];
  exposure_check_methods?: ExposureMethod[];
  exposure_checked_at?: string;
  pause_reason?: string;
  resume_approval?: PublicationState['resume_approval'];
  root_cause_analysis?: {
    category: string;
    conclusive: boolean;
    analyzed_at: string;
    findings?: Array<{ signal: string; status: string; details: string }>;
    recommended_changes?: string[];
  };
}
