/**
 * SPEC-NAVER-IMAGE-2026 — what each section role asks the image model to compose.
 *
 * The role decides arrangement and camera only. The facts (who, what, where) keep coming from the
 * section evidence in the contextual brief, so a role can never invent content.
 */
import type { ArticleVisualKind, SectionVisualRole } from './sectionRolePlanner.js';

export interface RoleDirective {
  /** Korean label for logs. */
  readonly label: string;
  /** How the frame is arranged for this role. */
  readonly composition: string;
  /** Camera line; replaces the ordinal rotation for this section. */
  readonly camera: string;
}

export const ROLE_DIRECTIVES: Readonly<Record<SectionVisualRole, RoleDirective>> = Object.freeze({
  scene: {
    label: '실제 장면',
    composition: 'the actual moment this section describes, in its real place; any people are small in the frame, seen from behind or in profile, never posing for the camera',
    camera: 'Camera: eye-level candid documentary framing, environmental context, available light.',
  },
  comparison: {
    label: '비교',
    composition: 'the two things being compared placed left and right in one frame at the same scale and under the same light, objects only, no people',
    camera: 'Camera: straight-on medium shot, even soft light, plain real surface behind the objects.',
  },
  closeup: {
    label: '클로즈업',
    composition: 'one decisive object or document detail from this section filling most of the frame; hands may hold it, no faces',
    camera: 'Camera: tight macro detail shot, shallow depth of field, soft diffused light.',
  },
  procedure: {
    label: '행동·절차',
    composition: 'the concrete step being done: hands resting on or holding the relevant object in a still grip, seen over the shoulder, no face visible',
    camera: 'Camera: over-the-shoulder perspective, mid-distance, natural window light.',
  },
  criteria: {
    label: '선택 기준',
    composition: 'the options or items the reader must choose between, laid out neatly with space between them on a real table surface, no people',
    camera: 'Camera: top-down flat-lay composition, even lighting.',
  },
  place: {
    label: '장소',
    composition: 'the specific place or setting of this section shown wide so its layout is readable, no person in focus',
    camera: 'Camera: wide-angle establishing view, deep depth of field, ambient light.',
  },
  problem: {
    label: '문제 상황',
    composition: 'the problem itself shown plainly (the damage, the rejected paper, the tense setting) with faces out of frame',
    camera: 'Camera: eye-level medium shot, muted natural light.',
  },
});

/** The owner's complaint in one line: the default subjects that make a whole set read as AI. */
export const ANTI_CLICHE_LINE =
  'Do not default to a person using a laptop, smartphone, or tablet, or to a product on a plain studio backdrop, unless this section is literally about that device or product.';

/** Replaces random stylised lighting and colour rotations for role-planned realistic images. */
export const REALISM_LINE =
  'Look like an unedited real photo: natural light, true-to-life colour, slightly imperfect framing, lived-in real Korean setting; no studio gloss, no HDR glow, no neon, no oversaturation, no tilt-shift.';

/** V1 §16: a regeneration must change the composition — each role's second camera. */
export const ROLE_ALT_CAMERA: Readonly<Record<SectionVisualRole, string>> = Object.freeze({
  scene: 'Camera: lower over-the-shoulder candid view, available light.',
  comparison: 'Camera: top-down view of both items side by side, even light.',
  closeup: 'Camera: close three-quarter angle on the detail, soft side light.',
  procedure: 'Camera: first-person view looking down at the hands and the object, natural light.',
  criteria: 'Camera: angled tabletop view at about 45 degrees, even light.',
  place: 'Camera: eye-level medium-wide view along the path or entrance, ambient light.',
  problem: 'Camera: low close angle on the problem detail, muted light.',
});

/** V1 §12, §21, §22: what each article kind must not do in its section images. */
export const KIND_CONSTRAINT: Readonly<Record<ArticleVisualKind, string>> = Object.freeze({
  issue: 'This story is about real, named people: do not depict them or any lookalike; show places, objects, documents or symbolic details, and keep any person small, from behind and unidentifiable.',
  info: "No clichés: no coin piles, cash stacks, piggy banks, judge's gavel, or a calculator on money, and no umbrella-over-family insurance scenes, neon circuit-board or hologram IT backgrounds, or stacks of banknotes for a subsidy; show the actual forms, screens, calendars or items this section is about.",
  travel: 'Do not invent landmarks, buildings or flower fields the section does not describe; keep the real place plausible, with no tourism-poster styling.',
  product: "Keep the real product's design, colour and proportions; do not redesign it or invent variants.",
  auto: 'Show the actual vehicle, part, dashboard, charging hardware, or price comparison this section is about; do not default to a generic car driving on a road or a car parked in front of scenery; vary exterior, interior and detail views across sections; do not invent badges, model names or specs absent from the article.',
});

export const REGENERATION_LINE = 'This is a regeneration: change the composition from the previous attempt — a different distance, angle and subject size.';

/** English name for each role, used only in the previous-images note (ROLE_DIRECTIVES.label is Korean). */
const ROLE_ENGLISH_LABEL: Readonly<Record<SectionVisualRole, string>> = Object.freeze({
  scene: 'real scene',
  comparison: 'comparison',
  closeup: 'closeup',
  procedure: 'procedure',
  criteria: 'criteria layout',
  place: 'place',
  problem: 'problem scene',
});

/**
 * V1 extension: tells the model what earlier sections in this same post already showed, so a later
 * section does not repeat the same device/desk/car angle even when it happens to share a role with an
 * earlier one. Pure and deterministic — `previousRoles` comes from the planner, never a model call.
 */
export function buildPreviousImagesLine(previousRoles: readonly SectionVisualRole[]): string | null {
  if (!previousRoles || previousRoles.length === 0) return null;
  // De-duplicate while keeping first-seen order so the sentence stays readable on longer articles.
  const labels = Array.from(new Set(previousRoles.map((role) => ROLE_ENGLISH_LABEL[role])));
  return `Earlier images in this post already used: ${labels.join(', ')}. Use a different subject, framing, distance and background from those; do not repeat the same device, desk, car angle or road shot.`;
}

/** Brief payload for one section — plain strings, so the brief module stays import-free. */
export interface BriefVisualRole {
  readonly name: SectionVisualRole;
  readonly composition: string;
  readonly camera: string;
  readonly constraints: readonly string[];
}

export function toBriefVisualRole(
  role: SectionVisualRole,
  options: {
    realistic: boolean;
    kind?: ArticleVisualKind;
    regenerate?: boolean;
    /** V1 extension: roles already used earlier in this article, oldest first. */
    previousRoles?: readonly SectionVisualRole[];
  },
): BriefVisualRole {
  const directive = ROLE_DIRECTIVES[role];
  const previousImagesLine = options.previousRoles && options.previousRoles.length > 0
    ? buildPreviousImagesLine(options.previousRoles)
    : null;
  return {
    name: role,
    composition: directive.composition,
    camera: options.regenerate ? ROLE_ALT_CAMERA[role] : directive.camera,
    constraints: [
      ANTI_CLICHE_LINE,
      ...(options.realistic ? [REALISM_LINE] : []),
      ...(options.kind ? [KIND_CONSTRAINT[options.kind]] : []),
      ...(options.regenerate ? [REGENERATION_LINE] : []),
      ...(previousImagesLine ? [previousImagesLine] : []),
    ],
  };
}

/**
 * Engines whose own camera/colour rotation is switched off when a role is planned. Only OpenAI sends
 * the brief (with the role lines) to the model. DeepInfra and Leonardo swap the brief for a short
 * English wrapper whenever the translated hint is usable (buildSafeEnglishProviderImagePrompt), which
 * drops the role — switching their rotation off too would leave no camera direction at all.
 */
export function engineHonorsVisualRole(provider: string | undefined): boolean {
  return /openai|gpt-image/u.test(String(provider || '').trim().toLowerCase());
}

export function isRealisticImageStyle(style: unknown): boolean {
  const value = String(style || '').trim().toLowerCase();
  return value === '' || value === 'realistic';
}
