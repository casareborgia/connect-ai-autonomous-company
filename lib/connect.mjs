// 바이브코딩·AI 도구에 본사 출입증(MCP 서버)과 직원 수첩(스킬)을 안전하게 연결/해제한다.
// connectTargets()는 읽기 전용으로 탐지·계획만 만들고, 실제 파일 수정은 터미널 `connect-ai-hq connect` / `disconnect` 에서만 실행한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findBin } from './agents.mjs';

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MCP_SERVER = path.join(PKG_ROOT, 'mcp', 'server.mjs');
export const SKILL_DIR = path.join(PKG_ROOT, 'skills', 'aihq-employee');

// MCP 서버를 켜는 명령. npx 임시 폴더에서 돌면 다음에도 찾을 수 있게 npx 로, 아니면 이 폴더의 파일로.
export function mcpLaunch(root = PKG_ROOT) {
  if (/[\\/]_npx[\\/]/.test(root)) return { command: 'npx', args: ['-y', 'github:wonseokjung/connect-ai-autonomous-company', 'mcp'] };
  return { command: 'node', args: [path.join(root, 'mcp', 'server.mjs')] };
}

// 화면과 터미널에 보여 줄 때만 쓰는 따옴표 (실행할 때는 배열 그대로 쓴다)
export function shellLine(argv) {
  return argv.map((a) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(a) ? a : `'${String(a).replace(/'/g, `'\\''`)}'`)).join(' ');
}

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const exists = (f) => { try { fs.accessSync(f); return true; } catch { return false; } };

function mcpEntry(id, launch) {
  return { command: launch.command, args: launch.args, env: { HQ_EMPLOYEE: id } };
}
function opencodeMcpEntry(id, launch) {
  return { type: 'local', command: [launch.command, ...launch.args], environment: { HQ_EMPLOYEE: id }, enabled: true };
}
function jsonSnippet(id, launch, section = 'mcpServers', entry = null) {
  return JSON.stringify({ [section]: { aihq: entry || mcpEntry(id, launch) } }, null, 2);
}

export function claudeDesktopConfigPath(home = os.homedir(), platform = process.platform) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
}

// 직원 아이디: 그 도구로 만든 직원이 있으면 그 아이디, 없으면 기본값
function empIdFor(employees, test, fallback) {
  const e = (employees || []).find(test);
  return e ? e.id : fallback;
}
const hasEmp = (employees, id) => (employees || []).some((e) => e.id === id);

// 기존 JSON 설정을 깨뜨리지 않고 .bak 백업을 남긴 뒤 지정 섹션에 aihq 항목만 안전하게 합친다.
export function mergeJsonMcpFile(filePath, section, entryName, entryObj, { dryRun = false } = {}) {
  const existed = exists(filePath);
  let data = {};
  if (existed) {
    const raw = read(filePath).trim();
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        return { ok: false, reason: 'invalid_json', filePath };
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { ok: false, reason: 'invalid_json', filePath };
      }
    }
  }
  const prevSection = data[section] && typeof data[section] === 'object' && !Array.isArray(data[section]) ? data[section] : {};
  const next = { ...data, [section]: { ...prevSection, [entryName]: entryObj } };
  const backupPath = existed ? `${filePath}.bak` : null;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (existed && backupPath) fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  return { ok: true, filePath, backupPath, created: !existed, dryRun };
}

// JSON 설정에서 aihq 항목만 안전하게 제거한다 (.bak 백업 생성, 다른 MCP 서버 100% 보존).
export function removeJsonMcpFile(filePath, section, entryName, { dryRun = false } = {}) {
  if (!exists(filePath)) return { ok: true, removed: false, filePath };
  const raw = read(filePath).trim();
  if (!raw) return { ok: true, removed: false, filePath };
  let data;
  try { data = JSON.parse(raw); } catch { return { ok: false, reason: 'invalid_json', filePath }; }
  if (!data || typeof data !== 'object' || !data[section] || !(entryName in data[section])) {
    return { ok: true, removed: false, filePath };
  }
  const backupPath = `${filePath}.bak`;
  const nextSection = { ...data[section] };
  delete nextSection[entryName];
  const next = { ...data, [section]: nextSection };
  if (!dryRun) {
    fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  return { ok: true, removed: true, filePath, backupPath, dryRun };
}

// 이 컴퓨터에서 찾은 9종 바이브코딩·AI 도구마다: 찾았는지, 이미 들어 있는지, 자동 연결 계획(cli 또는 jsonMerge + skill)
export function connectTargets({ employees = [], home = os.homedir(), root = PKG_ROOT, platform = process.platform, findBinFn = findBin } = {}) {
  const launch = mcpLaunch(root);
  const skillFrom = path.join(root, 'skills', 'aihq-employee');
  const out = [];

  // 1) Claude Code
  const claudeId = empIdFor(employees, (e) => e.engine === 'claude' || e.catalog === 'claudecode', 'claudecode');
  const claudeBin = findBinFn('claude', 'AIHQ_CLAUDE_BIN');
  const claudeSkill = path.join(home, '.claude', 'skills', 'aihq-employee');
  out.push({
    key: 'claude', name: 'Claude Code', kind: 'cli',
    found: Boolean(claudeBin),
    employee: claudeId,
    mcp: {
      configured: /"aihq"\s*:/.test(read(path.join(home, '.claude.json'))),
      cli: ['claude', 'mcp', 'add', '-s', 'user', 'aihq', '-e', `HQ_EMPLOYEE=${claudeId}`, '--', launch.command, ...launch.args],
      removeCli: ['claude', 'mcp', 'remove', '-s', 'user', 'aihq'],
    },
    skill: { installed: exists(path.join(claudeSkill, 'SKILL.md')), from: skillFrom, to: claudeSkill },
  });

  // 2) Codex
  const codexId = empIdFor(employees, (e) => e.engine === 'codex' || e.catalog === 'codex', 'codex');
  const codexBin = findBinFn('codex', 'AIHQ_CODEX_BIN');
  const codexSkill = path.join(home, '.codex', 'skills', 'aihq-employee');
  out.push({
    key: 'codex', name: 'Codex', kind: 'cli',
    found: Boolean(codexBin),
    employee: codexId,
    mcp: {
      configured: /^\s*\[mcp_servers\.aihq\]/m.test(read(path.join(home, '.codex', 'config.toml'))),
      cli: ['codex', 'mcp', 'add', 'aihq', '--env', `HQ_EMPLOYEE=${codexId}`, '--', launch.command, ...launch.args],
      removeCli: ['codex', 'mcp', 'remove', 'aihq'],
    },
    skill: { installed: exists(path.join(codexSkill, 'SKILL.md')), from: skillFrom, to: codexSkill },
  });

  // 3) Antigravity (agy)
  const agyId = empIdFor(employees, (e) => e.engine === 'agy' || e.catalog === 'antigravity' || /antigravity|\bagy\b/i.test(e.name), 'antigravity');
  const agyBin = findBinFn('agy', 'AIHQ_AGY_BIN');
  const agyDir = path.join(home, '.gemini', 'antigravity');
  const agyMcpFile = path.join(agyDir, 'mcp_config.json');
  const agySkill = path.join(home, '.gemini', 'config', 'skills', 'aihq-employee');
  const agyConfigured = /"aihq"\s*:/.test(read(agyMcpFile)) || /"aihq"\s*:/.test(read(path.join(home, '.gemini', 'config', 'mcp.json')));
  out.push({
    key: 'antigravity', name: 'Antigravity (agy)', kind: 'cli',
    found: Boolean(agyBin || exists(agyDir)),
    employee: agyId,
    mcp: agyBin
      ? {
          configured: agyConfigured,
          cli: ['agy', 'mcp', 'add', '--env', `HQ_EMPLOYEE=${agyId}`, 'aihq', '--', launch.command, ...launch.args],
          removeCli: ['agy', 'mcp', 'remove', 'aihq'],
          file: '~/.gemini/antigravity/mcp_config.json',
          snippet: jsonSnippet(agyId, launch),
          jsonMerge: { filePath: agyMcpFile, section: 'mcpServers', entryName: 'aihq', entry: mcpEntry(agyId, launch) },
        }
      : {
          configured: agyConfigured,
          file: '~/.gemini/antigravity/mcp_config.json',
          snippet: jsonSnippet(agyId, launch),
          jsonMerge: { filePath: agyMcpFile, section: 'mcpServers', entryName: 'aihq', entry: mcpEntry(agyId, launch) },
        },
    skill: { installed: exists(path.join(agySkill, 'SKILL.md')), from: skillFrom, to: agySkill },
  });

  // 4) Gemini CLI
  const geminiId = empIdFor(employees, (e) => e.engine === 'gemini' || e.catalog === 'geminicli' || e.catalog === 'gemini' || /gemini|제미나이/i.test(e.name), 'gemini');
  const geminiBin = findBinFn('gemini', 'AIHQ_GEMINI_BIN');
  const geminiSettings = path.join(home, '.gemini', 'settings.json');
  out.push({
    key: 'gemini', name: 'Gemini CLI', kind: 'cli',
    found: Boolean(geminiBin),
    employee: geminiId,
    mcp: {
      configured: /"aihq"\s*:/.test(read(geminiSettings)),
      file: '~/.gemini/settings.json',
      snippet: jsonSnippet(geminiId, launch),
      jsonMerge: { filePath: geminiSettings, section: 'mcpServers', entryName: 'aihq', entry: mcpEntry(geminiId, launch) },
    },
    skill: null,
  });

  // 5) OpenCode
  const ocId = empIdFor(employees, (e) => e.engine === 'opencode' || e.catalog === 'opencode' || /opencode/i.test(e.name), 'opencode');
  const ocBin = findBinFn('opencode', 'AIHQ_OPENCODE_BIN');
  const ocDir = path.join(home, '.config', 'opencode');
  const ocFile = path.join(ocDir, 'opencode.json');
  const ocSkill = path.join(ocDir, 'skills', 'aihq-employee');
  const ocEntry = opencodeMcpEntry(ocId, launch);
  out.push({
    key: 'opencode', name: 'OpenCode', kind: 'cli',
    found: Boolean(ocBin || exists(ocDir)),
    employee: ocId,
    mcp: {
      configured: /"aihq"\s*:/.test(read(ocFile)),
      file: '~/.config/opencode/opencode.json',
      snippet: jsonSnippet(ocId, launch, 'mcp', ocEntry),
      jsonMerge: { filePath: ocFile, section: 'mcp', entryName: 'aihq', entry: ocEntry },
    },
    skill: { installed: exists(path.join(ocSkill, 'SKILL.md')), from: skillFrom, to: ocSkill },
  });

  // 6) Cursor
  const cursorId = empIdFor(employees, (e) => e.catalog === 'cursor' || /cursor|커서/i.test(e.name), 'cursor');
  const cursorBin = findBinFn('cursor', 'AIHQ_CURSOR_BIN');
  const cursorDir = path.join(home, '.cursor');
  const cursorFile = path.join(cursorDir, 'mcp.json');
  const cursorSkill = path.join(cursorDir, 'skills', 'aihq-employee');
  out.push({
    key: 'cursor', name: 'Cursor', kind: 'ide',
    found: Boolean(cursorBin || exists(cursorDir)),
    employee: cursorId,
    mcp: {
      configured: /"aihq"\s*:/.test(read(cursorFile)),
      file: '~/.cursor/mcp.json',
      snippet: jsonSnippet(cursorId, launch),
      jsonMerge: { filePath: cursorFile, section: 'mcpServers', entryName: 'aihq', entry: mcpEntry(cursorId, launch) },
    },
    skill: { installed: exists(path.join(cursorSkill, 'SKILL.md')), from: skillFrom, to: cursorSkill },
  });

  // 7) Windsurf
  const wsId = empIdFor(employees, (e) => /windsurf/i.test(e.name), 'windsurf');
  const wsBin = findBinFn('windsurf', 'AIHQ_WINDSURF_BIN');
  const wsDir = path.join(home, '.codeium', 'windsurf');
  const wsFile = path.join(wsDir, 'mcp_config.json');
  out.push({
    key: 'windsurf', name: 'Windsurf', kind: 'ide',
    found: Boolean(wsBin || exists(wsDir)),
    employee: wsId,
    mcp: {
      configured: /"aihq"\s*:/.test(read(wsFile)),
      file: '~/.codeium/windsurf/mcp_config.json',
      snippet: jsonSnippet(wsId, launch),
      jsonMerge: { filePath: wsFile, section: 'mcpServers', entryName: 'aihq', entry: mcpEntry(wsId, launch) },
    },
    skill: null,
  });

  // 8) Claude Desktop
  const cdId = empIdFor(employees, (e) => e.catalog === 'claude' || (e.engine === 'claude' || /claude|클로드/i.test(e.name)), 'claude');
  const cdFile = claudeDesktopConfigPath(home, platform);
  out.push({
    key: 'claudedesktop', name: 'Claude Desktop', kind: 'app',
    found: exists(path.dirname(cdFile)),
    employee: cdId,
    mcp: {
      configured: /"aihq"\s*:/.test(read(cdFile)),
      file: platform === 'darwin' ? '~/Library/Application Support/Claude/claude_desktop_config.json' : cdFile,
      snippet: jsonSnippet(cdId, launch),
      jsonMerge: { filePath: cdFile, section: 'mcpServers', entryName: 'aihq', entry: mcpEntry(cdId, launch) },
    },
    skill: null,
  });

  // 9) LM Studio
  const lmId = empIdFor(employees, (e) => e.catalog === 'lmstudio' || /^lmstudio:/.test(e.model || ''), 'lmstudio');
  const lmFile = path.join(home, '.lmstudio', 'mcp.json');
  out.push({
    key: 'lmstudio', name: 'LM Studio', kind: 'local',
    found: exists(path.join(home, '.lmstudio')),
    employee: lmId,
    mcp: {
      configured: /"aihq"\s*:/.test(read(lmFile)),
      file: '~/.lmstudio/mcp.json',
      snippet: jsonSnippet(lmId, launch),
      jsonMerge: { filePath: lmFile, section: 'mcpServers', entryName: 'aihq', entry: mcpEntry(lmId, launch) },
    },
    skill: null,
  });

  for (const t of out) {
    t.hired = hasEmp(employees, t.employee);
    if (t.mcp.cli) t.mcp.line = shellLine(t.mcp.cli);
    if (t.skill) t.skill.line = shellLine(['mkdir', '-p', path.dirname(t.skill.to)]) + ' && ' + shellLine(['cp', '-R', t.skill.from, t.skill.to]);
  }
  return out;
}

// 대상 AI 도구 1개에 MCP 출입증 + 직원 수첩(스킬)을 안전하게 설치한다.
export function installTarget(t, { dryRun = false, spawnFn = spawnSync } = {}) {
  const res = { key: t.key, name: t.name, mcp: 'skip', skill: 'skip', backupPath: null, error: null };
  if (!t.mcp.configured) {
    if (t.mcp.cli) {
      if (dryRun) {
        res.mcp = 'dry-run-cli';
      } else {
        const r = spawnFn(t.mcp.cli[0], t.mcp.cli.slice(1), { stdio: 'pipe', encoding: 'utf8' });
        if (r && r.status === 0) {
          res.mcp = 'installed-cli';
        } else if (t.mcp.jsonMerge) {
          const m = mergeJsonMcpFile(t.mcp.jsonMerge.filePath, t.mcp.jsonMerge.section, t.mcp.jsonMerge.entryName, t.mcp.jsonMerge.entry, { dryRun });
          res.mcp = m.ok ? 'installed-json' : 'failed';
          res.backupPath = m.backupPath || null;
          if (!m.ok) res.error = m.reason;
        } else {
          res.mcp = 'failed';
          res.error = (r?.stderr || r?.error?.message || 'CLI 실행 실패').trim();
        }
      }
    } else if (t.mcp.jsonMerge) {
      const m = mergeJsonMcpFile(t.mcp.jsonMerge.filePath, t.mcp.jsonMerge.section, t.mcp.jsonMerge.entryName, t.mcp.jsonMerge.entry, { dryRun });
      res.mcp = m.ok ? (dryRun ? 'dry-run-json' : 'installed-json') : 'failed';
      res.backupPath = m.backupPath || null;
      if (!m.ok) res.error = m.reason;
    }
  } else {
    res.mcp = 'already';
  }

  if (t.skill) {
    if (t.skill.installed) {
      res.skill = 'already';
    } else if (dryRun) {
      res.skill = 'dry-run';
    } else {
      fs.mkdirSync(path.dirname(t.skill.to), { recursive: true });
      fs.cpSync(t.skill.from, t.skill.to, { recursive: true });
      res.skill = 'installed';
    }
  }
  return res;
}

// 공용 에이전트 스킬 폴더(~/.agents/skills/aihq-employee) 설치/제거
export function installSharedSkill({ home = os.homedir(), root = PKG_ROOT, dryRun = false } = {}) {
  const from = path.join(root, 'skills', 'aihq-employee');
  const to = path.join(home, '.agents', 'skills', 'aihq-employee');
  if (exists(path.join(to, 'SKILL.md'))) return { status: 'already', to };
  if (dryRun) return { status: 'dry-run', to };
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  return { status: 'installed', to };
}

export function uninstallSharedSkill({ home = os.homedir(), dryRun = false } = {}) {
  const to = path.join(home, '.agents', 'skills', 'aihq-employee');
  if (!exists(to)) return { status: 'none', to };
  if (dryRun) return { status: 'dry-run', to };
  fs.rmSync(to, { recursive: true, force: true });
  return { status: 'removed', to };
}

// 대상 AI 도구 1개에서 aihq MCP 항목과 스킬 폴더만 깔끔히 제거한다.
export function uninstallTarget(t, { dryRun = false, spawnFn = spawnSync } = {}) {
  const res = { key: t.key, name: t.name, mcp: 'none', skill: 'none', backupPath: null, error: null };
  if (t.mcp.configured) {
    if (t.mcp.removeCli && !t.mcp.jsonMerge) {
      if (dryRun) res.mcp = 'dry-run-cli';
      else {
        const r = spawnFn(t.mcp.removeCli[0], t.mcp.removeCli.slice(1), { stdio: 'pipe', encoding: 'utf8' });
        res.mcp = r && r.status === 0 ? 'removed-cli' : 'failed';
        if (res.mcp === 'failed') res.error = (r?.stderr || r?.error?.message || 'CLI 제거 실패').trim();
      }
    } else if (t.mcp.jsonMerge) {
      if (t.mcp.removeCli && !dryRun) {
        try { spawnFn(t.mcp.removeCli[0], t.mcp.removeCli.slice(1), { stdio: 'pipe', encoding: 'utf8' }); } catch { /* 폴백 */ }
      }
      const m = removeJsonMcpFile(t.mcp.jsonMerge.filePath, t.mcp.jsonMerge.section, t.mcp.jsonMerge.entryName, { dryRun });
      res.mcp = m.ok ? (m.removed ? (dryRun ? 'dry-run-json' : 'removed-json') : 'removed-cli') : 'failed';
      res.backupPath = m.backupPath || null;
      if (!m.ok) res.error = m.reason;
    }
  }
  if (t.skill && exists(t.skill.to)) {
    if (dryRun) res.skill = 'dry-run';
    else {
      fs.rmSync(t.skill.to, { recursive: true, force: true });
      res.skill = 'removed';
    }
  }
  return res;
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
