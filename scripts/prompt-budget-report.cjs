#!/usr/bin/env node
/*
 * prompt-budget-report.cjs — segment a live writer prompt (C-final-prompt.txt) into
 * named blocks and report chars / ~tokens / share / classification per block.
 *
 * Usage:
 *   node scripts/prompt-budget-report.cjs <path-to-C-final-prompt.txt> [--all] [--json]
 *
 *   --all   also print the minor (folded) sub-blocks under each major block
 *   --json  emit the block table as JSON instead of text
 *
 * Plain Node (CommonJS). No Electron, no repo imports — safe to run anywhere.
 *
 * Segmentation is derived from the headings actually present in the file:
 *   - "## ..." markdown headings
 *   - "[LABEL] ..." bracket headings, optionally prefixed by an emoji (🛑 🎯 📌 ...)
 *   - ALL-CAPS contract lines ("SEO 90+ QUALITY CONTRACT")
 *   - the bare "{" that opens the JSON output schema
 *   - "[자료 Sxx]" source-document sub-blocks inside the 📄 [원본 본문] region
 * Bracket headings that belong to a container section (e.g. [ES-1] under
 * 🎯 [노출·인용 구조], [롱테일 공식] under [SECTION 3]) are folded into the
 * enclosing major block unless they are listed in MAJOR_LABELS.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CHARS_PER_TOKEN = 1.7; // Korean-heavy text; ~1.7 chars per token

// ─── heading detection ───────────────────────────────────────────────────────

const SEPARATOR_RE = /^[═━─=\-]{6,}\s*$/;
// bullet glyphs used inside blocks (★ ⛔ ✅ ❌ ※ …) — never a heading prefix
const BULLET_PREFIX_RE = /^[★☆⛔✅❌⭕※•·\-–—□■▶→·]/;
const MD_HEADING_RE = /^#{1,3}\s+\S/;
const EMOJI_PREFIX_RE = /^(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}️‍]+\s*)+/u;
const BRACKET_HEADING_RE = /^\[[^\]\n]{2,80}\]/;
const ALLCAPS_CONTRACT_RE = /^[A-Z][A-Z0-9 +\-]{6,}(CONTRACT|OVERRIDE|RULES)\s*$/;
const SOURCE_DOC_RE = /^\[자료 S\d+\]/;
const SOURCE_REGION_START_RE = /\[원본 본문 — 아래 내용을 바탕으로 작성하라\]/;
const SOURCE_REGION_END_RE = /\[최종 강제 조건/;
const USER_MARKER = '[원본 텍스트]';

// Bracket headings that are always their own major block (even without emoji).
const MAJOR_LABELS = [
  /^\[SECTION/, /^\[OFFICIAL NAVER/, /^\[HEADINGS:/, /^\[BRIEF-HEAD\]/, /^\[HASHTAG\]/,
  /^\[ANGLE\]/, /^\[HUMAN WRITING/, /^\[STYLE OVERRIDE:/, /^\[MODE VOICE/, /^\[BLOGGER IDENTITY/,
  /^\[원본 제목 활용/, /^\[출력 형식/, /^\[원본 텍스트\]/, /^\[설계도/, /^\[당사자 발언/, /^\[핵심 사실/,
  /^\[VOICE PROFILE/, /^\[SITUATION DEPTH/, /^\[TITLE —/, /^\[TITLE\]/, /^\[EVIDENCE AND INTENT/,
  /^\[1회 완성/, /^\[RUNTIME RETRY/, /^\[최종 강제/, /^\[필수 키워드/, /^\[원본 본문/, /^\[참고 지표/,
  /^\[HOMEFEED BASE/, /^\[GAMMA-7\]/, /^\[STRUCTURE\]/, /^\[MOBILE\]/, /^\[RETENTION\]/, /^\[FINAL CHECK\]/,
  /^\[홈판 제목 제약/, /^\[홈판 모드 제목/, /^\[SEO 모드 제목/, /^\[네이버 메이트 모드 제목/, /^\[쇼핑커넥트 (최종|제목 필수)/,
  /^\[검증된 노출/, /^\[제목 약속/, /^\[QualityGate/, /^\[Quality Gate/, /^\[홈판 상위노출/, /^\[표 설정/,
  /^\[STRUCTURE OVERRIDE/, /^\[이전 작성 제목/, /^\[업체 정보/, /^\[사용자 추가 지시/, /^\[AFFILIATE/,
  /^\[근거 메타/, /^\[사용자 후킹/, /^\[GEO\/AEO/, /^\[모바일 우선/, /^\[노출·인용 구조/, /^\[상황-공감 깊이/,
  /^\[모든 모드/, /^\[근거 인용/, /^\[소제목 스타일/, /^\[이미지 프롬프트/, /^\[SEO 제목 생성/,
  /^\[홈판 모드 필수/, /^\[SEO 모드 필수/, /^\[공통 구조 규칙/, /^\[네이버 메이트 모드 필수/,
  /^\[홈판 추가\]/, /^\[Article Content\]/, /^\[팩트 규율/, /^\[FACT-CHECK/, /^\[실존인물/, /^\[공공정보/,
];

function stripEmoji(line) {
  return line.replace(EMOJI_PREFIX_RE, '').trim();
}

/** Returns {level:'major'|'minor'|'source-doc'|'user-marker', name} or null. */
function detectHeading(line, inSourceRegion) {
  const raw = line.replace(/\r$/, '');
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (inSourceRegion) {
    if (SOURCE_DOC_RE.test(trimmed)) return { level: 'source-doc', name: trimmed.slice(0, 60) };
    if (SOURCE_REGION_END_RE.test(trimmed)) return { level: 'major', name: stripEmoji(trimmed) };
    return null;
  }
  if (BULLET_PREFIX_RE.test(trimmed)) return null;
  if (trimmed === USER_MARKER) return { level: 'user-marker', name: USER_MARKER };
  if (trimmed === '{') return { level: 'major', name: '{ JSON output schema }' };
  if (MD_HEADING_RE.test(trimmed)) return { level: 'major', name: trimmed.replace(/^#+\s*/, '') };
  if (ALLCAPS_CONTRACT_RE.test(trimmed)) return { level: 'major', name: trimmed };

  const hasEmoji = EMOJI_PREFIX_RE.test(trimmed);
  const body = stripEmoji(trimmed);
  if (!BRACKET_HEADING_RE.test(body)) return null;
  // "[A] + [B] + [C]" formula lines are not headings
  if (/\]\s*\+\s*\[/.test(body)) return null;
  // "[TITLE_1] ..." output tokens, "[YYYY-MM-DD 작성]" examples are not headings
  if (/^\[(TITLE_\d|YYYY)/.test(body)) return null;
  // "[홈판 제목 제약]은 제목 보조 규칙이며…" — a sentence referring to a block, not a heading
  if (/^\[[^\]]+\](은|는|이|가|을|를|의|도)\s/.test(body)) return null;

  const isMajor = hasEmoji || MAJOR_LABELS.some((re) => re.test(body));
  return { level: isMajor ? 'major' : 'minor', name: body };
}

// ─── classification ──────────────────────────────────────────────────────────

// First match wins — order matters (specific labels before generic keywords).
const CLASS_RULES = [
  ['SOURCE_MATERIAL', /^\[자료 S|원본 본문|설계도|당사자 발언|핵심 사실|Article Content/],
  ['OTHER', /RUNTIME RETRY|QualityGate|Quality Gate|제목 약속 미이행|참고 지표|preamble/],
  ['OUTPUT_FORMAT', /출력 형식|JSON output schema|이미지 프롬프트|근거 인용|모든 모드 — 제목보다|소제목 스타일|최종 강제 조건|원본 텍스트|모든 모드 공통: 표|모드 필수 규칙|모드 필수 구조|공통 구조 규칙|표 설정|STRUCTURE OVERRIDE|1회 완성|FINAL SELF-CORRECTION|FINAL CHECK\]/],
  ['CORE_FACT_RULES', /SECTION -2|SECTION 1\]|Anti-Hallucination|팩트 규율|EVIDENCE AND INTENT|FACT-CHECK|근거 메타|실존인물|공공정보|충실도/],
  ['STYLE_RULES', /STYLE OVERRIDE|MODE VOICE|BLOGGER IDENTITY|HUMAN WRITING|VOICE PROFILE|SECTION 10|\[ANGLE\] 같은/],
  ['HOMEFEED_RULES', /홈판 제목 제약|홈판 모드|홈판 상위노출|HOMEFEED|homefeed|GAMMA-7|\[STRUCTURE\]|\[MOBILE\]|\[RETENTION\]|HEADINGS: 홈판|\[ANGLE\] 소재|\[TITLE\] 제목/],
  ['TITLE_RULES', /(?<!소)제목|TITLE|검증된 노출|SECTION 11/],
  ['FAQ_RULES', /FAQ|검색 종결 Q&A/],
  ['CTA_RULES', /CTA|결론부|SECTION 8/],
  ['RETENTION_RULES', /체류|상황-공감 깊이|SITUATION DEPTH|도입부 설계|SECTION 5/],
  ['SEO_RULES', /SEO|검색 의도|SECTION -1|SECTION 0|SECTION 3|SECTION 4|SECTION 7|롱테일|키워드|GEO\/AEO|노출·인용 구조|HEADINGS: SEO|BRIEF-HEAD|해시태그|HASHTAG|AI 탭/],
  ['NAVER_RULES', /OFFICIAL NAVER|네이버|스마트블록|C-Rank|DIA|QUMA|본문 구조 \+ 소제목|SECTION 6|SECTION 12|서식|모바일 우선/],
  ['PROHIBITIONS', /금지|블랙리스트|AI 탐지|SECTION 9|ANTI-PATTERN|탈락/],
  ['STYLE_RULES', /어미|톤|말투|문체|리듬|관점/],
];

function classify(name) {
  for (const [tag, re] of CLASS_RULES) if (re.test(name)) return tag;
  return 'OTHER';
}

// ─── segmentation ────────────────────────────────────────────────────────────

function segment(text) {
  const lines = text.split('\n');
  const blocks = []; // {name, level, startLine, endLine, chars, tag, part:'system'|'user', subs:[]}
  let current = null;
  let inSource = false;
  let part = 'system';
  let sourceRegionStart = -1;
  let sourceRegionEnd = -1;
  let dedupe = new Map();

  const open = (name, level, lineIdx) => {
    // separator lines immediately before a heading belong to the new block
    let start = lineIdx;
    while (start > 0 && SEPARATOR_RE.test(lines[start - 1]) && (current == null || start - 1 > current.startLine)) start -= 1;
    if (current) { current.endLine = start - 1; }
    const n = (dedupe.get(name) || 0) + 1;
    dedupe.set(name, n);
    current = {
      name: n > 1 ? `${name} #${n}` : name,
      level,
      startLine: start,
      endLine: lines.length - 1,
      part,
      subs: [],
    };
    blocks.push(current);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inSource && SOURCE_REGION_START_RE.test(line)) { inSource = true; sourceRegionStart = i; }
    const h = detectHeading(line, inSource);
    if (!h) { if (!current) open('(preamble)', 'major', i); continue; }
    if (inSource && h.level === 'major') { inSource = false; sourceRegionEnd = i - 1; }
    if (h.level === 'user-marker') { part = 'user'; open(h.name, 'major', i); continue; }
    if (h.level === 'major') { open(h.name, 'major', i); continue; }
    if (h.level === 'source-doc') {
      if (!current || !/원본 본문|자료 S/.test(current.name)) open('📄 [원본 본문]', 'major', i);
      current.subs.push({ name: h.name, startLine: i, endLine: lines.length - 1 });
      continue;
    }
    // minor: fold into current major
    if (!current) { open(h.name, 'major', i); continue; }
    current.subs.push({ name: h.name, startLine: i, endLine: lines.length - 1 });
  }

  const sliceChars = (a, b) => lines.slice(a, b + 1).join('\n').length;
  for (const b of blocks) {
    b.chars = sliceChars(b.startLine, b.endLine);
    b.tag = classify(b.name);
    for (let k = 0; k < b.subs.length; k += 1) {
      const s = b.subs[k];
      s.endLine = k + 1 < b.subs.length ? b.subs[k + 1].startLine - 1 : b.endLine;
      s.chars = sliceChars(s.startLine, s.endLine);
    }
  }

  // raw source docs = every [자료 Sxx] sub-block
  const rawSourceChars = blocks
    .filter((b) => /원본 본문/.test(b.name))
    .flatMap((b) => b.subs)
    .reduce((acc, s) => acc + s.chars, 0);
  // blueprint / derived summary (설계도 + 당사자 발언 + 핵심 사실)
  const derivedChars = blocks
    .filter((b) => /^\[(설계도|당사자 발언|핵심 사실)/.test(b.name))
    .reduce((acc, b) => acc + b.chars, 0);

  return { lines, blocks, rawSourceChars, derivedChars, sourceRegionStart, sourceRegionEnd, total: text.length };
}

// ─── report ──────────────────────────────────────────────────────────────────

function pad(s, n, right) {
  s = String(s);
  // crude East-Asian width: count Hangul/CJK as 2 columns
  const w = [...s].reduce((a, ch) => a + (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1), 0);
  const fill = Math.max(0, n - w);
  return right ? ' '.repeat(fill) + s : s + ' '.repeat(fill);
}
const fmt = (n) => n.toLocaleString('en-US');
const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '-');

function printTable(seg, opts) {
  const { blocks, rawSourceChars, derivedChars, total } = seg;
  const instructionChars = total - rawSourceChars;
  const instructionExDerived = instructionChars - derivedChars;

  console.log(`FILE: ${opts.file}`);
  console.log(`total chars ${fmt(total)} | lines ${fmt(seg.lines.length)} | ~tokens ${fmt(Math.round(total / CHARS_PER_TOKEN))}`);
  console.log('');
  const head = `${pad('#', 3, true)} ${pad('part', 6)} ${pad('block', 62)} ${pad('chars', 8, true)} ${pad('~tok', 7, true)} ${pad('%instr', 7, true)}  tag`;
  console.log(head);
  console.log('-'.repeat(head.length + 10));
  blocks.forEach((b, i) => {
    const isRaw = /원본 본문/.test(b.name);
    const share = isRaw ? '-' : pct(b.chars, instructionChars);
    const name = b.name.length > 60 ? b.name.slice(0, 59) + '…' : b.name;
    console.log(`${pad(i + 1, 3, true)} ${pad(b.part, 6)} ${pad(name, 62)} ${pad(fmt(b.chars), 8, true)} ${pad(fmt(Math.round(b.chars / CHARS_PER_TOKEN)), 7, true)} ${pad(share, 7, true)}  ${b.tag}  (L${b.startLine + 1}-${b.endLine + 1})`);
    if (opts.all && b.subs.length) {
      for (const s of b.subs) {
        const sn = s.name.length > 56 ? s.name.slice(0, 55) + '…' : s.name;
        console.log(`${pad('', 3)} ${pad('', 6)}   └ ${pad(sn, 57)} ${pad(fmt(s.chars), 8, true)} ${pad(fmt(Math.round(s.chars / CHARS_PER_TOKEN)), 7, true)} ${pad(isRaw ? '-' : pct(s.chars, instructionChars), 7, true)}  (L${s.startLine + 1}-${s.endLine + 1})`);
      }
    }
  });

  console.log('');
  console.log('── totals by tag ──');
  const byTag = new Map();
  for (const b of blocks) byTag.set(b.tag, (byTag.get(b.tag) || 0) + b.chars);
  [...byTag.entries()].sort((a, b) => b[1] - a[1]).forEach(([tag, c]) => {
    const share = tag === 'SOURCE_MATERIAL' ? '-' : pct(c, instructionChars);
    console.log(`  ${pad(tag, 18)} ${pad(fmt(c), 8, true)} chars  ${pad(fmt(Math.round(c / CHARS_PER_TOKEN)), 7, true)} tok  ${pad(share, 7, true)} of instruction`);
  });

  console.log('');
  console.log('── instruction vs source ──');
  console.log(`  raw source docs ([자료 Sxx])          : ${fmt(rawSourceChars)} chars (~${fmt(Math.round(rawSourceChars / CHARS_PER_TOKEN))} tok)`);
  console.log(`  blueprint/derived (설계도·발언·사실) : ${fmt(derivedChars)} chars`);
  console.log(`  instruction (total − raw source)     : ${fmt(instructionChars)} chars (~${fmt(Math.round(instructionChars / CHARS_PER_TOKEN))} tok)  ← matches meta.instructionChars definition`);
  console.log(`  instruction excluding blueprint      : ${fmt(instructionExDerived)} chars`);
  console.log(`  ratio instruction : raw source       = ${(instructionChars / Math.max(1, rawSourceChars)).toFixed(2)} : 1`);
  console.log(`  ratio instr(ex-blueprint) : source+bp = ${(instructionExDerived / Math.max(1, rawSourceChars + derivedChars)).toFixed(2)} : 1`);
  const sys = blocks.filter((b) => b.part === 'system').reduce((a, b) => a + b.chars, 0);
  const usr = total - sys;
  console.log(`  system part (before [원본 텍스트])    : ${fmt(sys)} chars | user part: ${fmt(usr)} chars (instruction inside user part: ${fmt(usr - rawSourceChars)})`);

  console.log('');
  console.log('── 40 longest lines ──');
  const longest = seg.lines
    .map((l, i) => ({ i, len: l.length, text: l }))
    .sort((a, b) => b.len - a.len)
    .slice(0, 40);
  for (const l of longest) {
    const inRaw = seg.sourceRegionStart >= 0 && l.i >= seg.sourceRegionStart && (seg.sourceRegionEnd < 0 || l.i <= seg.sourceRegionEnd);
    console.log(`  L${pad(l.i + 1, 5)} ${pad(fmt(l.len), 6, true)} ${inRaw ? '[SRC]' : '[INS]'} ${l.text.trim().slice(0, 100)}${l.text.length > 100 ? '…' : ''}`);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node scripts/prompt-budget-report.cjs <C-final-prompt.txt> [--all] [--json]');
    process.exit(2);
  }
  const abs = path.resolve(file);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    console.error(`cannot read ${abs}: ${err.message}`);
    process.exit(1);
  }
  const seg = segment(text);
  if (args.includes('--json')) {
    const out = {
      file: abs,
      total: seg.total,
      rawSourceChars: seg.rawSourceChars,
      derivedChars: seg.derivedChars,
      instructionChars: seg.total - seg.rawSourceChars,
      blocks: seg.blocks.map((b) => ({
        name: b.name, part: b.part, tag: b.tag, chars: b.chars,
        tokens: Math.round(b.chars / CHARS_PER_TOKEN), lines: [b.startLine + 1, b.endLine + 1],
        subs: b.subs.map((s) => ({ name: s.name, chars: s.chars, lines: [s.startLine + 1, s.endLine + 1] })),
      })),
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  printTable(seg, { file: abs, all: args.includes('--all') });
}

main();
