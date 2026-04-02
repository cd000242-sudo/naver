// src/main/utils/logger.ts
// 구조화된 로깅 서비스 (JSON + 카테고리 + 로그 로테이션)

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'automation' | 'ipc' | 'content' | 'image' | 'browser' | 'config' | 'license' | 'system' | 'general';

interface StructuredLogEntry {
    timestamp: string;
    level: LogLevel;
    category: LogCategory;
    message: string;
    stack?: string;
    context?: Record<string, unknown>;
}

const LOG_RETENTION_DAYS = 7;

/**
 * 로거 서비스 싱글톤
 * JSON 구조화 로그 + 카테고리 + 7일 로테이션
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
            this.rotateOldLogs();
        } catch (error) {
            console.error('[Logger] 로그 파일 초기화 실패:', error);
        }
    }

    /**
     * 7일 이상 된 로그 파일 삭제
     */
    private rotateOldLogs(): void {
        try {
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

            for (const file of files) {
                if (!file.startsWith('bln-') || !file.endsWith('.log')) continue;
                const filePath = path.join(this.logDir, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (now - stat.mtimeMs > maxAge) {
                        fs.unlinkSync(filePath);
                    }
                } catch {
                    // 개별 파일 삭제 실패는 무시
                }
            }
        } catch {
            // 로테이션 실패는 무시 — 로깅 자체를 막지 않음
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
     * 구조화된 JSON 로그 엔트리 생성 및 기록
     */
    private writeStructured(entry: StructuredLogEntry): void {
        try {
            const jsonLine = JSON.stringify(entry) + '\n';
            fs.appendFileSync(this.logFile, jsonLine, 'utf-8');
        } catch {
            // 파일 기록 실패 시 무시
        }
    }

    /**
     * 카테고리별 구조화된 로그 기록
     */
    logCategorized(level: LogLevel, category: LogCategory, message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
        const entry: StructuredLogEntry = {
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
        };

        if (error instanceof Error) {
            entry.stack = error.stack;
            entry.message = `${message}: ${error.message}`;
        } else if (error !== undefined) {
            entry.message = `${message}: ${String(error)}`;
        }

        if (context) {
            entry.context = context;
        }

        // 콘솔 출력 (기존 호환)
        const consoleMsg = `[${category}] ${entry.message}`;
        switch (level) {
            case 'debug': if (this.debugMode) console.debug(consoleMsg); break;
            case 'info': console.log(consoleMsg); break;
            case 'warn': console.warn(consoleMsg); break;
            case 'error': console.error(consoleMsg); break;
        }

        this.writeStructured(entry);
    }

    /**
     * 카테고리별 에러 로그 (빈 catch 블록 대체용)
     */
    logError(category: LogCategory, message: string, error?: Error | unknown): void {
        this.logCategorized('error', category, message, error);
    }

    /**
     * 카테고리별 경고 로그
     */
    logWarn(category: LogCategory, message: string, error?: Error | unknown): void {
        this.logCategorized('warn', category, message, error);
    }

    /**
     * 카테고리별 디버그 로그
     */
    logDebug(category: LogCategory, message: string, context?: Record<string, unknown>): void {
        this.logCategorized('debug', category, message, undefined, context);
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
        if (error?.stack) {
            this.writeToFile(`  Stack: ${error.stack}\n`);
        }
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
