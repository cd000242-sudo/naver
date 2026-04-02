/**
 * ✅ [2026-02-04] 자동 업데이트 모듈
 * - electron-updater를 사용한 GitHub Releases 자동 업데이트
 * - 앱 시작 시 자동 체크, 백그라운드 다운로드, 강제 설치 후 재시작
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';

// ✅ [2026-04-03] electron-updater 지연 로드 (개발 모드 crash 방지)
let _autoUpdater: any = null;
function getAutoUpdater() {
  if (!_autoUpdater) {
    try {
      const { autoUpdater: au } = require('electron-updater');
      au.autoDownload = true;
      au.autoInstallOnAppQuit = true;
      _autoUpdater = au;
    } catch (e) {
      console.warn('[Updater] electron-updater 로드 실패:', (e as Error).message);
    }
  }
  return _autoUpdater;
}
type UpdateInfo = any;
type ProgressInfo = any;

let mainWindow: BrowserWindow | null = null;
let loginWindow: BrowserWindow | null = null; // ✅ [2026-03-07] 인증창 참조 (업데이트 재시작 시 닫기용)
let progressWindow: BrowserWindow | null = null; // ✅ [2026-02-04] 진행률 창
let isInitialized = false; // ✅ [2026-02-04] 중복 초기화 방지 플래그
let isUpdateInProgress = false; // ✅ [2026-03-09] 업데이트 진행 중 플래그 (Race Condition 방지)

/**
 * ✅ [2026-03-11] 업데이트 진행 상태 외부 조회 함수
 * main.ts의 인증창 표시 로직에서 업데이트 중 여부를 확인할 때 사용
 */
export function isUpdating(): boolean {
    return isUpdateInProgress;
}

// ✅ [2026-03-11] 업데이트 체크 결과를 외부에 전달하기 위한 resolve 함수
let updateCheckResolve: ((hasUpdate: boolean) => void) | null = null;

/**
 * ✅ [2026-03-11] 업데이트 체크를 시작하고 결과를 Promise로 반환
 * main.ts에서 await하여 업데이트 여부 확인 후 인증창 표시 결정
 * @returns true = 업데이트 있음 (다운로드 시작됨), false = 업데이트 없음 또는 에러
 */
export function waitForUpdateCheck(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        updateCheckResolve = resolve;
        // 타임아웃: 15초 내 응답 없으면 업데이트 없는 것으로 간주
        setTimeout(() => {
            if (updateCheckResolve === resolve) {
                console.log('[Updater] 업데이트 체크 타임아웃 (15초) - 업데이트 없음으로 처리');
                updateCheckResolve = null;
                resolve(false);
            }
        }, 15000);
        checkForUpdates();
    });
}

/**
 * ✅ [2026-02-04] 다운로드 진행률 표시 창 생성
 */
function createProgressWindow(version: string): void {
    try {
        // 기존 창 닫기
        if (progressWindow && !progressWindow.isDestroyed()) {
            progressWindow.close();
        }

        progressWindow = new BrowserWindow({
            width: 420,
            height: 180,
            resizable: false,
            minimizable: false,
            maximizable: false,
            alwaysOnTop: true,
            frame: false,
            backgroundColor: '#1a1a2e', // transparent 대신 배경색 지정 (더 안정적)
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        // 세련된 진행률 UI HTML
        const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                background: transparent;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                -webkit-app-region: drag;
            }
            .container {
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 16px;
                padding: 28px 32px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
                width: 380px;
            }
            .title {
                color: #fff;
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .version {
                color: #6ee7b7;
                font-size: 13px;
                margin-bottom: 18px;
            }
            .progress-bar {
                background: rgba(255,255,255,0.1);
                border-radius: 8px;
                height: 12px;
                overflow: hidden;
            }
            .progress-fill {
                background: linear-gradient(90deg, #6ee7b7 0%, #3b82f6 100%);
                height: 100%;
                width: 0%;
                border-radius: 8px;
                transition: width 0.3s ease;
            }
            .status {
                color: rgba(255,255,255,0.7);
                font-size: 12px;
                margin-top: 12px;
                display: flex;
                justify-content: space-between;
            }
            .percent { color: #6ee7b7; font-weight: 600; }
            .speed { color: rgba(255,255,255,0.5); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="title">🚀 업데이트 다운로드 중</div>
            <div class="version">Better Life Naver v${version}</div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress"></div>
            </div>
            <div class="status">
                <span class="percent" id="percent">0%</span>
                <span class="speed" id="speed">대기 중...</span>
            </div>
        </div>
    </body>
    </html>`;

        progressWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        progressWindow.center();
    } catch (error) {
        console.error('[Updater] 진행률 창 생성 실패 (업데이트는 계속 진행):', error);
        // 진행률 창 생성 실패해도 업데이트는 계속 진행됨
    }
}

/**
 * ✅ [2026-02-04] 진행률 업데이트
 */
function updateProgress(percent: number, bytesPerSecond: number): void {
    if (progressWindow && !progressWindow.isDestroyed()) {
        const speed = bytesPerSecond > 1048576
            ? `${(bytesPerSecond / 1048576).toFixed(1)} MB/s`
            : `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;

        progressWindow.webContents.executeJavaScript(`
            document.getElementById('progress').style.width = '${percent}%';
            document.getElementById('percent').textContent = '${percent}%';
            document.getElementById('speed').textContent = '${speed}';
        `).catch(() => { });

        // 타스크바 진행률 표시
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setProgressBar(percent / 100);
        }
    }
}

/**
 * ✅ [2026-02-04] 진행률 창 닫기
 */
function closeProgressWindow(): void {
    if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.close();
        progressWindow = null;
    }
    // 타스크바 진행률 제거
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setProgressBar(-1);
    }
}

/**
 * 메인 윈도우 참조 설정
 */
export function setUpdaterMainWindow(win: BrowserWindow): void {
    mainWindow = win;
}

/**
 * ✅ [2026-03-07] 인증창 참조 설정 (업데이트 재시작 시 인증창을 닫기 위해)
 * ✅ [2026-03-09] Race Condition 방지: 업데이트가 이미 진행 중이면 인증창 즉시 숨김
 */
export function setUpdaterLoginWindow(win: BrowserWindow | null): void {
    loginWindow = win;
    // ✅ [2026-03-09] 업데이트가 이미 진행 중인데 인증창이 나중에 설정된 경우 → 즉시 숨김
    if (isUpdateInProgress && loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.hide();
        sendLogToRenderer('[Updater] 인증창 즉시 숨김 (업데이트가 이미 진행 중이었음 - Race Condition 방지)');
    }
}

/**
 * ✅ [2026-02-05] 렌더러에 로그 전송 (디버깅용)
 */
function sendLogToRenderer(message: string): void {
    console.log(message); // 메인 프로세스 콘솔에도 출력
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater-log', message);
    }
}

/**
 * 렌더러에 상태 전송
 */
function sendStatusToWindow(channel: string, data?: any): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
    }
}

/**
 * 업데이트 체크 시작
 */
export async function checkForUpdates(): Promise<void> {
    try {
        const updater = getAutoUpdater();
        if (!updater) return;
        console.log('[Updater] 업데이트 확인 시작...');
        await updater.checkForUpdates();
    } catch (error) {
        console.error('[Updater] 업데이트 확인 실패:', error);
    }
}

/**
 * 업데이트 다운로드 시작
 */
export function downloadUpdate(): void {
    const updater = getAutoUpdater();
    if (updater) updater.downloadUpdate();
}

/**
 * 업데이트 설치 및 재시작
 */
export function quitAndInstall(): void {
    const updater = getAutoUpdater();
    if (updater) updater.quitAndInstall();
}

/**
 * ✅ [2026-02-04] 앱 시작 시 즉시 호출 (윈도우 없이도 초기화)
 * - IPC 핸들러 및 이벤트 리스너는 앱 시작 시 한 번만 등록
 * - 윈도우는 나중에 setUpdaterMainWindow로 설정
 */
export function initAutoUpdaterEarly(): void {
    if (isInitialized) {
        console.log('[Updater] 이미 초기화됨, 스킵');
        return;
    }
    isInitialized = true;

    sendLogToRenderer('[Updater] 자동 업데이터 초기화 시작...');

    const updater = getAutoUpdater();
    if (!updater) {
        sendLogToRenderer('[Updater] updater 로드 실패 → 초기화 건너뜀');
        if (updateCheckResolve) { updateCheckResolve(false); updateCheckResolve = null; }
        return;
    }

    // ✅ 업데이트 체크 중
    updater.on('checking-for-update', () => {
        sendLogToRenderer('[Updater] 업데이트 확인 중...');
        sendStatusToWindow('update-checking');
    });

    // ✅ 업데이트 발견 (자동 다운로드 중이므로 알림만 표시)
    updater.on('update-available', (info: UpdateInfo) => {
        sendLogToRenderer(`[Updater] 새 업데이트 발견: ${info.version}`);
        sendStatusToWindow('update-available', {
            version: info.version,
            releaseDate: info.releaseDate,
            releaseNotes: info.releaseNotes
        });

        // ✅ [2026-03-09] 업데이트 진행 중 플래그 설정
        isUpdateInProgress = true;

        // ✅ [2026-03-11] Promise resolve: 업데이트 있음
        if (updateCheckResolve) {
            updateCheckResolve(true);
            updateCheckResolve = null;
        }

        // ✅ [2026-03-11] 안전장치: 인증창이 혹시 이미 만들어져 있으면 숨기기
        if (loginWindow && !loginWindow.isDestroyed()) {
            loginWindow.hide();
            sendLogToRenderer('[Updater] 인증창 숨김 (업데이트 진행 중)');
        }

        // ✅ [2026-02-04] 진행률 표시 창 생성
        createProgressWindow(info.version);
    });

    // ✅ 업데이트 없음
    updater.on('update-not-available', () => {
        sendLogToRenderer('[Updater] 최신 버전입니다.');
        sendStatusToWindow('update-not-available');
        // ✅ [2026-03-11] Promise resolve: 업데이트 없음 → main.ts에서 인증창 생성
        if (updateCheckResolve) {
            updateCheckResolve(false);
            updateCheckResolve = null;
        }
    });

    // ✅ 다운로드 진행률
    updater.on('download-progress', (progress: ProgressInfo) => {
        const percent = Math.round(progress.percent);
        sendLogToRenderer(`[Updater] 다운로드 중: ${percent}%`);

        // ✅ [2026-02-04] 진행률 창 업데이트
        updateProgress(percent, progress.bytesPerSecond);

        sendStatusToWindow('update-download-progress', {
            percent,
            transferred: progress.transferred,
            total: progress.total,
            bytesPerSecond: progress.bytesPerSecond
        });
    });

    // ✅ 다운로드 완료 - 강제 재시작
    updater.on('update-downloaded', (info: UpdateInfo) => {
        sendLogToRenderer(`[Updater] 다운로드 완료: ${info.version}`);

        // ✅ [Premium UI] 세련된 강제 재시작 알림
        const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();

        // 다이얼로그 옵션 (재사용)
        const dialogOptions = {
            type: 'info' as const,
            title: '✅ 업데이트 준비 완료',
            message: `Better Life Naver v${info.version}`,
            detail: `🎉 새로운 버전이 성공적으로 다운로드되었습니다!\n\n새로운 기능과 개선 사항을 적용하기 위해\n앱을 재시작합니다.\n\n⚠️ 진행 중인 작업이 있다면 먼저 저장해 주세요.`,
            buttons: ['지금 재시작하여 업데이트'],
            defaultId: 0,
            noLink: true,
        };

        // ✅ [2026-02-05 FIX] 진행률 창을 다이얼로그 표시 후에 닫도록 변경
        if (targetWindow) {
            sendLogToRenderer('[Updater] 다이얼로그 표시 중... (targetWindow 존재)');

            // 진행률 창을 먼저 숨기기 (닫지 않고)
            if (progressWindow && !progressWindow.isDestroyed()) {
                progressWindow.hide();
            }

            dialog.showMessageBox(targetWindow, dialogOptions).then(() => {
                sendLogToRenderer('[Updater] 사용자가 업데이트 확인, 재시작 실행');
                closeProgressWindow();
                // ✅ [2026-03-07] 인증창이 열려있으면 닫기 (업데이트 재시작 시)
                if (loginWindow && !loginWindow.isDestroyed()) {
                    sendLogToRenderer('[Updater] 인증창 닫기 (업데이트 재시작)');
                    loginWindow.close();
                }
                updater.quitAndInstall();
            }).catch((err) => {
                sendLogToRenderer(`[Updater] 다이얼로그 에러: ${err}`);
                closeProgressWindow();
                // ✅ [2026-03-07] 인증창이 열려있으면 닫기 (업데이트 재시작 시)
                if (loginWindow && !loginWindow.isDestroyed()) {
                    loginWindow.close();
                }
                updater.quitAndInstall();
            });
        } else {
            sendLogToRenderer('[Updater] targetWindow 없음, 진행률 창에서 완료 표시');

            // ✅ [2026-02-05 FIX] targetWindow가 없어도 진행률 창에서 완료 메시지 표시
            if (progressWindow && !progressWindow.isDestroyed()) {
                // ✅ [FIX] 중복 재시작 방지 플래그
                let isRestarting = false;
                const doRestart = () => {
                    if (isRestarting) return;
                    isRestarting = true;
                    sendLogToRenderer('[Updater] 재시작 실행');
                    closeProgressWindow();
                    // ✅ [2026-03-07] 인증창이 열려있으면 닫기 (업데이트 재시작 시)
                    if (loginWindow && !loginWindow.isDestroyed()) {
                        sendLogToRenderer('[Updater] 인증창 닫기 (업데이트 재시작)');
                        loginWindow.close();
                    }
                    updater.quitAndInstall();
                };

                progressWindow.webContents.executeJavaScript(`
                    document.querySelector('.title').innerHTML = '✅ 업데이트 준비 완료';
                    document.querySelector('.title').style.color = '#6ee7b7';
                    document.querySelector('.version').innerHTML = 'Better Life Naver v${info.version}';
                    document.querySelector('.progress-bar').style.display = 'none';
                    document.querySelector('.status').innerHTML = '<span style="color:#6ee7b7;font-weight:600;">클릭하여 재시작</span>';
                    // 전체 body를 클릭 가능하게 변경
                    document.body.style.cssText = '-webkit-app-region:no-drag;cursor:pointer;';
                    document.body.onclick = function() { window.close(); };
                `).catch(() => { });

                // ✅ [FIX] .once 사용하여 이벤트 리스너 중복 등록 방지
                progressWindow.once('closed', () => {
                    doRestart();
                });

                // 5초 후 자동 재시작 (사용자가 안 클릭하면)
                setTimeout(() => {
                    sendLogToRenderer('[Updater] 5초 경과, 자동 재시작');
                    doRestart();
                }, 5000);
            } else {
                // 진행률 창도 없으면 독립 다이얼로그 표시
                dialog.showMessageBox(dialogOptions).then(() => {
                    // ✅ [2026-03-07] 인증창이 열려있으면 닫기 (업데이트 재시작 시)
                    if (loginWindow && !loginWindow.isDestroyed()) {
                        loginWindow.close();
                    }
                    updater.quitAndInstall();
                });
            }
        }

        sendStatusToWindow('update-downloaded', {
            version: info.version
        });
    });

    // ✅ 에러 처리 - [2026-02-05 FIX] 진행률 창을 바로 닫지 않고 에러 표시 후 사용자 확인 대기
    updater.on('error', (error: any) => {
        sendLogToRenderer(`[Updater] ❌ 오류: ${error.message}`);

        // ✅ [2026-03-11] 업데이트 실패 시 플래그 해제
        isUpdateInProgress = false;

        // ✅ [2026-03-11] Promise resolve: 에러 발생 → 업데이트 없음으로 처리
        if (updateCheckResolve) {
            updateCheckResolve(false);
            updateCheckResolve = null;
        }

        // 인증창이 이미 있으면 다시 표시
        if (loginWindow && !loginWindow.isDestroyed()) {
            loginWindow.show();
            sendLogToRenderer('[Updater] 인증창 다시 표시 (업데이트 실패)');
        }

        sendStatusToWindow('update-error', {
            message: error.message
        });

        // ✅ [2026-02-05 FIX] 진행률 창이 있으면 에러 메시지로 변경 (닫지 않음)
        if (progressWindow && !progressWindow.isDestroyed()) {
            // 에러 메시지 안전하게 이스케이프 (따옴표, 줄바꿈 등)
            const safeErrorMsg = error.message
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\n/g, ' ')
                .replace(/\r/g, '');

            progressWindow.webContents.executeJavaScript(`
                document.querySelector('.title').innerHTML = '❌ 업데이트 실패';
                document.querySelector('.title').style.color = '#ef4444';
                document.querySelector('.version').innerHTML = '오류: ${safeErrorMsg}';
                document.querySelector('.version').style.color = '#fca5a5';
                document.querySelector('.progress-bar').style.display = 'none';
                document.querySelector('.status').innerHTML = '<span style="color:#fff;font-weight:600;">클릭하여 닫기</span>';
                // 전체 body를 클릭 가능하게 변경
                document.body.style.cssText = '-webkit-app-region:no-drag;cursor:pointer;';
                document.body.onclick = function() { window.close(); };
            `).catch(() => { });

            // 8초 후 자동으로 닫기 (사용자가 안 닫으면)
            setTimeout(() => {
                closeProgressWindow();
            }, 8000);
        } else {
            // 진행률 창이 없으면 다이얼로그로 표시
            const targetWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
            const dialogOptions = {
                type: 'warning' as const,
                title: '⚠️ 업데이트 실패',
                message: '자동 업데이트에 실패했습니다.',
                detail: `오류: ${error.message}\n\n수동으로 최신 버전을 다운로드해주세요:\nhttps://github.com/cd000242-sudo/naver/releases`,
                buttons: ['확인'],
            };

            if (targetWindow) {
                dialog.showMessageBox(targetWindow, dialogOptions);
            } else {
                // targetWindow도 없으면 독립 다이얼로그 표시
                dialog.showMessageBox(dialogOptions);
            }
        }
    });

    // ✅ IPC 핸들러 등록 (기존 핸들러 제거 후 등록하여 중복 방지)
    try { ipcMain.removeHandler('updater:check'); } catch { }
    ipcMain.handle('updater:check', async () => {
        await checkForUpdates();
        return { success: true };
    });

    try { ipcMain.removeHandler('updater:download'); } catch { }
    ipcMain.handle('updater:download', () => {
        downloadUpdate();
        return { success: true };
    });

    try { ipcMain.removeHandler('updater:install'); } catch { }
    ipcMain.handle('updater:install', () => {
        quitAndInstall();
        return { success: true };
    });

    try { ipcMain.removeHandler('updater:getVersion'); } catch { }
    ipcMain.handle('updater:getVersion', () => {
        return app.getVersion();
    });

    console.log('[Updater] ✅ 자동 업데이터 초기화 완료');

    // ✅ [2026-03-11] 업데이트 체크는 initAutoUpdaterEarly()에서 자동 시작하지 않음
    // main.ts에서 waitForUpdateCheck()를 호출하여 결과를 await함
    console.log('[Updater] 초기화 완료 - waitForUpdateCheck() 호출 대기');
}

/**
 * ✅ [2026-02-04] 윈도우 생성 후 호출 (기존 함수 유지, 호환성)
 * - 이미 초기화되어 있으면 윈도우만 업데이트
 */
export function initAutoUpdater(window: BrowserWindow): void {
    mainWindow = window;

    if (!isInitialized) {
        // 아직 초기화 안됐으면 전체 초기화
        initAutoUpdaterEarly();
    } else {
        console.log('[Updater] 윈도우 참조 업데이트됨');
    }
}
