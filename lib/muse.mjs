// Muse 읽기 (본사 쪽). 기본 꺼짐. 켜면 정해진 간격(기본 30분)마다 읽기 스크립트를 ego lite 에 넣어
// 대표가 로그인해 둔 ego lite 에서 새 메시지만 가져와 "대화 가져오기" 와 같은 모양 (가져옴 표시) 으로 스레드에 남긴다.
// 어디서 읽을지는 settings.muse.host 하나로 정한다: local = 이 맥(본사)의 ego lite, office = 사무실 맥의 ego lite (ssh).
// 가져온 글은 본사 data 폴더에만 남는다. 클라우드 AI 로 보내지 않는다. Muse 로는 아무것도 보내지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { ssh, sshWhy, isOffice, officeName } from './office.mjs';
import { tokens } from './assign.mjs';
import { nowIso, ymd } from './util.mjs';

const READER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'remote', 'muse-reader.js');
export const MUSE_HOSTS = ['local', 'office'];
export const MUSE_DEFAULTS = { enabled: false, host: 'local', everyMin: 30, url: 'https://muse.ai/', res: null, status: 'off', statusText: '', lastRunAt: null, lastOkAt: null, lastCount: 0, seen: {} };

export function readerScript(input) {
  const src = fs.readFileSync(READER, 'utf8');
  return src.replace('const INPUT = __AIHQ_INPUT__;', () => `const INPUT = ${JSON.stringify({ url: String(input.url), maxConversations: input.maxConversations || 8, maxMessages: input.maxMessages || 40 })};`);
}

export function parseReader(stdout) {
  const line = String(stdout || '').split('\n').reverse().find((l) => l.startsWith('AIHQ_JSON '));
  if (!line) return null;
  try { return JSON.parse(line.slice('AIHQ_JSON '.length)); } catch { return null; }
}

export const msgKey = (convKey, m) => crypto.createHash('sha1').update(`${convKey}|${m.id || ''}|${m.role}|${m.at || ''}|${m.text}`).digest('hex').slice(0, 12);

// Muse 를 맡을 직원 (없으면 만든다: 웹 앱 연결)
export function museEmployee(d, make) {
  return d.employees.find((e) => e.catalog === 'muse' || /^muse\b/i.test(e.name) || e.id === 'muse') || make(d);
}

// 대화 제목과 겹치는 말이 있는, 끝나지 않은 Muse 할 일. 없으면 "Muse 대화" 받은 편지함 할 일.
export function targetTask(d, emp, title, makeInbox) {
  const tt = tokens(title).filter((w) => w.length >= 2);
  const open = d.tasks.filter((t) => t.assignee === emp.id && t.status !== '완료' && !t.museInbox);
  const hit = tt.length ? open.find((t) => { const k = tokens(t.title); return tt.some((w) => k.includes(w)); }) : null;
  return hit || d.tasks.find((t) => t.museInbox) || makeInbox(d, emp);
}

// 새 메시지만 골라 스레드에 남긴다. 처음 보는 대화는 마지막 20개만.
export function importResult(d, out, { emp, addMsg, makeInbox, summarize }) {
  const m = d.settings.muse;
  m.seen = m.seen || {};
  let count = 0;
  for (const c of out.conversations || []) {
    const ck = crypto.createHash('sha1').update(String(c.key || c.title)).digest('hex').slice(0, 12);
    const seen = new Set(m.seen[ck] || []);
    const first = !m.seen[ck];
    let fresh = (c.messages || []).filter((x) => x && x.text).map((x) => ({ ...x, k: msgKey(ck, x) })).filter((x) => !seen.has(x.k));
    if (first) fresh = fresh.slice(-20);
    if (!fresh.length) { m.seen[ck] = [...seen].slice(-300); continue; }
    const t = targetTask(d, emp, c.title || '', makeInbox);
    const who = (x) => (x.role === 'user' ? `${d.owner.name || '나'}` : x.role === 'muse' ? emp.name : '?');
    const text = [`Muse 대화 "${String(c.title || 'Muse').slice(0, 120)}" · 새 메시지 ${fresh.length}개`, '',
      ...fresh.map((x) => `${x.at ? `[${x.at}] ` : ''}${who(x)}: ${x.text}`)].join('\n').slice(0, 20000);
    const link = /^https:\/\/\S+$/i.test(String(c.url || '')) ? c.url : null;
    addMsg(d, { thread: `task:${t.id}`, from: emp.id, fromKind: 'ai', kind: 'imported', imported: true, via: 'muse-reader', text, link, summary: summarize(fresh.map((x) => x.text).join('\n')) });
    if (t.museInbox) { t.date = ymd(); if (t.status === '완료') t.status = '대기'; }
    m.seen[ck] = [...seen, ...fresh.map((x) => x.k)].slice(-300);
    count += fresh.length;
  }
  return count;
}

// place: "이 맥" 또는 사무실 이름
export function statusText(kind, place, host) {
  const how = host === 'office' ? `화면 공유로 ${place}에 들어가` : `${place}에서`;
  return {
    login_required: `대표 로그인 필요 · ${how} ego lite 로 Muse 에 한 번 로그인해 주세요`,
    nobrowser: `${place}에서 ego lite 를 열 수 없어요 · ${how} ego lite 를 켜 두세요`,
    noego: `${place}에 ego lite 명령(ego-browser)이 없어요`,
    nothing_found: 'Muse 화면에서 대화를 찾지 못했어요',
  }[kind];
}

const EGO_PATH = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].filter(Boolean).join(path.delimiter);

// 이 맥에서 ego-browser 를 찾는다 (없으면 null)
export function localEgo(envPath = EGO_PATH) {
  const win = process.platform === 'win32';
  const mode = win ? fs.constants.F_OK : fs.constants.X_OK;
  const names = win ? ['ego-browser.exe', 'ego-browser.cmd', 'ego-browser'] : ['ego-browser'];
  for (const dir of envPath.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const f = path.join(dir, name);
      try { fs.accessSync(f, mode); return f; } catch { /* 다음 */ }
    }
  }
  return null;
}

// 이 맥의 ego lite 에서 읽기 스크립트를 한 번 실행한다. 셸을 거치지 않는다.
export function runLocal(bin, input, { timeoutMs = 4 * 60 * 1000, maxOut = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PATH: EGO_PATH } });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { if (out.length < maxOut) out += c.toString('utf8'); });
    child.stderr.on('data', (c) => { if (err.length < 20000) err += c.toString('utf8'); });
    child.stdin.on('error', () => { /* 먼저 닫힘 */ });
    child.stdin.end(input);
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 127, out, err: String(e.message) }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

// 한 번 읽기. 결과 상태를 settings.muse 에 적는다.
export async function runMuseOnce(store, { addMsg, makeEmployee, makeInbox, summarize, log = console.log, findEgo = localEgo, runEgo = runLocal }) {
  const d0 = store.data;
  const cfg = d0.settings.muse;
  const setStatus = (status, statusText, extra = {}) => store.mutate((d) => { Object.assign(d.settings.muse, { status, statusText, lastRunAt: nowIso(), ...extra }); });
  const script = readerScript({ url: cfg.url || MUSE_DEFAULTS.url });
  const host = cfg.host === 'office' ? 'office' : 'local';
  let r;
  let place;
  if (host === 'office') {
    const res = d0.resources.find((x) => x.id === cfg.res);
    if (!isOffice(res)) return setStatus('error', '읽을 사무실이 없어요 (내 리소스에서 ssh 별칭을 넣어 주세요)');
    place = officeName(res);
    const cmd = 'export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; command -v ego-browser >/dev/null 2>&1 || { echo AIHQ_NO_EGO; exit 0; }; ego-browser nodejs';
    r = await ssh(res.sshAlias, cmd, { input: script, timeoutMs: 4 * 60 * 1000 });
    if (r.down) return setStatus('down', `${place}에 닿지 않아요 · ${sshWhy(r.err)}`);
  } else {
    place = '이 맥';
    const bin = findEgo();
    if (!bin) return setStatus('noego', statusText('noego', place, host));
    r = await runEgo(bin, script);
  }
  if (/AIHQ_NO_EGO/.test(r.out)) return setStatus('noego', statusText('noego', place, host));
  const out = parseReader(r.out);
  if (!out) {
    const nob = /failed to start ego|launch ego lite|not running|connect/i.test(`${r.out}\n${r.err}`);
    log(`[Muse] 읽기 실패 (코드 ${r.code})`);
    return setStatus(nob ? 'nobrowser' : 'error', nob ? statusText('nobrowser', place, host) : `읽기 실패 (코드 ${r.code})`);
  }
  if (out.status === 'login_required') return setStatus('login', statusText('login_required', place, host));
  if (out.status === 'error') return setStatus('error', `읽기 오류 · ${String(out.error || '').slice(0, 160)}`);
  if (out.status === 'nothing_found') return setStatus('empty', statusText('nothing_found', place, host));
  let n = 0;
  await store.mutate((d) => {
    const emp = museEmployee(d, makeEmployee);
    n = importResult(d, out, { emp, addMsg, makeInbox, summarize });
    Object.assign(d.settings.muse, { status: 'ok', statusText: n ? `새 메시지 ${n}개 가져옴` : '새 메시지 없음', lastRunAt: nowIso(), lastOkAt: nowIso(), lastCount: n });
  });
  log(`[Muse] 새 메시지 ${n}개 (${place})`);
  return n;
}
