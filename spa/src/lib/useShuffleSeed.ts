import { useEffect, useState } from 'react';
import { kstHour, msToNextHour, shuffleSeed } from './hourlyShuffle.mjs';

/**
 * 1시간마다 바뀌는 섞기 시드 + [순서 섞기] 버튼용 함수(2026-10-10 사장님 "1시간 주기로 섞고, 수동으로 섞는 버튼").
 * 정시(KST)가 되면 스스로 새 시드로 바뀌고, 수동 섞기 횟수는 그때 0 으로 돌아간다.
 */
export function useShuffleSeed(): [number, () => void] {
  const [hour, setHour] = useState(() => kstHour(Date.now()));
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => { setHour(kstHour(Date.now())); setBump(0); }, msToNextHour(Date.now()) + 500);
    return () => window.clearTimeout(timer);
  }, [hour]);
  return [shuffleSeed(hour, bump), () => setBump((n) => n + 1)];
}
