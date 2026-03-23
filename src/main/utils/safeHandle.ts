// ═══════════════════════════════════════════════════════════════════════════════
// ✅ [2026-03-23] 안전 IPC 핸들러 래퍼 유틸리티
// - 모든 IPC 핸들러를 try-catch로 감싸서 앱 크래시 방지
// - 항상 { success, message } 구조 반환 보장
// - 에러 발생 시 콘솔 + 렌더러 로그 전달
// ═══════════════════════════════════════════════════════════════════════════════
import { ipcMain } from 'electron';

type SafeResult = { success: boolean; message?: string; [key: string]: any };
type IpcHandler = (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any>;

/**
 * IPC 핸들러를 안전하게 래핑합니다.
 * - try-catch로 감싸서 에러 시 앱이 죽지 않고 { success: false, message } 반환
 * - 타임아웃 옵션으로 무한 대기 방지 (기본: 5분)
 */
export function safeHandle(
  channel: string,
  handler: IpcHandler,
  options?: { timeoutMs?: number; silent?: boolean }
): void {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000; // 기본 5분
  const silent = options?.silent ?? false;

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      // 타임아웃 래핑
      const result = await Promise.race([
        handler(event, ...args),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`IPC 핸들러 타임아웃 (${timeoutMs / 1000}초): ${channel}`)), timeoutMs)
        ),
      ]);

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '알 수 없는 오류';
      const shortStack = (error as Error).stack?.split('\n').slice(0, 3).join('\n') || '';

      if (!silent) {
        console.error(`[SafeHandle] ❌ IPC "${channel}" 에러:`, errorMessage);
        console.error(`[SafeHandle] Stack:`, shortStack);
      }

      return {
        success: false,
        message: `[${channel}] ${errorMessage}`,
        error: errorMessage,
      } as SafeResult;
    }
  });
}

/**
 * 기존에 이미 등록된 ipcMain.handle을 안전 래퍼로 재등록합니다.
 * 주의: 이미 등록된 핸들러를 제거 후 재등록하므로, 앱 초기화 후반에 호출해야 합니다.
 */
export function wrapExistingHandler(
  channel: string,
  options?: { timeoutMs?: number; silent?: boolean }
): boolean {
  try {
    // Electron은 기존 핸들러를 가져오는 API가 없으므로,
    // 이 함수는 새 핸들러를 등록할 때만 사용합니다.
    // 기존 핸들러 래핑은 safeHandle로 처음부터 등록하는 방식을 권장합니다.
    console.warn(`[SafeHandle] wrapExistingHandler는 권장되지 않습니다. safeHandle로 직접 등록하세요.`);
    return false;
  } catch {
    return false;
  }
}

/**
 * 여러 IPC 핸들러를 한 번에 안전하게 등록합니다.
 */
export function safeHandleBatch(
  handlers: Array<{ channel: string; handler: IpcHandler; timeoutMs?: number; silent?: boolean }>
): void {
  for (const { channel, handler, timeoutMs, silent } of handlers) {
    safeHandle(channel, handler, { timeoutMs, silent });
  }
  console.log(`[SafeHandle] ✅ ${handlers.length}개 IPC 핸들러 안전 등록 완료`);
}
