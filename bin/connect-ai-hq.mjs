#!/usr/bin/env node
// CONNECT AI HQ · 한 줄로 켜기
//   npx connect-ai-hq            본사를 켜고 브라우저를 연다 (데이터: ~/.connect-ai-hq)
//   npx connect-ai-hq connect    이 컴퓨터의 AI 도구에 본사 출입증(MCP)과 직원 수첩(스킬)을 넣는다 (도구마다 먼저 묻는다)
//   npx connect-ai-hq mcp        MCP 서버 (AI 도구 설정에서 부르는 명령)
//   npx connect-ai-hq task ...   AI 직원용 보고 명령 (hq 와 같음, help 로 전체 보기)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME_DIR = path.join(os.homedir(), '.connect-ai-hq');
const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'start';

function flag(name) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const HELP = `CONNECT AI HQ · AI Autonomous Company · 나의 AI 자율 회사 본사

  npx connect-ai-hq                 본사를 켜고 브라우저를 엽니다
      --port <번호>                 기본 8790
      --no-open                     브라우저를 열지 않음
  npx connect-ai-hq connect         AI 도구에 MCP 와 스킬 넣기 (도구마다 먼저 물어봄, 기본은 보여 주기만)
  npx connect-ai-hq mcp             MCP 서버 (HQ_EMPLOYEE=<직원 아이디>)
  npx connect-ai-hq <hq 명령>        AI 직원용 보고 명령. 예: task list --mine codex (전체: npx connect-ai-hq hq help)

데이터 폴더: ${HOME_DIR} (AIHQ_DATA_DIR 로 바꿀 수 있음)
`;

function openBrowser(url) {
  const [bin, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try {
    const child = spawn(bin, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch { /* 브라우저를 못 열면 주소만 보여 준다 */ }
}

async function isHq(base) {
  try {
    const res = await fetch(base, { signal: AbortSignal.timeout(1500) });
    return { up: true, hq: /<title>CONNECT AI HQ/.test(await res.text()) };
  } catch {
    return { up: false, hq: false };
  }
}

async function start() {
  const port = Number(flag('port') || process.env.AIHQ_PORT || 8790);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('포트 번호가 맞지 않아요.'); process.exit(1); }
  const url = `http://127.0.0.1:${port}`;
  const open = flag('no-open') === undefined && process.env.AIHQ_NO_OPEN !== '1';
  const now = await isHq(url);
  if (now.hq) {
    console.log(`이미 켜져 있어요: ${url}`);
    if (open) openBrowser(url);
    return;
  }
  if (now.up) { console.error(`${port}번 포트를 다른 프로그램이 쓰고 있어요. --port 8791 처럼 다른 번호로 켜 주세요.`); process.exit(1); }

  process.env.AIHQ_PORT = String(port);
  process.env.AIHQ_DATA_DIR = process.env.AIHQ_DATA_DIR || path.join(HOME_DIR, 'data');
  process.env.AIHQ_WORKSPACES = process.env.AIHQ_WORKSPACES || path.join(HOME_DIR, 'workspaces');
  fs.mkdirSync(process.env.AIHQ_DATA_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(process.env.AIHQ_WORKSPACES, { recursive: true });

  console.log('\nCONNECT AI HQ · AI Autonomous Company · 나의 AI 자율 회사 본사');
  console.log(`데이터: ${process.env.AIHQ_DATA_DIR} (이 컴퓨터 안에만 저장)`);
  await import(pathToFileURL(path.join(ROOT, 'server.mjs')).href);
  for (let i = 0; i < 40; i++) {
    if ((await isHq(url)).hq) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`AI 도구 연결: npx connect-ai-hq connect · 끄기: Ctrl+C\n`);
  if (open) openBrowser(url);
}

// 이 컴퓨터의 AI 도구에 MCP 와 스킬 넣기. 도구마다 먼저 묻고, 기본 답은 "아니요" (명령만 보여 줌).
async function connect() {
  const { connectTargets } = await import('../lib/connect.mjs');
  const base = (process.env.AIHQ_URL || `http://127.0.0.1:${flag('port') || process.env.AIHQ_PORT || 8790}`).replace(/\/$/, '');
  let employees = [];
  try {
    const res = await fetch(`${base}/api/agent/employees`, { headers: { 'X-HQ-Agent': '1', 'User-Agent': 'aihq-cli/1' }, signal: AbortSignal.timeout(1500) });
    if (res.ok) employees = await res.json();
  } catch { /* 본사가 꺼져 있으면 기본 직원 아이디로 */ }
  const targets = connectTargets({ employees }).filter((t) => t.found && (!employees.length || t.hired));
  console.log('\nCONNECT AI HQ · AI 도구 연결');
  if (!targets.length) { console.log('이 컴퓨터에서 연결할 AI 도구를 찾지 못했어요. 웹에서 쓰는 AI 는 할 일에서 지시문을 복사해서 맡기면 돼요.\n'); return; }
  const tty = process.stdin.isTTY && process.stdout.isTTY;
  const rl = tty ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  const ask = async (q) => (rl ? /^(y|yes|예|네|응)$/i.test((await rl.question(`${q} (y/N) `)).trim()) : false);
  try {
    for (const t of targets) {
      console.log(`\n· ${t.name} (직원 아이디 ${t.employee})`);
      if (t.mcp.configured) console.log('  출입증(MCP): 이미 들어 있어요');
      else if (t.mcp.cli) {
        console.log(`  출입증(MCP) 명령:\n    ${t.mcp.line}`);
        if (await ask('  지금 넣을까요?')) {
          const r = spawnSync(t.mcp.cli[0], t.mcp.cli.slice(1), { stdio: 'inherit' });
          console.log(r.status === 0 ? '  넣었어요' : '  넣지 못했어요. 위 명령을 직접 실행해 주세요.');
        }
      } else {
        console.log(`  출입증(MCP): ${t.mcp.file} 의 mcpServers 에 아래를 합쳐 주세요 (파일은 직접 고쳐 주세요)\n${t.mcp.snippet.replace(/^/gm, '    ')}`);
      }
      if (t.skill) {
        if (t.skill.installed) console.log('  직원 수첩(스킬): 이미 들어 있어요');
        else {
          console.log(`  직원 수첩(스킬) 명령:\n    ${t.skill.line}`);
          if (await ask('  지금 넣을까요?')) {
            fs.mkdirSync(path.dirname(t.skill.to), { recursive: true });
            fs.cpSync(t.skill.from, t.skill.to, { recursive: true });
            console.log('  넣었어요');
          }
        }
      }
    }
  } finally {
    rl?.close();
  }
  console.log(tty ? '\n끝. 본사 화면은 그대로 쓰면 돼요.\n' : '\n(대화형 터미널이 아니라서 명령만 보여 줬어요.)\n');
}

async function main() {
  if (cmd === 'help' || cmd === '--help' || flag('help') === true || flag('h') === true) { console.log(HELP); return; }
  if (cmd === 'start') return start();
  if (cmd === 'connect') return connect();
  if (cmd === 'mcp') { await import(pathToFileURL(path.join(ROOT, 'mcp', 'server.mjs')).href); return; }
  // 나머지는 AI 직원용 보고 명령 (hq) 으로 넘긴다
  let rest = cmd === 'hq' ? argv.slice(1) : argv;
  const pi = rest.indexOf('--port');
  if (pi >= 0) {
    if (!process.env.AIHQ_URL && /^\d{1,5}$/.test(rest[pi + 1] || '')) process.env.AIHQ_URL = `http://127.0.0.1:${rest[pi + 1]}`;
    rest = [...rest.slice(0, pi), ...rest.slice(pi + 2)];
  }
  process.argv = [process.argv[0], path.join(ROOT, 'bin', 'hq.mjs'), ...rest];
  await import(pathToFileURL(path.join(ROOT, 'bin', 'hq.mjs')).href);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
