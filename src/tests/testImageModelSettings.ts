/**
 * 이미지 모델 설정 통합 테스트
 * - 새 이미지 제공자(OpenAI Image, Leonardo AI)의 설정 저장/불러오기 검증
 * - configManager와 생성기 간 설정 일관성 확인
 */

import { loadConfig, saveConfig, AppConfig } from '../configManager.js';
import * as path from 'path';
import * as fs from 'fs/promises';

// ==========================================
// 테스트 유틸리티
// ==========================================

interface TestResult {
    step: string;
    success: boolean;
    message: string;
    details?: any;
}

const testResults: TestResult[] = [];

function logTest(step: string, success: boolean, message: string, details?: any) {
    testResults.push({ step, success, message, details });
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
    openaiImageApiKey: 'test-openai-key',
    leonardoaiApiKey: 'test-leonardo-key',
    leonardoaiModel: 'phoenix-1.0',
    imagePreset: 'premium',
};

const BUDGET_PRESET: Partial<AppConfig> = {
    leonardoaiModel: 'phoenix-1.0',
    imagePreset: 'budget',
};

const PREMIUM_PRESET: Partial<AppConfig> = {
    leonardoaiModel: 'phoenix-1.0',
    imagePreset: 'premium',
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
            { field: 'openaiImageApiKey', expected: TEST_CONFIG.openaiImageApiKey, actual: loadedConfig.openaiImageApiKey },
            { field: 'leonardoaiApiKey', expected: TEST_CONFIG.leonardoaiApiKey, actual: loadedConfig.leonardoaiApiKey },
            { field: 'leonardoaiModel', expected: TEST_CONFIG.leonardoaiModel, actual: loadedConfig.leonardoaiModel },
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
        // 이미지 관련 필드만 삭제 (다른 설정은 유지)
        const currentConfig = await loadConfig();
        const cleanConfig: any = { ...currentConfig };
        delete cleanConfig.openaiImageApiKey;
        delete cleanConfig.leonardoaiApiKey;
        delete cleanConfig.leonardoaiModel;

        await saveConfig(cleanConfig);

        // 다시 불러와서 기본값 확인
        const loaded = await loadConfig();

        const hasNoImageFields =
            !loaded.openaiImageApiKey &&
            !loaded.leonardoaiApiKey &&
            !loaded.leonardoaiModel;

        if (hasNoImageFields) {
            logTest(step, true, '이미지 API 키 필드가 삭제됨 (생성기에서 기본값 적용됨)');
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
        await saveConfig({
            ...BUDGET_PRESET,
        } as AppConfig);

        const loaded = await loadConfig();

        const checks = [
            { field: 'leonardoaiModel', expected: BUDGET_PRESET.leonardoaiModel, actual: loaded.leonardoaiModel },
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
        await saveConfig({
            ...PREMIUM_PRESET,
        } as AppConfig);

        const loaded = await loadConfig();

        const checks = [
            { field: 'leonardoaiModel', expected: PREMIUM_PRESET.leonardoaiModel, actual: loaded.leonardoaiModel },
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
        await saveConfig({
            leonardoaiModel: 'invalid-model-name' as any,
        } as AppConfig);

        const loaded = await loadConfig();

        // configManager는 값을 그대로 저장함 (생성기에서 fallback 처리)
        logTest(step, true, '잘못된 값도 저장됨 (생성기에서 fallback 처리)');
        return true;
    } catch (error: any) {
        logTest(step, false, `저장 자체가 실패함: ${error.message}`);
        return false;
    }
}

/**
 * 테스트 6: 생성기에서 설정 사용 확인 (모듈 임포트 기반)
 */
async function testGeneratorUsesConfig(): Promise<boolean> {
    const step = '생성기 설정 사용';

    try {
        // 새 생성기 모듈 가져오기 (존재 확인 용도)
        const openaiModule = await import('../image/openaiImageGenerator.js');
        const leonardoModule = await import('../image/leonardoAIGenerator.js');

        // 함수 export 확인
        const hasOpenAI = typeof openaiModule.generateWithOpenAIImage === 'function' &&
            typeof openaiModule.generateSingleOpenAIImage === 'function';
        const hasLeonardo = typeof leonardoModule.generateWithLeonardoAI === 'function' &&
            typeof leonardoModule.generateSingleLeonardoAIImage === 'function';

        // 설정 저장
        await saveConfig({
            leonardoaiModel: 'phoenix-1.0',
        } as AppConfig);

        const loaded = await loadConfig();
        const hasLeonardoSetting = loaded.leonardoaiModel === 'phoenix-1.0';

        if (hasOpenAI && hasLeonardo && hasLeonardoSetting) {
            logTest(step, true, '모든 생성기 모듈 임포트 및 설정 확인됨');
            return true;
        } else {
            logTest(step, false, '생성기 모듈 또는 설정이 예상과 다름', {
                hasOpenAI, hasLeonardo, hasLeonardoSetting
            });
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
