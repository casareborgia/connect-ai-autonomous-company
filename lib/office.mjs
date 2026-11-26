// 배차: 할 일을 다른 맥(사무실)에 ssh 로 보내 그 맥이 직접 하게 한다. 본사가 밀어 넣는 방식이라 새로 여는 포트가 없다.
//   1) 보낼 수 있는 일인지 본다 (안전 정지, 정해진 일 종류, 사무실마다 한 번에 하나)
//   2) ssh 로 render-node/jobs/<할 일>/ 에 실행기와 job.json 을 넣고 한 번 실행 (nohup)
//   3) 몇 초마다 ssh 로 끝났는지와 마지막 로그를 본다
//   4) 끝나면 결과를 본사 data/jobs/<할 일>/ 로 가져오고, 스레드에 결과와 인수인계를 남기고, 사무실 폴더를 지운다
// 사무실에 닿지 않으면 할 일은 대기로 남고, 1분, 2분, 4분 … (최대 15분) 뒤에 다시 보낸다.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { TEMPLATES, LIGHT_TEMPLATES, validateJob } from './jobspec.mjs';
import { detectGate } from './gates.mjs';
import { pickAccount, evaluateAccountPolicy } from './accounts.mjs';
import { ymd, hm, nowIso } from './util.mjs';

const LIB = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(LIB, '..', 'remote', 'aihq-runner.mjs');
const JOBSPEC = path.join(LIB, 'jobspec.mjs');

export const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const ACTIVE = ['sending', 'running', 'fetching'];
const TASK_ID = /^[A-Za-z0-9_-]{1,40}$/;
const INST = /^[a-f0-9]{8,32}$/;
const MAX_FETCH = 4 * 1024 ** 3; // 이보다 큰 결과는 사무실에 남겨 두고 경로만 알린다

export const validAlias = (a) => typeof a === 'string' && ALIAS_RE.test(a);
export const isOffice = (r) => Boolean(r && r.kind === '기계' && !r.isThisMac && validAlias(r.sshAlias || ''));
export const officeName = (r) => String(r?.name || '').replace(/\s*\(.*\)\s*$/, '') || r?.name || '사무실';

// 무거운 일 (Remotion, Blender) 은 스튜디오 같은 렌더 기계만. 정해 두지 않았으면 이름으로 본다.
export function allowedTemplates(r) {
  if (Array.isArray(r?.officeJobs)) return r.officeJobs.filter((k) => Object.hasOwn(TEMPLATES, k));
  return /(스튜디오|studio)/i.test(String(r?.name || '')) ? Object.keys(TEMPLATES) : LIGHT_TEMPLATES;
}

const minutesOf = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };

// 이 할 일을 지금 사무실로 보내도 되는가. { go, res, emp, job } 또는 { go:false, why, block }
//   block: 고치기 전에는 다시 봐도 안 되는 이유 (스레드에 한 번 알린다)
export function dispatchCheck(d, t, now = new Date(), hosts = new Map()) {
  const no = (why, block = false) => ({ go: false, why, block });
  if (t.status !== '대기' || t.runStartedAt) return no('대기 중인 일이 아님');
  if (t.remote && (ACTIVE.includes(t.remote.state) || t.remote.state === 'blocked')) return no(t.remote.reason || '이미 보냄');
  const res = d.resources.find((r) => r.id === t.resource);
  if (!isOffice(res)) return no('사무실 기계가 아님');
  if (res.status === '꺼짐') return no(`${officeName(res)} 꺼짐`);
  const emp = d.employees.find((e) => e.id === t.assignee);
  if (!emp) return no('AI 직원의 일이 아님');
  const today = ymd(now);
  const autoRoutine = emp.runMode === 'auto' && Boolean(t.routineId) && t.date === today;
  if (!t.officeRun && !autoRoutine) return no('사무실에서 실행이 꺼져 있음');
  if (t.date > today) return no('아직 날짜가 안 됨');
  if (t.time && t.date === today && minutesOf(t.time) > minutesOf(hm(now))) return no('아직 시간이 안 됨');
  // 안전 정지: 저장된 확인 종류가 없어도 글을 다시 본다 + 연결 계정 금지 권한 차단
  const gate = t.gate || detectGate(`${t.title} ${t.note || ''}`);
  if (gate && !t.gateApprovedAt) return no(`${gate} 확인 전`);
  const acc = (t.account ? (d.resources || []).find((r) => r.id === t.account && r.kind === '계정') : null) || pickAccount(`${t.title} ${t.note || ''}`, d.resources || []);
  const pol = acc ? evaluateAccountPolicy(acc, `${t.title} ${t.note || ''}`) : null;
  if (pol?.blocked) return no(pol.message, true);
  const v = validateJob(t.officeJob || { template: 'ai-text' });
  if (v.error) return no(v.error, true);
  if (!allowedTemplates(res).includes(v.job.template)) return no(`${officeName(res)}: 가벼운 일만 해요. 렌더 기계로 보내 주세요 (${TEMPLATES[v.job.template].label}).`, true);
  if (v.job.template === 'ai-text' && emp.engine !== 'local') return no(`글 일은 로컬 모델 직원만 사무실에서 할 수 있어요. 담당을 로컬 모델 직원으로 바꾸거나 렌더 일을 골라 주세요.`, true);
  if (d.tasks.some((x) => x.id !== t.id && x.remote && ACTIVE.includes(x.remote.state) && x.remote.res === res.id)) return no(`${officeName(res)} 다른 일 중`);
  const h = hosts.get(res.id);
  if (h && h.retryAt && h.retryAt > now.getTime()) return no(`${officeName(res)} 다시 시도 대기`);
  if (t.remote?.state === 'retry' && Date.parse(t.remote.retryAt || 0) > now.getTime()) return no('다시 시도 대기');
  return { go: true, res, emp, job: v.job };
}

// ───────── ssh ─────────

const PRE = 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; ';
const jdir = (id) => {
  if (!TASK_ID.test(id)) throw new Error('할 일 아이디 형식이 아닙니다.');
  return `J="$HOME/render-node/jobs/${id}"; `;
};
const inst = (x) => {
  if (!INST.test(x)) throw new Error('본사 아이디 형식이 아닙니다.');
  return x;
};

// 보내기: 같은 이름 폴더가 남의 것이면 건드리지 않는다. 내 것인데 실행기가 살아 있으면 이어서 본다.
export function launchScript(taskId, instance) {
  const me = inst(instance);
  return PRE + jdir(taskId)
    + 'if [ -e "$J" ]; then '
    + `if [ "$(cat "$J/.aihq" 2>/dev/null)" != "${me}" ]; then cat > /dev/null; echo AIHQ_EXISTS; exit 3; fi; `
    + 'P=$(cat "$J/pid" 2>/dev/null); if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then cat > /dev/null; echo AIHQ_RUNNING; exit 0; fi; '
    + 'rm -rf "${J:?}"; fi; '
    + 'mkdir -p "$J" && tar -xf - -C "$J" && cd "$J" && '
    + `printf %s "${me}" > .aihq && `
    + '{ nohup node aihq-runner.mjs "$J" >> log.txt 2>&1 < /dev/null & echo $! > pid; } && echo AIHQ_STARTED';
}

export function pollScript(taskId) {
  return PRE + jdir(taskId)
    + 'if [ -f "$J/result.json" ]; then echo AIHQ_DONE; cat "$J/result.json"; echo; '
    + 'else P=$(cat "$J/pid" 2>/dev/null); if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then echo AIHQ_ALIVE; '
    + 'elif [ -d "$J" ]; then echo AIHQ_DEAD; else echo AIHQ_GONE; fi; fi; '
    + 'echo AIHQ_LOG; tail -c 1500 "$J/log.txt" 2>/dev/null; true';
}

export function fetchScript(taskId, withOut) {
  return PRE + jdir(taskId) + `cd "$J" && COPYFILE_DISABLE=1 tar -cf - result.json log.txt${withOut ? ' out' : ''}`;
}

export function cleanScript(taskId, instance) {
  const me = inst(instance);
  return PRE + jdir(taskId) + `if [ -d "$J" ] && [ "$(cat "$J/.aihq" 2>/dev/null)" = "${me}" ]; then rm -rf "\${J:?}"; echo AIHQ_CLEANED; fi; true`;
}

// 기록해 둔 실행기 pid 에만 멈춤 신호를 보낸다 (실행기가 결과를 남기고 끝낸다)
export function stopScript(taskId, instance) {
  const me = inst(instance);
  return PRE + jdir(taskId) + `if [ "$(cat "$J/.aihq" 2>/dev/null)" = "${me}" ]; then P=$(cat "$J/pid" 2>/dev/null); [ -n "$P" ] && kill "$P" 2>/dev/null; fi; true`;
}

export function sshWhy(err) {
  const s = String(err || '');
  if (/timed out|timeout/i.test(s)) return '응답 없음 (시간 초과)';
  if (/no route|unreachable/i.test(s)) return '네트워크에서 찾을 수 없음';
  if (/refused/i.test(s)) return 'ssh 가 꺼져 있음';
  if (/permission denied/i.test(s)) return 'ssh 키로 들어갈 수 없음';
  if (/could not resolve/i.test(s)) return '이름을 찾을 수 없음';
  if (/host key/i.test(s)) return '호스트 키 확인 실패';
  return 'ssh 연결 실패';
}

const SSH_BIN = process.platform !== 'win32' && fs.existsSync('/usr/bin/ssh') ? '/usr/bin/ssh' : 'ssh';
const TAR_BIN = process.platform !== 'win32' && fs.existsSync('/usr/bin/tar') ? '/usr/bin/tar' : 'tar';

// ssh 한 번 실행. stdout 을 파이프로 다른 프로세스에 넘길 수도 있다 (pipeTo).
export function ssh(alias, script, { input = null, timeoutMs = 30000, pipeTo = null, maxOut = 2 * 1024 * 1024 } = {}) {
  if (!validAlias(alias)) return Promise.resolve({ code: 255, out: '', err: 'ssh 별칭 형식이 아님', down: true });
  return new Promise((resolve) => {
    const child = spawn(SSH_BIN, ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4', '--', alias, script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    if (pipeTo) child.stdout.pipe(pipeTo.stdin);
    else child.stdout.on('data', (c) => { if (out.length < maxOut) out += c.toString('utf8'); });
    child.stderr.on('data', (c) => { if (err.length < 20000) err += c.toString('utf8'); });
    child.stdin.on('error', () => { /* 원격이 먼저 닫음 */ });
    if (input) child.stdin.end(input); else child.stdin.end();
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 255, out, err: e.message, down: true }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const c = timedOut ? 255 : code;
      resolve({ code: c, out, err: timedOut ? `timed out ${err}` : err, down: c === 255 });
    });
  });
}

// 실행기, 검사 목록, job.json 을 tar 로 묶는다 (이 맥의 숨은 ._ 파일 없이)
export function packJob(job, stageRoot) {
  const stage = fs.mkdtempSync(path.join(stageRoot, '.stage-'));
  try {
    fs.copyFileSync(RUNNER, path.join(stage, 'aihq-runner.mjs'));
    fs.copyFileSync(JOBSPEC, path.join(stage, 'jobspec.mjs'));
    fs.writeFileSync(path.join(stage, 'job.json'), JSON.stringify(job, null, 2));
    const r = spawnSync(TAR_BIN, ['-cf', '-', '-C', stage, 'aihq-runner.mjs', 'jobspec.mjs', 'job.json'], { env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`묶기 실패: ${String(r.stderr).slice(0, 200)}`);
    return r.stdout;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

export function parsePoll(out) {
  const [head, ...rest] = String(out).split('AIHQ_LOG\n');
  const logTail = rest.join('AIHQ_LOG\n');
  const lines = head.trim().split('\n');
  const tag = lines[0]?.trim() || '';
  let result = null;
  if (tag === 'AIHQ_DONE') { try { result = JSON.parse(lines.slice(1).join('\n')); } catch { result = null; } }
  return { tag, result, logTail };
}

// 실패 이유: 로그에서 Error 가 들어간 줄을 먼저, 없으면 마지막 줄
function errorLine(s) {
  const lines = String(s || '').split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean);
  return (lines.find((x) => /\berror\b|오류|에러|not found|no such/i.test(x)) || lines.slice(-1)[0] || '').slice(0, 300);
}

function lastLines(s, n = 2) {
  // ffmpeg 는 \r 로 줄을 덮어쓴다
  return String(s || '').split(/[\r\n]+/).map((x) => x.trim()).filter(Boolean).slice(-n).join(' / ').slice(0, 300);
}

const fmtBytes = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)}GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`);
const stampDir = (d = new Date()) => `${ymd(d).replace(/-/g, '')}-${d.toTimeString().slice(0, 8).replace(/:/g, '')}`;

// ───────── 배차기 ─────────
// helpers: { addMsg, sys, pushHistory, systemPrompt, remotePrompt, ownerName }
export function startDispatcher({ store, dataDir, helpers, log = console.log, intervalMs = 5000, extraTick = null }) {
  const hosts = new Map(); // resId → { ok, reason, at, fails, retryAt }
  const live = new Map(); // taskId → { log, polledAt, dead }
  let busy = false;

  const instance = () => store.data.settings.instanceId;
  const resOf = (id) => store.data.resources.find((r) => r.id === id);

  function hostDown(resId, why) {
    const h = hosts.get(resId) || { fails: 0 };
    h.fails = (h.fails || 0) + 1;
    const waitMin = Math.min(15, 2 ** (h.fails - 1));
    Object.assign(h, { ok: false, reason: why, at: Date.now(), retryAt: Date.now() + waitMin * 60000, waitMin });
    hosts.set(resId, h);
    return h;
  }
  function hostUp(resId) {
    hosts.set(resId, { ok: true, reason: '닿음', at: Date.now(), fails: 0, retryAt: 0 });
  }

  async function send(t, res, emp, job) {
    const d = store.data;
    const office = officeName(res);
    const label = `${office} · ${TEMPLATES[job.template].label}`;
    const prev = t.remote;
    await store.mutate((x) => {
      const tt = x.tasks.find((y) => y.id === t.id);
      if (tt) tt.remote = { state: 'sending', res: res.id, since: nowIso(), template: job.template, label, attempts: (prev?.attempts || 0) + 1 };
    });
    const spec = { taskId: t.id, template: job.template, params: job.params, createdAt: nowIso() };
    if (job.template === 'ai-text') Object.assign(spec, { model: emp.model || '', system: helpers.systemPrompt(emp, d.owner.name), prompt: helpers.remotePrompt(d, emp, t) });
    const localRoot = path.join(dataDir, 'jobs', t.id);
    fs.mkdirSync(localRoot, { recursive: true });
    let r;
    try {
      r = await ssh(res.sshAlias, launchScript(t.id, instance()), { input: packJob(spec, localRoot), timeoutMs: 60000 });
    } catch (e) {
      r = { code: 1, out: '', err: e.message };
    }
    const out = r.out || '';
    if (/AIHQ_STARTED|AIHQ_RUNNING/.test(out)) {
      hostUp(res.id);
      live.set(t.id, { log: '', polledAt: Date.now(), dead: 0 });
      await store.mutate((x) => {
        const tt = x.tasks.find((y) => y.id === t.id);
        if (!tt) return;
        tt.remote = { ...tt.remote, state: 'running', reason: '', startedAt: nowIso() };
        tt.status = '진행';
        tt.runStartedAt = tt.remote.startedAt;
        helpers.pushHistory(tt, emp.id, '진행', `${office}에서 실행`);
        helpers.sys(x, `task:${t.id}`, `${office}에서 실행 시작: ${emp.name} · ${TEMPLATES[job.template].label} (사무실 폴더 render-node/jobs/${t.id})`);
      });
      log(`[배차] ${t.id} → ${res.sshAlias} 시작`);
      return;
    }
    if (/AIHQ_EXISTS/.test(out)) {
      await block(t.id, `${office}에 같은 이름의 작업 폴더가 이미 있어요 (render-node/jobs/${t.id}). 본사가 만든 폴더가 아니라서 건드리지 않았어요.`);
      return;
    }
    const why = r.down ? sshWhy(r.err) : `보내기 실패 (코드 ${r.code}) ${String(r.err || out).trim().slice(0, 160)}`;
    const h = r.down ? hostDown(res.id, why) : { waitMin: 2, retryAt: Date.now() + 120000 };
    await store.mutate((x) => {
      const tt = x.tasks.find((y) => y.id === t.id);
      if (!tt) return;
      const first = !prev || prev.state !== 'retry';
      tt.remote = { state: 'retry', res: res.id, template: job.template, label, attempts: (prev?.attempts || 0) + 1, reason: `${office}에 ${r.down ? '닿지 않아요' : '보내지 못했어요'} · ${why}. ${h.waitMin}분 뒤 다시 보낼게요.`, retryAt: new Date(h.retryAt).toISOString() };
      tt.status = '대기';
      if (first) helpers.sys(x, `task:${t.id}`, `대기로 돌림: ${tt.remote.reason}`);
    });
    log(`[배차] ${t.id} → ${res.sshAlias} 실패: ${why}`);
  }

  async function block(taskId, reason) {
    await store.mutate((x) => {
      const tt = x.tasks.find((y) => y.id === taskId);
      if (!tt) return;
      const same = tt.remote?.state === 'blocked' && tt.remote.reason === reason;
      tt.remote = { state: 'blocked', res: tt.resource, reason };
      if (tt.status === '진행' && !tt.runStartedAt) tt.status = '대기';
      if (!same) helpers.sys(x, `task:${tt.id}`, `사무실로 보내지 않음: ${reason}`);
    });
  }

  // 가져오기: ssh 의 tar 를 이 맥의 tar 로 바로 푼다
  function fetchInto(alias, taskId, dir, withOut) {
    fs.mkdirSync(dir, { recursive: true });
    const untar = spawn(TAR_BIN, ['-xf', '-', '-C', dir], { stdio: ['pipe', 'ignore', 'pipe'] });
    const done = new Promise((resolve) => untar.on('close', (c) => resolve(c)));
    untar.stdin.on('error', () => {});
    return ssh(alias, fetchScript(taskId, withOut), { pipeTo: untar, timeoutMs: 30 * 60 * 1000 }).then(async (r) => ({ ...r, untar: await done }));
  }

  async function finalize(t, res, result, logTail) {
    const office = officeName(res);
    const dir = path.join(dataDir, 'jobs', t.id, stampDir());
    const total = (result.files || []).reduce((s, f) => s + (f.bytes || 0), 0);
    const withOut = total <= MAX_FETCH;
    const got = await fetchInto(res.sshAlias, t.id, dir, withOut);
    const fetched = got.code === 0 && got.untar === 0;
    if (fetched && withOut) await ssh(res.sshAlias, cleanScript(t.id, instance()), { timeoutMs: 20000 });
    const files = (result.files || []).map((f) => ({ ...f, path: withOut && fetched ? path.join(dir, 'out', f.name) : `${office}: render-node/jobs/${t.id}/out/${f.name}` }));
    const label = t.remote?.label || office;
    const ok = Boolean(result.ok);
    let body;
    if (result.text) body = result.text;
    else if (ok) body = `${TEMPLATES[t.remote?.template]?.label || '일'} 끝 (${office})\n${files.map((f) => `${f.name} · ${fmtBytes(f.bytes)}\n${f.path}`).join('\n') || '만든 파일 없음'}`;
    else body = `${office}에서 멈췄어요: ${result.reason || '이유 모름'}\n${errorLine(logTail) || '-'}`;
    const TOOL = { 'ffmpeg-test': 'ffmpeg', 'remotion-render': 'Remotion', 'blender-render': 'Blender' };
    const model = result.model || TOOL[t.remote?.template] || null;
    const secs = result.startedAt && result.endedAt ? Math.max(1, Math.round((Date.parse(result.endedAt) - Date.parse(result.startedAt)) / 1000)) : null;
    await store.mutate((x) => {
      const tt = x.tasks.find((y) => y.id === t.id);
      const empId = tt?.assignee && tt.assignee !== 'jay' ? tt.assignee : t.assignee;
      const thread = `task:${t.id}`;
      helpers.addMsg(x, { thread, from: empId, fromKind: 'ai', kind: 'result', text: String(body).slice(0, 20000), to: ['jay'], summary: String(body).split('\n')[0].slice(0, 240), run: { label, code: result.code ?? null, model } });
      helpers.addMsg(x, {
        thread, from: empId, fromKind: 'ai', kind: 'handoff', text: '인수인계 → 대표', to: ['jay'],
        handoff: {
          done: `${office}에서 ${TEMPLATES[t.remote?.template]?.label || '일'} ${ok ? '끝냄' : '시도'}${secs ? ` (${secs}초)` : ''}. 결과는 본사 ${fetched ? path.relative(path.dirname(dataDir), dir) : '로 못 가져옴'}`,
          stuck: ok ? '' : (result.reason || '이유 모름'),
          why: ok ? '' : errorLine(logTail),
          files: files.map((f) => f.path).slice(0, 50),
          to: 'jay',
          model,
        },
      });
      x.worklog.push({ emp: empId, start: tt?.runStartedAt || result.startedAt || nowIso(), end: nowIso(), label: `${t.title} (${office})` });
      if (x.worklog.length > 3000) x.worklog = x.worklog.slice(-3000);
      if (!tt) return;
      tt.remote = { state: ok ? 'done' : 'failed', res: res.id, template: tt.remote?.template, label, endedAt: nowIso(), reason: ok ? '' : (result.reason || ''), dir: fetched ? dir : null };
      tt.runStartedAt = null;
      tt.lastRunAt = nowIso();
      if (tt.status === '진행') {
        if (ok && Array.isArray(tt.steps) && tt.steps.length && helpers.onStepRunDone) {
          helpers.onStepRunDone(x, tt, empId, String(body).slice(0, 2000), `${office} 실행 끝`);
        } else {
          tt.status = ok ? '완료' : '막힘';
          helpers.pushHistory(tt, empId, tt.status, ok ? `${office} 실행 끝` : `${office} 실행 실패`);
          helpers.onTaskStatus?.(x, tt);
        }
      }
    });
    live.delete(t.id);
    log(`[배차] ${t.id} ${ok ? '끝' : '실패'} (${office})`);
  }

  async function backToWait(t, res, reason, minutes) {
    await ssh(res.sshAlias, cleanScript(t.id, instance()), { timeoutMs: 20000 });
    live.delete(t.id);
    await store.mutate((x) => {
      const tt = x.tasks.find((y) => y.id === t.id);
      if (!tt) return;
      tt.remote = { state: 'retry', res: res.id, template: tt.remote?.template, label: tt.remote?.label, attempts: tt.remote?.attempts || 1, reason: `${reason} ${minutes}분 뒤 다시 보낼게요.`, retryAt: new Date(Date.now() + minutes * 60000).toISOString() };
      if (tt.status === '진행') { tt.status = '대기'; tt.runStartedAt = null; helpers.pushHistory(tt, 'system', '대기', reason); }
      helpers.sys(x, `task:${tt.id}`, `대기로 돌림: ${tt.remote.reason}`);
    });
  }

  async function poll(t) {
    const res = resOf(t.remote.res);
    if (!isOffice(res)) return;
    const h = hosts.get(res.id);
    if (h && !h.ok && h.retryAt > Date.now()) return;
    const r = await ssh(res.sshAlias, pollScript(t.id), { timeoutMs: 20000 });
    if (r.down) { hostDown(res.id, sshWhy(r.err)); return; }
    hostUp(res.id);
    const p = parsePoll(r.out);
    const L = live.get(t.id) || { log: '', dead: 0 };
    L.log = lastLines(p.logTail, 2);
    L.polledAt = Date.now();
    live.set(t.id, L);
    if (p.tag === 'AIHQ_DONE' && p.result) {
      if (p.result.busy) return backToWait(t, res, `${officeName(res)}: ${p.result.reason}`, 2);
      await store.mutate((x) => { const tt = x.tasks.find((y) => y.id === t.id); if (tt?.remote) tt.remote.state = 'fetching'; });
      return finalize(t, res, p.result, p.logTail);
    }
    if (p.tag === 'AIHQ_ALIVE') {
      const spec = TEMPLATES[t.remote.template];
      const since = Date.parse(t.remote.startedAt || t.remote.since || 0);
      if (spec && since && Date.now() - since > (spec.timeoutMin + 15) * 60000 && !L.stopSent) {
        L.stopSent = true;
        await ssh(res.sshAlias, stopScript(t.id, instance()), { timeoutMs: 20000 });
      }
      return;
    }
    if (p.tag === 'AIHQ_GONE' && t.remote.state === 'sending') return backToWait(t, res, `${officeName(res)}에 일이 도착하지 않았어요.`, 1);
    // 실행기가 결과 없이 사라짐: 두 번 연속이면 멈춘 것으로 본다
    L.dead = (L.dead || 0) + 1;
    if (L.dead < 2) return;
    await finalize(t, res, { ok: false, reason: p.tag === 'AIHQ_GONE' ? '사무실 작업 폴더가 사라졌어요.' : '사무실 실행기가 결과 없이 멈췄어요.', files: [] }, p.logTail);
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const d = store.data;
      if (!d.settings.instanceId) return;
      for (const t of d.tasks.filter((x) => x.remote && ACTIVE.includes(x.remote.state))) {
        try { await poll(t); } catch (e) { log(`[배차] ${t.id} 확인 실패: ${e.message}`); }
      }
      const now = new Date();
      const list = [...store.data.tasks].sort((a, b) => (a.order || 0) - (b.order || 0));
      for (const t of list) {
        const c = dispatchCheck(store.data, t, now, hosts);
        if (c.go) {
          try { await send(t, c.res, c.emp, c.job); } catch (e) { log(`[배차] ${t.id} 보내기 실패: ${e.message}`); }
        } else if (c.block && t.remote?.reason !== c.why && t.officeRun) {
          await block(t.id, c.why);
        }
      }
      if (extraTick) await extraTick(hosts);
    } catch (e) {
      log(`[배차] ${e.message}`);
    } finally {
      busy = false;
    }
  }

  // 화면용: 사무실마다 한 줄
  function view() {
    const d = store.data;
    return d.resources.filter(isOffice).map((r) => {
      const t = d.tasks.find((x) => x.remote && ACTIVE.includes(x.remote.state) && x.remote.res === r.id);
      const h = hosts.get(r.id);
      const L = t ? live.get(t.id) : null;
      return {
        id: r.id, name: officeName(r), alias: r.sshAlias,
        state: t ? 'busy' : h && !h.ok ? 'down' : 'idle',
        taskId: t?.id || null, title: t?.title || null, emp: t?.assignee || null, label: t?.remote.label || null,
        since: t ? (t.remote.startedAt || t.remote.since) : null, log: L?.log || '',
        reason: h && !h.ok ? h.reason : '', retryAt: h && !h.ok && h.retryAt ? new Date(h.retryAt).toISOString() : null,
        checkedAt: h?.at ? new Date(h.at).toISOString() : null,
        templates: allowedTemplates(r),
      };
    });
  }

  const timer = setInterval(tick, intervalMs);
  setTimeout(tick, 1500);
  return { tick, view, hosts, stop: () => clearInterval(timer) };
}

// ~/.ssh/config 에서 이 기계에 맞는 별칭을 찾는다 (읽기만). 예: office-1.local → office-1, 10.0.0.5 → office-2
export function guessSshAlias(hostname, configText = null) {
  if (!hostname) return '';
  let text = configText;
  if (text === null) { try { text = fs.readFileSync(path.join(os.homedir(), '.ssh', 'config'), 'utf8'); } catch { return ''; } }
  const blocks = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = /^(\w+)\s+(.+)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'host') { cur = { names: m[2].split(/\s+/).filter((n) => !/[*?!]/.test(n)), hostName: '' }; blocks.push(cur); } else if (key === 'hostname' && cur) cur.hostName = m[2].trim();
  }
  const bare = hostname.replace(/\.local$/i, '').toLowerCase();
  const prefer = (names) => names.find((n) => /^office/i.test(n)) || names[0];
  for (const b of blocks) { const n = b.names.find((x) => x.toLowerCase() === hostname.toLowerCase() || x.toLowerCase() === bare); if (n) return validAlias(n) ? n : ''; }
  for (const b of blocks) if (b.hostName && b.hostName.toLowerCase() === hostname.toLowerCase() && b.names.length) { const n = prefer(b.names); return validAlias(n) ? n : ''; }
  return '';
}
