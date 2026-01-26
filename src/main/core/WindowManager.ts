// src/main/core/WindowManager.ts
// 메인 윈도우 관리 싱글톤 (트레이 아이콘 지원)

import { BrowserWindow, shell, Notification, Tray, Menu, nativeImage, app } from 'electron';
import * as path from 'path';

/**
 * 윈도우 관리자 싱글톤
 * ✅ [100점 수정] 트레이 아이콘 지원 추가
 * - 최소화 버튼 → 트레이로 숨김
 * - 트레이 아이콘 클릭 → 앱 표시
 * - 닫기 버튼 → 앱 완전 종료
 */
class WindowManagerImpl {
    private mainWindow: BrowserWindow | null = null;
    private tray: Tray | null = null;
    private isQuitting = false;

    /**
     * 메인 윈도우 생성
     */
    createMainWindow(): BrowserWindow {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            return this.mainWindow;
        }

        this.mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            minWidth: 800,
            minHeight: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, '../../preload.js')
            },
            frame: true,
            show: false,
            backgroundColor: '#1a1a2e'
        });

        // 준비되면 표시
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
        });

        // ✅ [100점 수정] 최소화 버튼 클릭 시 트레이로 숨김
        // @ts-ignore - Electron의 minimize 이벤트는 실제로 존재하지만 타입 정의가 불완전함
        (this.mainWindow as any).on('minimize', () => {
            this.mainWindow?.hide();

            // 트레이 아이콘이 없으면 생성
            if (!this.tray) {
                this.createTray();
            }
        });

        // ✅ [100점 수정] 닫기 버튼 클릭 시 앱 완전 종료 (백그라운드 프로세스 포함)
        this.mainWindow.on('close', (event) => {
            this.isQuitting = true;

            // 트레이 아이콘 제거
            if (this.tray) {
                this.tray.destroy();
                this.tray = null;
            }

            // 모든 브라우저 윈도우 강제 종료
            BrowserWindow.getAllWindows().forEach((win) => {
                try {
                    if (!win.isDestroyed()) {
                        win.destroy();
                    }
                } catch (e) {
                    // 무시
                }
            });

            // 강제 종료 (app.quit()보다 더 강력함)
            app.exit(0);
        });

        // 외부 링크 처리
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        // ✅ 트레이 아이콘 생성
        this.createTray();

        return this.mainWindow;
    }

    /**
     * ✅ [100점 수정] 트레이 아이콘 생성
     */
    private createTray(): void {
        if (this.tray) return;

        try {
            // 앱 아이콘 경로 (build/icon.ico)
            const iconPath = path.join(__dirname, '../../../build/icon.ico');
            const icon = nativeImage.createFromPath(iconPath);

            this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
            this.tray.setToolTip('리더 네이버 자동화');

            // 트레이 메뉴
            const contextMenu = Menu.buildFromTemplate([
                {
                    label: '🔓 열기',
                    click: () => {
                        this.show();
                    }
                },
                { type: 'separator' },
                {
                    label: '❌ 종료',
                    click: () => {
                        this.isQuitting = true;
                        if (this.tray) {
                            this.tray.destroy();
                            this.tray = null;
                        }
                        app.exit(0);
                    }
                }
            ]);
            this.tray.setContextMenu(contextMenu);

            // 트레이 아이콘 더블클릭 → 앱 표시
            this.tray.on('double-click', () => {
                this.show();
            });

            // 트레이 아이콘 클릭 → 앱 표시
            this.tray.on('click', () => {
                this.show();
            });

            console.log('[WindowManager] ✅ 트레이 아이콘 생성 완료');
        } catch (error) {
            console.error('[WindowManager] ❌ 트레이 아이콘 생성 실패:', error);
        }
    }

    /**
     * 메인 윈도우 가져오기
     */
    getMainWindow(): BrowserWindow | null {
        return this.mainWindow;
    }

    /**
     * 렌더러에 메시지 전송
     */
    sendToRenderer(channel: string, ...args: any[]): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, ...args);
        }
    }

    /**
     * 알림 표시
     */
    notify(title: string, body: string): void {
        new Notification({ title, body }).show();
    }

    /**
     * ✅ [100점 수정] 윈도우 최소화 → 트레이로 숨김
     */
    minimize(): void {
        this.mainWindow?.hide();
        if (!this.tray) {
            this.createTray();
        }
    }

    /**
     * 윈도우 표시
     */
    show(): void {
        if (this.mainWindow) {
            this.mainWindow.show();
            this.mainWindow.focus();
            // 최소화 상태에서 복원
            if (this.mainWindow.isMinimized()) {
                this.mainWindow.restore();
            }
        }
    }

    /**
     * 윈도우 숨기기
     */
    hide(): void {
        this.mainWindow?.hide();
    }

    /**
     * 앱 종료 플래그 설정
     */
    setQuitting(quitting: boolean): void {
        this.isQuitting = quitting;
    }

    /**
     * 종료 중인지 확인
     */
    isAppQuitting(): boolean {
        return this.isQuitting;
    }

    /**
     * HTML 로드
     */
    loadFile(filePath: string): void {
        this.mainWindow?.loadFile(filePath);
    }

    /**
     * DevTools 열기
     */
    openDevTools(): void {
        this.mainWindow?.webContents.openDevTools();
    }

    /**
     * ✅ [100점 수정] 트레이 아이콘 가져오기
     */
    getTray(): Tray | null {
        return this.tray;
    }
}

// 싱글톤 인스턴스
export const WindowManager = new WindowManagerImpl();

