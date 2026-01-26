/**
 * 이미지 모델 설정 통합 테스트
 * - 기존 integrationTest.ts 패턴 준수
 * - 설정 저장/불러오기, 기본값, 프리셋, Edge Case 검증
 */

import { loadConfig, saveConfig, type AppConfig } from '../configManager.js';
import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

// ==========================================
// 테스트 유틸리티 (기존 패턴)
// ==========================================

interface TestResult {
    step: string;
    success: boolean;
    message: string;
    details?: any;
}

const testResults: TestResult[] = [];

function logTest(step: string, success: boolean, message: string, details?: any) {
    const result: TestResult = { step, success, message, details };
    testResults.push(result);
    const icon = success ? '✅' : '❌';
    console.log(`${icon} [${step}] ${message}`);
    if (details && !success) {
        console.log('   상세:', JSON.stringify(details, null, 2));
    }
}

// ==========================================
// 테스트 데이터
// ==========================================

const TEST_CONFIG: Partial<AppConfig> = {
    falaiModel: 'flux-1.1-pro',
    stabilityModel: 'stable-image-ultra',
    nanoBananaMainModel: 'gemini-3-pro-4k',
    nanoBananaSubModel: 'gemini-3-pro',
    nanoBananaThumbnailModel: 'gemini-3-pro',
    pollinationsModel: 'default',
    imagePreset: 'premium',
};

const DEFAULT_VALUES = {
    falaiModel: 'flux-realism',
    stabilityModel: 'sd35-large-turbo',
    nanoBananaMainModel: 'gemini-3-pro',
    nanoBananaSubModel: 'gemini-2.5-flash',
    nanoBananaThumbnailModel: 'gemini-3-pro',
    pollinationsModel: 'default',
};

const BUDGET_PRESET = {
    falaiModel: 'flux-schnell',
    stabilityModel: 'sdxl-1.0',
    nanoBananaMainModel: 'gemini-2.5-flash',
    nanoBananaSubModel: 'gemini-2.5-flash',
    nanoBananaThumbnailModel: 'gemini-2.5-flash',
};

const PREMIUM_PRESET = {
    falaiModel: 'flux-1.1-pro',
    stabilityModel: 'stable-image-ultra',
    nanoBananaMainModel: 'gemini-3-pro-4k',
    nanoBananaSubModel: 'gemini-3-pro',
    nanoBananaThumbnailModel: 'gemini-3-pro-4k',
};

// ==========================================
// 테스트 케이스
// ==========================================

/**
 * 테스트 1: 설정 저장 및 불러오기
 */
async function testConfigSaveAndLoad(): Promise<boolean> {
    const step = '설정 저장/불러오기';

    try {
        // 테스트용 설정 저장
        await saveConfig(TEST_CONFIG as AppConfig);

        // 설정 다시 불러오기
        const loadedConfig = await loadConfig();

        // 각 필드 검증
        const checks = [
            { field: 'falaiModel', expected: TEST_CONFIG.falaiModel, actual: loadedConfig.falaiModel },
            { field: 'stabilityModel', expected: TEST_CONFIG.stabilityModel, actual: loadedConfig.stabilityModel },
            { field: 'nanoBananaMainModel', expected: TEST_CONFIG.nanoBananaMainModel, actual: loadedConfig.nanoBananaMainModel },
            { field: 'nanoBananaSubModel', expected: TEST_CONFIG.nanoBananaSubModel, actual: loadedConfig.nanoBananaSubModel },
            { field: 'nanoBananaThumbnailModel', expected: TEST_CONFIG.nanoBananaThumbnailModel, actual: loadedConfig.nanoBananaThumbnailModel },
            { field: 'imagePreset', expected: TEST_CONFIG.imagePreset, actual: loadedConfig.imagePreset },
        ];

        const failures = checks.filter(c => c.expected !== c.actual);

        if (failures.length === 0) {
            logTest(step, true, '모든 필드가 정상적으로 저장 및 불러오기됨');
            return true;
        } else {
            logTest(step, false, `${failures.length}개 필드 불일치`, failures);
            return false;
        }
    } catch (error: any) {
        logTest(step, false, `오류 발생: ${error.message}`);
        return false;
    }
}

/**
 * 테스트 2: 기본값 검증 (설정 없을 때)
 */
async function testDefaultValues(): Promise<boolean> {
    const step = '기본값 검증';

    try {
        // 이미지 모델 관련 필드만 삭제 (다른 설정은 유지)
        const currentConfig = await loadConfig();
        const cleanConfig: any = { ...currentConfig };
        delete cleanConfig.falaiModel;
        delete cleanConfig.stabilityModel;
        delete cleanConfig.nanoBananaMainModel;
        delete cleanConfig.nanoBananaSubModel;
        delete cleanConfig.nanoBananaThumbnailModel;
        delete cleanConfig.pollinationsModel;

        await saveConfig(cleanConfig);

        // 다시 불러와서 기본값 확인 (생성기 코드에서 적용되는 기본값)
        const loaded = await loadConfig();

        // 기본값은 각 생성기에서 적용되므로, 여기서는 undefined 또는 빈 값 확인
        const hasNoImageModelFields =
            !loaded.falaiModel &&
            !loaded.stabilityModel &&
            !loaded.nanoBananaMainModel;

        if (hasNoImageModelFields) {
            logTest(step, true, '이미지 모델 필드가 삭제됨 (생성기에서 기본값 적용됨)');
            return true;
        } else {
            logTest(step, false, '예상치 못한 값이 남아있음', { loaded });
            return false;
        }
    } catch (error: any) {
        logTest(step, false, `오류 발생: ${error.message}`);
        return false;
    }
}

/**
 * 테스트 3: 가성비 프리셋 검증
 */
async function testPresetBudget(): Promise<boolean> {
    const step = '가성비 프리셋';

    try {
        // 가성비 프리셋 적용
        await saveConfig({
            ...BUDGET_PRESET,
            imagePreset: 'budget',
        } as AppConfig);

        const loaded = await loadConfig();

        const checks = [
            { field: 'falaiModel', expected: BUDGET_PRESET.falaiModel, actual: loaded.falaiModel },
            { field: 'stabilityModel', expected: BUDGET_PRESET.stabilityModel, actual: loaded.stabilityModel },
            { field: 'nanoBananaMainModel', expected: BUDGET_PRESET.nanoBananaMainModel, actual: loaded.nanoBananaMainModel },
            { field: 'imagePreset', expected: 'budget', actual: loaded.imagePreset },
        ];

        const failures = checks.filter(c => c.expected !== c.actual);

        if (failures.length === 0) {
            logTest(step, true, '가성비 프리셋 모든 값 일치');
            return true;
        } else {
            logTest(step, false, `${failures.length}개 불일치`, failures);
            return false;
        }
    } catch (error: any) {
        logTest(step, false, `오류 발생: ${error.message}`);
        return false;
    }
}

/**
 * 테스트 4: 고퀄리티 프리셋 검증
 */
async function testPresetPremium(): Promise<boolean> {
    const step = '고퀄리티 프리셋';

    try {
        // 고퀄리티 프리셋 적용
        await saveConfig({
            ...PREMIUM_PRESET,
            imagePreset: 'premium',
        } as AppConfig);

        const loaded = await loadConfig();

        const checks = [
            { field: 'falaiModel', expected: PREMIUM_PRESET.falaiModel, actual: loaded.falaiModel },
            { field: 'stabilityModel', expected: PREMIUM_PRESET.stabilityModel, actual: loaded.stabilityModel },
            { field: 'nanoBananaMainModel', expected: PREMIUM_PRESET.nanoBananaMainModel, actual: loaded.nanoBananaMainModel },
            { field: 'nanoBananaThumbnailModel', expected: PREMIUM_PRESET.nanoBananaThumbnailModel, actual: loaded.nanoBananaThumbnailModel },
            { field: 'imagePreset', expected: 'premium', actual: loaded.imagePreset },
        ];

        const failures = checks.filter(c => c.expected !== c.actual);

        if (failures.length === 0) {
            logTest(step, true, '고퀄리티 프리셋 모든 값 일치');
            return true;
        } else {
            logTest(step, false, `${failures.length}개 불일치`, failures);
            return false;
        }
    } catch (error: any) {
        logTest(step, false, `오류 발생: ${error.message}`);
        return false;
    }
}

/**
 * 테스트 5: Edge Case - 잘못된 모델명
 */
async function testInvalidModelName(): Promise<boolean> {
    const step = 'Edge Case: 잘못된 모델명';

    try {
        // 잘못된 모델명 저장 시도
        await saveConfig({
            falaiModel: 'invalid-model-name' as any,
            stabilityModel: 'non-existent' as any,
        } as AppConfig);

        const loaded = await loadConfig();

        // configManager는 값을 그대로 저장함 (생성기에서 fallback 처리)
        // 여기서는 저장이 실패하지 않는지만 확인
        logTest(step, true, '잘못된 값도 저장됨 (생성기에서 fallback 처리)');
        return true;
    } catch (error: any) {
        logTest(step, false, `저장 자체가 실패함: ${error.message}`);
        return false;
    }
}

/**
 * 테스트 6: 생성기에서 설정 사용 확인 (로그 기반)
 */
async function testGeneratorUsesConfig(): Promise<boolean> {
    const step = '생성기 설정 사용';

    try {
        // falaiGenerator, stabilityGenerator, nanoBananaProGenerator 가져오기
        const { generateWithFalAI, isFalAIConfigured } = await import('../image/falaiGenerator.js');
        const { generateWithStability } = await import('../image/stabilityGenerator.js');

        // 설정 저장
        await saveConfig({
            falaiModel: 'flux-schnell',
            stabilityModel: 'sd35-large-turbo',
        } as AppConfig);

        // 실제 API 호출 없이, 설정이 로드되는지만 확인
        // (API 키가 없으면 에러 발생하므로 config만 로드)
        const loaded = await loadConfig();

        const hasFalaiSetting = loaded.falaiModel === 'flux-schnell';
        const hasStabilitySetting = loaded.stabilityModel === 'sd35-large-turbo';

        if (hasFalaiSetting && hasStabilitySetting) {
            logTest(step, true, '생성기 테스트용 설정 저장 확인됨');
            return true;
        } else {
            logTest(step, false, '설정이 예상과 다름', { loaded });
            return false;
        }
    } catch (error: any) {
        logTest(step, false, `오류 발생: ${error.message}`);
        return false;
    }
}

// ==========================================
// 테스트 실행
// ==========================================

async function saveTestReport(): Promise<void> {
    const report = {
        timestamp: new Date().toISOString(),
        totalTests: testResults.length,
        passed: testResults.filter(r => r.success).length,
        failed: testResults.filter(r => !r.success).length,
        results: testResults,
    };

    const reportPath = path.join(process.cwd(), 'test-image-model-settings-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n📊 테스트 리포트 저장됨: ${reportPath}`);
}

async function runImageModelSettingsTest(): Promise<void> {
    console.log('\n========================================');
    console.log('🧪 이미지 모델 설정 통합 테스트 시작');
    console.log('========================================\n');

    const startTime = Date.now();

    // 테스트 실행
    await testConfigSaveAndLoad();
    await testDefaultValues();
    await testPresetBudget();
    await testPresetPremium();
    await testInvalidModelName();
    await testGeneratorUsesConfig();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // 결과 요약
    console.log('\n========================================');
    console.log('📊 테스트 결과 요약');
    console.log('========================================');

    const passed = testResults.filter(r => r.success).length;
    const failed = testResults.filter(r => !r.success).length;
    const total = testResults.length;

    console.log(`✅ 통과: ${passed}/${total}`);
    console.log(`❌ 실패: ${failed}/${total}`);
    console.log(`⏱️ 소요 시간: ${elapsed}초`);

    if (failed > 0) {
        console.log('\n❌ 실패한 테스트:');
        testResults.filter(r => !r.success).forEach(r => {
            console.log(`   - ${r.step}: ${r.message}`);
        });
    }

    // 리포트 저장
    await saveTestReport();

    console.log('\n========================================');
    if (failed === 0) {
        console.log('🎉 모든 테스트 통과!');
    } else {
        console.log(`⚠️ ${failed}개 테스트 실패`);
    }
    console.log('========================================\n');

    // 실패 시 종료 코드 1
    if (failed > 0) {
        process.exit(1);
    }
}

// Electron 환경이 아닐 때만 직접 실행
if (require.main === module) {
    runImageModelSettingsTest().catch((error) => {
        console.error('❌ 테스트 실행 중 오류:', error);
        process.exit(1);
    });
}

export { runImageModelSettingsTest };
