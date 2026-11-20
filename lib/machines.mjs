// 사무실(기계) 상태. 이 맥은 os 와 df 로 실제 값을 읽고,
// 다른 기계는 hostname 이 입력된 경우에만, 누를 때 한 번 TCP 연결로 닿는지 확인한다 (ssh 로그인 안 함).
import os from 'node:os';
import fs from 'node:fs/promises';
import net from 'node:net';
import { execFile } from 'node:child_process';

function run(cmd, args, ms = 3000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: ms }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });
}

async function memoryMac() {
  const total = os.totalmem();
  if (process.platform === 'darwin') {
    // macOS 는 os.freemem() 이 너무 작게 나온다. vm_stat 의 free + inactive + speculative + purgeable 을 쓴다.
    const out = await run('/usr/bin/vm_stat', []);
    const pageSize = Number(/page size of (\d+)/.exec(out)?.[1] || 0);
    const pick = (label) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(out)?.[1] || 0);
    if (pageSize && out) {
      const avail = (pick('Pages free') + pick('Pages inactive') + pick('Pages speculative') + pick('Pages purgeable')) * pageSize;
      return { total, available: Math.min(avail, total) };
    }
  }
  return { total, available: os.freemem() };
}

async function diskRoot() {
  try {
    const root = process.platform === 'win32' ? (process.env.SystemDrive || 'C:') + '\\' : '/';
    const st = await fs.statfs(root);
    const total = st.blocks * st.bsize;
    const free = st.bavail * st.bsize;
    return { total, used: Math.max(0, total - st.bfree * st.bsize), free };
  } catch { /* statfs 미지원 시 df 폴백 */ }
  const out = await run('/bin/df', ['-k', '/']);
  const line = out.trim().split('\n')[1];
  if (!line) return null;
  const cols = line.trim().split(/\s+/);
  // Filesystem 1024-blocks Used Available Capacity ...
  return { total: Number(cols[1]) * 1024, used: Number(cols[2]) * 1024, free: Number(cols[3]) * 1024 };
}

export async function localStatus() {
  const mac = process.platform === 'darwin';
  const [mem, disk, model, chip] = await Promise.all([
    memoryMac(),
    diskRoot(),
    mac ? run('/usr/sbin/sysctl', ['-n', 'hw.model']) : Promise.resolve(''),
    mac ? run('/usr/sbin/sysctl', ['-n', 'machdep.cpu.brand_string']) : Promise.resolve(os.cpus()[0]?.model || ''),
  ]);
  return {
    hostname: os.hostname(),
    model: model.trim(),
    chip: chip.trim(),
    cpus: os.cpus().length,
    uptimeSec: Math.round(os.uptime()),
    load: os.loadavg().map((x) => Math.round(x * 100) / 100),
    memory: mem,
    disk,
    readAt: new Date().toISOString(),
  };
}

// 닿는지만 본다: hostname:port 로 TCP 연결을 열었다가 바로 닫는다.
export function reach(hostname, port = 22, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = net.connect({ host: hostname, port, timeout: timeoutMs });
    const done = (ok, reason) => {
      sock.destroy();
      resolve({ ok, ms: Date.now() - started, reason, checkedAt: new Date().toISOString() });
    };
    sock.once('connect', () => done(true, '연결됨'));
    sock.once('timeout', () => done(false, `응답 없음 (${timeoutMs / 1000}초)`));
    sock.once('error', (e) => {
      // 거절은 기계가 켜져서 답한 것이므로 닿은 것으로 본다
      if (e.code === 'ECONNREFUSED') return done(true, `켜져 있음, ${port}번 포트 닫힘`);
      done(false, e.code === 'ENOTFOUND' ? '이름을 찾을 수 없음' : e.code === 'EHOSTUNREACH' ? '네트워크에서 찾을 수 없음' : (e.code || '오류'));
    });
  });
}

export function validHostname(h) {
  return typeof h === 'string' && /^[A-Za-z0-9.\-:]{1,253}$/.test(h);
}
