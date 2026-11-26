// 자동화 직원: 이 맥에서 이미 쓰는 스크립트를 본사의 할 일로 돌린다.
//   - 실행할 명령은 등록 파일(automations.json)에 적힌 것뿐이다. 화면이나 API 로는 고칠 수 없다 (대표가 파일을 직접 고친다).
//   - 명령은 인자 배열로 실행하고 셸을 거치지 않는다. 할 일의 제목, 메모, 대화는 명령에도 환경에도 들어가지 않는다.
//   - 직원 하나가 명령 하나를 맡는다. 켜고 끄기, 시간, 지금 실행, 안전 정지는 다른 직원과 같은 길을 탄다.
// 시험: node --test qa/automations.test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const DEFAULT_TIMEOUT_MIN = 15;
export const MAX_TIMEOUT_MIN = 180;
const OUT_CAP = 200000;

// 등록 파일 위치: 데이터 폴더 옆 (본사가 쓰는 hq.json 과 섞이지 않게)
export function automationsFile(dataDir, env = process.env) {
  return env.AIHQ_AUTOMATIONS || path.join(path.dirname(dataDir), 'automations.json');
}

function isExecutable(p) {
  try { fs.accessSync(p, fs.constants.X_OK); return fs.statSync(p).isFile(); } catch { return false; }
}
function isDirectory(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// 읽은 JSON 을 검사한다. 받아들인 것은 list, 버린 것은 problems 에 이유와 함께.
export function parseAutomations(raw, { executable = isExecutable, directory = isDirectory } = {}) {
  const list = [];
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.automations)) {
    return { list, problems: ['등록 파일은 {"automations": [ … ]} 모양이어야 합니다.'] };
  }
  const seen = new Set();
  raw.automations.forEach((a, i) => {
    const where = `${i + 1}번째`;
    if (!a || typeof a !== 'object' || Array.isArray(a)) return problems.push(`${where}: 객체가 아닙니다.`);
    const id = typeof a.id === 'string' ? a.id : '';
    const name = id ? `${where} (${id.slice(0, 40)})` : where;
    if (!ID_RE.test(id)) return problems.push(`${name}: id 는 영어 소문자, 숫자, 하이픈으로 41자까지입니다.`);
    if (seen.has(id)) return problems.push(`${name}: 같은 id 가 앞에 있습니다.`);
    const cmd = a.command;
    if (!Array.isArray(cmd) || cmd.length === 0 || !cmd.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 2000) || cmd.length > 40) {
      return problems.push(`${name}: command 는 ["실행 파일", "인자", …] 처럼 글자 배열이어야 합니다 (한 줄 명령은 받지 않습니다).`);
    }
    if (!path.isAbsolute(cmd[0])) return problems.push(`${name}: 실행 파일은 /로 시작하는 전체 경로로 적어 주세요.`);
    if (!executable(cmd[0])) return problems.push(`${name}: 실행 파일을 찾지 못했거나 실행할 수 없습니다 (${cmd[0]}).`);
    let cwd = null;
    if (a.cwd !== undefined && a.cwd !== null && a.cwd !== '') {
      if (typeof a.cwd !== 'string' || !path.isAbsolute(a.cwd) || !directory(a.cwd)) return problems.push(`${name}: cwd 는 있는 폴더의 전체 경로여야 합니다.`);
      cwd = a.cwd;
    }
    let timeoutMinutes = DEFAULT_TIMEOUT_MIN;
    if (a.timeoutMinutes !== undefined) {
      const n = Number(a.timeoutMinutes);
      if (!Number.isFinite(n) || n < 1 || n > MAX_TIMEOUT_MIN) return problems.push(`${name}: timeoutMinutes 는 1 에서 ${MAX_TIMEOUT_MIN} 사이입니다.`);
      timeoutMinutes = n;
    }
    const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 80) : id;
    seen.add(id);
    list.push({ id, title, command: [...cmd], ...(cwd ? { cwd } : {}), timeoutMinutes });
  });
  return { list, problems };
}

// 파일이 바뀌었을 때만 다시 읽는다 (실행 가능 여부를 자주 묻기 때문)
const cache = new Map();
export function loadAutomations(file) {
  let st;
  try { st = fs.statSync(file); } catch { cache.delete(file); return { list: [], problems: [] }; }
  const stamp = `${st.mtimeMs}:${st.size}:${st.mode}`;
  const hit = cache.get(file);
  if (hit && hit.stamp === stamp) return hit.value;
  let value;
  if (process.platform !== 'win32' && (st.mode & 0o022)) {
    value = { list: [], problems: [`등록 파일을 다른 사용자가 고칠 수 있습니다. 권한을 좁혀 주세요: chmod 600 ${file}`] };
  } else {
    try { value = parseAutomations(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { value = { list: [], problems: [`등록 파일을 읽지 못했습니다: ${String(e.message || e).slice(0, 160)}`] }; }
  }
  cache.set(file, { stamp, value });
  return value;
}

export function findAutomation(list, id) {
  return (id && (list || []).find((a) => a.id === id)) || null;
}

// 스크립트에 주는 환경: 어느 할 일, 어느 직원인지 아이디만. 사람이나 AI 가 쓴 글은 넣지 않는다.
export function automationEnv(base, task, emp) {
  return { ...base, AIHQ_TASK_ID: String(task?.id || ''), AIHQ_EMPLOYEE: String(emp?.id || ''), AIHQ_TRIGGERED_BY_HQ: '1' };
}

// 등록된 명령을 한 번 실행한다. 실패해도 예외를 던지지 않고 결과로 돌려준다.
// signal 이 끊기면(대표가 중단) 하위 프로세스까지 멈추고 aborted 로 알린다.
export function runAutomation(a, { env = process.env, timeoutMs, signal = null } = {}) {
  const limit = timeoutMs || (a.timeoutMinutes || DEFAULT_TIMEOUT_MIN) * 60 * 1000;
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let timedOut = false;
    let aborted = false;
    let child;
    if (signal?.aborted) return resolve({ code: null, signal: null, out: '', err: '', timedOut: false, aborted: true });
    try {
      // detached: 스크립트가 띄운 하위 프로세스까지 한 묶음으로 멈출 수 있게 한다
      child = spawn(a.command[0], a.command.slice(1), { cwd: a.cwd || undefined, env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: 127, signal: null, out: '', err: String(e.message || e), timedOut: false, aborted: false });
    }
    const cap = (s, chunk) => (s.length > OUT_CAP ? s : s + chunk);
    child.stdout.on('data', (c) => { out = cap(out, c.toString('utf8')); });
    child.stderr.on('data', (c) => { err = cap(err, c.toString('utf8')); });
    const stop = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch { /* 이미 끝남 */ } } };
    const timer = setTimeout(() => { timedOut = true; stop('SIGTERM'); setTimeout(() => stop('SIGKILL'), 5000).unref(); }, limit);
    const onAbort = () => { aborted = true; stop('SIGTERM'); setTimeout(() => stop('SIGKILL'), 5000).unref(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    child.on('error', (e) => { done(); resolve({ code: 127, signal: null, out: out.trim(), err: (err + String(e.message || e)).trim(), timedOut, aborted }); });
    child.on('close', (code, sig) => { done(); resolve({ code, signal: sig, out: out.trim(), err: err.trim(), timedOut, aborted }); });
  });
}

// 할 일 스레드에 남길 글
export function resultText(r, timeoutMinutes = DEFAULT_TIMEOUT_MIN) {
  const body = r.out || r.err || '(출력 없음)';
  return r.timedOut ? `${body}\n\n${timeoutMinutes}분이 넘어 멈췄습니다.` : body;
}
