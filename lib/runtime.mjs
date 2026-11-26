// 런타임 안정화: 작업 중 맥 잠자기 방지(caffeinate) + 먹통 감시 기본값
// macOS 에서 AI 직원이 실행 중일 때만 /usr/bin/caffeinate -i -s -w <pid> 를 띄우고,
// 모든 작업이 끝나면 즉시 종료해 평상시에는 정상적으로 절전된다.
import { spawn } from 'node:child_process';

export const DEFAULT_HANG_MS = Math.max(
  1000,
  Number(process.env.AIHQ_HANG_MS) || 3 * 60 * 1000, // 기본 3분 무응답 시 먹통 감지
);

export function createPowerGuard({
  platform = process.platform,
  pid = process.pid,
  spawnFn = spawn,
  disabled = process.env.AIHQ_NO_CAFFEINATE === '1',
} = {}) {
  const supported = platform === 'darwin' && !disabled;
  let child = null;
  let enabled = true;
  let activeCount = 0;

  const stopChild = () => {
    if (!child) return;
    const c = child;
    child = null;
    try { c.kill('SIGTERM'); } catch { /* 이미 종료 */ }
  };

  const startChild = () => {
    if (!supported || child) return;
    try {
      const c = spawnFn('/usr/bin/caffeinate', ['-i', '-s', '-w', String(pid)], { stdio: 'ignore' });
      child = c;
      c.on('error', () => { if (child === c) child = null; });
      c.on('exit', () => { if (child === c) child = null; });
    } catch {
      child = null;
    }
  };

  return {
    sync(nextActiveCount, nextEnabled = enabled) {
      activeCount = Math.max(0, Number(nextActiveCount) || 0);
      enabled = Boolean(nextEnabled);
      if (enabled && activeCount > 0) startChild();
      else stopChild();
      return this.status();
    },
    stop() {
      activeCount = 0;
      stopChild();
    },
    status() {
      return {
        supported,
        enabled,
        active: Boolean(child),
        activeCount,
        hangWatchdogSec: Math.round(DEFAULT_HANG_MS / 1000),
      };
    },
  };
}
