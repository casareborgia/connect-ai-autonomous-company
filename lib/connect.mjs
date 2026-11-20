// AI 도구에 본사 출입증(MCP 서버)과 직원 수첩(스킬)을 넣는 방법. 여기서는 찾고 명령을 만들기만 한다.
// 실제로 넣는 일은 대표가 터미널에서 `connect-ai-hq connect` 를 열고 도구마다 "예" 를 눌렀을 때만 한다 (기본은 보여 주기).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBin } from './agents.mjs';

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MCP_SERVER = path.join(PKG_ROOT, 'mcp', 'server.mjs');
export const SKILL_DIR = path.join(PKG_ROOT, 'skills', 'aihq-employee');

// MCP 서버를 켜는 명령. npx 임시 폴더에서 돌면 다음에도 찾을 수 있게 npx 로, 아니면 이 폴더의 파일로.
export function mcpLaunch(root = PKG_ROOT) {
  if (/[\\/]_npx[\\/]/.test(root)) return { command: 'npx', args: ['-y', 'connect-ai-hq', 'mcp'] };
  return { command: 'node', args: [path.join(root, 'mcp', 'server.mjs')] };
}

// 화면과 터미널에 보여 줄 때만 쓰는 따옴표 (실행할 때는 배열 그대로 쓴다)
export function shellLine(argv) {
  return argv.map((a) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(a) ? a : `'${String(a).replace(/'/g, `'\\''`)}'`)).join(' ');
}

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };

function jsonSnippet(id, launch) {
  return JSON.stringify({ mcpServers: { aihq: { command: launch.command, args: launch.args, env: { HQ_EMPLOYEE: id } } } }, null, 2);
}

// 직원 아이디: 그 도구로 만든 직원이 있으면 그 아이디, 없으면 기본값
function empIdFor(employees, test, fallback) {
  const e = (employees || []).find(test);
  return e ? e.id : fallback;
}
const hasEmp = (employees, id) => (employees || []).some((e) => e.id === id);

// 이 컴퓨터에서 찾은 AI 도구마다: 찾았는지, 이미 들어 있는지, 넣는 명령 (cli = 터미널에서 실행 가능한 배열, file = 직접 붙여 넣을 설정)
export function connectTargets({ employees = [], home = os.homedir(), root = PKG_ROOT } = {}) {
  const launch = mcpLaunch(root);
  const skillFrom = path.join(root, 'skills', 'aihq-employee');
  const out = [];

  const claudeId = empIdFor(employees, (e) => e.engine === 'claude' || e.catalog === 'claudecode', 'claudecode');
  const claudeSkill = path.join(home, '.claude', 'skills', 'aihq-employee');
  out.push({
    key: 'claude', name: 'Claude Code', found: Boolean(findBin('claude', 'AIHQ_CLAUDE_BIN')), employee: claudeId,
    mcp: { configured: /"aihq"\s*:/.test(read(path.join(home, '.claude.json'))), cli: ['claude', 'mcp', 'add', '-s', 'user', 'aihq', '-e', `HQ_EMPLOYEE=${claudeId}`, '--', launch.command, ...launch.args] },
    skill: { installed: exists(path.join(claudeSkill, 'SKILL.md')), from: skillFrom, to: claudeSkill },
  });

  const codexId = empIdFor(employees, (e) => e.engine === 'codex' || e.catalog === 'codex', 'codex');
  out.push({
    key: 'codex', name: 'Codex', found: Boolean(findBin('codex', 'AIHQ_CODEX_BIN')), employee: codexId,
    mcp: { configured: /^\s*\[mcp_servers\.aihq\]/m.test(read(path.join(home, '.codex', 'config.toml'))), cli: ['codex', 'mcp', 'add', 'aihq', '--env', `HQ_EMPLOYEE=${codexId}`, '--', launch.command, ...launch.args] },
    skill: null,
  });

  const geminiId = empIdFor(employees, (e) => e.catalog === 'gemini' || /gemini|제미나이/i.test(e.name), 'gemini');
  const geminiSettings = path.join(home, '.gemini', 'settings.json');
  out.push({
    key: 'gemini', name: 'Gemini CLI', found: Boolean(findBin('gemini', 'AIHQ_GEMINI_BIN')), employee: geminiId,
    mcp: { configured: /"aihq"\s*:/.test(read(geminiSettings)), file: '~/.gemini/settings.json', snippet: jsonSnippet(geminiId, launch) },
    skill: null,
  });

  const lmId = empIdFor(employees, (e) => e.catalog === 'lmstudio' || /^lmstudio:/.test(e.model || ''), 'lmstudio');
  const lmFile = path.join(home, '.lmstudio', 'mcp.json');
  out.push({
    key: 'lmstudio', name: 'LM Studio', found: exists(path.join(home, '.lmstudio')), employee: lmId,
    mcp: { configured: /"aihq"\s*:/.test(read(lmFile)), file: '~/.lmstudio/mcp.json', snippet: jsonSnippet(lmId, launch) },
    skill: null,
  });

  for (const t of out) {
    t.hired = hasEmp(employees, t.employee); // 이 도구로 만든 직원이 본사에 있는가 (없으면 화면에서는 빼고 보여 줌)
    if (t.mcp.cli) t.mcp.line = shellLine(t.mcp.cli);
  }
  if (out[0].skill) out[0].skill.line = shellLine(['mkdir', '-p', path.dirname(claudeSkill)]) + ' && ' + shellLine(['cp', '-R', skillFrom, claudeSkill]);
  return out;
}

// ~/.ssh/config 에서 일할 컴퓨터 후보 (별칭만, 주소는 넘기지 않음). 코드 저장소 호스트는 뺀다.
export function sshHosts(configText = null) {
  let text = configText;
  if (text === null) text = read(path.join(os.homedir(), '.ssh', 'config'));
  const blocks = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const m = /^\s*(\w+)\s+(.+?)\s*$/.exec(raw);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'host') { cur = { names: m[2].split(/\s+/).filter((n) => n && !/[*?!]/.test(n)), hostName: '' }; blocks.push(cur); } else if (key === 'hostname' && cur) cur.hostName = m[2];
  }
  const repo = /(github|gitlab|bitbucket|codeberg|azure|heroku|aws|amazonaws)/i;
  const out = [];
  for (const b of blocks) {
    if (!b.names.length || b.names.some((n) => repo.test(n)) || repo.test(b.hostName)) continue;
    const alias = b.names.find((n) => /^office/i.test(n)) || b.names[0];
    if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(alias) && !out.includes(alias)) out.push(alias);
  }
  return out.slice(0, 12);
}
