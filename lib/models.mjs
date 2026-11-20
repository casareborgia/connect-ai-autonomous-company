// 직원마다 "지금 어떤 모델로 일하는지" 읽기 (읽기만).
// 설정 파일에서 모델 이름 줄만 꺼낸다. 다른 값이나 토큰은 읽어서 보관하지 않는다.
//   Claude Code: ~/.claude/settings.json 의 "model"
//   Codex: ~/.codex/config.toml 맨 위의 model, model_reasoning_effort
//   agy (Gemini): ~/.gemini/antigravity/antigravity_state.pbtxt 의 last_selected_agent_model 줄 (이름이 아니면 확인 필요)
//   로컬 모델: 직원에 고른 Ollama 모델, 사무실 기계면 그 사무실 Ollama 에서 실제로 쓸 모델 (ssh)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
export const UNKNOWN = '확인 필요';
const NAME = /^[A-Za-z0-9][\w.:/\[\]() -]{0,80}$/;
const PREFERRED = ['qwen3:8b', 'qwen3:4b', 'qwen3-vl:8b', 'qwen2.5:7b', 'gemma3:4b', 'llama3.1:8b'];

const clean = (s) => { const v = String(s || '').trim(); return NAME.test(v) ? v : null; };
function readFile(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

export function claudeModel(text = readFile(path.join(HOME, '.claude', 'settings.json'))) {
  if (text === null) return null;
  try { return clean(JSON.parse(text)?.model) || 'Claude Code 기본값'; } catch { return null; }
}

// 맨 위 (첫 [구역] 앞) 의 model 과 model_reasoning_effort 줄만 본다
export function codexModel(text = readFile(path.join(HOME, '.codex', 'config.toml'))) {
  if (text === null) return null;
  const top = text.split(/^\s*\[/m)[0];
  const pick = (k) => clean(new RegExp(`^\\s*${k}\\s*=\\s*"([^"\\n]*)"`, 'm').exec(top)?.[1]);
  const model = pick('model');
  if (!model) return 'Codex 기본값';
  const effort = pick('model_reasoning_effort');
  return effort ? `${model} (${effort})` : model;
}

export function agyModel(text = readFile(path.join(HOME, '.gemini', 'antigravity', 'antigravity_state.pbtxt'))) {
  if (text === null) return UNKNOWN;
  const v = clean(/^\s*last_selected_agent_model:\s*"?([^"\n]+)"?/m.exec(text)?.[1]);
  return v && !/placeholder|unspecified/i.test(v) ? v : UNKNOWN;
}

// 사무실 실행기와 같은 방식으로 모델을 고른다
export function pickFrom(names, want) {
  const list = (names || []).filter((n) => !/embed/i.test(n));
  if (want && list.includes(want)) return want;
  return PREFERRED.find((p) => list.includes(p)) || list[0] || null;
}

// 이 직원이 지금 쓰는 모델. officeModels: { resId: [모델 이름…] } (사무실 Ollama 목록, 못 읽었으면 없음)
export function modelFor(emp, { resources = [], officeModels = {}, files = {} } = {}) {
  const g = (k, fn) => (k in files ? fn(files[k]) : fn());
  if (emp.engine === 'claude') return { name: g('claude', claudeModel), source: 'Claude Code 설정' };
  if (emp.engine === 'codex') return { name: g('codex', codexModel), source: 'Codex 설정' };
  if (emp.engine === 'agy' || emp.catalog === 'gemini' || /gemini/i.test(emp.name)) return { name: g('agy', agyModel), source: 'agy 설정' };
  if (emp.engine === 'local') {
    const want = String(emp.model || '').replace(/^(ollama|lmstudio):/, '');
    const office = resources.find((r) => (emp.resources || []).includes(r.id) && r.kind === '기계' && !r.isThisMac && r.sshAlias && officeModels[r.id]);
    if (office) return { name: pickFrom(officeModels[office.id], want) || UNKNOWN, source: `${String(office.name).replace(/\s*\(.*\)\s*$/, '')} Ollama` };
    return { name: want || UNKNOWN, source: '이 맥 로컬 모델' };
  }
  return null; // 웹 앱 AI (Muse, 피클 등) 는 앱이 알 수 없다
}

// 읽은 모델을 직원에 기록. 바뀌었으면 이력에 한 줄. 바뀐 직원 수를 돌려준다.
export function recordModels(d, detected, at = new Date().toISOString()) {
  let changed = 0;
  for (const e of d.employees) {
    const m = detected[e.id];
    if (!m || !m.name) continue;
    const prev = e.modelNow?.name || null;
    if (prev === m.name) { e.modelNow.checkedAt = at; continue; }
    if (prev && prev !== UNKNOWN && m.name !== UNKNOWN) {
      e.modelHistory = [...(e.modelHistory || []), { from: prev, to: m.name, at }].slice(-20);
    }
    // 잠깐 못 읽은 것 (확인 필요) 으로 아는 이름을 덮지 않는다
    if (prev && prev !== UNKNOWN && m.name === UNKNOWN) continue;
    e.modelNow = { name: m.name, source: m.source, at, checkedAt: at };
    changed++;
  }
  return changed;
}
