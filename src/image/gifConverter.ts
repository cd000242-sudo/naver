import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';
import fs from 'fs/promises';

/**
 * MP4 비디오를 GIF로 변환
 */
export async function convertMp4ToGif(mp4Path: string, options: { fps?: number; width?: number; aspectRatio?: string } = {}): Promise<string> {
    if (!ffmpegPath) {
        throw new Error('ffmpeg-static을 찾을 수 없습니다.');
    }

    const fps = options.fps || 12;
    const width = options.width || 480; // 블로그용 적정 사이즈
    const gifPath = mp4Path.replace(/\.mp4$/i, '.gif');
    const aspectRatio = options.aspectRatio; // '1:1', '16:9', '9:16' 등

    console.log(`[GifConverter] 변환 시작: ${path.basename(mp4Path)} -> ${path.basename(gifPath)} (Ratio: ${aspectRatio || 'auto'})`);

    return new Promise((resolve, reject) => {
        let filter: string;

        if (aspectRatio && aspectRatio === '1:1') {
            // ✅ 1:1 강제 크롭 (꽉 차게)
            // scale로 width에 맞추되 비율 유지하며 증가(increase), 그다음 crop으로 1:1 자르기
            // height도 width와 같게 설정 (정사각형)
            filter = `fps=${fps},scale=${width}:${width}:force_original_aspect_ratio=increase,crop=${width}:${width},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
        } else if (aspectRatio && aspectRatio === '9:16') {
            // ✅ 9:16 강제 크롭 (세로형)
            const height = Math.round(width * (16 / 9));
            filter = `fps=${fps},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
        } else {
            // ❌ 기존 방식 (비율 유지, 크롭 없음) - 16:9나 원본 비율 유지 시 사용
            filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
        }

        const args = [
            '-y',
            '-i', mp4Path,
            '-vf', filter,
            gifPath
        ];

        const ffmpeg: any = spawn(ffmpegPath as string, args);

        // [v2.10.154] 60초 timeout — debugger agent 발견: ffmpeg 좀비 prevention
        //   기존: close 이벤트만 대기 → 상위 throw/timeout 시 ffmpeg 고아
        //   해결: 60초 후 강제 kill (긴 mp4도 충분, 무한 hang 방지)
        const timeoutId = setTimeout(() => {
            try {
                console.warn(`[GifConverter] ⏱️ 60초 timeout — ffmpeg 강제 종료`);
                ffmpeg.kill('SIGKILL');
            } catch { /* ignore */ }
            reject(new Error('ffmpeg 변환 timeout (60s)'));
        }, 60000);

        ffmpeg.on('error', (err: any) => {
            clearTimeout(timeoutId);
            console.error('[GifConverter] ffmpeg 오류:', err);
            reject(err);
        });

        ffmpeg.on('close', (code: number) => {
            clearTimeout(timeoutId);
            if (code === 0) {
                console.log(`[GifConverter] ✅ 변환 완료: ${gifPath}`);
                resolve(gifPath);
            } else {
                reject(new Error(`ffmpeg가 종료 코드 ${code}로 종료되었습니다.`));
            }
        });
    });
}
