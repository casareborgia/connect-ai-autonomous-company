// AI 직원이 사내 메신저에서 실제로 답하게 하는 부분.
// 1) 로컬 모델 직원: Ollama 또는 LM Studio 로 바로 답한다 (업무 매뉴얼 = 시스템 프롬프트).
// 2) Claude Code, Codex 직원: 대표가 화면에서 "일 시키기"를 누를 때만 한 번 headless 로 실행한다.
//    자동 실행 없음, 권한 건너뛰기 플래그 없음, 직원별로 대표가 켠 경우만.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const OLLAMA = process.env.AIHQ_OLLAMA_URL || 'http://127.0.0.1:11434';
const LMSTUDIO = process.env.AIHQ_LMSTUDIO_URL || 'http://127.0.0.1:1234';

async function postJson(url, body, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, ms = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 설정 화면에서 고를 수 있는 로컬 모델 목록
export async function listLocalModels() {
  const out = [];
  try {
    const t = await getJson(`${OLLAMA}/api/tags`);
    for (const m of t.models || []) {
      const caps = m.capabilities;
      if (Array.isArray(caps) && !caps.includes('completion')) continue;
      out.push({ id: `ollama:${m.name}`, label: `Ollama · ${m.name}`, size: m.details?.parameter_size || '' });
    }
  } catch { /* Ollama 꺼짐 */ }
  try {
    const t = await getJson(`${LMSTUDIO}/v1/models`);
    for (const m of t.data || []) if (!/embed/i.test(m.id)) out.push({ id: `lmstudio:${m.id}`, label: `LM Studio · ${m.id}`, size: '' });
  } catch { /* LM Studio 꺼짐 */ }
  return out;
}

export function systemPrompt(emp, ownerName) {
  const displayName = emp.avatarName && emp.avatarName !== emp.name ? `${emp.avatarName} (${emp.name})` : emp.name;
  return [
    `너는 "${displayName}" 이다. ${ownerName} 대표의 AI 회사에서 일하는 AI 직원이다.`,
    emp.persona ? `캐릭터 소개: ${emp.persona}` : '',
    emp.role ? `역할: ${emp.role}` : '',
    emp.tools?.length ? `도구: ${emp.tools.join(', ')}` : '',
    '대표에게 한국어로 짧고 정확하게 답한다. 생각 과정은 쓰지 말고 답만 쓴다. 모르는 것은 모른다고 말한다. 숫자, 가격, 할인, 사실을 지어내지 않는다.',
    '결제, 업로드, 게시, 메시지 발송, 삭제는 직접 하지 않고 결재함에 요청해야 한다고 말한다.',
    emp.manual ? `\n업무 매뉴얼:\n${emp.manual}` : '',
  ].filter(Boolean).join('\n');
}

// 로컬 모델 답장. model 은 "ollama:이름" 또는 "lmstudio:이름"
export async function localReply(emp, ownerName, history) {
  if (!emp.model) throw new Error('로컬 모델을 아직 고르지 않았습니다. AI 직원 화면에서 모델을 골라 주세요.');
  const [kind, ...rest] = emp.model.split(':');
  const model = rest.join(':');
  const messages = [{ role: 'system', content: systemPrompt(emp, ownerName) }, ...history];
  let content;
  if (kind === 'ollama') {
    const res = await postJson(`${OLLAMA}/api/chat`, { model, stream: false, think: false, options: { temperature: 0.4 }, messages }, 120000);
    content = res.message?.content;
  } else if (kind === 'lmstudio') {
    const res = await postJson(`${LMSTUDIO}/v1/chat/completions`, { model, temperature: 0.4, messages }, 120000);
    content = res.choices?.[0]?.message?.content;
  } else {
    throw new Error('알 수 없는 모델 종류입니다.');
  }
  // 생각 과정이 섞여 나오는 모델(qwen3 등)은 마지막 </think> 뒤만 쓴다
  let clean = String(content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  if (clean.includes('</think>')) clean = clean.split('</think>').pop();
  clean = clean.trim();
  if (!clean) throw new Error('모델이 빈 답을 냈습니다.');
  return clean.slice(0, 4000);
}

// ───────── Claude Code / Codex 한 번 실행 ─────────

// 환경변수가 있으면 그 경로만 쓴다. 빈 값이면 "없음" (시험에서 진짜 CLI 를 막을 때).
const binCache = new Map();
export function findBin(name, envVar) {
  if (envVar in process.env) return process.env[envVar] || null;
  const hit = binCache.get(name);
  if (hit && Date.now() - hit.at < 30000) return hit.path;
  const home = os.homedir();
  const win = process.platform === 'win32';
  const exts = win ? ['.exe', '.cmd', '.bat', ''] : [''];
  const dirs = win ? [] : [
    path.join(home, '.local/bin'),
    path.join(home, '.opencode/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) if (dir) dirs.push(dir);
  const mode = win ? fs.constants.F_OK : fs.constants.X_OK;
  let found = null;
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = path.join(dir, `${name}${ext}`);
      try { fs.accessSync(p, mode); found = p; break; } catch { /* 다음 */ }
    }
    if (found) break;
  }
  binCache.set(name, { path: found, at: Date.now() });
  return found;
}

// Claude Code headless 실행 시 안전하게 허용하는 최소 도구 범위 (임의 셸·삭제·결제 우회 금지)
const CLAUDE_HEADLESS_ALLOWED_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'WebSearch',
  'WebFetch',
  'Bash(ego-browser:*)',
  'Bash(ego-browser *)',
  'Bash(node *bin/hq.mjs *)',
].join(',');

const EFFORTS = new Set(['low', 'medium', 'high']);
function cleanCliModel(v) {
  const s = String(v || '').trim();
  if (!s || s.startsWith('-') || s.length > 120) return '';
  return /^[A-Za-z0-9_.:/@#\-]+$/.test(s) ? s : '';
}
function cleanEffort(v) {
  const s = String(v || '').trim().toLowerCase();
  return EFFORTS.has(s) ? s : '';
}

export function runnerInfo(engine, { model = '', effort = '' } = {}) {
  const m = cleanCliModel(model);
  const ef = cleanEffort(effort);
  if (engine === 'claude') {
    return {
      bin: findBin('claude', 'AIHQ_CLAUDE_BIN'),
      args: (prompt) => [
        '--allowedTools', CLAUDE_HEADLESS_ALLOWED_TOOLS,
        ...(m ? ['--model', m] : []),
        ...(ef ? ['--effort', ef] : []),
        '-p', prompt,
      ],
      label: `claude -p${m ? ` (${m})` : ''}`,
    };
  }
  if (engine === 'codex') {
    return {
      bin: findBin('codex', 'AIHQ_CODEX_BIN'),
      args: (prompt) => [
        'exec', '--skip-git-repo-check',
        ...(m ? ['-m', m] : []),
        ...(ef ? ['-c', `model_reasoning_effort=${ef}`] : []),
        prompt,
      ],
      label: `codex exec${m ? ` (${m})` : ''}`,
    };
  }
  if (engine === 'gemini') {
    return {
      bin: findBin('gemini', 'AIHQ_GEMINI_BIN'),
      args: (prompt) => [...(m ? ['--model', m] : []), '-p', prompt],
      label: `gemini -p${m ? ` (${m})` : ''}`,
    };
  }
  if (engine === 'agy') {
    let tpl = null;
    try { tpl = JSON.parse(process.env.AIHQ_AGY_ARGS || 'null'); } catch { tpl = null; }
    const customOk = Array.isArray(tpl) && tpl.every((x) => typeof x === 'string') && tpl.includes('{prompt}');
    const args = customOk
      ? (prompt) => tpl.map((x) => (x === '{prompt}' ? prompt : x))
      : (prompt) => [...(m ? ['--model', m] : []), '-p', prompt];
    return { bin: findBin('agy', 'AIHQ_AGY_BIN'), args, label: customOk ? 'agy' : `agy -p${m ? ` (${m})` : ''}` };
  }
  if (engine === 'opencode') {
    return {
      bin: findBin('opencode', 'AIHQ_OPENCODE_BIN'),
      args: (prompt) => ['run', ...(m ? ['--model', m] : []), prompt],
      label: `opencode run${m ? ` (${m})` : ''}`,
    };
  }
  return null;
}

export const ENGINE_NAME = { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', agy: 'Antigravity (agy)', opencode: 'OpenCode' };
export function notInstalled(engine) {
  return `이 맥에서 ${ENGINE_NAME[engine] || engine} 실행 파일을 찾지 못했어요. 설치되어 있지 않다면 할 일에서 복사해서 맡기기로 같은 일을 시킬 수 있어요.`;
}

// 스레드 기록을 지시가 아닌 인용 데이터로 감싼다
export function quoteThread(lines) {
  if (!lines.length) return '(아직 대화 없음)';
  const body = lines.map((l) => l.split('\n').map((x) => `> ${x}`).join('\n')).join('\n>\n');
  return `<thread_data>\n${body.replace(/<\/?thread_data>/g, '')}\n</thread_data>`;
}

// 권한을 건너뛰는 플래그는 절대 붙이지 않는다. 인자는 위 두 가지뿐.
// 먹통 감시(hangMs): 일정 시간 동안 stdout/stderr 출력이 전혀 없으면 프로세스를 안전하게 종료한다.
export function runOnce({ engine, workspace, prompt, model = '', effort = '', env = {}, timeoutMs = 15 * 60 * 1000, hangMs = 3 * 60 * 1000, onProgress = null }) {
  const info = runnerInfo(engine, { model, effort });
  if (!info) return Promise.reject(new Error('Claude Code, Codex, Gemini CLI, Antigravity(agy), OpenCode 직원만 headless 로 실행할 수 있습니다.'));
  if (info.missing) return Promise.reject(new Error(info.missing));
  if (!info.bin) return Promise.reject(new Error(notInstalled(engine)));
  fs.mkdirSync(workspace, { recursive: true });
  return new Promise((resolve, reject) => {
    const usePg = process.platform !== 'win32';
    const child = spawn(info.bin, info.args(prompt), {
      cwd: workspace,
      detached: usePg,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env, AIHQ_WORKSPACE: workspace },
    });
    let out = '';
    let err = '';
    let hung = false;
    let timedOut = false;
    let hangTimer = null;
    let killTimer = null;

    const killTree = (sig) => {
      if (usePg && child.pid) {
        try { process.kill(-child.pid, sig); return; } catch { /* 폴백 */ }
      }
      try { child.kill(sig); } catch { /* ignore */ }
    };
    const terminate = () => {
      killTree('SIGTERM');
      killTimer = setTimeout(() => { killTree('SIGKILL'); }, 1500);
    };
    const armHang = () => {
      if (hangTimer) clearTimeout(hangTimer);
      if (hangMs > 0) {
        hangTimer = setTimeout(() => {
          hung = true;
          terminate();
        }, hangMs);
      }
    };
    const reportChunk = (str) => {
      armHang();
      if (!onProgress) return;
      const lines = str.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length >= 2);
      if (lines.length) onProgress(lines[lines.length - 1].slice(0, 80));
    };

    armHang();
    const cap = (s, chunk) => (s.length > 200000 ? s : s + chunk);
    child.stdout.on('data', (c) => { const s = c.toString('utf8'); out = cap(out, s); reportChunk(s); });
    child.stderr.on('data', (c) => { const s = c.toString('utf8'); err = cap(err, s); reportChunk(s); });
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      if (hangTimer) clearTimeout(hangTimer);
      if (killTimer) clearTimeout(killTimer);
    };
    child.on('error', (e) => { cleanup(); reject(e); });
    child.on('close', (code, signal) => {
      cleanup();
      resolve({ code, signal, hung, timedOut, hangSec: Math.round(hangMs / 1000), out: out.trim(), err: err.trim(), label: info.label, pid: child.pid });
    });
  });
}
