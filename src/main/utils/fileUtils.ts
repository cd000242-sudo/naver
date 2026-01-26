// src/main/utils/fileUtils.ts
// 파일 시스템 유틸리티 함수 (순수 함수)

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

/**
 * 파일명 정화 - 특수문자 제거
 */
export function sanitizeFileName(name: string): string {
    const cleaned = String(name || '')
        .replace(/[\\/><:"|?*]+/g, '_')
        .replace(/[\u0000-\u001F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

/**
 * MP4 저장 디렉토리 확보
 */
export async function ensureMp4Dir(customPath?: string): Promise<string> {
    let basePath = customPath && customPath.trim() !== ''
        ? customPath
        : path.join(os.homedir(), 'Downloads', 'naver-blog-images');
    basePath = basePath.replace(/\\/g, '/');
    const mp4Dir = path.join(basePath, 'mp4');
    await fs.mkdir(mp4Dir, { recursive: true });
    return mp4Dir;
}

/**
 * 소제목별 MP4 디렉토리 확보
 */
export async function ensureHeadingMp4Dir(heading: string, customPath?: string): Promise<string> {
    const mp4Root = await ensureMp4Dir(customPath);
    const raw = String(heading || '').trim();
    const shortBase = (sanitizeFileName(raw) || 'heading').slice(0, 18).trim();
    const hash = createHash('sha1').update(raw || String(Date.now())).digest('hex').slice(0, 10);
    const headingFolder = `${shortBase}-${hash}`;
    const headingDir = path.join(mp4Root, headingFolder);
    await fs.mkdir(headingDir, { recursive: true });
    return headingDir;
}

/**
 * 유니크한 MP4 경로 생성
 */
export async function getUniqueMp4Path(dir: string, heading: string): Promise<{ fullPath: string; fileName: string }> {
    const raw = String(heading || '').trim();
    const shortBase = (sanitizeFileName(raw) || 'video').slice(0, 18).trim();
    const hash = createHash('sha1').update(raw || String(Date.now())).digest('hex').slice(0, 10);
    const baseName = `${shortBase}-${hash}`;
    let fileName = `${baseName}.mp4`;
    let fullPath = path.join(dir, fileName);

    let counter = 2;
    while (true) {
        try {
            await fs.access(fullPath);
            fileName = `${baseName} (${counter}).mp4`;
            fullPath = path.join(dir, fileName);
            counter++;
        } catch {
            break;
        }
    }

    return { fullPath, fileName };
}

/**
 * 이미지 저장 기본 디렉토리
 */
export function getDefaultImageDir(): string {
    return path.join(os.homedir(), 'naver-blog-automation', 'images');
}

/**
 * 디렉토리 존재 확인 및 생성
 */
export async function ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
}

/**
 * 파일 존재 여부 확인
 */
export function fileExists(filePath: string): boolean {
    return fsSync.existsSync(filePath);
}

/**
 * 파일 존재 여부 확인 (비동기)
 */
export async function fileExistsAsync(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * 파일 읽기 (JSON)
 */
export async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data) as T;
    } catch {
        return defaultValue;
    }
}

/**
 * 파일 쓰기 (JSON)
 */
export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 임시 디렉토리 경로
 */
export function getTempDir(): string {
    return os.tmpdir();
}

/**
 * 앱 데이터 디렉토리 경로
 */
export function getAppDataDir(appName: string = 'naver-blog-automation'): string {
    return path.join(os.homedir(), appName);
}
