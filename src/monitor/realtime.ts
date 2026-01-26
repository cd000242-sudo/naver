import dotenv from 'dotenv';
import { TrendMonitor } from './trendMonitor.js';

dotenv.config();

const monitor = new TrendMonitor();

monitor
  .monitorRealtime()
  .catch((error) => {
    console.error('❌ 실시간 모니터링 실패:', error);
    process.exit(1);
  })
  .finally(() => {
    monitor.stop();
  });









