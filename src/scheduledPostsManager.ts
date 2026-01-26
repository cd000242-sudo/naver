import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';

// ✅ 반복 일정 타입 추가
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface ScheduledPost {
  id: string;
  postId?: string; // ✅ localStorage의 generatedPosts에서 찾을 때 사용
  title: string;
  scheduleDate: string; // YYYY-MM-DD HH:mm 형식
  createdAt: string; // ISO 형식
  status: 'scheduled' | 'published' | 'cancelled';
  publishMode?: 'draft' | 'publish' | 'schedule';
  publishedAt?: string; // ✅ 실제 발행 완료 시간
  publishedUrl?: string; // ✅ 발행된 글 URL
  // ✅ 반복 일정 필드
  recurrence?: RecurrenceType;
  recurrenceEndDate?: string; // 반복 종료 날짜 (선택사항)
  lastPublished?: string; // 마지막 발행 시간
}

const SCHEDULED_POSTS_FILE = 'scheduled-posts.json';

function getScheduledPostsPath(): string {
  return path.join(app.getPath('userData'), SCHEDULED_POSTS_FILE);
}

export async function loadScheduledPosts(): Promise<ScheduledPost[]> {
  try {
    const filePath = getScheduledPostsPath();
    const data = await fs.readFile(filePath, 'utf-8');
    const posts = JSON.parse(data) as ScheduledPost[];
    return posts.filter(post => post.status === 'scheduled'); // 예약된 것만 반환
  } catch (error) {
    // 파일이 없으면 빈 배열 반환
    return [];
  }
}

export async function saveScheduledPost(post: ScheduledPost): Promise<void> {
  try {
    const filePath = getScheduledPostsPath();
    let posts: ScheduledPost[] = [];
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      posts = JSON.parse(data) as ScheduledPost[];
    } catch {
      // 파일이 없으면 새로 생성
      posts = [];
    }
    
    // 기존 포스트가 있으면 업데이트, 없으면 추가
    const existingIndex = posts.findIndex(p => p.id === post.id);
    if (existingIndex >= 0) {
      posts[existingIndex] = post;
    } else {
      posts.push(post);
    }
    
    await fs.writeFile(filePath, JSON.stringify(posts, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`예약 포스팅 저장 실패: ${(error as Error).message}`);
  }
}

export async function removeScheduledPost(postId: string): Promise<void> {
  try {
    const filePath = getScheduledPostsPath();
    let posts: ScheduledPost[] = [];
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      posts = JSON.parse(data) as ScheduledPost[];
    } catch {
      return; // 파일이 없으면 아무것도 하지 않음
    }
    
    // 포스트 제거 또는 상태를 cancelled로 변경
    posts = posts.filter(p => p.id !== postId);
    
    await fs.writeFile(filePath, JSON.stringify(posts, null, 2), 'utf-8');
  } catch (error) {
    throw new Error(`예약 포스팅 제거 실패: ${(error as Error).message}`);
  }
}

export async function getAllScheduledPosts(): Promise<ScheduledPost[]> {
  try {
    const filePath = getScheduledPostsPath();
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as ScheduledPost[];
  } catch (error) {
    return [];
  }
}

// ✅ 반복 일정 계산 함수
export function calculateNextScheduleDate(post: ScheduledPost): string | null {
  if (!post.recurrence || post.recurrence === 'none') return null;
  
  const lastDate = post.lastPublished ? new Date(post.lastPublished) : new Date(post.scheduleDate);
  let nextDate: Date;
  
  switch (post.recurrence) {
    case 'daily':
      nextDate = new Date(lastDate.getTime() + 24 * 60 * 60 * 1000); // +1일
      break;
    case 'weekly':
      nextDate = new Date(lastDate.getTime() + 7 * 24 * 60 * 60 * 1000); // +7일
      break;
    case 'monthly':
      nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + 1); // +1개월
      break;
    default:
      return null;
  }
  
  // 종료 날짜 체크
  if (post.recurrenceEndDate) {
    const endDate = new Date(post.recurrenceEndDate);
    if (nextDate > endDate) {
      return null; // 종료 날짜 초과
    }
  }
  
  // YYYY-MM-DD HH:mm 형식으로 반환
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, '0');
  const day = String(nextDate.getDate()).padStart(2, '0');
  const hours = String(nextDate.getHours()).padStart(2, '0');
  const minutes = String(nextDate.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ✅ 반복 일정 포스트 처리 (발행 후 다음 일정 생성)
export async function handleRecurringPost(post: ScheduledPost): Promise<void> {
  if (!post.recurrence || post.recurrence === 'none') return;
  
  const nextScheduleDate = calculateNextScheduleDate(post);
  
  if (nextScheduleDate) {
    // 다음 일정 생성
    const nextPost: ScheduledPost = {
      ...post,
      id: `${post.id}-${Date.now()}`, // 새 ID 생성
      scheduleDate: nextScheduleDate,
      lastPublished: new Date().toISOString(),
      status: 'scheduled'
    };
    
    await saveScheduledPost(nextPost);
    console.log(`[Scheduler] 반복 일정 생성: ${nextPost.title} - ${nextScheduleDate}`);
  } else {
    console.log(`[Scheduler] 반복 일정 종료: ${post.title}`);
  }
}









