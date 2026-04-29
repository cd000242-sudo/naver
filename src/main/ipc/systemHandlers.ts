// src/main/ipc/systemHandlers.ts
// 시스템/파일/설정 관련 IPC 핸들러

import { ipcMain, shell, dialog, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IpcContext } from '../types';
import { WindowManager } from '../core/WindowManager';
import { checkAdbDevice, changeIpViaAirplaneMode, getCurrentIp, downloadAdb } from '../utils/adbIpChanger';
import { checkAdsPowerStatus, openAdsPowerBrowser, closeAdsPowerBrowser, listAdsPowerProfiles, createAdsPowerProfile, deleteAdsPowerProfile, setAdsPowerApiKey } from '../utils/adsPowerManager';
import { setAdsPowerEnabled } from '../../crawler/crawlerBrowser.js';
import { setImageFxAdsPowerEnabled } from '../../image/imageFxGenerator.js';
import { setProxyEnabled, isProxyEnabled, getPoolStatus, getSmartProxyConfig, setManualProxy, getManualProxy, verifyProxy, type ManualProxyConfig } from '../../crawler/utils/proxyManager.js';

/**
 * ✅ [2026-03-27] FNV-1a 해시 → 8자리 hex (계정별 Sticky Session ID 생성용)
 */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}


/**
 * 시스템 관련 핸들러 등록
 */
export function registerSystemHandlers(ctx: IpcContext): void {

    // ✅ [2026-03-17] 프록시(SmartProxy) 온/오프 토글
    ipcMain.handle('proxy:setEnabled', async (_event, enabled: boolean) => {
        setProxyEnabled(enabled);
        return { success: true, enabled };
    });

    ipcMain.handle('proxy:isEnabled', async () => {
        return { enabled: isProxyEnabled() };
    });

    ipcMain.handle('proxy:getStatus', async () => {
        return getPoolStatus();
    });

    // ✅ [v1.4.79] 사용자 수동 프록시 IP 저장/조회
    ipcMain.handle('proxy:setManual', async (_event, config: ManualProxyConfig | null) => {
        try {
            setManualProxy(config);
            return { success: true };
        } catch (err) {
            return { success: false, message: (err as Error).message };
        }
    });

    ipcMain.handle('proxy:getManual', async () => {
        return getManualProxy();
    });

    // ✅ [v1.4.79] 프록시 실전 검증 — 실제 HTTP 요청으로 IP 우회 여부 확인
    ipcMain.handle('proxy:verify', async (_event, config: ManualProxyConfig) => {
        try {
            return await verifyProxy(config);
        } catch (err) {
            return {
                ok: false,
                message: `검증 중 예외: ${(err as Error).message}`,
                diagnostics: [],
            };
        }
    });

    // ✅ [v1.4.79] 활성 Chrome 세션의 실제 공인 IP 확인 (프록시 Chrome 적용 최종 확증)
    ipcMain.handle('proxy:detectSessionIp', async (_event, accountId: string) => {
        try {
            const { browserSessionManager } = await import('../../browserSessionManager.js');
            const ip = await browserSessionManager.detectSessionPublicIp(accountId);
            return { ok: !!ip, ip };
        } catch (err) {
            return { ok: false, message: (err as Error).message };
        }
    });

    // ✅ [v1.4.79 P0-Gate] 발행 전 프록시 적용 강제 게이트
    ipcMain.handle('proxy:enforceGate', async (_event, accountId: string, expectedHost?: string) => {
        try {
            const { browserSessionManager } = await import('../../browserSessionManager.js');
            return await browserSessionManager.enforceProxyAppliedOrThrow(accountId, expectedHost);
        } catch (err) {
            return { ok: false, message: (err as Error).message };
        }
    });

    // ✅ [2026-03-16] AdsPower 토글 설정 → crawlerBrowser + ImageFX 전역 flag 동시 동기화
    ipcMain.handle('crawler:setAdsPowerEnabled', async (_event, enabled: boolean) => {
        setAdsPowerEnabled(enabled);
        setImageFxAdsPowerEnabled(enabled); // ✅ ImageFX도 동기화
        return { success: true, enabled };
    });

    // ✅ [2026-03-13] AdsPower Local API 핸들러
    ipcMain.handle('adspower:checkStatus', async () => {
        try {
            return await checkAdsPowerStatus();
        } catch (error) {
            return { running: false, message: `AdsPower 상태 확인 오류: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('adspower:setApiKey', async (_event, apiKey: string) => {
        try {
            setAdsPowerApiKey(apiKey);
            return { success: true };
        } catch (error) {
            return { success: false, message: `API Key 설정 오류: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('adspower:openBrowser', async (_event, profileId: string) => {
        try {
            return await openAdsPowerBrowser(profileId);
        } catch (error) {
            return { success: false, message: `브라우저 열기 오류: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('adspower:closeBrowser', async (_event, profileId: string) => {
        try {
            return await closeAdsPowerBrowser(profileId);
        } catch (error) {
            return { success: false, message: `브라우저 닫기 오류: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('adspower:listProfiles', async () => {
        try {
            return await listAdsPowerProfiles();
        } catch (error) {
            return { success: false, profiles: [], message: `프로필 조회 오류: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('adspower:createProfile', async (_event, profileName: string) => {
        try {
            return await createAdsPowerProfile(profileName);
        } catch (error) {
            return { success: false, message: `프로필 생성 오류: ${(error as Error).message}` };
        }
    });

    ipcMain.handle('adspower:deleteProfile', async (_event, profileIds: string[]) => {
        try {
            return await deleteAdsPowerProfile(profileIds);
        } catch (error) {
            return { success: false, message: `프로필 삭제 오류: ${(error as Error).message}` };
        }
    });

    // ✅ [v2.7.56 SEC-V2-H3] 외부 URL 열기 — file:/javascript: 차단
    //   security-auditor 진단: openExternalUrl이 임의 URL → shell.openExternal()
    //   악용: file:///C:/sensitive/ 또는 javascript:alert(1) 호출 가능
    //   수정: http(s)/mailto만 화이트리스트
    ipcMain.handle('open-external-url', async (_event, url: string) => {
        try {
            if (typeof url !== 'string' || !url) {
                return { success: false, message: 'URL이 필요합니다.' };
            }
            const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];
            try {
                const parsed = new URL(url);
                if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
                    console.warn(`[SEC] 허용되지 않은 URL 프로토콜 차단: ${parsed.protocol}`);
                    return { success: false, message: '허용되지 않은 URL 형식입니다.' };
                }
            } catch {
                return { success: false, message: 'URL 형식이 올바르지 않습니다.' };
            }
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ ADB 디바이스 연결 확인
    ipcMain.handle('adb:checkDevice', async () => {
        try {
            return await checkAdbDevice();
        } catch (error) {
            return { connected: false, message: `ADB 확인 오류: ${(error as Error).message}` };
        }
    });

    // ✅ ADB 비행기모드로 IP 변경
    ipcMain.handle('adb:changeIp', async (_event, waitSeconds?: number) => {
        try {
            return await changeIpViaAirplaneMode(waitSeconds || 5);
        } catch (error) {
            return { success: false, message: `IP 변경 오류: ${(error as Error).message}` };
        }
    });

    // ✅ 현재 공인 IP 조회
    ipcMain.handle('adb:getCurrentIp', async () => {
        try {
            const ip = await getCurrentIp();
            return { success: true, ip };
        } catch (error) {
            return { success: false, ip: 'unknown', message: (error as Error).message };
        }
    });

    // ✅ [2026-03-11] ADB 자동 다운로드
    ipcMain.handle('adb:downloadAdb', async () => {
        try {
            return await downloadAdb();
        } catch (error) {
            return { success: false, message: `ADB 다운로드 오류: ${(error as Error).message}` };
        }
    });
    // OS 홈 디렉토리
    ipcMain.handle('os:homedir', async () => {
        return os.homedir();
    });

    // ✅ LEWORD 실행 핸들러는 main.ts에서 등록 (leword:launch)
    // window:minimize 핸들러 제거됨 → 황금키워드 실행 버튼으로 교체

    // 셸에서 경로 열기 (경로 정규화 + 홈 디렉토리 확장 + 폴더 자동 생성)
    ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
        try {
            const fsPromises = await import('fs/promises');
            const osModule = await import('os');

            // 경로 정규화
            let normalizedPath = targetPath.replace(/\\/g, '/');

            // 홈 디렉토리 경로 확장
            if (normalizedPath.startsWith('~')) {
                normalizedPath = normalizedPath.replace('~', osModule.homedir());
            }

            // 폴더가 없으면 생성
            try {
                await fsPromises.access(normalizedPath);
            } catch {
                await fsPromises.mkdir(normalizedPath, { recursive: true });
            }

            // 폴더 열기
            const result = await shell.openPath(normalizedPath);

            if (result) {
                return { success: false, message: result };
            }

            return { success: true };
        } catch (error) {
            console.error('[systemHandlers] shell:openPath 실패:', error);
            return { success: false, message: (error as Error).message };
        }
    });

    // 앱 강제 종료
    ipcMain.handle('app:forceQuit', async () => {
        try {
            setTimeout(() => {
                try {
                    app.quit();
                } finally {
                    process.exit(0);
                }
            }, 200);
        } catch {
        }
        return { success: true };
    });

    // 앱 정보 가져오기
    ipcMain.handle('app:getInfo', async () => {
        return { isPackaged: app.isPackaged };
    });

    // 앱 패키징 여부 확인
    ipcMain.handle('app:isPackaged', async (): Promise<boolean> => {
        return app.isPackaged;
    });

    // 앱 버전 반환
    ipcMain.handle('app:getVersion', async (): Promise<string> => {
        return app.getVersion();
    });

    // 외부 URL을 브라우저에서 열기
    ipcMain.handle('openExternalUrl', async (_event, url: string): Promise<{ success: boolean; message?: string }> => {
        try {
            if (!url || !url.trim()) {
                return { success: false, message: 'URL이 비어있습니다.' };
            }

            // URL 유효성 검사
            const urlPattern = /^https?:\/\//i;
            if (!urlPattern.test(url.trim())) {
                return { success: false, message: '유효하지 않은 URL 형식입니다.' };
            }

            await shell.openExternal(url.trim());
            console.log(`[systemHandlers] 외부 URL 열기: ${url}`);
            return { success: true };
        } catch (error) {
            console.error('[systemHandlers] 외부 URL 열기 실패:', (error as Error).message);
            return { success: false, message: (error as Error).message };
        }
    });

    // ✅ [2026-03-27] 계정별 Sticky Session 프록시 자동 생성
    // C-1 해결: SmartProxy 자격증명은 main process에서만 처리 (렌더러 노출 차단)
    // M-1 해결: Decodo 공식 format — session-{id}-sessionduration-{min}
    ipcMain.handle('proxy:generateSticky', async (_event, naverId: string) => {
        try {
            if (!naverId || naverId.trim().length === 0) {
                return { success: false, message: '네이버 ID가 비어있습니다.' };
            }
            const config = getSmartProxyConfig();
            const sessionId = fnv1aHash(naverId.trim());
            // Decodo Sticky Session: -session-{id}-sessionduration-1440 (24시간 유지)
            const stickyUsername = `${config.username}-session-${sessionId}-sessionduration-1440`;

            return {
                success: true,
                proxy: {
                    host: config.host,
                    port: String(config.port),
                    username: stickyUsername,
                    password: config.password,
                },
            };
        } catch (error) {
            return { success: false, message: `프록시 생성 실패: ${(error as Error).message}` };
        }
    });
}

/**
 * 파일 시스템 핸들러 등록
 */
export function registerFileHandlers(ctx: IpcContext): void {
    // 파일 존재 여부 확인
    ipcMain.handle('file:checkExists', async (_event, filePath: string) => {
        try {
            return fs.existsSync(filePath);
        } catch {
            return false;
        }
    });

    // 파일 존재 여부 (별칭)
    ipcMain.handle('file:exists', async (_event, filePath: string): Promise<boolean> => {
        try {
            return fs.existsSync(filePath);
        } catch {
            return false;
        }
    });

    // 디렉토리 읽기
    ipcMain.handle('file:readDir', async (_event, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) return [];
            return fs.readdirSync(dirPath);
        } catch {
            return [];
        }
    });

    // 폴더 삭제
    ipcMain.handle('file:deleteFolder', async (_event, folderPath: string) => {
        try {
            if (fs.existsSync(folderPath)) {
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // 파일 삭제
    ipcMain.handle('file:deleteFile', async (_event, filePath: string) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // 디렉토리 읽기 (상세 정보 포함)
    ipcMain.handle('file:readDirWithStats', async (_event, dirPath: string) => {
        try {
            if (!fs.existsSync(dirPath)) return [];
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            return entries.map(entry => {
                const fullPath = path.join(dirPath, entry.name);
                let stats = null;
                try {
                    stats = fs.statSync(fullPath);
                } catch { }
                return {
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory(),
                    size: stats?.size || 0,
                    mtime: stats?.mtime || null
                };
            });
        } catch {
            return [];
        }
    });

    // 파일 상태 가져오기
    ipcMain.handle('file:getStats', async (_event, filePath: string) => {
        try {
            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                mtime: stats.mtime,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory()
            };
        } catch {
            return null;
        }
    });
}

/**
 * 다이얼로그 핸들러 등록
 */
export function registerDialogHandlers(ctx: IpcContext): void {
    // 비디오 파일 선택
    ipcMain.handle('dialog:selectVideoFile', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'avi'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    });

    // 일반 파일 선택 다이얼로그
    ipcMain.handle('dialog:showOpenDialog', async (_event, options) => {
        const mainWindow = WindowManager.getMainWindow();
        if (mainWindow) {
            return dialog.showOpenDialog(mainWindow, options);
        }
        return dialog.showOpenDialog(options);
    });

    // 이미지 폴더 열기
    ipcMain.handle('openImagesFolder', async () => {
        const imagesPath = path.join(os.homedir(), 'naver-blog-automation', 'images');
        if (!fs.existsSync(imagesPath)) {
            fs.mkdirSync(imagesPath, { recursive: true });
        }
        await shell.openPath(imagesPath);
        return { success: true };
    });
}
