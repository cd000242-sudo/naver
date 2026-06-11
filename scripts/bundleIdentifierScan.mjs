// SPEC-STABILITY-2026 Phase 6.1 — bundle top-level identifier collision scan.
//
// copy-static.mjs concatenates every renderer module into ONE scope. A
// duplicate top-level const/let/class is a runtime SyntaxError the moment the
// bundle loads (v2.10.85 RecoveryBlockingModal incident), and a duplicate
// function silently overrides its namesake. tsc/eslint/esbuild all miss it
// because they see the modules separately — only the concatenated source can
// be checked, right here.

// tsc/tslib emit these per-module helpers; duplicates of them are expected
// and harmless in the inlined output.
const TS_HELPER_RE = /^__(?:importDefault|importStar|esModule|awaiter|generator|createBinding|setModuleDefault|exportStar|rest|assign|extends|decorate|metadata|param|classPrivateField\w*|spreadArray|values|read|asyncValues|makeTemplateObject|runInitializers|esDecorate|propKey|setFunctionName|addDisposableResource|disposeResources)$/;

const DECL_RE = /^(?:export\s+)?(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;

/**
 * Scans concatenated single-scope source for duplicate top-level
 * declarations. Returns [{ name, kind, lines }] for identifiers declared at
 * column 0 more than once (tsc helpers and `var` re-declarations excluded —
 * duplicate `var` is legal JS and tsc emits them defensively).
 */
export function findDuplicateTopLevelIdentifiers(source) {
  const seen = new Map(); // name -> { kinds: Set, lines: [] }
  const lines = String(source).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Top level only: declarations at column 0 (module bodies are indented
    // by the inliner; minified output is scanned BEFORE minify).
    if (!line || line[0] === ' ' || line[0] === '\t') continue;
    const m = line.match(DECL_RE);
    if (!m) continue;
    const [, kind, name] = m;
    if (kind === 'var') continue;
    if (TS_HELPER_RE.test(name)) continue;
    const entry = seen.get(name) || { kinds: new Set(), lines: [] };
    entry.kinds.add(kind);
    entry.lines.push(i + 1);
    seen.set(name, entry);
  }
  const duplicates = [];
  for (const [name, entry] of seen.entries()) {
    if (entry.lines.length > 1) {
      duplicates.push({ name, kinds: [...entry.kinds], lines: entry.lines });
    }
  }
  return duplicates.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ratchet: legacy duplicate FUNCTIONS (renderer.ts split leftovers — last
 * declaration silently wins) are frozen in a baseline and tolerated; anything
 * NEW fails the build. const/let/class duplicates always fail — those are a
 * load-time SyntaxError (the v2.10.85 incident class), never legacy.
 */
export function filterAgainstBaseline(duplicates, baselineNames) {
  const baseline = new Set(baselineNames || []);
  return duplicates.filter((dup) => {
    const functionOnly = dup.kinds.length === 1 && dup.kinds[0] === 'function';
    return !(functionOnly && baseline.has(dup.name));
  });
}
