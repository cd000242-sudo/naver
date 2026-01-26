// src/main/utils/logger.ts
// 로깅 유틸리티 서비스 (debugLog 함수 대체)

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 로거 서비스 싱글톤
 * 기존 debugLog 함수를 클래스로 래핑
 */
class LoggerServiceImpl {
    private static instance: LoggerServiceImpl | null = null;
    private logDir: string;
    private logFile: string;
    private debugMode = true;
    private initialized = false;

    private constructor() {
        this.logDir = os.tmpdir();
        this.logFile = path.join(this.logDir, 'better-life-naver-debug.log');
    }

    static getInstance(): LoggerServiceImpl {
        if (!LoggerServiceImpl.instance) {
            LoggerServiceImpl.instance = new LoggerServiceImpl();
        }
        return LoggerServiceImpl.instance;
    }

    /**
     * 로거 초기화 (앱 시작 시 호출)
     */
    initialize(): void {
        if (this.initialized) return;

        try {
            fs.writeFileSync(
                this.logFile,
                `=== Better Life Naver Debug Log ===\n시작 시간: ${new Date().toISOString()}\n\n`,
                'utf-8'
            );
            console.log(`[Logger] 로그 파일 생성: ${this.logFile}`);
            this.initialized = true;
        } catch (error) {
            console.error('[Logger] 로그 파일 초기화 실패:', error);
        }
    }

    /**
     * 로그 디렉토리 설정
     */
    setLogDir(dir: string): void {
        this.logDir = dir;
        this.logFile = path.join(dir, `app-${this.getDateString()}.log`);
    }

    private getDateString(): string {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    private formatMessage(level: LogLevel, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    /**
     * 디버그 모드 설정
     */
    setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * 로그 기록 (기존 debugLog 함수 호환)
     */
    log(message: string): void {
        const formatted = this.formatMessage('info', message);
        console.log(message);
        this.writeToFile(formatted + '\n');
    }

    private writeToFile(line: string): void {
        try {
            fs.appendFileSync(this.logFile, line, 'utf-8');
        } catch {
            // 파일 기록 실패 시 무시
        }
    }

    /**
     * 디버그 로그
     */
    debug(message: string): void {
        if (this.debugMode) {
            const formatted = this.formatMessage('debug', message);
            console.debug(message);
            this.writeToFile(formatted + '\n');
        }
    }

    /**
     * 정보 로그
     */
    info(message: string): void {
        const formatted = this.formatMessage('info', message);
        console.log(message);
        this.writeToFile(formatted + '\n');
    }

    /**
     * 경고 로그
     */
    warn(message: string): void {
        const formatted = this.formatMessage('warn', message);
        console.warn(message);
        this.writeToFile(formatted + '\n');
    }

    /**
     * 에러 로그
     */
    error(message: string, error?: Error): void {
        const errorDetail = error ? `: ${error.message}` : '';
        const formatted = this.formatMessage('error', message + errorDetail);
        console.error(message, error || '');
        this.writeToFile(formatted + '\n');
    }

    /**
     * 로그 파일 경로 가져오기
     */
    getLogFilePath(): string {
        return this.logFile;
    }
}

export const Logger = LoggerServiceImpl.getInstance();

// ============================================
// Static 스타일 헬퍼 함수 (기존 debugLog 호환)
// ============================================

/**
 * 기존 debugLog 함수 호환용
 */
export function debugLog(message: string): void {
    Logger.log(message);
}
