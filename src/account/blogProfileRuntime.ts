/**
 * 앱 하나에 블로그 설정 · 성과 저장소 하나씩 — IPC(화면)와 생성 경로(main)가 같은 저장소 · 같은 줄 세우기를 쓰게 한다(2026-10-21).
 */
import path from 'node:path';
import { createBlogProfileStore, type BlogProfileStore } from './blogProfileStore.js';
import { createBlogPerformanceStore, type BlogPerformanceStore } from '../analytics/blogPerformanceStore.js';

let sharedProfiles: BlogProfileStore | null = null;
let sharedPerformance: BlogPerformanceStore | null = null;

export function blogProfileStoreAt(userDataPath: string): BlogProfileStore {
  if (!sharedProfiles) sharedProfiles = createBlogProfileStore(path.join(userDataPath, 'blog-profiles.json'));
  return sharedProfiles;
}

export function blogPerformanceStoreAt(userDataPath: string): BlogPerformanceStore {
  if (!sharedPerformance) sharedPerformance = createBlogPerformanceStore(path.join(userDataPath, 'blog-performance-v1.json'));
  return sharedPerformance;
}
