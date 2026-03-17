import { cp, mkdir, access, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'public');
const targetDir = path.join(projectRoot, 'dist', 'public');
const rendererBundle = path.join(projectRoot, 'dist', 'renderer', 'renderer.js');
const rendererTarget = path.join(targetDir, 'renderer.js');

await mkdir(targetDir, { recursive: true });
// public 폴더의 모든 파일을 dist/public으로 복사
await cp(sourceDir, targetDir, { recursive: true, force: true });

// ✅ prompts 폴더 복사 (2축 분리 구조 프롬프트 파일)
const promptsSourceDir = path.join(projectRoot, 'src', 'prompts');
const promptsTargetDir = path.join(projectRoot, 'dist', 'prompts');
try {
  await access(promptsSourceDir);
  await mkdir(promptsTargetDir, { recursive: true });
  await cp(promptsSourceDir, promptsTargetDir, { recursive: true, force: true });
  console.log('📦 Copied prompts folder to dist/prompts');
} catch (e) {
  console.warn('⚠️ prompts folder not found or copy failed:', e.message);
}

// ✅ assets 폴더 복사 (시스템 트레이 아이콘 등)
const assetsSourceDir = path.join(projectRoot, 'assets');
const assetsTargetDir = path.join(projectRoot, 'dist', 'assets');
try {
  await access(assetsSourceDir);
  await mkdir(assetsTargetDir, { recursive: true });
  await cp(assetsSourceDir, assetsTargetDir, { recursive: true, force: true });
  console.log('📦 Copied assets folder to dist/assets');
} catch (e) {
  console.warn('⚠️ assets folder not found or copy failed:', e.message);
}

// index.html의 CSP를 public/index.html에서 읽어와서 동기화
const sourceIndexPath = path.join(sourceDir, 'index.html');
const indexPath = path.join(targetDir, 'index.html');
try {
  // 원본 public/index.html에서 CSP 추출
  const sourceHtmlContent = await readFile(sourceIndexPath, 'utf-8');
  const cspMatch = sourceHtmlContent.match(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i);

  if (cspMatch) {
    // 원본의 CSP 태그 추출
    const cspMetaTag = cspMatch[0];

    // dist/index.html 읽기
    let htmlContent = await readFile(indexPath, 'utf-8');

    // 기존 CSP 태그가 있으면 제거하고 원본의 CSP로 교체
    htmlContent = htmlContent.replace(/<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');

    // <head> 태그를 찾아서 그 다음에 추가
    if (htmlContent.includes('<head>')) {
      htmlContent = htmlContent.replace('<head>', `<head>\n    ${cspMetaTag}`);
    } else if (htmlContent.includes('<head ')) {
      // <head 속성> 형태인 경우
      htmlContent = htmlContent.replace(/(<head[^>]*>)/, `$1\n    ${cspMetaTag}`);
    }

    await writeFile(indexPath, htmlContent, 'utf-8');
    console.log('✅ Updated Content-Security-Policy meta tag from public/index.html');
  } else {
    console.warn('⚠️ CSP meta tag not found in source public/index.html');
  }
} catch (error) {
  console.warn('⚠️ Could not sync CSP meta tag to index.html:', error.message);
}

// styles.css가 이미 복사되었으므로 추가 작업 불필요
// (public/styles.css에 모든 스타일이 포함되어 있음)

try {
  await access(rendererBundle);
  const rendererSource = await readFile(rendererBundle, 'utf-8');

  // scheduleAndUI.js도 복사
  const scheduleAndUIBundle = path.join(projectRoot, 'dist', 'renderer', 'scheduleAndUI.js');
  let scheduleAndUISource = '';
  try {
    await access(scheduleAndUIBundle);
    scheduleAndUISource = await readFile(scheduleAndUIBundle, 'utf-8');
  } catch (e) {
    console.warn('⚠️ scheduleAndUI.js not found');
  }

  // categoryPrompts.js도 복사
  const categoryPromptsBundle = path.join(projectRoot, 'dist', 'renderer', 'categoryPrompts.js');
  let categoryPromptsSource = '';
  try {
    await access(categoryPromptsBundle);
    categoryPromptsSource = await readFile(categoryPromptsBundle, 'utf-8');
  } catch (e) {
    console.warn('⚠️ categoryPrompts.js not found');
  }

  // automationHelpers.js도 복사
  const automationHelpersBundle = path.join(projectRoot, 'dist', 'renderer', 'automationHelpers.js');
  let automationHelpersSource = '';
  try {
    await access(automationHelpersBundle);
    automationHelpersSource = await readFile(automationHelpersBundle, 'utf-8');
  } catch (e) {
    console.warn('⚠️ automationHelpers.js not found');
  }

  // performanceUtils.js도 복사
  const performanceUtilsBundle = path.join(projectRoot, 'dist', 'renderer', 'performanceUtils.js');
  let performanceUtilsSource = '';
  try {
    await access(performanceUtilsBundle);
    performanceUtilsSource = await readFile(performanceUtilsBundle, 'utf-8');
  } catch (e) {
    console.warn('⚠️ performanceUtils.js not found');
  }

  // ✅ [2026-01-25] utils 모듈들 복사 (모듈화 후 번들링 필수)
  // renderer.ts에서 import하는 모든 utils 모듈 포함 (100% 완전성)
  const utilsDir = path.join(projectRoot, 'dist', 'renderer', 'utils');
  const utilsModules = [
    // 기본 유틸리티 (의존성 없음)
    'errorAndAutosave.js',
    'safeExecute.js',
    'htmlUtils.js',
    'headingKeyUtils.js',
    'storageUtils.js',
    'dateUtils.js',
    'titleUtils.js',
    'errorUtils.js',
    'categoryNormalizeUtils.js',
    'textFormatUtils.js',
    // 중간 유틸리티 (기본에 의존)
    'kenBurnsStyles.js',
    'imageHelpers.js',
    'imageCostUtils.js',
    'shoppingConnectUtils.js',
    'geminiModelSync.js',
    'fullAutoUtils.js',
    'promptOverrideUtils.js',
    'veoSafetyUtils.js',
    'videoProviderUtils.js',
    // 상위 유틸리티 (여러 모듈에 의존)
    'uiManagers.js',
    'apiClient.js',
    'postStorageUtils.js',
    'errorHandlerUtils.js',
    'stabilityUtils.js',
    'headingVideoPreviewUtils.js',
    'veoVideoUtils.js',
    'semiAutoImageSearch.js',
    // UI/이벤트 관련 (마지막에 로드)
    'categoryModalUtils.js',
    'appEventsHandler.js',
    'settingsModal.js',
  ];
  let utilsSource = '';
  for (const utilFile of utilsModules) {
    const utilPath = path.join(utilsDir, utilFile);
    try {
      await access(utilPath);
      let content = await readFile(utilPath, 'utf-8');
      // CommonJS exports 제거 - 더 정교한 처리
      content = content
        .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
        // ✅ [FIX] 체인된 void 0 선언 제거 (exports.a = exports.b = exports.c = void 0;)
        .replace(/^exports\.\w+\s*(=\s*exports\.\w+\s*)*=\s*void\s+0;\s*$/gm, '')
        // exports.xxx = void 0; 제거 (단일 선언)
        .replace(/exports\.(\w+)\s*=\s*void\s+0;\s*/g, '')
        // exports.xxx = xxx; 제거 (이미 정의된 변수 재할당)
        .replace(/exports\.(\w+)\s*=\s*\1;/g, '')
        // exports.xxx = ClassName.getInstance(); 형태 처리
        .replace(/exports\.(\w+)\s*=\s*(\w+)\.getInstance\(\);/g, 'const $1 = $2.getInstance();')
        // exports.xxx = {...}; 형태는 const xxx = {...}; 로 변환 (중요!)
        // exports.xxx = function... 형태도 const xxx = function...으로 변환
        .replace(/^(\s*)exports\.(\w+)\s*=\s*(\{|\[|function|class|new\s)/gm, '$1const $2 = $3')
        // 남은 exports.xxx = 값; 형태 처리
        .replace(/^(\s*)exports\.(\w+)\s*=\s*([^;=]+);/gm, (match, indent, name, value) => {
          // 이미 처리됐거나, 다른 exports를 참조하면 삭제
          if (value.trim() === name) return '';
          if (value.includes('exports.')) return '';
          return `${indent}const ${name} = ${value};`;
        })
        .replace(/exports\.default\s*=/g, '// exports.default =')
        .replace(/module\.exports\s*=/g, '// module.exports =');
      // ✅ [FIX] 남은 exports.XXX 참조를 XXX로 변환 (읽기 참조)
      content = content.replace(/exports\.(\w+)/g, '$1');
      // require 문 제거 (utils 간 의존성)
      content = content.replace(/const\s+\{[^}]+\}\s*=\s*require\([^)]+\);\s*/g, '');
      content = content.replace(/const\s+\w+\s*=\s*require\([^)]+\);\s*/g, '');
      utilsSource += `\n// ===== ${utilFile} inlined =====\n${content}\n`;
      console.log(`📦 Inlined utils/${utilFile}`);
    } catch (e) {
      console.warn(`⚠️ utils/${utilFile} not found`);
    }
  }

  // ✅ [2026-01-25] components 모듈들 복사 (UI 컴포넌트)
  // renderer.ts에서 import하는 모든 components 포함
  const componentsDir = path.join(projectRoot, 'dist', 'renderer', 'components');
  const componentModules = [
    'ProgressModal.js',
    'VeoProgressOverlay.js',
    'PromptEditModal.js',
    'HeadingImageSettings.js',
  ];
  let componentsSource = '';
  for (const compFile of componentModules) {
    const compPath = path.join(componentsDir, compFile);
    try {
      await access(compPath);
      let content = await readFile(compPath, 'utf-8');
      // CommonJS exports 제거 - 더 정교한 처리
      content = content
        .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
        // ✅ [FIX] 체인된 void 0 선언 제거
        .replace(/^exports\.\w+\s*(=\s*exports\.\w+\s*)*=\s*void\s+0;\s*$/gm, '')
        .replace(/exports\.(\w+)\s*=\s*void\s+0;\s*/g, '')
        .replace(/exports\.(\w+)\s*=\s*\1;/g, '')
        .replace(/exports\.(\w+)\s*=\s*(\w+)\.getInstance\(\);/g, 'const $1 = $2.getInstance();')
        // exports.xxx = {...}; 형태는 const xxx = {...}; 로 변환
        .replace(/^(\s*)exports\.(\w+)\s*=\s*(\{|\[|function|class|new\s)/gm, '$1const $2 = $3')
        // exports.xxx = 값; 형태는 const xxx = 값;으로 변환
        .replace(/^(\s*)exports\.(\w+)\s*=\s*([^;=]+);/gm, (match, indent, name, value) => {
          if (value.trim() === name) return '';
          if (value.includes('exports.')) return '';
          return `${indent}const ${name} = ${value};`;
        })
        .replace(/exports\.default\s*=/g, '// exports.default =')
        .replace(/module\.exports\s*=/g, '// module.exports =');
      // ✅ [FIX] 남은 exports.XXX 참조를 XXX로 변환
      content = content.replace(/exports\.(\w+)/g, '$1');
      // require 문 제거
      content = content.replace(/const\s+\{[^}]+\}\s*=\s*require\([^)]+\);\s*/g, '');
      content = content.replace(/const\s+\w+\s*=\s*require\([^)]+\);\s*/g, '');
      // ✅ [FIX] window fallback 선언 제거 (const xxx = window.xxx || {...})
      // 다른 모듈에서 이미 정의된 변수와 충돌 방지
      content = content.replace(/^const\s+(\w+)\s*=\s*window\.\1\s*\|\|\s*\{[^}]*\};\s*$/gm, '// $1 uses global from other module');
      content = content.replace(/^const\s+(\w+)\s*=\s*window\.\1\s*\|\|[^;]+;\s*$/gm, '// $1 uses global from other module');
      componentsSource += `\n// ===== ${compFile} inlined =====\n${content}\n`;
      console.log(`📦 Inlined components/${compFile}`);
    } catch (e) {
      console.warn(`⚠️ components/${compFile} not found`);
    }
  }
  // utils에 components 추가
  utilsSource += componentsSource;

  // ✅ [2026-02-24] modules 디렉토리 인라인 (renderer.ts에서 추출된 대규모 모듈)
  const modulesDir = path.join(projectRoot, 'dist', 'renderer', 'modules');
  const modulesFiles = [
    // ✅ [2026-02-26] renderer.ts에서 import하는 모든 모듈 완전 포함
    'promptTranslation.js',
    'paywallSystem.js',
    'enhancedFetch.js',
    'credentialsSave.js',
    'charCountDisplay.js',
    'tutorialsTab.js',
    'apiGuideModals.js',
    'priceInfoModal.js',
    'imageManagementTab.js',
    'guideModals.js',
    'dashboardUI.js',
    'tailUIUtils.js',
    'formUtilities.js',
    'aiAssistant.js',
    'scheduleDistributor.js',  // ✅ [2026-03-17] 예약 시간 분산 유틸리티 (continuousPublishing보다 먼저 로드 필수)
    'continuousPublishing.js',
    'thumbnailGenerator.js',
    'multiAccountManager.js',
    'headingImageGen.js',
    'imageDisplayGrid.js',
    'licenseUI.js',
    'scheduleManager.js',
    'localImageModals.js',
    'postListUI.js',
    'videoManager.js',
    'publishingHandlers.js',
    'fullAutoFlow.js',
    'contentGeneration.js',
    'undoImageChange.js',
    'formAndAutomation.js',
    'thumbnailPreview.js',
    'titleGeneration.js',
    'bestProductModal.js',  // ✅ [2026-03-13] 베스트 상품 수집기 모듈 추가
  ];
  let modulesSource = '';
  for (const modFile of modulesFiles) {
    const modPath = path.join(modulesDir, modFile);
    try {
      await access(modPath);
      let content = await readFile(modPath, 'utf-8');
      // CommonJS exports 제거 - 더 정교한 처리
      content = content
        .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
        // ✅ [FIX] 체인된 void 0 선언 제거
        .replace(/^exports\.\w+\s*(=\s*exports\.\w+\s*)*=\s*void\s+0;\s*$/gm, '')
        .replace(/exports\.(\w+)\s*=\s*void\s+0;\s*/g, '')
        .replace(/exports\.(\w+)\s*=\s*\1;/g, '')
        .replace(/exports\.(\w+)\s*=\s*(\w+)\.getInstance\(\);/g, 'const $1 = $2.getInstance();')
        // exports.xxx = {...}; 형태는 const xxx = {...}; 로 변환
        .replace(/^(\s*)exports\.(\w+)\s*=\s*(\{|\[|function|class|new\s)/gm, '$1const $2 = $3')
        // exports.xxx = 값; 형태는 const xxx = 값;으로 변환
        .replace(/^(\s*)exports\.(\w+)\s*=\s*([^;=]+);/gm, (match, indent, name, value) => {
          if (value.trim() === name) return '';
          if (value.includes('exports.')) return '';
          return `${indent}const ${name} = ${value};`;
        })
        .replace(/exports\.default\s*=/g, '// exports.default =')
        .replace(/module\.exports\s*=/g, '// module.exports =');
      // ✅ [FIX] 남은 exports.XXX 참조를 XXX로 변환
      content = content.replace(/exports\.(\w+)/g, '$1');
      // require 문 제거
      content = content.replace(/const\s+\{[^}]+\}\s*=\s*require\([^)]+\);\s*/g, '');
      content = content.replace(/const\s+\w+\s*=\s*require\([^)]+\);\s*/g, '');
      // ✅ [FIX] window fallback 선언 제거
      content = content.replace(/^const\s+(\w+)\s*=\s*window\.\1\s*\|\|\s*\{[^}]*\};\s*$/gm, '// $1 uses global from other module');
      content = content.replace(/^const\s+(\w+)\s*=\s*window\.\1\s*\|\|[^;]+;\s*$/gm, '// $1 uses global from other module');
      modulesSource += `\n// ===== modules/${modFile} inlined =====\n${content}\n`;
      console.log(`📦 Inlined modules/${modFile}`);
    } catch (e) {
      console.warn(`⚠️ modules/${modFile} not found`);
    }
  }
  // utilsSource에 modules 추가
  utilsSource += modulesSource;

  // CommonJS를 ES 모듈로 변환
  let sanitized = rendererSource
    // __esModule 제거
    .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
    // require를 제거 (나중에 인라인으로 대체됨)
    .replace(/const\s+(\w+)\s*=\s*require\(["']([^"']+)["']\);\s*/g, '')
    // import 문도 제거 (나중에 인라인으로 대체됨)
    .replace(/import\s+\*\s+as\s+\w+\s+from\s+["']\.\/scheduleAndUI\.js["'];\s*/g, '')
    .replace(/import\s+\{[^}]+\}\s+from\s+["']\.\/scheduleAndUI\.js["'];\s*/g, '')
    .replace(/import\s+\{[^}]+\}\s+from\s+["']\.\/performanceUtils\.js["'];\s*/g, '')
    // exports.xxx를 export로 변환
    .replace(/exports\.(\w+)\s*=/g, 'export const $1 =')
    // exports.default를 export default로 변환
    .replace(/exports\.default\s*=/g, 'export default')
    // module.exports를 export로 변환
    .replace(/module\.exports\s*=/g, 'export default')
    // ⚠️ 위험한 정규식 제거됨 (SyntaxError 원인 해결)
    // require('electron') 같은 코드도 제거 (renderer에서 사용 불가)
    .replace(/require\(['"]electron['"]\)/g, 'null')
    // 남아있는 모든 require 호출 제거
    .replace(/require\([^)]+\)/g, 'null');

  // scheduleAndUI.js가 있다면 인라인으로 포함
  if (scheduleAndUISource) {
    // scheduleAndUI.js를 ES 모듈로 변환
    let scheduleAndUISanitized = scheduleAndUISource
      .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
      // exports.xxx = void 0; 제거 (선언만 하고 나중에 할당하는 패턴)
      .replace(/exports\.(\w+)\s*=\s*void\s+0;\s*/g, '')
      // exports.xxx = xxx; 제거 (이미 선언된 함수를 재할당하는 패턴)
      .replace(/exports\.(\w+)\s*=\s*\1;\s*/g, '')
      // exports.xxx = { ... } 형태를 const xxx = { ... }로 변환
      .replace(/exports\.(\w+)\s*=\s*(\{[\s\S]*?\});/g, (match, name, value) => {
        // 이미 function으로 선언되어 있으면 제거
        if (scheduleAndUISource.includes(`function ${name}(`)) {
          return '';
        }
        return `const ${name} = ${value};`;
      })
      // exports.xxx = 다른값; 형태 처리
      .replace(/exports\.(\w+)\s*=\s*([^;]+);/g, (match, name, value) => {
        // 이미 function으로 선언되어 있으면 제거
        if (scheduleAndUISource.includes(`function ${name}(`)) {
          return '';
        }
        return `const ${name} = ${value};`;
      })
      .replace(/exports\.default\s*=/g, '// exports.default =')
      .replace(/module\.exports\s*=/g, '// module.exports =');

    // require("./scheduleAndUI.js") 제거
    sanitized = sanitized.replace(/const\s+scheduleAndUI_js_1\s*=\s*require\(["'][^"']+["']\);\s*/g, '');
    sanitized = sanitized.replace(/const\s+\w+\s*=\s*require\(["']\.\/scheduleAndUI\.js["']\);\s*/g, '');

    // scheduleAndUI_js_1.initClockAndCalendar() -> initClockAndCalendar()
    sanitized = sanitized.replace(/scheduleAndUI_js_1\.(\w+)/g, '$1');
    sanitized = sanitized.replace(/scheduleAndUI_js_1\[["'](\w+)["']\]/g, '$1');
    // (0, scheduleAndUI_js_1.initClockAndCalendar)() -> initClockAndCalendar()
    sanitized = sanitized.replace(/\(0,\s*scheduleAndUI_js_1\.(\w+)\)/g, '$1');
    sanitized = sanitized.replace(/\(0,\s*scheduleAndUI_js_1\[["'](\w+)["']\]\)/g, '$1');
    // Object.keys(scheduleAndUI_js_1.externalLinks) -> Object.keys(externalLinks)
    sanitized = sanitized.replace(/(\w+)\(scheduleAndUI_js_1\.(\w+)\)/g, '$1($2)');

    // scheduleAndUI 내용을 앞에 추가
    sanitized = `// scheduleAndUI.js inlined\n${scheduleAndUISanitized}\n\n${sanitized}`;
  }

  // categoryPrompts.js 인라인 처리
  if (categoryPromptsSource) {
    let categoryPromptsSanitized = categoryPromptsSource
      .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
      // exports.xxx = void 0; 제거 (선언만)
      .replace(/exports\.(\w+)\s*=\s*void\s+0;\s*/g, '')
      // exports.xxx = ClassName; 제거 (클래스는 이미 정의되어 있음)
      .replace(/exports\.(\w+)\s*=\s*\1;\s*/g, '')
      // exports.xxx = { ... } 형태는 유지하되 클래스가 아닌 경우만
      .replace(/exports\.(\w+)\s*=\s*(\{[\s\S]*?\});/g, (match, name, value) => {
        // 클래스나 함수가 이미 정의되어 있으면 exports 문만 제거
        if (categoryPromptsSource.includes(`class ${name}`) || categoryPromptsSource.includes(`function ${name}(`)) {
          return '';
        }
        return `const ${name} = ${value};`;
      })
      // exports.xxx = 다른값; 형태 처리 (클래스가 아닌 경우만)
      .replace(/exports\.(\w+)\s*=\s*([^;]+);/g, (match, name, value) => {
        // 클래스나 함수가 이미 정의되어 있으면 exports 문만 제거
        if (categoryPromptsSource.includes(`class ${name}`) || categoryPromptsSource.includes(`function ${name}(`)) {
          return '';
        }
        // 클래스 이름과 같은 경우도 제거 (exports.CategoryPromptTemplates = CategoryPromptTemplates;)
        if (value.trim() === name) {
          return '';
        }
        return `const ${name} = ${value};`;
      })
      .replace(/exports\.default\s*=/g, '// exports.default =')
      .replace(/module\.exports\s*=/g, '// module.exports =');

    // require("./categoryPrompts.js") 제거
    sanitized = sanitized.replace(/const\s+categoryPrompts_js_1\s*=\s*require\(["'][^"']+["']\);\s*/g, '');
    sanitized = sanitized.replace(/const\s+\w+\s*=\s*require\(["']\.\/categoryPrompts\.js["']\);\s*/g, '');

    // categoryPrompts_js_1.CategoryPromptTemplates -> CategoryPromptTemplates
    sanitized = sanitized.replace(/categoryPrompts_js_1\.(\w+)/g, '$1');
    sanitized = sanitized.replace(/categoryPrompts_js_1\[["'](\w+)["']\]/g, '$1');
    sanitized = sanitized.replace(/\(0,\s*categoryPrompts_js_1\.(\w+)\)/g, '$1');
    sanitized = sanitized.replace(/\(0,\s*categoryPrompts_js_1\[["'](\w+)["']\]\)/g, '$1');

    // categoryPrompts 내용을 앞에 추가
    sanitized = `// categoryPrompts.js inlined\n${categoryPromptsSanitized}\n\n${sanitized}`;
  }

  // automationHelpers.js 인라인 처리
  if (automationHelpersSource) {
    let automationHelpersSanitized = automationHelpersSource
      .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
      // exports.xxx = void 0; 제거 (선언만) - 여러 개가 한 줄에 있을 수 있음
      .replace(/exports\.(\w+)(\s*=\s*exports\.\w+)*\s*=\s*void\s+0;\s*/g, '')
      // exports.xxx = ClassName; 제거 (클래스는 이미 정의되어 있음)
      .replace(/exports\.(\w+)\s*=\s*\1;\s*/g, '')
      // exports.xxx = { ... } 형태는 유지하되 클래스가 아닌 경우만
      .replace(/exports\.(\w+)\s*=\s*(\{[\s\S]*?\});/g, (match, name, value) => {
        // 클래스나 함수가 이미 정의되어 있으면 exports 문만 제거
        if (automationHelpersSource.includes(`class ${name}`) || automationHelpersSource.includes(`function ${name}(`)) {
          return '';
        }
        return `const ${name} = ${value};`;
      })
      // exports.xxx = 다른값; 형태 처리 (클래스가 아닌 경우만)
      .replace(/exports\.(\w+)\s*=\s*([^;]+);/g, (match, name, value) => {
        // 클래스나 함수가 이미 정의되어 있으면 exports 문만 제거
        if (automationHelpersSource.includes(`class ${name}`) || automationHelpersSource.includes(`function ${name}(`)) {
          return '';
        }
        // 클래스 이름과 같은 경우도 제거 (exports.HashtagGenerator = HashtagGenerator;)
        if (value.trim() === name) {
          return '';
        }
        return `const ${name} = ${value};`;
      })
      .replace(/exports\.default\s*=/g, '// exports.default =')
      .replace(/module\.exports\s*=/g, '// module.exports =');

    // require("./automationHelpers.js") 제거
    sanitized = sanitized.replace(/const\s+automationHelpers_js_1\s*=\s*require\(["'][^"']+["']\);\s*/g, '');
    sanitized = sanitized.replace(/const\s+\{[^}]+\}\s*=\s*require\(["']\.\/automationHelpers\.js["']\);\s*/g, '');
    sanitized = sanitized.replace(/const\s+\w+\s*=\s*require\(["']\.\/automationHelpers\.js["']\);\s*/g, '');

    // automationHelpers_js_1.HashtagGenerator -> HashtagGenerator
    sanitized = sanitized.replace(/automationHelpers_js_1\.(\w+)/g, '$1');
    sanitized = sanitized.replace(/automationHelpers_js_1\[["'](\w+)["']\]/g, '$1');
    sanitized = sanitized.replace(/\(0,\s*automationHelpers_js_1\.(\w+)\)/g, '$1');
    sanitized = sanitized.replace(/\(0,\s*automationHelpers_js_1\[["'](\w+)["']\]\)/g, '$1');

    // automationHelpers 내용을 앞에 추가
    sanitized = `// automationHelpers.js inlined\n${automationHelpersSanitized}\n\n${sanitized}`;
  }

  // performanceUtils.js 인라인 처리
  if (performanceUtilsSource) {
    let performanceUtilsSanitized = performanceUtilsSource
      .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
      // exports.xxx = void 0; 제거
      .replace(/exports\.(\w+)(\s*=\s*exports\.\w+)*\s*=\s*void\s+0;\s*/g, '')
      // exports.xxx = ClassName; 제거 (클래스는 이미 정의되어 있음)
      .replace(/exports\.(\w+)\s*=\s*\1;\s*/g, '')
      // exports.xxx = new ClassName(); 형태 처리
      .replace(/exports\.(\w+)\s*=\s*new\s+(\w+)\(\);/g, (match, name, className) => {
        // 이미 const로 선언되어 있으면 exports 문만 제거
        if (performanceUtilsSource.includes(`const ${name} = new ${className}()`)) {
          return '';
        }
        return `const ${name} = new ${className}();`;
      })
      // exports.xxx = 다른값; 형태 처리
      .replace(/exports\.(\w+)\s*=\s*([^;]+);/g, (match, name, value) => {
        // 클래스나 함수가 이미 정의되어 있으면 exports 문만 제거
        if (performanceUtilsSource.includes(`class ${name}`) || performanceUtilsSource.includes(`function ${name}(`)) {
          return '';
        }
        // 클래스 이름과 같은 경우도 제거
        if (value.trim() === name) {
          return '';
        }
        // 이미 const로 선언되어 있으면 exports 문만 제거
        if (performanceUtilsSource.includes(`const ${name} =`)) {
          return '';
        }
        return `const ${name} = ${value};`;
      })
      .replace(/exports\.default\s*=/g, '// exports.default =')
      .replace(/module\.exports\s*=/g, '// module.exports =');

    // require("./performanceUtils.js") 제거
    sanitized = sanitized.replace(/const\s+performanceUtils_js_1\s*=\s*require\(["'][^"']+["']\);\s*/g, '');
    sanitized = sanitized.replace(/const\s+\{[^}]+\}\s*=\s*require\(["']\.\/performanceUtils\.js["']\);\s*/g, '');
    sanitized = sanitized.replace(/const\s+\w+\s*=\s*require\(["']\.\/performanceUtils\.js["']\);\s*/g, '');

    // performanceUtils_js_1.xxx -> xxx
    sanitized = sanitized.replace(/performanceUtils_js_1\.(\w+)/g, '$1');
    sanitized = sanitized.replace(/performanceUtils_js_1\[["'](\w+)["']\]/g, '$1');
    sanitized = sanitized.replace(/\(0,\s*performanceUtils_js_1\.(\w+)\)/g, '$1');

    // performanceUtils 내용을 가장 앞에 추가
    sanitized = `// performanceUtils.js inlined\n${performanceUtilsSanitized}\n\n${sanitized}`;
  }

  // ✅ [2026-01-25] utils 모듈들을 가장 앞에 추가 (의존성 순서 주의)
  if (utilsSource) {
    sanitized = `// ===== UTILS MODULES INLINED =====\n${utilsSource}\n// ===== END UTILS MODULES =====\n\n${sanitized}`;
  }

  // ✅ [2026-01-25] 모든 남은 _js_1 모듈 참조 제거 (categoryModalUtils, appEventsHandler 등)
  // (0, xxx_js_1.functionName)() -> functionName()
  sanitized = sanitized.replace(/\(0,\s*(\w+)_js_1\.(\w+)\)/g, '$2');
  // xxx_js_1.functionName -> functionName
  sanitized = sanitized.replace(/(\w+)_js_1\.(\w+)/g, '$2');
  // xxx_js_1['functionName'] -> functionName
  sanitized = sanitized.replace(/(\w+)_js_1\[["'](\w+)["']\]/g, '$2');

  // ✅ [2026-01-25] 브라우저에서 실행 불가능한 utils 함수 호출 주석 처리
  // 이 함수들은 별도 모듈에 정의되어 있어서 인라인 없이는 사용 불가
  // ✅ [2026-01-27] initSettingsModal, initSettingsModalFunc는 인라인되어 정상 동작하므로 제외
  const utilsFunctionsToComment = [
    'initAllAppEventHandlers',
    'initCategorySelectionListener',
    // 'initSettingsModal',       // ✅ [2026-01-27] 인라인됨 - 주석 처리 불필요
    // 'initSettingsModalFunc',   // ✅ [2026-01-27] 인라인됨 - 주석 처리 불필요
    'cleanupAllMemoryManagers',
  ];
  utilsFunctionsToComment.forEach(funcName => {
    // funcName(); 형태의 호출 주석 처리
    const callPattern = new RegExp(`^(\\s*)(${funcName})\\(\\);`, 'gm');
    sanitized = sanitized.replace(callPattern, '$1// [BROWSER] $2();');
  });

  // ✅ [2026-01-25] 모든 utils 모듈이 인라인되므로 fallback 불필요
  // 중복 선언 오류 방지를 위해 fallback 제거
  const fallbackDefinitions = `
// ===== [BROWSER NOTE] =====
// 모든 utils 및 components 모듈이 인라인되어 별도 fallback 불필요
`;
  sanitized = fallbackDefinitions + sanitized;

  await writeFile(
    rendererTarget,
    `// Auto-generated by copy-static.mjs to run inside the renderer (ES module context)\n${sanitized}`,
    'utf-8',
  );
  console.log('📦 Copied renderer bundle to dist/public/renderer.js (sanitized for browser)');
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  } else {
    throw error;
  }
  console.warn('⚠️ Renderer bundle not found; skipping copy to dist/public');
}

console.log('📦 Copied static assets to dist/public');

