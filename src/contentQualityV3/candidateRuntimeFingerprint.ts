import { createHash, type Hash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { TextDecoder } from 'node:util';
import { CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 } from './candidateRuntimeFingerprintPin.js';

export { CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 } from './candidateRuntimeFingerprintPin.js';

export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS: readonly string[] = Object.freeze([
  'config/content_policy.yaml',
  'package-lock.json',
  'package.json',
  'public/ai-hook-modal.js',
  'public/floating-scroll.js',
  'public/index.html',
  'scripts/bundle-identifier-baseline.json',
  'scripts/bundleIdentifierScan.mjs',
  'scripts/copy-static.mjs',
  'scripts/rendererRuntimeDependencyInline.mjs',
  'scripts/sync-build-define.mjs',
  'src/account/cohortStore.ts',
  'src/account/proxyMapping.ts',
  'src/aeoRulesManager.ts',
  'src/agentCli/agenticEnvelope.ts',
  'src/agentCli/claudeRunner.ts',
  'src/agentCli/codexRunner.ts',
  'src/agentCli/detect.ts',
  'src/agentCli/failureMessage.ts',
  'src/agentCli/index.ts',
  'src/agentCli/parse.ts',
  'src/agentCli/productPolicy.ts',
  'src/agentCli/spawnHelper.ts',
  'src/agentCli/subscriptionEnv.ts',
  'src/agentCli/types.ts',
  'src/agentCli/validation.ts',
  'src/agentCli/version.ts',
  'src/agents/trendAnalyzer.ts',
  'src/aiHumanizer.ts',
  'src/analytics/benchmarkAnalyzer.ts',
  'src/analytics/dynamicSerpProbe.ts',
  'src/analytics/postMetricsStore.ts',
  'src/analytics/publishedPostTracker.ts',
  'src/analytics/serpHistory.ts',
  'src/analytics/serpProbe.ts',
  'src/analytics/unifiedSerpProbe.ts',
  'src/apiUsageTracker.ts',
  'src/auth/authFailureMessagePolicy.ts',
  'src/authgrDefense.ts',
  'src/automation/accountProfilePolicy.ts',
  'src/automation/bannerPhrasePool.ts',
  'src/automation/bodyArtifactCleanup.ts',
  'src/automation/bodyHashtagCleanup.ts',
  'src/automation/bodyTextCleanupPolicy.ts',
  'src/automation/chromeExecutablePolicy.ts',
  'src/automation/ctaHelpers.ts',
  'src/automation/editorDraftPopupPolicy.ts',
  'src/automation/editorFrameForensics.ts',
  'src/automation/editorHelpers.ts',
  'src/automation/editorNavigationUrlPolicy.ts',
  'src/automation/editorOfficialSiteTail.ts',
  'src/automation/editorReadinessDiagnostics.ts',
  'src/automation/editorTailActions.ts',
  'src/automation/editorTailPlan.ts',
  'src/automation/editorTitleHelpers.ts',
  'src/automation/editorUrlState.ts',
  'src/automation/editorVisibleSnapshot.ts',
  'src/automation/editorWriterTextSemantics.ts',
  'src/automation/ftcDisclosurePresets.ts',
  'src/automation/humanBehavior.ts',
  'src/automation/imageHelpers.ts',
  'src/automation/immediatePublishCommitPolicy.ts',
  'src/automation/loginPageNavigationPolicy.ts',
  'src/automation/loginStatusUrlPolicy.ts',
  'src/automation/manualLoginRecoveryPolicy.ts',
  'src/automation/naverImagePolicy.ts',
  'src/automation/postPublishReviewPlan.ts',
  'src/automation/postRunBrowserPolicy.ts',
  'src/automation/postRunPageHealthPolicy.ts',
  'src/automation/postRunStalePagePolicy.ts',
  'src/automation/prePublishAssertion.ts',
  'src/automation/publishCommitHook.ts',
  'src/automation/publishFailureClassifier.ts',
  'src/automation/publishHelpers.ts',
  'src/automation/publishModalSelectorPolicy.ts',
  'src/automation/publishOutcomeResolver.ts',
  'src/automation/publishPipelineLogPolicy.ts',
  'src/automation/publishSaveButtonPolicy.ts',
  'src/automation/publishedPostPageConfirmation.ts',
  'src/automation/richTextPaste.ts',
  'src/automation/runOptionsPolicy.ts',
  'src/automation/scheduleDatePolicy.ts',
  'src/automation/schedulePublishCommitPolicy.ts',
  'src/automation/selectors/ctaSelectors.ts',
  'src/automation/selectors/editorSelectors.ts',
  'src/automation/selectors/flowSelectors.ts',
  'src/automation/selectors/imageSelectors.ts',
  'src/automation/selectors/index.ts',
  'src/automation/selectors/loginSelectors.ts',
  'src/automation/selectors/placeSelectors.ts',
  'src/automation/selectors/publishSelectors.ts',
  'src/automation/selectors/selectorUtils.ts',
  'src/automation/selectors/shoppingCompetitorSelectors.ts',
  'src/automation/selectors/topBloggerSelectors.ts',
  'src/automation/silentFailureCounter.ts',
  'src/automation/timeouts.ts',
  'src/automation/typingUtils.ts',
  'src/browserSessionManager.ts',
  'src/browserUtils.ts',
  'src/configManager.ts',
  'src/content/adsPostEngine.ts',
  'src/content/affiliateAuthenticity.ts',
  'src/content/affiliateReviewDepth.ts',
  'src/content/categoryClassifier.ts',
  'src/content/celebrityAssertionSanitizer.ts',
  'src/content/chainCache.ts',
  'src/content/chainedGeneration.ts',
  'src/content/ctrCombat.ts',
  'src/content/evaluators/affiliateEval.ts',
  'src/content/evaluators/homefeedEval.ts',
  'src/content/evaluators/humanlikeEval.ts',
  'src/content/evaluators/safetyEval.ts',
  'src/content/evaluators/seoEval.ts',
  'src/content/evidenceIntegrity.ts',
  'src/content/exposureWinnersBlock.ts',
  'src/content/forbiddenPhrases.ts',
  'src/content/generalContentGuard.ts',
  'src/content/hallucinationCheck.ts',
  'src/content/homefeedExposurePattern.ts',
  'src/content/internalLinkManager.ts',
  'src/content/neoHookTitles.ts',
  'src/content/officialExposureRubric.ts',
  'src/content/personaBuilder.ts',
  'src/content/quality90Gate.ts',
  'src/content/qualityEvaluator.ts',
  'src/content/qualityGate.ts',
  'src/content/revenueEngine.ts',
  'src/content/reviewDecisionBlueprint.ts',
  'src/content/reviewGuard.ts',
  'src/content/sectionDistinctnessJudge.ts',
  'src/content/shoppingEvidenceSource.ts',
  'src/content/sourceFidelityCheck.ts',
  'src/content/subKeywordCoverageGate.ts',
  'src/contentAbortTimeoutPolicy.ts',
  'src/contentAiTabPrompt.ts',
  'src/contentBodyHooks.ts',
  'src/contentBodyTransforms.ts',
  'src/contentClaimSanitizer.ts',
  'src/contentCustomModePrompt.ts',
  'src/contentDuplicateCleanup.ts',
  'src/contentDuplicateHeuristics.ts',
  'src/contentEncodingPolicy.ts',
  'src/contentEngagementStrategy.ts',
  'src/contentEnvNumberPolicy.ts',
  'src/contentErrorDiagnostics.ts',
  'src/contentEscapeCleanup.ts',
  'src/contentExaggerationFilter.ts',
  'src/contentFactCheckConstraint.ts',
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
  'src/contentGenerator/schema.ts',
  'src/contentHeadingKeywordPatch.ts',
  'src/contentHeadingOptimizer.ts',
  'src/contentHomefeedValidator.ts',
  'src/contentHumanizationPolicy.ts',
  'src/contentJsonPromptFormat.ts',
  'src/contentKeywordHelpers.ts',
  'src/contentKeywordPrefix.ts',
  'src/contentKeywordTitlePolicy.ts',
  'src/contentLengthRetryPolicy.ts',
  'src/contentManualTitlePolicy.ts',
  'src/contentMergeOverlay.ts',
  'src/contentOptimizer.ts',
  'src/contentPipeline/facade.ts',
  'src/contentPipeline/mode.ts',
  'src/contentPipeline/resultContract.ts',
  'src/contentPlatitudeDetector.ts',
  'src/contentPolicy/auditStore.ts',
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
  'src/contentPolicy/policyService.ts',
  'src/contentPolicy/publicationStateStore.ts',
  'src/contentPolicy/publishGuard.ts',
  'src/contentPolicy/publishInputReconciler.ts',
  'src/contentPolicy/qualityGate.ts',
  'src/contentPolicy/recentPostsRepository.ts',
  'src/contentPolicy/searchIntentAnalyzer.ts',
  'src/contentPolicy/similarityGuard.ts',
  'src/contentPolicy/sourceEvidence.ts',
  'src/contentPolicy/textMetrics.ts',
  'src/contentPolicy/topicDiversifier.ts',
  'src/contentPolicy/types.ts',
  'src/contentProductCategory.ts',
  'src/contentPromptAddons.ts',
  'src/contentPromptAdherence.ts',
  'src/contentProviderRequestGate.ts',
  'src/contentProviderTimeoutPolicy.ts',
  'src/contentQualityChecker.ts',
  'src/contentQualityV3/affiliateGuard.ts',
  'src/contentQualityV3/baselineManifest.ts',
  'src/contentQualityV3/businessGuard.ts',
  'src/contentQualityV3/candidateRuntimeFingerprint.ts',
  'src/contentQualityV3/currentEvidenceBindings.ts',
  'src/contentQualityV3/durableProvenanceRegistry.ts',
  'src/contentQualityV3/editorCommitBoundary.ts',
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
  'src/contentQualityV3/productionPublishSafetyMode.ts',
  'src/contentQualityV3/prompt.ts',
  'src/contentQualityV3/providerPolicy.ts',
  'src/contentQualityV3/publicationBoundary.ts',
  'src/contentQualityV3/publishHandoffStore.ts',
  'src/contentQualityV3/rawEvidencePackage.ts',
  'src/contentQualityV3/recordedRolloutCase.ts',
  'src/contentQualityV3/releaseActivation.ts',
  'src/contentQualityV3/rolloutGate.ts',
  'src/contentQualityV3/rolloutGateAggregate.ts',
  'src/contentQualityV3/rolloutGateFinite.ts',
  'src/contentQualityV3/schema.ts',
  'src/contentQualityV3/strictOutputValidator.ts',
  'src/contentQualityV3/titleContract.ts',
  'src/contentRecentWinnersBlock.ts',
  'src/contentRetryPromptPolicy.ts',
  'src/contentReviewAnalysisPrompt.ts',
  'src/contentReviewHelpers.ts',
  'src/contentSanitizers.ts',
  'src/contentSelfCritique.ts',
  'src/contentSemanticScoring.ts',
  'src/contentSeoValidator.ts',
  'src/contentShoppingConnectValidation.ts',
  'src/contentShoppingDisclosure.ts',
  'src/contentShoppingPromptAddons.ts',
  'src/contentStructuredRecovery.ts',
  'src/contentStructuredValidator.ts',
  'src/contentTemperaturePolicy.ts',
  'src/contentTextHelpers.ts',
  'src/contentTextMetrics.ts',
  'src/contentTitleDuplicateRemoval.ts',
  'src/contentTitleEvaluator.ts',
  'src/contentTitleFormulas.ts',
  'src/contentTitleHelpers.ts',
  'src/contentTitlePrefixHelpers.ts',
  'src/contentTitleQuality.ts',
  'src/contentTitleSafetyChecks.ts',
  'src/contentTitleSelector.ts',
  'src/contentTitleValidators.ts',
  'src/contentTitleYearGuard.ts',
  'src/contentTonePolicy.ts',
  'src/contentUrlModeDirective.ts',
  'src/contentViralOptimizer.ts',
  'src/crawler/advancedAutomator.ts',
  'src/crawler/crawlerBrowser.ts',
  'src/crawler/naverStorePriceExtractor.ts',
  'src/crawler/productSpecCrawler.ts',
  'src/crawler/shopping/brandStoreAffiliateCrawler.ts',
  'src/crawler/shopping/providers/BaseProvider.ts',
  'src/crawler/shopping/providers/BrandStoreProvider.ts',
  'src/crawler/shopping/providers/brandStore/brandStoreDom.ts',
  'src/crawler/shopping/types.ts',
  'src/crawler/shopping/utils/UrlResolver.ts',
  'src/crawler/shopping/utils/genericReviewDom.ts',
  'src/crawler/shopping/utils/imageUrlUtils.ts',
  'src/crawler/shopping/utils/jsonLdProduct.ts',
  'src/crawler/shopping/utils/officialNaverProductGallery.ts',
  'src/crawler/shopping/utils/reviewTextSelection.ts',
  'src/crawler/smartCrawler.ts',
  'src/crawler/utils/proxyManager.ts',
  'src/debug/diagnosticsBuffer.ts',
  'src/debug/domDumpManager.ts',
  'src/debug/privacyScrubber.ts',
  'src/errorRecovery.ts',
  'src/errors/AutomationError.ts',
  'src/errors/errorCodes.ts',
  'src/freeTrialPolicy.ts',
  'src/gemini.ts',
  'src/geminiBillingBlock.ts',
  'src/geminiCostOptimizer.ts',
  'src/geminiQuotaPolicy.ts',
  'src/generation/submissionPolicy.ts',
  'src/ghostCursorHelper.ts',
  'src/image/contextualImagePrompt.ts',
  'src/image/geminiAutoRecovery.ts',
  'src/image/geminiTableExtractor.ts',
  'src/image/imageErrorMessages.ts',
  'src/image/imageHashUtils.ts',
  'src/image/imageUtils.ts',
  'src/image/koreanTitleWrap.ts',
  'src/image/legacyImageModelPolicy.ts',
  'src/image/nanoBananaProGenerator.ts',
  'src/image/promptBuilder.ts',
  'src/image/publishImageSequence.ts',
  'src/image/referenceImageLoader.ts',
  'src/image/referenceImagePolicy.ts',
  'src/image/shoppingReferenceGeneration.ts',
  'src/image/tableImageGenerator.ts',
  'src/image/types.ts',
  'src/imageNarrative/context.ts',
  'src/imageNarrative/cost/budgetGuard.ts',
  'src/imageNarrative/cost/imageHashCache.ts',
  'src/imageNarrative/inferenceAggregator/aggregator.ts',
  'src/imageNarrative/inferenceAggregator/exifEnricher.ts',
  'src/imageNarrative/inferenceAggregator/hallucinationGuard.ts',
  'src/imageNarrative/inferenceAggregator/ordering.ts',
  'src/imageNarrative/inferenceAggregator/sectionBuilder.ts',
  'src/imageNarrative/narrativeBuilder/builder.ts',
  'src/imageNarrative/visionInference/claudeVisionAdapter.ts',
  'src/imageNarrative/visionInference/geminiVisionAdapter.ts',
  'src/imageNarrative/visionInference/inferencePrompts.ts',
  'src/imageNarrative/visionInference/openaiVisionAdapter.ts',
  'src/imageNarrative/visionInference/visionRouter.ts',
  'src/jsonParser.ts',
  'src/learning/recentWinnersExtractor.ts',
  'src/licenseManager.ts',
  'src/main.ts',
  'src/main/blobStore/fsBackend.ts',
  'src/main/blobStore/index.ts',
  'src/main/blobStore/singleton.ts',
  'src/main/ipc/blogHandlers.ts',
  'src/main/services/AutomationService.ts',
  'src/main/services/BlogExecutor.ts',
  'src/main/userDataMigration.ts',
  'src/main/utils/adsPowerManager.ts',
  'src/main/utils/authUtils.ts',
  'src/main/utils/base64Async.ts',
  'src/main/utils/ipcHelpers.ts',
  'src/main/utils/logger.ts',
  'src/main/workers/base64Pool.ts',
  'src/main/workers/base64Worker.ts',
  'src/monitor/chainedGenMetrics.ts',
  'src/naverBlogAutomation.ts',
  'src/naverBlogCrawler.ts',
  'src/naverFactCheckRAG.ts',
  'src/naverSearchApi.ts',
  'src/openaiResponses.ts',
  'src/perplexity.ts',
  'src/perplexityFactCheck.ts',
  'src/postLimitManagerPerAccount.ts',
  'src/preload.ts',
  'src/promptLoader.ts',
  'src/promptSplitter.ts',
  'src/prompts/affiliate/base.prompt',
  'src/prompts/affiliate/chain/editor.prompt',
  'src/prompts/affiliate/chain/faq.prompt',
  'src/prompts/affiliate/chain/stage1_classify.prompt',
  'src/prompts/affiliate/chain/stage2_persona.prompt',
  'src/prompts/affiliate/chain/stage3_draft.prompt',
  'src/prompts/affiliate/chain/stage4_factgate.prompt',
  'src/prompts/affiliate/chain/stage5_optimize.prompt',
  'src/prompts/affiliate/shopping_expert_review.prompt',
  'src/prompts/affiliate/shopping_review.prompt',
  'src/prompts/affiliate/shopping_spec_analysis.prompt',
  'src/prompts/automation.prompt',
  'src/prompts/business/base.prompt',
  'src/prompts/business/construction.prompt',
  'src/prompts/business/local.prompt',
  'src/prompts/business/medical.prompt',
  'src/prompts/business/professional.prompt',
  'src/prompts/homefeed/base.prompt',
  'src/prompts/homefeed/entertainment.prompt',
  'src/prompts/homefeed/fashion.prompt',
  'src/prompts/homefeed/food.prompt',
  'src/prompts/homefeed/health.prompt',
  'src/prompts/homefeed/it.prompt',
  'src/prompts/homefeed/life.prompt',
  'src/prompts/homefeed/living.prompt',
  'src/prompts/homefeed/parenting.prompt',
  'src/prompts/homefeed/pet.prompt',
  'src/prompts/homefeed/society.prompt',
  'src/prompts/homefeed/sports.prompt',
  'src/prompts/homefeed/tips.prompt',
  'src/prompts/homefeed/travel.prompt',
  'src/prompts/imageNarrative/base.prompt',
  'src/prompts/imageNarrative/daily.prompt',
  'src/prompts/imageNarrative/food.prompt',
  'src/prompts/imageNarrative/lodging.prompt',
  'src/prompts/imageNarrative/review.prompt',
  'src/prompts/imageNarrative/travel.prompt',
  'src/prompts/mate/base.prompt',
  'src/prompts/seo/ai-tab-friendly.prompt',
  'src/prompts/seo/base.prompt',
  'src/prompts/seo/entertainment.prompt',
  'src/prompts/seo/fashion.prompt',
  'src/prompts/seo/food.prompt',
  'src/prompts/seo/geo-overlay.prompt',
  'src/prompts/seo/health.prompt',
  'src/prompts/seo/it.prompt',
  'src/prompts/seo/life.prompt',
  'src/prompts/seo/living.prompt',
  'src/prompts/seo/parenting.prompt',
  'src/prompts/seo/pet.prompt',
  'src/prompts/seo/society.prompt',
  'src/prompts/seo/sports.prompt',
  'src/prompts/seo/tips.prompt',
  'src/prompts/seo/travel.prompt',
  'src/prompts/shared/exposure-structure.prompt',
  'src/prompts/shared/homefeed-90-quality.prompt',
  'src/prompts/shared/human-writing-anti-pattern.prompt',
  'src/prompts/shared/mate-90-quality.prompt',
  'src/prompts/shared/official-exposure-rubric.prompt',
  'src/prompts/shared/seo-90-quality.prompt',
  'src/prompts/shared/situation-depth.prompt',
  'src/prompts/shared/strong-headings.prompt',
  'src/prompts/title/affiliate.prompt',
  'src/prompts/title/affiliate/base.prompt',
  'src/prompts/title/affiliate/fashion.prompt',
  'src/prompts/title/affiliate/health.prompt',
  'src/prompts/title/affiliate/it.prompt',
  'src/prompts/title/affiliate/living.prompt',
  'src/prompts/title/business/base.prompt',
  'src/prompts/title/homefeed.prompt',
  'src/prompts/title/homefeed/base.prompt',
  'src/prompts/title/homefeed/entertainment.prompt',
  'src/prompts/title/homefeed/fashion.prompt',
  'src/prompts/title/homefeed/food.prompt',
  'src/prompts/title/homefeed/health.prompt',
  'src/prompts/title/homefeed/it.prompt',
  'src/prompts/title/homefeed/life.prompt',
  'src/prompts/title/homefeed/living.prompt',
  'src/prompts/title/homefeed/parenting.prompt',
  'src/prompts/title/homefeed/pet.prompt',
  'src/prompts/title/homefeed/society.prompt',
  'src/prompts/title/homefeed/sports.prompt',
  'src/prompts/title/homefeed/tips.prompt',
  'src/prompts/title/homefeed/travel.prompt',
  'src/prompts/title/seo.prompt',
  'src/prompts/title/seo/base.prompt',
  'src/prompts/title/seo/entertainment.prompt',
  'src/prompts/title/seo/fashion.prompt',
  'src/prompts/title/seo/food.prompt',
  'src/prompts/title/seo/health.prompt',
  'src/prompts/title/seo/it.prompt',
  'src/prompts/title/seo/life.prompt',
  'src/prompts/title/seo/living.prompt',
  'src/prompts/title/seo/parenting.prompt',
  'src/prompts/title/seo/pet.prompt',
  'src/prompts/title/seo/society.prompt',
  'src/prompts/title/seo/sports.prompt',
  'src/prompts/title/seo/tips.prompt',
  'src/prompts/title/seo/travel.prompt',
  'src/providerRateLimitWaitPolicy.ts',
  'src/quotaManager.ts',
  'src/rag/embedder.ts',
  'src/rag/vectorStore.ts',
  'src/renderer/automationHelpers.ts',
  'src/renderer/components/HeadingImageSettings.ts',
  'src/renderer/components/ProgressModal.ts',
  'src/renderer/components/PromptEditModal.ts',
  'src/renderer/components/RecoveryBlockingModal.ts',
  'src/renderer/components/RecoveryFollowupActions.ts',
  'src/renderer/components/VeoProgressOverlay.ts',
  'src/renderer/modules/accountSettingsManager.ts',
  'src/renderer/modules/aiAssistant.ts',
  'src/renderer/modules/apiGuideModals.ts',
  'src/renderer/modules/articleTableComposer.ts',
  'src/renderer/modules/bestProductModal.ts',
  'src/renderer/modules/businessAngleRotation.ts',
  'src/renderer/modules/charCountDisplay.ts',
  'src/renderer/modules/contentGeneration.ts',
  'src/renderer/modules/contentPolicyDashboard.ts',
  'src/renderer/modules/contentPreviewAndLibrary.ts',
  'src/renderer/modules/continuousPublishModeHelpers.ts',
  'src/renderer/modules/continuousPublishing.ts',
  'src/renderer/modules/costAndAutoGen.ts',
  'src/renderer/modules/credentialsSave.ts',
  'src/renderer/modules/dashboardUI.ts',
  'src/renderer/modules/dropshotLoginUi.ts',
  'src/renderer/modules/enhancedFetch.ts',
  'src/renderer/modules/featureLockModal.ts',
  'src/renderer/modules/formAndAutomation.ts',
  'src/renderer/modules/formUtilities.ts',
  'src/renderer/modules/fullAutoFlow.ts',
  'src/renderer/modules/guideModals.ts',
  'src/renderer/modules/headingImageGen.ts',
  'src/renderer/modules/imageDisplayGrid.ts',
  'src/renderer/modules/imageGenStudio.ts',
  'src/renderer/modules/imageGenStudioCore.ts',
  'src/renderer/modules/imageGenStudioLightbox.ts',
  'src/renderer/modules/imageManagementTab.ts',
  'src/renderer/modules/imageManagerCore.ts',
  'src/renderer/modules/imageNarrativeMode.ts',
  'src/renderer/modules/imageNarrativeQuickMode.ts',
  'src/renderer/modules/imageNarrativeReview.ts',
  'src/renderer/modules/imageNarrativeUpload.ts',
  'src/renderer/modules/imageSyncService.ts',
  'src/renderer/modules/intervalJitter.ts',
  'src/renderer/modules/licenseUI.ts',
  'src/renderer/modules/localFolderImageLoader.ts',
  'src/renderer/modules/localImageModals.ts',
  'src/renderer/modules/multiAccountManager.ts',
  'src/renderer/modules/noticeAdmin.ts',
  'src/renderer/modules/openaiImageGuard.ts',
  'src/renderer/modules/paywallSystem.ts',
  'src/renderer/modules/pipelineConfig.ts',
  'src/renderer/modules/postListUI.ts',
  'src/renderer/modules/postManager.ts',
  'src/renderer/modules/priceInfoModal.ts',
  'src/renderer/modules/promptTranslation.ts',
  'src/renderer/modules/publishingHandlers.ts',
  'src/renderer/modules/rendererUtils.ts',
  'src/renderer/modules/revenueOperationsDashboard.ts',
  'src/renderer/modules/scheduleDistributor.ts',
  'src/renderer/modules/scheduleManager.ts',
  'src/renderer/modules/tailUIUtils.ts',
  'src/renderer/modules/thumbnailGenerator.ts',
  'src/renderer/modules/thumbnailPreview.ts',
  'src/renderer/modules/titleGeneration.ts',
  'src/renderer/modules/tutorialsTab.ts',
  'src/renderer/modules/undoImageChange.ts',
  'src/renderer/modules/unifiedDOMCache.ts',
  'src/renderer/modules/videoManager.ts',
  'src/renderer/performanceUtils.ts',
  'src/renderer/renderer.ts',
  'src/renderer/scheduleAndUI.ts',
  'src/renderer/utils/agentLoginCodePrompt.ts',
  'src/renderer/utils/agentModeGuard.ts',
  'src/renderer/utils/agentProductPolicyUi.ts',
  'src/renderer/utils/agentStatusRefreshCoordinator.ts',
  'src/renderer/utils/apiClient.ts',
  'src/renderer/utils/appEventsHandler.ts',
  'src/renderer/utils/articleTableClipboard.ts',
  'src/renderer/utils/articleTableUtils.ts',
  'src/renderer/utils/brokenImageRegistry.ts',
  'src/renderer/utils/browserPreviewBridge.ts',
  'src/renderer/utils/categoryModalUtils.ts',
  'src/renderer/utils/categoryNormalizeUtils.ts',
  'src/renderer/utils/contentPolicyContext.ts',
  'src/renderer/utils/dateUtils.ts',
  'src/renderer/utils/errorAndAutosave.ts',
  'src/renderer/utils/errorHandlerUtils.ts',
  'src/renderer/utils/errorUtils.ts',
  'src/renderer/utils/ftcModeTransition.ts',
  'src/renderer/utils/fullAutoUtils.ts',
  'src/renderer/utils/geminiModelSync.ts',
  'src/renderer/utils/geminiPlanMemo.ts',
  'src/renderer/utils/hashtagUtils.ts',
  'src/renderer/utils/headingKeyUtils.ts',
  'src/renderer/utils/headingVideoPreviewUtils.ts',
  'src/renderer/utils/htmlUtils.ts',
  'src/renderer/utils/idleInit.ts',
  'src/renderer/utils/imageCostUtils.ts',
  'src/renderer/utils/imageDisplayHelpers.ts',
  'src/renderer/utils/imageHelpers.ts',
  'src/renderer/utils/imageSkipCheck.ts',
  'src/renderer/utils/imageStorageNormalize.ts',
  'src/renderer/utils/kenBurnsStyles.ts',
  'src/renderer/utils/pipelineRunCoordinator.ts',
  'src/renderer/utils/postStorageUtils.ts',
  'src/renderer/utils/promptOverrideUtils.ts',
  'src/renderer/utils/publishInterruptionPolicy.ts',
  'src/renderer/utils/realBlogCategoryPolicy.ts',
  'src/renderer/utils/safeExecute.ts',
  'src/renderer/utils/semiAutoHeadingExtractor.ts',
  'src/renderer/utils/semiAutoImageSearch.ts',
  'src/renderer/utils/settingsModal.ts',
  'src/renderer/utils/shoppingConnectEvents.ts',
  'src/renderer/utils/shoppingConnectUtils.ts',
  'src/renderer/utils/shoppingImageLocalSave.ts',
  'src/renderer/utils/stabilityUtils.ts',
  'src/renderer/utils/storageUtils.ts',
  'src/renderer/utils/subImageMode.ts',
  'src/renderer/utils/textFormatUtils.ts',
  'src/renderer/utils/time24Select.ts',
  'src/renderer/utils/titleUtils.ts',
  'src/renderer/utils/uiManagers.ts',
  'src/renderer/utils/veoSafetyUtils.ts',
  'src/renderer/utils/veoVideoUtils.ts',
  'src/renderer/utils/videoProviderUtils.ts',
  'src/rssSearcher.ts',
  'src/runtime/adaptiveLimiter.ts',
  'src/runtime/cleanupTimeout.ts',
  'src/runtime/geminiTextModelNormalization.ts',
  'src/runtime/geminiVisionQuotaGuard.ts',
  'src/runtime/imageProviderMigration.ts',
  'src/runtime/modelRegistry.ts',
  'src/runtime/textModelConstants.ts',
  'src/runtime/userVisibleError.ts',
  'src/runtime/version.generated.ts',
  'src/runtime/zombieRecovery.ts',
  'src/scheduledPostsManager.ts',
  'src/scheduler/appScheduleQueue.ts',
  'src/scheduler/scheduledPostLookupPolicy.ts',
  'src/schemas/productInfoSchema.ts',
  'src/security/encryptionMigrator.ts',
  'src/security/safeStoragePort.ts',
  'src/security/safeStorageWrapper.ts',
  'src/security/secretValueUtils.ts',
  'src/seoCalculator.ts',
  'src/services/contentValidationPipeline.ts',
  'src/services/featureFlagConfig.ts',
  'src/services/priceNormalizer.ts',
  'src/session/sessionEventLogger.ts',
  'src/sessionPersistence.ts',
  'src/sourceAssembler.ts',
  'src/thumbnailService.ts',
  'src/titleSelector.ts',
  'src/types/automation.ts',
  'src/ui/components/DomHelper.ts',
  'src/ui/components/UIFactory.ts',
  'src/ui/components/index.ts',
  'src/ui/config/categories.ts',
  'src/ui/config/constants.ts',
  'src/ui/config/index.ts',
  'src/ui/core/Application.ts',
  'src/ui/core/index.ts',
  'src/ui/index.ts',
  'src/ui/managers/ErrorHandler.ts',
  'src/ui/managers/EventManager.ts',
  'src/ui/managers/index.ts',
  'src/ui/services/ApiBridge.ts',
  'src/ui/store/GlobalStore.ts',
  'src/ui/types/index.ts',
  'src/ui/utils/domUtils.ts',
  'src/ui/utils/functionUtils.ts',
  'src/ui/utils/index.ts',
  'src/utils/botBackoff.ts',
  'src/utils/memoryManager.ts',
  'src/utils/openaiRpmThrottler.ts',
  'src/validators/seo/comparisonBlockScanner.ts',
  'src/validators/seo/curiosityHookScanner.ts',
  'src/validators/seo/definitionFirstSentenceScanner.ts',
  'src/validators/seo/faqHeadingScanner.ts',
  'src/validators/seo/h2QuestionRatioScanner.ts',
  'src/validators/seo/imageRatioScanner.ts',
  'src/validators/seo/longtailDepthScanner.ts',
  'src/validators/seo/mainKeywordPositionScanner.ts',
  'src/validators/seo/sourceFooterScanner.ts',
  'tsconfig.json',
]);

export type CandidateRuntimeFingerprintErrorCode =
  | 'CANDIDATE_RUNTIME_INVALID_PATH'
  | 'CANDIDATE_RUNTIME_PATH_OUTSIDE_ROOT'
  | 'CANDIDATE_RUNTIME_DUPLICATE_PATH'
  | 'CANDIDATE_RUNTIME_SOURCE_UNAVAILABLE'
  | 'CANDIDATE_RUNTIME_SYMLINK_NOT_ALLOWED'
  | 'CANDIDATE_RUNTIME_BOM_NOT_ALLOWED'
  | 'CANDIDATE_RUNTIME_INVALID_UTF8'
  | 'CANDIDATE_RUNTIME_LONE_CR_NOT_ALLOWED'
  | 'CANDIDATE_RUNTIME_FINGERPRINT_MISMATCH';

export class CandidateRuntimeFingerprintError extends Error {
  readonly code: CandidateRuntimeFingerprintErrorCode;
  readonly expectedSha256?: string;
  readonly actualSha256?: string;

  constructor(
    code: CandidateRuntimeFingerprintErrorCode,
    details: Readonly<{ expectedSha256?: string; actualSha256?: string }> = {},
  ) {
    super(code);
    this.name = 'CandidateRuntimeFingerprintError';
    this.code = code;
    this.expectedSha256 = details.expectedSha256;
    this.actualSha256 = details.actualSha256;
  }
}

const UTF8_BOM = Object.freeze([0xef, 0xbb, 0xbf] as const);
const FINGERPRINT_DOMAIN = Buffer.from('CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_V1', 'utf8');

function fail(
  code: CandidateRuntimeFingerprintErrorCode,
  details?: Readonly<{ expectedSha256?: string; actualSha256?: string }>,
): never {
  throw new CandidateRuntimeFingerprintError(code, details);
}

function normalizeRelativeSourcePath(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return fail('CANDIDATE_RUNTIME_INVALID_PATH');
  }
  if (
    isAbsolute(value)
    || win32.isAbsolute(value)
    || /^[A-Za-z]:/u.test(value)
    || value.startsWith('/')
  ) {
    return fail('CANDIDATE_RUNTIME_PATH_OUTSIDE_ROOT');
  }
  if (value.includes('\\')) return fail('CANDIDATE_RUNTIME_INVALID_PATH');
  const segments = value.split('/');
  if (segments.some(segment => segment === '..')) {
    return fail('CANDIDATE_RUNTIME_PATH_OUTSIDE_ROOT');
  }
  if (segments.some(segment => segment.length === 0 || segment === '.')) {
    return fail('CANDIDATE_RUNTIME_INVALID_PATH');
  }
  return segments.join('/');
}

function isInsideRoot(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot.length > 0
    && fromRoot !== '..'
    && !fromRoot.startsWith(`..${sep}`)
    && !isAbsolute(fromRoot);
}

function canonicalizeUtf8Source(bytes: Uint8Array): Buffer {
  if (
    bytes.length >= UTF8_BOM.length
    && UTF8_BOM.every((value, index) => bytes[index] === value)
  ) {
    return fail('CANDIDATE_RUNTIME_BOM_NOT_ALLOWED');
  }

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return fail('CANDIDATE_RUNTIME_INVALID_UTF8');
  }
  const canonicalLf = decoded.replace(/\r\n/gu, '\n');
  if (canonicalLf.includes('\r')) return fail('CANDIDATE_RUNTIME_LONE_CR_NOT_ALLOWED');
  return Buffer.from(canonicalLf, 'utf8');
}

function updateLengthPrefixed(hash: Hash, bytes: Uint8Array): void {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

async function resolveTrustedWorkspaceRoot(workspaceRoot: string): Promise<{
  readonly root: string;
  readonly realRoot: string;
}> {
  const root = resolve(workspaceRoot);
  try {
    const stats = await lstat(root);
    if (stats.isSymbolicLink()) return fail('CANDIDATE_RUNTIME_SYMLINK_NOT_ALLOWED');
    if (!stats.isDirectory()) return fail('CANDIDATE_RUNTIME_SOURCE_UNAVAILABLE');
    return Object.freeze({ root, realRoot: await realpath(root) });
  } catch (error) {
    if (error instanceof CandidateRuntimeFingerprintError) throw error;
    return fail('CANDIDATE_RUNTIME_SOURCE_UNAVAILABLE');
  }
}

async function readCanonicalSource(
  workspaceRoot: string,
  realWorkspaceRoot: string,
  relativePath: string,
): Promise<Buffer> {
  const absolutePath = resolve(workspaceRoot, ...relativePath.split('/'));
  if (!isInsideRoot(workspaceRoot, absolutePath)) {
    return fail('CANDIDATE_RUNTIME_PATH_OUTSIDE_ROOT');
  }
  try {
    let currentPath = workspaceRoot;
    const segments = relativePath.split('/');
    for (const [index, segment] of segments.entries()) {
      currentPath = resolve(currentPath, segment);
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) return fail('CANDIDATE_RUNTIME_SYMLINK_NOT_ALLOWED');
      const finalSegment = index === segments.length - 1;
      if ((!finalSegment && !stats.isDirectory()) || (finalSegment && !stats.isFile())) {
        return fail('CANDIDATE_RUNTIME_SOURCE_UNAVAILABLE');
      }
    }
    const realSourcePath = await realpath(absolutePath);
    if (!isInsideRoot(realWorkspaceRoot, realSourcePath)) {
      return fail('CANDIDATE_RUNTIME_PATH_OUTSIDE_ROOT');
    }
    return canonicalizeUtf8Source(await readFile(absolutePath));
  } catch (error) {
    if (error instanceof CandidateRuntimeFingerprintError) throw error;
    return fail('CANDIDATE_RUNTIME_SOURCE_UNAVAILABLE');
  }
}

export async function computeContentQualityV3CandidateRuntimeSha256(
  workspaceRoot: string,
  relativePaths: readonly string[] = CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS,
): Promise<string> {
  const { root, realRoot } = await resolveTrustedWorkspaceRoot(workspaceRoot);
  const normalizedPaths = Array.from(relativePaths, normalizeRelativeSourcePath).sort();
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    return fail('CANDIDATE_RUNTIME_DUPLICATE_PATH');
  }

  const hash = createHash('sha256');
  updateLengthPrefixed(hash, FINGERPRINT_DOMAIN);
  const pathCount = Buffer.alloc(8);
  pathCount.writeBigUInt64BE(BigInt(normalizedPaths.length));
  hash.update(pathCount);

  for (const relativePath of normalizedPaths) {
    updateLengthPrefixed(hash, Buffer.from(relativePath, 'utf8'));
    updateLengthPrefixed(hash, await readCanonicalSource(root, realRoot, relativePath));
  }
  return hash.digest('hex');
}

export async function verifyContentQualityV3CandidateRuntimeFingerprint(
  workspaceRoot: string,
  relativePaths: readonly string[] = CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS,
): Promise<void> {
  const actualSha256 = await computeContentQualityV3CandidateRuntimeSha256(
    workspaceRoot,
    relativePaths,
  );
  if (actualSha256 !== CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256) {
    return fail('CANDIDATE_RUNTIME_FINGERPRINT_MISMATCH', {
      expectedSha256: CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256,
      actualSha256,
    });
  }
}
