// ESLint v9 flat config — v1.4.56 autopus 전환 시 TypeScript 지원 추가
// 이전: src/**/*.ts가 all ignored — 린트 전체 무작동 상태
// 지금: typescript-eslint 파서로 TypeScript 파일 정상 파싱 + 완화된 규칙으로 기존 god-file 수용
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');

module.exports = tseslint.config(
    // ━━━ 전역 제외 ━━━
    {
        ignores: [
            'node_modules/**',
            'dist/**',
            'release_final/**',
            'public/dist/**',
            '.opencode/dist/**',
            '.cursor/**',
            'build/**',
            '.claude/**',
            '.autopus/**',
            'app-update.yml',
            '**/*.min.js',
        ],
    },

    // ━━━ JavaScript 기본 규칙 ━━━
    js.configs.recommended,

    // ━━━ TypeScript 기본 규칙 ━━━
    ...tseslint.configs.recommended,

    // ━━━ 공통 언어 설정 ━━━
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.es2022,
                ...globals.browser, // renderer 프로세스
            },
        },
    },

    // ━━━ TypeScript 파일 전용 규칙 완화 ━━━
    // 기존 god-file 4개(contentGenerator/main/naverBlogAutomation/renderer)에
    // 린트가 갑자기 수천 개 에러 터지는 것을 방지. 점진 강화 전략.
    {
        files: ['**/*.ts'],
        rules: {
            // 타입 안전성은 tsc --noEmit가 책임. 린트는 스타일 + 미사용 변수만.
            '@typescript-eslint/no-explicit-any': 'off', // 전체 코드베이스에 any 다수
            '@typescript-eslint/no-unused-vars': ['warn', {
                // v1.4.56: caughtErrors 'none' — catch(e) 미사용 허용 (140건 → 0)
                // 이유: 에러 로깅/무시 패턴 흔함. 강제 prefix는 기존 코드 전부 수정 필요
                caughtErrors: 'none',
                // args 'after-used' — 사용 arg 이후 unused만 경고 (callback 패턴 수용)
                args: 'after-used',
                argsIgnorePattern: '^_',
                // vars — 미사용 import/local은 여전히 경고 (진짜 dead code)
                varsIgnorePattern: '^_',
                // 구조분해에서 다른 키 꺼낼 때 _로 무시 가능
                destructuredArrayIgnorePattern: '^_',
                ignoreRestSiblings: true,
            }],
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-require-imports': 'off', // CommonJS 모듈 혼재
            '@typescript-eslint/no-this-alias': 'off',
            '@typescript-eslint/no-namespace': 'off',

            // JS 규칙 완화
            'no-unused-vars': 'off', // TS 버전이 대체
            'no-undef': 'off', // tsc가 대체
            'no-case-declarations': 'off',
            'no-useless-escape': 'off',
            'no-irregular-whitespace': 'off',
            'no-control-regex': 'off',
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'no-constant-condition': ['warn', { checkLoops: false }],
            'no-async-promise-executor': 'off',
            'no-misleading-character-class': 'off',

            // 장려 규칙
            'eqeqeq': ['warn', 'always', { null: 'ignore' }],
            'prefer-const': 'warn',

            // ━━━ 기존 god-file 부채 수용 (warn으로 강등 — 점진 정리 예정) ━━━
            'no-var': 'warn',                              // 34건 (레거시 var)
            'no-cond-assign': 'warn',                      // 6건 (while ((x = ...)) 패턴)
            'no-constant-binary-expression': 'warn',       // 3건
            'prefer-rest-params': 'warn',                  // 2건
            '@typescript-eslint/ban-ts-comment': 'warn',   // 9건 (@ts-ignore)
            '@typescript-eslint/prefer-as-const': 'warn',  // 1건
            '@typescript-eslint/no-wrapper-object-types': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'warn',
            '@typescript-eslint/triple-slash-reference': 'warn',
            'no-sparse-arrays': 'warn',
            'no-fallthrough': 'warn',
        },
    },

    // ━━━ .mjs 파일 전용 (ES modules) ━━━
    {
        files: ['**/*.mjs'],
        languageOptions: {
            sourceType: 'module',
        },
    },

    // ━━━ 테스트 파일 추가 완화 ━━━
    {
        files: ['**/__tests__/**/*.ts', '**/tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },

    // ━━━ [v1.4.77 P2] no-raw-price-format — 크롤러/수집기에서 원시 가격 포맷 금지 ━━━
    // Price.display() 또는 formatPrice()를 통해서만 가격 표시 문자열을 생성하도록 강제.
    // 원시 `parseInt(x).toLocaleString() + '원'` 패턴이 0원 누출의 근원이었음 (v1.4.77 회고).
    // 예외: Price.ts 자체는 toLocaleString을 써야 하고, 테스트/렌더러는 UI 표시용 허용.
    {
        files: [
            'src/crawler/**/*.ts',
            'src/sourceAssembler.ts',
            'src/services/bestProductCollector.ts',
        ],
        rules: {
            'no-restricted-syntax': ['warn', {
                selector: "TemplateLiteral TemplateElement[value.raw=/원$/] ~ .expressions CallExpression[callee.property.name='toLocaleString']",
                message: "원시 가격 포맷 금지. Price.display() 또는 formatPrice() 사용. (0원 누출 회귀 방지)"
            }, {
                selector: "BinaryExpression[operator='+'][right.value='원'] CallExpression[callee.property.name='toLocaleString']",
                message: "원시 가격 포맷 금지. Price.display() 또는 formatPrice() 사용."
            }],
        },
    },
);
