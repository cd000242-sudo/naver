import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';

import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256,
  CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS,
  computeContentQualityV3CandidateRuntimeSha256,
  verifyContentQualityV3CandidateRuntimeFingerprint,
} from '../contentQualityV3/candidateRuntimeFingerprint.js';

const temporaryRoots: string[] = [];

function importClauseHasRuntimeBinding(importClause: ts.ImportClause | undefined): boolean {
  if (importClause === undefined) return true;
  if (importClause.isTypeOnly || importClause.name !== undefined) return !importClause.isTypeOnly;
  const bindings = importClause.namedBindings;
  if (bindings === undefined || ts.isNamespaceImport(bindings)) return true;
  return bindings.elements.some(element => !element.isTypeOnly);
}

function exportDeclarationHasRuntimeBinding(declaration: ts.ExportDeclaration): boolean {
  if (declaration.isTypeOnly) return false;
  if (declaration.exportClause === undefined || !ts.isNamedExports(declaration.exportClause)) {
    return true;
  }
  return declaration.exportClause.elements.some(element => !element.isTypeOnly);
}

interface RuntimeModuleScan {
  readonly relativeSpecifiers: readonly string[];
  readonly unresolvedDynamicLoads: readonly string[];
}

function unwrapModuleSpecifierExpression(value: ts.Expression): ts.Expression {
  let expression = value;
  while (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isNonNullExpression(expression)
  ) {
    expression = expression.expression;
  }
  return expression;
}

function readStaticModuleSpecifier(value: ts.Expression | undefined): string | undefined {
  if (value === undefined) return undefined;
  const unwrapped = unwrapModuleSpecifierExpression(value);
  return ts.isStringLiteralLike(unwrapped) ? unwrapped.text : undefined;
}

function isRuntimeModuleCall(node: ts.CallExpression): boolean {
  return node.expression.kind === ts.SyntaxKind.ImportKeyword
    || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
    || (
      ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'require'
      && node.expression.name.text === 'resolve'
    );
}

function scanRuntimeModule(sourcePath: string): RuntimeModuleScan {
  const source = readFileSync(sourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers = new Set<string>();
  const unresolvedDynamicLoads = new Set<string>();

  function collectStaticSpecifier(value: ts.Expression | undefined): void {
    const specifier = readStaticModuleSpecifier(value);
    if (specifier?.startsWith('.')) specifiers.add(specifier);
  }

  function recordDynamicSpecifier(node: ts.CallExpression): void {
    const specifier = readStaticModuleSpecifier(node.arguments[0]);
    if (specifier !== undefined) {
      if (specifier.startsWith('.')) specifiers.add(specifier);
      return;
    }
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    unresolvedDynamicLoads.add(`${line + 1}:${character + 1}`);
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && importClauseHasRuntimeBinding(node.importClause)) {
      collectStaticSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && !node.isTypeOnly
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      collectStaticSpecifier(node.moduleReference.expression);
    } else if (ts.isExportDeclaration(node) && exportDeclarationHasRuntimeBinding(node)) {
      collectStaticSpecifier(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && isRuntimeModuleCall(node)) {
      recordDynamicSpecifier(node);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return Object.freeze({
    relativeSpecifiers: Object.freeze([...specifiers].sort()),
    unresolvedDynamicLoads: Object.freeze([...unresolvedDynamicLoads].sort()),
  });
}

function collectRelativeRuntimeImports(sourcePath: string): readonly string[] {
  return scanRuntimeModule(sourcePath).relativeSpecifiers;
}

function collectNamedArrayStringValues(
  sourcePath: string,
  variableName: string,
  objectPropertyName?: string,
): readonly string[] {
  const source = readFileSync(sourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  let values: readonly string[] | undefined;

  function visit(node: ts.Node): void {
    if (
      values === undefined
      && ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === variableName
      && node.initializer !== undefined
      && ts.isArrayLiteralExpression(node.initializer)
    ) {
      values = node.initializer.elements.map((element) => {
        if (objectPropertyName === undefined && ts.isStringLiteralLike(element)) {
          return element.text;
        }
        if (objectPropertyName !== undefined && ts.isObjectLiteralExpression(element)) {
          const property = element.properties.find(candidate => (
            ts.isPropertyAssignment(candidate)
            && (
              (ts.isIdentifier(candidate.name) && candidate.name.text === objectPropertyName)
              || (ts.isStringLiteralLike(candidate.name) && candidate.name.text === objectPropertyName)
            )
          ));
          if (
            property !== undefined
            && ts.isPropertyAssignment(property)
            && ts.isStringLiteralLike(property.initializer)
          ) return property.initializer.text;
        }
        throw new Error(`Unsupported ${variableName} production assembly entry`);
      });
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  if (values === undefined) throw new Error(`Missing production assembly array: ${variableName}`);
  return Object.freeze([...values]);
}

function isWorkspaceFile(workspaceRoot: string, candidatePath: string): boolean {
  try {
    return statSync(resolve(workspaceRoot, ...candidatePath.split('/'))).isFile();
  } catch {
    return false;
  }
}

function resolveRuntimeImportPath(
  workspaceRoot: string,
  sourcePath: string,
  specifier: string,
): string {
  const normalized = posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  const extension = posix.extname(normalized);
  const candidates = extension === '.js'
    ? [`${normalized.slice(0, -3)}.ts`, `${normalized.slice(0, -3)}.tsx`, normalized]
    : extension === '.mjs'
      ? [`${normalized.slice(0, -4)}.mts`, normalized]
      : extension === '.cjs'
        ? [`${normalized.slice(0, -4)}.cts`, normalized]
        : extension.length > 0
          ? [normalized]
          : [
              `${normalized}.ts`,
              `${normalized}.tsx`,
              `${normalized}.js`,
              `${normalized}.mts`,
              `${normalized}.cts`,
              `${normalized}.mjs`,
              `${normalized}.cjs`,
              `${normalized}/index.ts`,
              `${normalized}/index.tsx`,
              `${normalized}/index.js`,
            ];

  return candidates.find(candidate => isWorkspaceFile(workspaceRoot, candidate))
    ?? candidates[0];
}

const ALLOWED_SELF_REFERENCE_EDGES = new Set([
  'src/contentQualityV3/candidateRuntimeFingerprint.ts->src/contentQualityV3/candidateRuntimeFingerprintPin.ts',
  'src/contentQualityV3/evidenceAttestation.ts->src/contentQualityV3/approvedEvidenceArtifacts.ts',
  'src/contentQualityV3/releaseActivation.ts->src/contentQualityV3/releaseActivationManifest.ts',
]);

const PRODUCTION_RUNTIME_CLOSURE_ROOTS = Object.freeze([
  'src/naverFactCheckRAG.ts',
  'src/naverBlogAutomation.ts',
  'src/sourceAssembler.ts',
] as const);

const PRODUCTION_RENDERER_ASSEMBLY_DIRECT_ROOTS = Object.freeze([
  'scripts/bundleIdentifierScan.mjs',
  'scripts/copy-static.mjs',
  'scripts/rendererRuntimeDependencyInline.mjs',
  'scripts/sync-build-define.mjs',
  'src/renderer/renderer.ts',
] as const);

const PRODUCTION_RENDERER_ASSEMBLY_STATIC_RESOURCES = Object.freeze([
  'public/index.html',
  'scripts/bundle-identifier-baseline.json',
] as const);

function collectProductionRendererAssemblyInputs(workspaceRoot: string): Readonly<{
  sourceRoots: readonly string[];
  resources: readonly string[];
}> {
  const copyStaticPath = resolve(workspaceRoot, 'scripts', 'copy-static.mjs');
  const sourceGroups = [
    ['runtimeModules', 'src/runtime/'],
    ['utilsModules', 'src/renderer/utils/'],
    ['componentModules', 'src/renderer/components/'],
    ['modulesFiles', 'src/renderer/modules/'],
  ] as const;
  const sourceRoots: string[] = [...PRODUCTION_RENDERER_ASSEMBLY_DIRECT_ROOTS];
  for (const [variableName, prefix] of sourceGroups) {
    for (const fileName of collectNamedArrayStringValues(copyStaticPath, variableName)) {
      const sourcePath = `${prefix}${fileName.replace(/\.js$/u, '.ts')}`;
      if (!isWorkspaceFile(workspaceRoot, sourcePath)) {
        throw new Error(`Missing production renderer assembly source: ${sourcePath}`);
      }
      sourceRoots.push(sourcePath);
    }
  }
  for (const label of collectNamedArrayStringValues(
    copyStaticPath,
    'rendererRuntimeDependencyFiles',
    'label',
  )) {
    const sourcePath = `src/${label.replace(/\.js$/u, '.ts')}`;
    if (!isWorkspaceFile(workspaceRoot, sourcePath)) {
      throw new Error(`Missing production renderer dependency source: ${sourcePath}`);
    }
    sourceRoots.push(sourcePath);
  }
  for (const optionalSourcePath of [
    'src/renderer/scheduleAndUI.ts',
    'src/renderer/categoryPrompts.ts',
    'src/renderer/automationHelpers.ts',
    'src/renderer/performanceUtils.ts',
  ]) {
    if (isWorkspaceFile(workspaceRoot, optionalSourcePath)) sourceRoots.push(optionalSourcePath);
  }

  const indexSource = readFileSync(resolve(workspaceRoot, 'public', 'index.html'), 'utf8');
  const localScriptResources = [...indexSource.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu)]
    .map(match => match[1])
    .filter(scriptPath => !/^(?:[a-z]+:|\/\/)/iu.test(scriptPath) && scriptPath !== 'renderer.js')
    .map(scriptPath => `public/${scriptPath.replace(/^\.\//u, '')}`);
  for (const resourcePath of localScriptResources) {
    if (!isWorkspaceFile(workspaceRoot, resourcePath)) {
      throw new Error(`Missing production renderer loader resource: ${resourcePath}`);
    }
  }

  return Object.freeze({
    sourceRoots: Object.freeze([...new Set(sourceRoots)].sort()),
    resources: Object.freeze([
      ...new Set([
        ...PRODUCTION_RENDERER_ASSEMBLY_STATIC_RESOURCES,
        ...localScriptResources,
      ]),
    ].sort()),
  });
}

function collectProductionPromptResources(workspaceRoot: string): readonly string[] {
  const promptRoot = 'src/prompts';
  const pending = [promptRoot];
  const promptResources: string[] = [];

  while (pending.length > 0) {
    const relativeDirectory = pending.shift();
    if (relativeDirectory === undefined) continue;
    const absoluteDirectory = resolve(workspaceRoot, ...relativeDirectory.split('/'));
    const entries = readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) pending.push(relativePath);
      else if (entry.isFile() && entry.name.endsWith('.prompt')) promptResources.push(relativePath);
    }
  }

  if (promptResources.length === 0) {
    throw new Error('Production prompt resource closure is empty');
  }
  return Object.freeze(promptResources.sort());
}

const SUPPLEMENTAL_RUNTIME_CLOSURE_ROOTS = Object.freeze([
  'src/content/internalLinkManager.ts',
  'src/contentPolicy/claimRepair.ts',
  'src/contentPolicy/draftGenerator.ts',
  'src/contentPolicy/fileOperationQueue.ts',
  'src/contentPolicy/generatedContentGuard.ts',
  'src/contentPolicy/generationContext.ts',
  'src/contentPolicy/inputValidator.ts',
  'src/contentPolicy/manualReview.ts',
  'src/contentPolicy/orchestrator.ts',
  'src/contentPolicy/outlineGenerator.ts',
  'src/contentPolicy/policyLoader.ts',
  'src/contentPolicy/publicationStateStore.ts',
  'src/contentPolicy/publishGuard.ts',
  'src/contentPolicy/qualityGate.ts',
  'src/contentPolicy/recentPostsRepository.ts',
  'src/contentPolicy/searchIntentAnalyzer.ts',
  'src/contentPolicy/similarityGuard.ts',
  'src/contentPolicy/sourceEvidence.ts',
  'src/contentPolicy/textMetrics.ts',
  'src/contentPolicy/topicDiversifier.ts',
  'src/contentPolicy/types.ts',
  'src/main/ipc/blogHandlers.ts',
  'src/main/services/BlogExecutor.ts',
  'src/main/workers/base64Worker.ts',
  'src/preload.ts',
  'src/rag/embedder.ts',
  'src/rag/vectorStore.ts',
  'src/renderer/modules/formAndAutomation.ts',
  'src/renderer/modules/fullAutoFlow.ts',
  'src/renderer/modules/postListUI.ts',
  'src/renderer/modules/postManager.ts',
  'src/renderer/modules/publishingHandlers.ts',
  'src/types/automation.ts',
] as const);

function collectRuntimeDependencyClosure(
  workspaceRoot: string,
  rootPaths: readonly string[],
): Readonly<{
  closure: readonly string[];
  unresolvedEdges: readonly string[];
}> {
  const visited = new Set<string>();
  const unresolvedEdges = new Set<string>();
  const pending = [...rootPaths];

  while (pending.length > 0) {
    const sourcePath = pending.shift();
    if (sourcePath === undefined || visited.has(sourcePath)) continue;
    visited.add(sourcePath);
    if (!/\.(?:[cm]?[jt]sx?)$/u.test(sourcePath)) continue;

    const absoluteSourcePath = resolve(workspaceRoot, ...sourcePath.split('/'));
    const moduleScan = scanRuntimeModule(absoluteSourcePath);
    for (const location of moduleScan.unresolvedDynamicLoads) {
      unresolvedEdges.add(`${sourcePath}:dynamic-module-load@${location}`);
    }
    for (const specifier of moduleScan.relativeSpecifiers) {
      const importedPath = resolveRuntimeImportPath(workspaceRoot, sourcePath, specifier);
      const edge = `${sourcePath}->${importedPath}`;
      if (ALLOWED_SELF_REFERENCE_EDGES.has(edge)) continue;
      if (!isWorkspaceFile(workspaceRoot, importedPath)) {
        unresolvedEdges.add(edge);
        continue;
      }
      if (!visited.has(importedPath)) pending.push(importedPath);
    }
  }

  return Object.freeze({
    closure: Object.freeze([...visited].sort()),
    unresolvedEdges: Object.freeze([...unresolvedEdges].sort()),
  });
}

function collectRequiredV3Modules(workspaceRoot: string): readonly string[] {
  const excludedSelfReferentialData = new Set([
    'approvedEvidenceArtifacts.ts',
    'candidateRuntimeFingerprintPin.ts',
    'releaseActivationManifest.ts',
  ]);
  return readdirSync(resolve(workspaceRoot, 'src', 'contentQualityV3'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
    .map(entry => entry.name)
    .filter(name => !excludedSelfReferentialData.has(name))
    .map(name => `src/contentQualityV3/${name}`)
    .sort();
}

async function createFixture(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'content-quality-v3-runtime-'));
  temporaryRoots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, ...relativePath.split('/'));
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(async root => {
    const resolved = resolve(root);
    if (!resolved.startsWith(resolve(tmpdir()))) {
      throw new Error('unsafe temporary cleanup target');
    }
    await rm(resolved, { recursive: true, force: true });
  }));
});

describe('Content Quality V3 candidate runtime fingerprint', () => {
  it('pins the complete source-reviewed runtime boundary in stable path order', () => {
    expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS).toEqual(expect.arrayContaining([
      'config/content_policy.yaml',
      'package-lock.json',
      'package.json',
      'src/agents/trendAnalyzer.ts',
      'src/apiUsageTracker.ts',
      'src/configManager.ts',
      'src/content/affiliateAuthenticity.ts',
      'src/content/internalLinkManager.ts',
      'src/contentAbortTimeoutPolicy.ts',
      'src/contentEncodingPolicy.ts',
      'src/contentEnvNumberPolicy.ts',
      'src/contentGeminiBudgetSafety.ts',
      'src/contentGeminiCacheEligibility.ts',
      'src/contentGeminiCachePolicy.ts',
      'src/contentGeminiCacheStreamFallback.ts',
      'src/contentGeminiCacheSupportRegistry.ts',
      'src/contentGeminiErrorPolicy.ts',
      'src/contentGeminiModelPolicy.ts',
      'src/contentGeminiPromptCache.ts',
      'src/contentGeminiResultCache.ts',
      'src/contentGeminiSamplingPolicy.ts',
      'src/contentGeminiUsageMetadata.ts',
      'src/contentGenerationFailurePolicy.ts',
      'src/contentGenerationUserGuidance.ts',
      'src/contentGenerator.ts',
      'src/contentKeywordHelpers.ts',
      'src/contentKeywordTitlePolicy.ts',
      'src/contentLengthRetryPolicy.ts',
      'src/contentManualTitlePolicy.ts',
      'src/contentPipeline/facade.ts',
      'src/contentPipeline/mode.ts',
      'src/contentPipeline/resultContract.ts',
      'src/contentPolicy/claimRepair.ts',
      'src/contentPolicy/draftGenerator.ts',
      'src/contentPolicy/fileOperationQueue.ts',
      'src/contentPolicy/generatedContentGuard.ts',
      'src/contentPolicy/generationContext.ts',
      'src/contentPolicy/inputValidator.ts',
      'src/contentPolicy/manualReview.ts',
      'src/contentPolicy/orchestrator.ts',
      'src/contentPolicy/outlineGenerator.ts',
      'src/contentPolicy/policyLoader.ts',
      'src/contentPolicy/publicationStateStore.ts',
      'src/contentPolicy/publishGuard.ts',
      'src/contentPolicy/qualityGate.ts',
      'src/contentPolicy/recentPostsRepository.ts',
      'src/contentPolicy/searchIntentAnalyzer.ts',
      'src/contentPolicy/similarityGuard.ts',
      'src/contentPolicy/sourceEvidence.ts',
      'src/contentPolicy/textMetrics.ts',
      'src/contentPolicy/topicDiversifier.ts',
      'src/contentPolicy/types.ts',
      'src/contentProductCategory.ts',
      'src/contentProviderRequestGate.ts',
      'src/contentProviderTimeoutPolicy.ts',
      'src/contentQualityV3/affiliateGuard.ts',
      'src/contentQualityV3/baselineManifest.ts',
      'src/contentQualityV3/businessGuard.ts',
      'src/contentQualityV3/candidateRuntimeFingerprint.ts',
      'src/contentQualityV3/currentEvidenceBindings.ts',
      'src/contentQualityV3/evalAssessor.ts',
      'src/contentQualityV3/evalCaseManifest.ts',
      'src/contentQualityV3/evalCorpus.ts',
      'src/contentQualityV3/evalCorpusTypes.ts',
      'src/contentQualityV3/evalImportantLiterals.ts',
      'src/contentQualityV3/evalScenarios.ts',
      'src/contentQualityV3/evalTopicSeeds.ts',
      'src/contentQualityV3/evaluationEvidenceContract.ts',
      'src/contentQualityV3/evaluationOnlyCandidateDriver.ts',
      'src/contentQualityV3/evidenceAttestation.ts',
      'src/contentQualityV3/factualSafetyGuard.ts',
      'src/contentQualityV3/finalizer.ts',
      'src/contentQualityV3/geminiRequestContract.ts',
      'src/contentQualityV3/pairwiseEvidence.ts',
      'src/contentQualityV3/postDraftMutationPolicy.ts',
      'src/contentQualityV3/prompt.ts',
      'src/contentQualityV3/providerPolicy.ts',
      'src/contentQualityV3/publicationBoundary.ts',
      'src/contentQualityV3/rawEvidencePackage.ts',
      'src/contentQualityV3/recordedRolloutCase.ts',
      'src/contentQualityV3/releaseActivation.ts',
      'src/contentQualityV3/rolloutGate.ts',
      'src/contentQualityV3/rolloutGateAggregate.ts',
      'src/contentQualityV3/rolloutGateFinite.ts',
      'src/contentQualityV3/schema.ts',
      'src/contentQualityV3/strictOutputValidator.ts',
      'src/contentQualityV3/titleContract.ts',
      'src/contentRetryPromptPolicy.ts',
      'src/contentShoppingConnectValidation.ts',
      'src/contentTemperaturePolicy.ts',
      'src/contentTextMetrics.ts',
      'src/gemini.ts',
      'src/geminiBillingBlock.ts',
      'src/geminiCostOptimizer.ts',
      'src/geminiQuotaPolicy.ts',
      'src/jsonParser.ts',
      'src/main.ts',
      'src/naverFactCheckRAG.ts',
      'src/promptSplitter.ts',
      'src/providerRateLimitWaitPolicy.ts',
      'src/rag/embedder.ts',
      'src/rag/vectorStore.ts',
      'src/runtime/adaptiveLimiter.ts',
      'src/runtime/modelRegistry.ts',
      'src/security/secretValueUtils.ts',
      'src/sourceAssembler.ts',
      'tsconfig.json',
    ]));
    expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS)
      .toEqual([...CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS].sort());
    expect(Object.isFrozen(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS)).toBe(true);
    expect(new Set(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS).size)
      .toBe(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS.length);
    expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256).toMatch(/^[a-f0-9]{64}$/);
    for (const selfReferentialApprovalPath of [
      'src/contentQualityV3/approvedEvidenceArtifacts.ts',
      'src/contentQualityV3/candidateRuntimeFingerprintPin.ts',
      'src/contentQualityV3/releaseActivationManifest.ts',
    ]) {
      expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS)
        .not.toContain(selfReferentialApprovalPath);
    }
  });

  it('automatically covers every V3 module except explicit self-referential approval data', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const requiredModules = collectRequiredV3Modules(workspaceRoot);
    const fingerprintedModules = CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS
      .filter(path => path.startsWith('src/contentQualityV3/'))
      .sort();

    expect(fingerprintedModules).toEqual(requiredModules);
  });

  it('locks main-process production wiring to source assembly and both fact-check guards', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const mainSource = readFileSync(resolve(workspaceRoot, 'src', 'main.ts'), 'utf8');
    const mainRuntimeImports = collectRelativeRuntimeImports(resolve(workspaceRoot, 'src', 'main.ts'))
      .map(specifier => resolveRuntimeImportPath(workspaceRoot, 'src/main.ts', specifier));

    expect(mainRuntimeImports).toEqual(expect.arrayContaining(PRODUCTION_RUNTIME_CLOSURE_ROOTS));
    expect(mainSource).toMatch(/import\s*\{[^}]*\bassembleContentSource\b[^}]*\}\s*from\s*['"]\.\/sourceAssembler\.js['"]/u);
    expect(mainSource).toMatch(/await\s+assembleContentSource\(payload\.assembly\)/u);
    expect(mainSource).toMatch(/\{\s*validateFactCheckSource\s*\}\s*=\s*await\s+import\(['"]\.\/naverFactCheckRAG\.js['"]\)/u);
    expect(mainSource).toMatch(/await\s+validateFactCheckSource\(keywordQuery\)/u);
    expect(mainSource).toMatch(/\{\s*validateFactsAgainstSource\s*\}\s*=\s*await\s+import\(['"]\.\/naverFactCheckRAG\.js['"]\)/u);
    expect(mainSource).toMatch(/validateFactsAgainstSource\(fullText,\s*factCheckRawSource,\s*0\.7\)/u);

    const assemblyIndex = mainSource.indexOf(
      'const { source, warnings } = await assembleContentSource(payload.assembly);',
    );
    const sourceValidationIndex = mainSource.indexOf(
      'const validation = await validateFactCheckSource(keywordQuery);',
      assemblyIndex,
    );
    const blockIndex = mainSource.indexOf('if (!validation.passed)', sourceValidationIndex);
    const blockThrowIndex = mainSource.indexOf('throw new Error(errMsg);', blockIndex);
    const evidenceBindingIndex = mainSource.indexOf(
      '(source as any).factCheckRawSource = validation.rawText;',
      blockThrowIndex,
    );
    const generationIndex = mainSource.indexOf(
      'generateStructuredContentWithProductPolicy(source,',
      evidenceBindingIndex,
    );
    const outputValidationIndex = mainSource.indexOf(
      'const validation = validateFactsAgainstSource(fullText, factCheckRawSource, 0.7);',
      generationIndex,
    );
    const reportBindingIndex = mainSource.indexOf(
      '(content as any).factCheckReport =',
      outputValidationIndex,
    );
    const warningBindingIndex = mainSource.indexOf(
      'content.quality.warnings =',
      reportBindingIndex,
    );

    expect([
      assemblyIndex,
      sourceValidationIndex,
      blockIndex,
      blockThrowIndex,
      evidenceBindingIndex,
      generationIndex,
      outputValidationIndex,
      reportBindingIndex,
      warningBindingIndex,
    ].every(index => index >= 0)).toBe(true);
    expect(sourceValidationIndex).toBeGreaterThan(assemblyIndex);
    expect(blockThrowIndex).toBeGreaterThan(blockIndex);
    expect(evidenceBindingIndex).toBeGreaterThan(blockThrowIndex);
    expect(generationIndex).toBeGreaterThan(evidenceBindingIndex);
    expect(reportBindingIndex).toBeGreaterThan(outputValidationIndex);
    expect(warningBindingIndex).toBeGreaterThan(reportBindingIndex);
  });

  it('locks the one-shot publish handoff from main through renderer to BlogExecutor', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const mainSourcePath = resolve(workspaceRoot, 'src', 'main.ts');
    const executorSourcePath = resolve(workspaceRoot, 'src', 'main', 'services', 'BlogExecutor.ts');
    const rendererSourcePath = resolve(workspaceRoot, 'src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const editorBoundarySourcePath = resolve(
      workspaceRoot,
      'src',
      'contentQualityV3',
      'editorCommitBoundary.ts',
    );
    const mainSource = readFileSync(mainSourcePath, 'utf8');
    const executorSource = readFileSync(executorSourcePath, 'utf8');
    const rendererSource = readFileSync(rendererSourcePath, 'utf8');
    const editorBoundarySource = readFileSync(editorBoundarySourcePath, 'utf8');
    const handoffStorePath = 'src/contentQualityV3/publishHandoffStore.ts';

    expect(collectRelativeRuntimeImports(mainSourcePath).map(specifier => (
      resolveRuntimeImportPath(workspaceRoot, 'src/main.ts', specifier)
    ))).toContain(handoffStorePath);
    expect(collectRelativeRuntimeImports(executorSourcePath).map(specifier => (
      resolveRuntimeImportPath(
        workspaceRoot,
        'src/main/services/BlogExecutor.ts',
        specifier,
      )
    ))).toContain(handoffStorePath);
    expect(mainSource).toMatch(/contentQualityV3PublishHandoffStore\.issue\(/u);
    expect(mainSource).toMatch(/\[CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD\]:\s*contentQualityV3PublishHandoff/u);
    expect(rendererSource).toMatch(/_contentQualityV3PublishHandoff:\s*structuredContent\?\._contentQualityV3PublishHandoff/u);
    expect(executorSource.match(/enforceContentQualityV3PublishPayload\(/gu)).toHaveLength(2);
    expect(executorSource.match(/\{\s*consume:\s*false\s*\}/gu) ?? []).toHaveLength(2);
    expect(executorSource.match(/\{\s*consume:\s*true\s*\}/gu) ?? []).toHaveLength(0);
    expect(executorSource).toMatch(
      /enforceContentQualityV3EditorCommit\(\s*contentQualityV3PublishHandoffStore,\s*effectivePayload,\s*candidate,?\s*\)/u,
    );
    expect(editorBoundarySource.match(/enforceContentQualityV3PublishPayload\(/gu))
      .toHaveLength(2);
    expect(editorBoundarySource.match(/\{\s*\.\.\.options,\s*consume:\s*false\s*\}/gu) ?? [])
      .toHaveLength(1);
    expect(editorBoundarySource.match(/\{\s*\.\.\.options,\s*consume:\s*true\s*\}/gu) ?? [])
      .toHaveLength(1);
  });

  it('locks saved V3 marker persistence, reconstruction, and renderer publish relay', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const postManagerSource = readFileSync(
      resolve(workspaceRoot, 'src', 'renderer', 'modules', 'postManager.ts'),
      'utf8',
    );
    const postListSource = readFileSync(
      resolve(workspaceRoot, 'src', 'renderer', 'modules', 'postListUI.ts'),
      'utf8',
    );
    const publishingSource = readFileSync(
      resolve(workspaceRoot, 'src', 'renderer', 'modules', 'publishingHandlers.ts'),
      'utf8',
    );
    const fullAutoSource = readFileSync(
      resolve(workspaceRoot, 'src', 'renderer', 'modules', 'fullAutoFlow.ts'),
      'utf8',
    );
    const mainSource = readFileSync(resolve(workspaceRoot, 'src', 'main.ts'), 'utf8');
    const storeSource = readFileSync(
      resolve(workspaceRoot, 'src', 'contentQualityV3', 'publishHandoffStore.ts'),
      'utf8',
    );

    expect(postManagerSource).toMatch(
      /function\s+snapshotContentQualityV3PersistenceFields\s*\(/u,
    );
    expect(postManagerSource.match(/snapshotContentQualityV3PersistenceFields\s*\(/gu)).toHaveLength(4);
    expect(postManagerSource).toMatch(
      /\.\.\.snapshotContentQualityV3PersistenceFields\(existingPost\?\.structuredContent\)[\s\S]*\.\.\.snapshotContentQualityV3PersistenceFields\(structuredContent\)/u,
    );
    expect(postManagerSource).toMatch(
      /\[V3_HANDOFF_FIELD\]:\s*\{\s*handle,\s*publicationIdentity,\s*originalContentSha256\s*\}/u,
    );

    expect(postListSource).toMatch(
      /export\s+function\s+reconstructGeneratedPostStructuredContent\s*\([\s\S]*\.\.\.storedStructuredContent/u,
    );
    expect(postListSource).toMatch(
      /const\s+structuredContent\s*=\s*reconstructGeneratedPostStructuredContent\(post\)/u,
    );
    expect(publishingSource).toMatch(
      /const\s+updatedStructuredContent\s*=\s*\{\s*\.\.\.structuredContent,/u,
    );
    expect(publishingSource).toMatch(/saveGeneratedPost\(updatedStructuredContent,\s*true\)/u);
    expect(publishingSource).toMatch(/structuredContent:\s*updatedStructuredContent/u);

    expect(fullAutoSource).toMatch(
      /_contentQualityV3Required:\s*structuredContent\?\._contentQualityV3Required/u,
    );
    expect(fullAutoSource).toMatch(
      /_contentQualityV3PublishHandoff:\s*structuredContent\?\._contentQualityV3PublishHandoff/u,
    );
    expect(mainSource).toMatch(
      /nestedV3Required[\s\S]*\[CONTENT_QUALITY_V3_REQUIRED_FIELD\]:[\s\S]*\?\?\s*nestedV3Required/u,
    );
    expect(mainSource).toMatch(
      /nestedHandoff[\s\S]*\[CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD\]:[\s\S]*\?\?\s*nestedHandoff/u,
    );
    expect(storeSource).toMatch(
      /readRequiredMarker\(ownPayloadValue\(payload,\s*CONTENT_QUALITY_V3_REQUIRED_FIELD\)\)[\s\S]*readRequiredMarker\(nestedStructuredContentValue\(payload,\s*CONTENT_QUALITY_V3_REQUIRED_FIELD\)\)/u,
    );
  });

  it('locks the source-controlled renderer build assembly through the production IPC relay', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const packageJson = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'));
    const copyStaticSource = readFileSync(resolve(workspaceRoot, 'scripts', 'copy-static.mjs'), 'utf8');
    const rendererSource = readFileSync(resolve(workspaceRoot, 'src', 'renderer', 'renderer.ts'), 'utf8');
    const fullAutoSource = readFileSync(
      resolve(workspaceRoot, 'src', 'renderer', 'modules', 'fullAutoFlow.ts'),
      'utf8',
    );
    const preloadSource = readFileSync(resolve(workspaceRoot, 'src', 'preload.ts'), 'utf8');
    const mainSource = readFileSync(resolve(workspaceRoot, 'src', 'main.ts'), 'utf8');
    const indexSource = readFileSync(resolve(workspaceRoot, 'public', 'index.html'), 'utf8');
    const assembly = collectProductionRendererAssemblyInputs(workspaceRoot);

    expect(packageJson.scripts.build).toBe(
      'node scripts/sync-build-define.mjs && tsc && node scripts/copy-static.mjs',
    );
    expect(assembly.sourceRoots).toEqual(expect.arrayContaining([
      'scripts/copy-static.mjs',
      'scripts/rendererRuntimeDependencyInline.mjs',
      'src/renderer/renderer.ts',
      'src/renderer/utils/apiClient.ts',
      'src/renderer/modules/fullAutoFlow.ts',
      'src/renderer/modules/postManager.ts',
    ]));
    expect(assembly.resources).toEqual(expect.arrayContaining([
      'public/index.html',
      'public/floating-scroll.js',
      'public/ai-hook-modal.js',
      'scripts/bundle-identifier-baseline.json',
    ]));

    const moduleOrder = [
      'postManager.js',
      'postListUI.js',
      'publishingHandlers.js',
      'fullAutoFlow.js',
      'formAndAutomation.js',
    ].map(moduleName => copyStaticSource.indexOf(`'${moduleName}'`));
    expect(moduleOrder.every(index => index >= 0)).toBe(true);
    expect(moduleOrder).toEqual([...moduleOrder].sort((left, right) => left - right));
    expect(copyStaticSource).toMatch(/const\s+rendererBundle\s*=\s*path\.join\(projectRoot,\s*'dist',\s*'renderer',\s*'renderer\.js'\)/u);
    expect(copyStaticSource).toMatch(/const\s+rendererTarget\s*=\s*path\.join\(targetDir,\s*'renderer\.js'\)/u);
    expect(copyStaticSource).toMatch(/const\s+REQUIRED_CONTENT_QUALITY_V3_RENDERER_RELAY_PATTERNS\s*=\s*\[/u);
    expect(copyStaticSource).toMatch(/Content Quality V3 renderer relay missing after inlining/u);
    expect(copyStaticSource).toMatch(/const\s+REQUIRED_CONTENT_QUALITY_V3_RENDERER_OUTPUT_TOKENS\s*=\s*\[/u);
    expect(copyStaticSource).toMatch(/Content Quality V3 renderer output missing after minification/u);
    const finalRelayGateIndex = copyStaticSource.indexOf(
      'Content Quality V3 renderer output missing after minification',
    );
    expect(finalRelayGateIndex).toBeGreaterThan(copyStaticSource.indexOf('await transform(finalRenderer'));
    expect(finalRelayGateIndex).toBeLessThan(copyStaticSource.indexOf('await writeFile(rendererTarget'));
    expect(copyStaticSource).toMatch(/await\s+writeFile\(rendererTarget,\s*toWrite,\s*'utf-8'\)/u);

    const rendererLoaderIndex = indexSource.indexOf('<script defer src="renderer.js"></script>');
    const followingScriptIndex = indexSource.indexOf('<script defer src="floating-scroll.js"></script>');
    expect(rendererLoaderIndex).toBeGreaterThanOrEqual(0);
    expect(followingScriptIndex).toBeGreaterThan(rendererLoaderIndex);
    expect(rendererSource).toMatch(/async\s+function\s+executeUnifiedAutomation\(formData:\s*any\)/u);
    expect(rendererSource).toMatch(/return\s+await\s+executeFullAutoFlow\(formData\)/u);
    expect(rendererSource).toMatch(/return\s+await\s+executeSemiAutoFlow\(formData\)/u);
    expect(fullAutoSource).toMatch(/_contentQualityV3PostId:\s*structuredContent\?\._contentQualityV3PostId/u);
    expect(fullAutoSource).toMatch(/_contentQualityV3Required:\s*structuredContent\?\._contentQualityV3Required/u);
    expect(fullAutoSource).toMatch(/_contentQualityV3PublishHandoff:\s*structuredContent\?\._contentQualityV3PublishHandoff/u);
    expect(fullAutoSource).toMatch(/apiClient\.call\(['"]runAutomation['"],\s*\[payload\]/u);
    expect(preloadSource).toMatch(/runAutomation:\s*\(payload:\s*AutomationPayload\)\s*=>\s*ipcRenderer\.invoke\(['"]automation:run['"],\s*payload\)/u);
    expect(mainSource).toMatch(/ipcMain\.handle\(['"]automation:run['"]/u);
  });

  it('locks every production prompt resource through development and packaged lookup paths', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const packageJson = JSON.parse(readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'));
    const copyStaticSource = readFileSync(resolve(workspaceRoot, 'scripts', 'copy-static.mjs'), 'utf8');
    const promptLoaderSource = readFileSync(resolve(workspaceRoot, 'src', 'promptLoader.ts'), 'utf8');
    const promptResources = collectProductionPromptResources(workspaceRoot);

    expect(promptResources.length).toBeGreaterThan(0);
    expect(copyStaticSource).toMatch(
      /const\s+promptsSourceDir\s*=\s*path\.join\(projectRoot,\s*'src',\s*'prompts'\)/u,
    );
    expect(copyStaticSource).toMatch(
      /const\s+promptsTargetDir\s*=\s*path\.join\(projectRoot,\s*'dist',\s*'prompts'\)/u,
    );
    expect(copyStaticSource).toMatch(
      /await\s+cp\(promptsSourceDir,\s*promptsTargetDir,\s*\{\s*recursive:\s*true,\s*force:\s*true\s*\}\)/u,
    );
    expect(copyStaticSource).toMatch(
      /const\s+promptsSourceDir[\s\S]*?catch\s*\(e\)\s*\{[\s\S]*?throw\s+e;[\s\S]*?const\s+assetsSourceDir/u,
    );
    expect(packageJson.build.extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'dist/prompts', to: 'prompts' }),
    ]));
    expect(promptLoaderSource).toMatch(/path\.join\(appPath,\s*'src',\s*'prompts'\)/u);
    expect(promptLoaderSource).toMatch(/path\.join\(process\.cwd\(\),\s*'src',\s*'prompts'\)/u);
    expect(promptLoaderSource).toMatch(/path\.join\(process\.resourcesPath,\s*'prompts'\)/u);
    expect(promptLoaderSource).toMatch(
      /const\s+fullPath\s*=\s*path\.join\(getPromptsDir\(\),\s*filePath\)[\s\S]*fs\.readFileSync\(fullPath,\s*'utf-8'\)/u,
    );
    expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS)
      .toEqual(expect.arrayContaining(promptResources));
  });

  it('locks the post-gate NaverBlogAutomation dependency-injection and editor application path', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const mainSource = readFileSync(resolve(workspaceRoot, 'src', 'main.ts'), 'utf8');
    const executorSource = readFileSync(
      resolve(workspaceRoot, 'src', 'main', 'services', 'BlogExecutor.ts'),
      'utf8',
    );
    const automationPath = resolve(workspaceRoot, 'src', 'naverBlogAutomation.ts');
    const automationSource = readFileSync(automationPath, 'utf8');
    const publishHelpersSource = readFileSync(
      resolve(workspaceRoot, 'src', 'automation', 'publishHelpers.ts'),
      'utf8',
    );
    const automationImports = collectRelativeRuntimeImports(automationPath).map(specifier => (
      resolveRuntimeImportPath(workspaceRoot, 'src/naverBlogAutomation.ts', specifier)
    ));

    expect(mainSource).toMatch(/import\s*\{[^}]*\bNaverBlogAutomation\b[^}]*\}\s*from\s*['"]\.\/naverBlogAutomation\.js['"]/u);
    expect(mainSource).toMatch(/createAutomation:[\s\S]*return\s+new\s+NaverBlogAutomation\(/u);
    expect(executorSource).toMatch(/const\s+runOptions\s*=\s*\{[\s\S]*?title:\s*finalTitle,[\s\S]*?content:\s*payload\.content,[\s\S]*?structuredContent:\s*updatedStructuredContent/u);
    const strictHookAttachPattern = /attachMainProcessBeforePublishCommit\(\s*runOptions,\s*beforePublishCommit,\s*\{\s*requiresVisibleSnapshot:\s*true,?\s*\},?\s*\)/u;
    expect(executorSource).toMatch(strictHookAttachPattern);
    expect(executorSource).toMatch(/const\s+result\s*=\s*await\s+automation\.run\(runOptions\)/u);

    const executorRunOptionsIndex = executorSource.indexOf('const runOptions = {');
    const hookAttachMatch = strictHookAttachPattern.exec(executorSource.slice(executorRunOptionsIndex));
    const executorHookAttachIndex = hookAttachMatch
      ? executorRunOptionsIndex + hookAttachMatch.index
      : -1;
    const executorRunIndex = executorSource.indexOf(
      'const result = await automation.run(runOptions);',
      executorHookAttachIndex,
    );
    expect(executorRunOptionsIndex).toBeGreaterThanOrEqual(0);
    expect(executorHookAttachIndex).toBeGreaterThan(executorRunOptionsIndex);
    expect(executorRunIndex).toBeGreaterThan(executorHookAttachIndex);
    expect(automationImports).toEqual(expect.arrayContaining([
      'src/automation/editorHelpers.ts',
      'src/automation/publishCommitHook.ts',
      'src/automation/runOptionsPolicy.ts',
    ]));
    expect(automationSource).toMatch(/private\s+resolveRunOptions\(runOptions:\s*RunOptions\)[\s\S]*resolveNaverRunOptions\(/u);
    expect(automationSource).toMatch(/private\s+async\s+applyStructuredContent\(resolved:\s*ResolvedRunOptions\)[\s\S]*editorHelpers\.applyStructuredContent\(this,\s*resolved\)/u);
    expect(automationSource).toMatch(/async\s+publishBlogPost\([\s\S]*?runOptions\?:\s*object,[\s\S]*?const\s+beforeIrreversibleCommit\s*=\s*async\s*\(\):\s*Promise<void>\s*=>\s*\{[\s\S]*?await\s+invokeMainProcessBeforePublishCommit\(runOptions\)/u);
    expect(
      automationSource.match(/await\s+invokeMainProcessBeforePublishCommit\(/gu) ?? [],
    ).toHaveLength(1);

    const draftStartIndex = automationSource.indexOf("if (mode === 'draft')");
    const draftEndIndex = automationSource.indexOf("} else if (mode === 'publish')", draftStartIndex);
    expect(draftStartIndex).toBeGreaterThanOrEqual(0);
    expect(draftEndIndex).toBeGreaterThan(draftStartIndex);
    const draftPublishRegion = automationSource.slice(draftStartIndex, draftEndIndex);
    expect(draftPublishRegion).toContain('await saveButton.click();');
    expect(draftPublishRegion).not.toContain('beforeIrreversibleCommit');

    const immediateCommitPattern = /await\s+beforeIrreversibleCommit\(\);\s*this\.immediatePublishCommitAttempted\s*=\s*true;\s*await\s+confirmPublishButton\.click\(\);/gu;
    expect(automationSource.match(immediateCommitPattern) ?? []).toHaveLength(3);
    expect(automationSource.match(/await\s+beforeIrreversibleCommit\(\);/gu) ?? []).toHaveLength(3);
    expect(automationSource).toMatch(/await\s+this\.publishScheduled\(scheduleDate,\s*beforeIrreversibleCommit\)/u);

    const scheduledHookIndex = publishHelpersSource.indexOf('await beforeIrreversibleCommit?.();');
    const scheduledMissingConfirmIndex = publishHelpersSource.lastIndexOf(
      'if (!confirmButton)',
      scheduledHookIndex,
    );
    const scheduledAttemptIndex = publishHelpersSource.indexOf(
      'confirmationAttempted = true;',
      scheduledHookIndex,
    );
    const scheduledClickIndex = publishHelpersSource.indexOf(
      'await confirmButton.click();',
      scheduledAttemptIndex,
    );
    expect(scheduledMissingConfirmIndex).toBeGreaterThanOrEqual(0);
    expect(scheduledHookIndex).toBeGreaterThan(scheduledMissingConfirmIndex);
    expect(scheduledAttemptIndex).toBeGreaterThan(scheduledHookIndex);
    expect(scheduledClickIndex).toBeGreaterThan(scheduledAttemptIndex);

    const publishBlogPostForwardPattern = /await\s+this\.publishBlogPost\(\s*resolvedOptions\.publishMode,\s*resolvedOptions\.scheduleDate,\s*resolvedOptions\.scheduleMethod,\s*runOptions,\s*\);/gu;
    expect(automationSource.match(publishBlogPostForwardPattern) ?? []).toHaveLength(2);

    const runIndex = automationSource.indexOf('async run(runOptions: RunOptions = {})');
    const resolveIndex = automationSource.indexOf('const resolvedOptions = this.resolveRunOptions(runOptions);', runIndex);
    const structuredIndex = automationSource.indexOf('await this.applyStructuredContent(resolvedOptions);', resolveIndex);
    const plainIndex = automationSource.indexOf('await this.applyPlainContent(resolvedOptions);', resolveIndex);
    expect(runIndex).toBeGreaterThanOrEqual(0);
    expect(resolveIndex).toBeGreaterThan(runIndex);
    expect(structuredIndex).toBeGreaterThan(resolveIndex);
    expect(plainIndex).toBeGreaterThan(structuredIndex);
  });

  it('binds the default worker_threads entrypoint loaded outside the import graph', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const poolPath = 'src/main/workers/base64Pool.ts';
    const workerPath = 'src/main/workers/base64Worker.ts';
    const poolSource = readFileSync(resolve(workspaceRoot, ...poolPath.split('/')), 'utf8');

    expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS).toEqual(expect.arrayContaining([
      poolPath,
      workerPath,
    ]));
    expect(poolSource).toMatch(/path\.join\(__dirname,\s*['"]base64Worker\.js['"]\)/u);
    expect(poolSource).toMatch(/new\s+Worker\(this\.workerPath\)/u);
  });

  it('covers the transitive runtime closure of every V3 module and production source path', () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const sourceSet = new Set(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS);
    const rendererAssembly = collectProductionRendererAssemblyInputs(workspaceRoot);
    const promptResources = collectProductionPromptResources(workspaceRoot);
    const roots = [
      ...collectRequiredV3Modules(workspaceRoot),
      ...PRODUCTION_RUNTIME_CLOSURE_ROOTS,
      ...rendererAssembly.sourceRoots,
      ...SUPPLEMENTAL_RUNTIME_CLOSURE_ROOTS,
    ];
    const { closure, unresolvedEdges } = collectRuntimeDependencyClosure(workspaceRoot, roots);
    const missingRuntimeSources = closure.filter(sourcePath => !sourceSet.has(sourcePath));
    const expectedRuntimeSources = [...new Set([
      'config/content_policy.yaml',
      'package-lock.json',
      'package.json',
      ...rendererAssembly.resources,
      ...promptResources,
      ...closure,
      'src/main.ts',
      'tsconfig.json',
    ])].sort();

    expect(unresolvedEdges).toEqual([]);
    expect(missingRuntimeSources).toEqual([]);
    expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS).toEqual(expectedRuntimeSources);
  });

  it('fails closed on computed module loads while resolving static TypeScript module forms', async () => {
    const root = await createFixture({
      'src/asset.json': '{"ok":true}\n',
      'src/importEquals.ts': 'export const imported = true;\n',
      'src/root.ts': [
        "import imported = require('./importEquals.js');",
        "void import('@google/generative-ai/server' as any);",
        "require.resolve('./asset.json');",
        "const computedPath = './unbound.js';",
        'void import(computedPath);',
        'void imported;',
        '',
      ].join('\n'),
    });

    const result = collectRuntimeDependencyClosure(root, ['src/root.ts']);

    expect(result.closure).toEqual([
      'src/asset.json',
      'src/importEquals.ts',
      'src/root.ts',
    ]);
    expect(result.unresolvedEdges).toHaveLength(1);
    expect(result.unresolvedEdges[0]).toMatch(/^src\/root\.ts:dynamic-module-load@/u);
  });

  it('binds production source assembly and fact-check RAG byte drift into runtime identity', async () => {
    const workspaceRoot = resolve(__dirname, '..', '..');
    const productionDependencyPaths = [
      'src/naverFactCheckRAG.ts',
      'src/sourceAssembler.ts',
    ] as const;
    const sourceFiles = Object.fromEntries(productionDependencyPaths.map(sourcePath => [
      sourcePath,
      readFileSync(resolve(workspaceRoot, ...sourcePath.split('/')), 'utf8'),
    ]));

    expect(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS)
      .toEqual(expect.arrayContaining(productionDependencyPaths));

    const baselineRoot = await createFixture(sourceFiles);
    const baselineSha256 = await computeContentQualityV3CandidateRuntimeSha256(
      baselineRoot,
      productionDependencyPaths,
    );
    for (const driftedPath of productionDependencyPaths) {
      const driftedRoot = await createFixture({
        ...sourceFiles,
        [driftedPath]: `${sourceFiles[driftedPath]}\n// audit drift\n`,
      });
      await expect(computeContentQualityV3CandidateRuntimeSha256(
        driftedRoot,
        productionDependencyPaths,
      )).resolves.not.toBe(baselineSha256);
    }
  });

  it('matches the source-controlled constant against actual workspace UTF-8 bytes', async () => {
    const workspaceRoot = resolve(__dirname, '..', '..');

    await expect(computeContentQualityV3CandidateRuntimeSha256(workspaceRoot))
      .resolves.toBe(CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256);
    await expect(verifyContentQualityV3CandidateRuntimeFingerprint(workspaceRoot))
      .resolves.toBeUndefined();
  }, 30_000);

  it('sorts paths before length-prefixed hashing and canonicalizes only CRLF to LF', async () => {
    const lfRoot = await createFixture({
      'src/a.ts': 'alpha\nbeta\n',
      'src/nested/b.ts': 'gamma\n',
    });
    const crlfRoot = await createFixture({
      'src/a.ts': 'alpha\r\nbeta\r\n',
      'src/nested/b.ts': 'gamma\r\n',
    });
    const ordered = ['src/a.ts', 'src/nested/b.ts'];
    const reversed = [...ordered].reverse();

    const lfDigest = await computeContentQualityV3CandidateRuntimeSha256(lfRoot, reversed);
    await expect(computeContentQualityV3CandidateRuntimeSha256(lfRoot, ordered))
      .resolves.toBe(lfDigest);
    await expect(computeContentQualityV3CandidateRuntimeSha256(crlfRoot, ordered))
      .resolves.toBe(lfDigest);
  });

  it('length-prefixes each source so concatenation-equivalent byte splits cannot collide', async () => {
    const leftRoot = await createFixture({
      'src/a.ts': 'ab',
      'src/b.ts': 'c',
    });
    const rightRoot = await createFixture({
      'src/a.ts': 'a',
      'src/b.ts': 'bc',
    });
    const paths = ['src/a.ts', 'src/b.ts'];

    await expect(computeContentQualityV3CandidateRuntimeSha256(leftRoot, paths))
      .resolves.not.toBe(await computeContentQualityV3CandidateRuntimeSha256(rightRoot, paths));
  });

  it.each([
    ['UTF-8 BOM', new Uint8Array([0xef, 0xbb, 0xbf, 0x61]), 'CANDIDATE_RUNTIME_BOM_NOT_ALLOWED'],
    ['lone CR', 'alpha\rbeta\n', 'CANDIDATE_RUNTIME_LONE_CR_NOT_ALLOWED'],
    ['invalid UTF-8', new Uint8Array([0xc3, 0x28]), 'CANDIDATE_RUNTIME_INVALID_UTF8'],
  ] as const)('rejects %s instead of silently changing source identity', async (_label, content, code) => {
    const root = await createFixture({ 'src/a.ts': content });

    await expect(computeContentQualityV3CandidateRuntimeSha256(root, ['src/a.ts']))
      .rejects.toMatchObject({ code });
  });

  it('rejects duplicate, escaping, absolute, and missing runtime paths', async () => {
    const root = await createFixture({ 'src/a.ts': 'alpha\n' });
    const candidates = [
      { paths: ['src/a.ts', 'src/a.ts'], code: 'CANDIDATE_RUNTIME_DUPLICATE_PATH' },
      { paths: ['../outside.ts'], code: 'CANDIDATE_RUNTIME_PATH_OUTSIDE_ROOT' },
      { paths: [resolve(root, 'src/a.ts')], code: 'CANDIDATE_RUNTIME_PATH_OUTSIDE_ROOT' },
      { paths: ['src/missing.ts'], code: 'CANDIDATE_RUNTIME_SOURCE_UNAVAILABLE' },
    ] as const;

    for (const candidate of candidates) {
      await expect(computeContentQualityV3CandidateRuntimeSha256(root, candidate.paths))
        .rejects.toMatchObject({ code: candidate.code });
    }
  });

  it('rejects a symlink in any allowlisted parent path component', async () => {
    const root = await createFixture({ 'src/base.ts': 'base\n' });
    const outside = await createFixture({ 'escape.ts': 'escape\n' });
    try {
      await symlink(
        outside,
        join(root, 'src', 'linked'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES' || code === 'ENOTSUP') return;
      throw error;
    }

    await expect(computeContentQualityV3CandidateRuntimeSha256(
      root,
      ['src/linked/escape.ts'],
    )).rejects.toMatchObject({ code: 'CANDIDATE_RUNTIME_SYMLINK_NOT_ALLOWED' });
  });

  it('fails closed when actual source bytes drift from the reviewed constant', async () => {
    const root = await createFixture({ 'src/a.ts': 'drifted\n' });

    await expect(verifyContentQualityV3CandidateRuntimeFingerprint(root, ['src/a.ts']))
      .rejects.toMatchObject({
        code: 'CANDIDATE_RUNTIME_FINGERPRINT_MISMATCH',
        expectedSha256: CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256,
      });
  });
});
