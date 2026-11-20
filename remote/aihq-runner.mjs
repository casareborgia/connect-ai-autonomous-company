// 사무실(다른 맥)에서 도는 실행기. 본사가 ssh 로 이 파일과 jobspec.mjs, job.json 을 일 폴더에 넣고 한 번 실행한다.
//   node aihq-runner.mjs <일 폴더>
// 하는 일: job.json 을 다시 검사 → 사무실에 하나만 도는지 잠금 → 정해진 일만 실행 → out/ 과 result.json 을 남긴다.
// 셸을 거치지 않는다. sudo 를 쓰지 않는다. 할 일 제목이나 메모는 명령으로 쓰지 않는다 (글 일의 지시문으로만 쓴다).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TEMPLATES, validateJob, buildCommand, validModel } from './jobspec.mjs';

const jobDir = path.resolve(process.argv[2] || '.');
const home = os.homedir();
const LOCK = path.join(home, 'render-node', 'aihq.lock');
const GPU_LOCK = path.join(home, 'render-node', 'GPU_LOCK');
const OLLAMA = 'http://127.0.0.1:11434';
const PREFERRED = ['qwen3:8b', 'qwen3:4b', 'qwen3-vl:8b', 'qwen2.5:7b', 'gemma3:4b', 'llama3.1:8b'];
const started = new Date().toISOString();
const log = (s) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);

let held = [];
function release() {
  for (const p of held) { try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* 이미 없음 */ } }
  held = [];
}

function finish(result) {
  release();
  const files = [];
  const outDir = path.join(jobDir, 'out');
  try {
    for (const f of fs.readdirSync(outDir)) {
      const st = fs.statSync(path.join(outDir, f));
      if (st.isFile()) files.push({ name: f, bytes: st.size });
    }
  } catch { /* out 없음 */ }
  const body = { ...result, files, startedAt: started, endedAt: new Date().toISOString(), host: os.hostname() };
  fs.writeFileSync(path.join(jobDir, 'result.tmp'), JSON.stringify(body, null, 2));
  fs.renameSync(path.join(jobDir, 'result.tmp'), path.join(jobDir, 'result.json'));
  log(result.ok ? '끝' : `멈춤: ${result.reason || ''}`);
  process.exit(result.ok ? 0 : 1);
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// 사무실에 본사 일은 하나만. 잠금 폴더(mkdir 은 원자적)에 주인 pid 를 적는다. 주인이 이미 끝났으면 잠금을 치운다.
function takeLock() {
  for (let i = 0; i < 2; i++) {
    try {
      fs.mkdirSync(LOCK);
      fs.writeFileSync(path.join(LOCK, 'owner'), `${process.pid} ${jobDir}`);
      held.push(LOCK);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = Number(String(safeRead(path.join(LOCK, 'owner'))).split(' ')[0]);
      if (owner && pidAlive(owner)) return false;
      fs.rmSync(LOCK, { recursive: true, force: true });
    }
  }
  return false;
}

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

// GPU 를 쓰는 일 (Blender, Remotion) 은 GPU_LOCK 이 비어 있을 때만. 쓰는 동안 주인 이름을 적어 두고 끝나면 지운다.
function takeGpu(label) {
  try {
    fs.mkdirSync(path.dirname(GPU_LOCK), { recursive: true });
    fs.writeFileSync(GPU_LOCK, `aihq ${label} pid ${process.pid}\n`, { flag: 'wx' });
    held.push(GPU_LOCK);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

let activeChild = null;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { log(`신호 ${sig}`); if (activeChild) activeChild.kill('SIGTERM'); finish({ ok: false, code: null, reason: `중간에 멈춤 (${sig})` }); });

async function getJson(url, opts = {}, ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function pickModel(want) {
  const tags = await getJson(`${OLLAMA}/api/tags`);
  const names = (tags.models || []).filter((m) => !Array.isArray(m.capabilities) || m.capabilities.includes('completion')).map((m) => m.name).filter((n) => !/embed/i.test(n));
  if (want && names.includes(want)) return want;
  return PREFERRED.find((p) => names.includes(p)) || names[0] || null;
}

async function runAi(job, timeoutMs) {
  const want = String(job.model || '').replace(/^ollama:/, '');
  const model = await pickModel(validModel(want) ? want : '');
  if (!model) return { ok: false, reason: '사무실 Ollama 에 쓸 수 있는 모델이 없어요.' };
  log(`사무실 Ollama 모델: ${model}`);
  const messages = [{ role: 'system', content: String(job.system || '') }, { role: 'user', content: String(job.prompt || '') }];
  const res = await getJson(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: false, think: false, options: { temperature: 0.4 }, messages }) }, timeoutMs);
  let text = String(res.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  if (text.includes('</think>')) text = text.split('</think>').pop();
  text = text.trim().slice(0, 20000);
  if (!text) return { ok: false, reason: '모델이 빈 답을 냈어요.', model };
  fs.writeFileSync(path.join(jobDir, 'out', 'result.md'), `${text}\n`);
  return { ok: true, code: 0, text, model };
}

function runCmd(c, timeoutMs) {
  return new Promise((resolve) => {
    log(`실행: ${path.basename(c.cmd)} ${c.args.join(' ')}`);
    const env = { ...process.env, PATH: `${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || '/usr/bin:/bin'}` };
    const child = spawn(c.cmd, c.args, { cwd: c.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = child;
    fs.writeFileSync(path.join(jobDir, 'child.pid'), String(child.pid));
    const pipe = (s) => s.on('data', (b) => process.stdout.write(b));
    pipe(child.stdout);
    pipe(child.stderr);
    const timer = setTimeout(() => { log('시간 초과, 멈춤'); child.kill('SIGTERM'); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, code: null, reason: `실행 파일을 열 수 없어요: ${e.code || e.message}` }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      activeChild = null;
      resolve({ ok: code === 0, code, reason: code === 0 ? '' : signal ? `멈춤 (${signal})` : `종료 코드 ${code}` });
    });
  });
}

async function main() {
  fs.mkdirSync(path.join(jobDir, 'out'), { recursive: true });
  let job;
  try { job = JSON.parse(fs.readFileSync(path.join(jobDir, 'job.json'), 'utf8')); } catch { return finish({ ok: false, reason: 'job.json 을 읽을 수 없어요.' }); }
  const v = validateJob(job);
  if (v.error) return finish({ ok: false, reason: v.error });
  const spec = TEMPLATES[v.job.template];
  log(`일: ${spec.label} (${job.taskId || '?'})`);
  if (!takeLock()) return finish({ ok: false, busy: true, reason: '사무실에서 다른 본사 일이 도는 중이에요.' });
  const timeoutMs = spec.timeoutMin * 60 * 1000;
  try {
    if (v.job.template === 'ai-text') return finish(await runAi(job, timeoutMs));
    const c = buildCommand(v.job, { home, jobDir });
    if (c.gpu && !takeGpu(job.taskId || 'job')) return finish({ ok: false, busy: true, reason: 'GPU_LOCK 이 걸려 있어요 (다른 렌더 중).' });
    return finish(await runCmd(c, timeoutMs));
  } catch (e) {
    return finish({ ok: false, reason: String(e.message || e).slice(0, 300) });
  }
}

main();
