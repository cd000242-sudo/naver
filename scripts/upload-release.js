/**
 * GitHub Releases 자동 업로드 스크립트 (v2)
 * ✅ [2026-02-13] 릴리즈 자동화: git push + 릴리즈 생성 + 에셋 업로드 + 검증
 * 
 * 기능:
 * 1. git commit & push (소스코드만 선택적 add → GH013 방지)
 * 2. GitHub 릴리즈 생성 (또는 기존 릴리즈 재사용)
 * 3. 기존 에셋 자동 삭제 후 재업로드
 * 4. Node.js https raw binary 업로드 (WebClient multipart 손상 방지)
 * 5. 업로드 후 size/state 자동 검증
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GITHUB_TOKEN = process.env.GH_TOKEN;
const OWNER = 'cd000242-sudo';
const REPO = 'naver';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;

const releaseDir = path.join(__dirname, '..', 'release_final');
const setupFile = path.join(releaseDir, `Better Life Naver Setup ${VERSION}.exe`);
const latestYml = path.join(releaseDir, 'latest.yml');
// GitHub 에셋 이름은 하이픈 (electron-updater가 이 이름으로 다운로드)
const setupUploadName = `Better-Life-Naver-Setup-${VERSION}.exe`;

// ─── GitHub API Helper ──────────────────────────────────────

function apiRequest(options, body = null) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            ...options,
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'BetterLifeNaver',
                ...options.headers,
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data ? JSON.parse(data) : {});
                } else if (res.statusCode === 422) {
                    resolve({ _exists: true, statusCode: 422 });
                } else {
                    reject(new Error(`API ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// ─── Step 1: Git Commit & Push ──────────────────────────────

function gitPush() {
    console.log('\n📦 Step 1: Git Commit & Push');
    console.log('─'.repeat(50));

    const projectDir = path.join(__dirname, '..');
    const opts = { cwd: projectDir, encoding: 'utf-8', stdio: 'pipe' };

    try {
        // 소스코드만 선택적 add (test-*.js, .env 등 제외 → GH013 방지)
        const addPaths = [
            'package.json',
            'package-lock.json',
            'src/',
            'public/',
            'scripts/',
            '.agent/workflows/'
        ];

        for (const p of addPaths) {
            try {
                execSync(`git add "${p}"`, opts);
            } catch (e) {
                // 파일이 없으면 무시
            }
        }

        // .pre-pack-backup 파일은 반드시 unstage
        try {
            execSync('git reset HEAD -- "*.pre-pack-backup" ".env*" "test-*" "build-log*" "sha512*"', opts);
        } catch (e) {
            // unstage 대상이 없으면 무시
        }

        // 커밋 (변경사항 없으면 스킵)
        try {
            const status = execSync('git status --porcelain', opts).trim();
            if (status) {
                execSync(`git commit -m "v${VERSION} release"`, opts);
                console.log(`   ✅ 커밋 완료: v${VERSION} release`);
            } else {
                console.log('   ⏭️ 변경사항 없음, 커밋 스킵');
            }
        } catch (e) {
            console.log('   ⏭️ 커밋 스킵 (이미 커밋됨)');
        }

        // 태그
        try {
            execSync(`git tag "${TAG}"`, opts);
            console.log(`   ✅ 태그 생성: ${TAG}`);
        } catch (e) {
            console.log(`   ⏭️ 태그 이미 존재: ${TAG}`);
        }

        // Push (토큰 포함 URL)
        const pushUrl = `https://${GITHUB_TOKEN}@github.com/${OWNER}/${REPO}.git`;
        try {
            execSync(`git push "${pushUrl}" main "${TAG}" 2>&1`, opts);
            console.log('   ✅ Push 완료');
        } catch (e) {
            // push 실패해도 릴리즈 업로드는 계속 진행
            console.log(`   ⚠️ Push 실패 (릴리즈 업로드는 계속): ${e.message.substring(0, 100)}`);
        }
    } catch (error) {
        console.log(`   ⚠️ Git 작업 실패 (계속 진행): ${error.message.substring(0, 100)}`);
    }
}

// ─── Step 2: Create Release ─────────────────────────────────

async function createRelease() {
    console.log('\n🚀 Step 2: GitHub 릴리즈 생성');
    console.log('─'.repeat(50));

    const releaseData = JSON.stringify({
        tag_name: TAG,
        name: `v${VERSION}`,
        body: `## v${VERSION}\n\n릴리즈 자동 생성`,
        draft: false,
        prerelease: false
    });

    const result = await apiRequest({
        hostname: 'api.github.com',
        path: `/repos/${OWNER}/${REPO}/releases`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(releaseData)
        }
    }, releaseData);

    if (result._exists) {
        // 이미 존재 → 기존 릴리즈 가져오기
        console.log('   📌 릴리즈 이미 존재, 기존 릴리즈 사용');
        const existing = await apiRequest({
            hostname: 'api.github.com',
            path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
            method: 'GET'
        });
        console.log(`   ✅ 릴리즈 ID: ${existing.id}`);
        return existing;
    }

    console.log(`   ✅ 릴리즈 생성 완료: ${result.html_url}`);
    return result;
}

// ─── Step 3: Delete Existing Assets ─────────────────────────

async function deleteExistingAssets(release) {
    if (!release.assets || release.assets.length === 0) return;

    console.log('\n🗑️ Step 3: 기존 에셋 정리');
    console.log('─'.repeat(50));

    for (const asset of release.assets) {
        try {
            await apiRequest({
                hostname: 'api.github.com',
                path: `/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`,
                method: 'DELETE'
            });
            console.log(`   ✅ 삭제: ${asset.name}`);
        } catch (e) {
            console.log(`   ⚠️ 삭제 실패: ${asset.name} (${e.message})`);
        }
    }
}

// ─── Step 4: Upload Assets ──────────────────────────────────

async function uploadAsset(release, filePath, fileName) {
    const fileBuffer = fs.readFileSync(filePath);
    const localSize = fileBuffer.length;
    const sizeMB = (localSize / 1024 / 1024).toFixed(1);

    console.log(`   📤 업로드: ${fileName} (${sizeMB}MB)...`);

    const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
    const url = new URL(uploadUrl);

    const result = await new Promise((resolve, reject) => {
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/octet-stream',
                'User-Agent': 'BetterLifeNaver',
                'Content-Length': fileBuffer.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 201) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Upload ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.write(fileBuffer);
        req.end();
    });

    // 검증: 업로드된 크기 = 로컬 크기
    const match = result.size === localSize;
    console.log(`   ${match ? '✅' : '❌'} ${fileName}: ${result.state} (${(result.size / 1024 / 1024).toFixed(1)}MB) ${match ? '' : `⚠️ size mismatch! local=${localSize} remote=${result.size}`}`);

    return { ...result, _sizeMatch: match };
}

// ─── Step 5: Verify ─────────────────────────────────────────

async function verify(release) {
    console.log('\n🔍 Step 5: 최종 검증');
    console.log('─'.repeat(50));

    // 릴리즈 에셋 재조회
    const updated = await apiRequest({
        hostname: 'api.github.com',
        path: `/repos/${OWNER}/${REPO}/releases/${release.id}`,
        method: 'GET'
    });

    let allGood = true;

    // latest.yml 내용 검증
    const ymlContent = fs.readFileSync(latestYml, 'utf-8');
    const ymlVersionOk = ymlContent.includes(`version: ${VERSION}`);
    console.log(`   latest.yml version: ${ymlVersionOk ? '✅' : '❌'} (${VERSION})`);
    if (!ymlVersionOk) allGood = false;

    // 에셋 검증
    for (const asset of updated.assets || []) {
        const stateOk = asset.state === 'uploaded';
        console.log(`   ${asset.name}: ${stateOk ? '✅' : '❌'} ${(asset.size / 1024 / 1024).toFixed(1)}MB (${asset.state})`);
        if (!stateOk) allGood = false;
    }

    const expectedAssets = ['latest.yml', setupUploadName];
    const foundNames = (updated.assets || []).map(a => a.name);
    for (const expected of expectedAssets) {
        if (!foundNames.includes(expected)) {
            console.log(`   ❌ 에셋 누락: ${expected}`);
            allGood = false;
        }
    }

    console.log('');
    if (allGood) {
        console.log('═'.repeat(50));
        console.log(`🎉 v${VERSION} 릴리즈 완료!`);
        console.log(`📎 ${updated.html_url}`);
        console.log('═'.repeat(50));
    } else {
        console.log('═'.repeat(50));
        console.log('⚠️ 일부 검증 실패. 위 로그를 확인하세요.');
        console.log('═'.repeat(50));
        process.exit(1);
    }
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
    console.log('');
    console.log('═'.repeat(50));
    console.log(`📋 Better Life Naver v${VERSION} 릴리즈`);
    console.log('═'.repeat(50));

    if (!GITHUB_TOKEN) {
        console.error('❌ GH_TOKEN 환경변수가 설정되지 않았습니다.');
        console.error('   실행: $env:GH_TOKEN="ghp_..." ; npm run release:full');
        process.exit(1);
    }

    // 파일 존재 확인
    if (!fs.existsSync(setupFile)) {
        console.error(`❌ Setup 파일 없음: ${setupFile}`);
        process.exit(1);
    }
    if (!fs.existsSync(latestYml)) {
        console.error(`❌ latest.yml 없음: ${latestYml}`);
        console.error('   fix-latest-yml.js를 먼저 실행하세요.');
        process.exit(1);
    }

    try {
        // Step 1: Git
        gitPush();

        // Step 2: 릴리즈 생성
        const release = await createRelease();

        // Step 3: 기존 에셋 정리
        await deleteExistingAssets(release);

        // Step 4: 업로드
        console.log('\n📤 Step 4: 에셋 업로드');
        console.log('─'.repeat(50));

        await uploadAsset(release, setupFile, setupUploadName);
        await uploadAsset(release, latestYml, 'latest.yml');

        // Step 5: 검증
        await verify(release);

    } catch (error) {
        console.error(`\n❌ 오류: ${error.message}`);
        process.exit(1);
    }
}

main();
