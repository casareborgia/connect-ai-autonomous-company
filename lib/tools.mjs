// 브라우저(Ego Lite, Aside 등)와 내가 설치한 오픈소스 도구/스킬 자동 감지 및 매칭.
// 읽기만 한다. 설정 파일이나 스킬을 임의로 고치거나 설치하지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBin } from './agents.mjs';

export const BROWSER_CATALOG = [
  { key: 'ego-lite', name: 'Ego Lite', hint: '로그인한 사이트를 AI와 함께 보기', bin: 'ego-browser', envVar: 'AIHQ_EGO_BIN', command: 'ego-browser nodejs', guide: 'ego-browser skill' },
  { key: 'aside', name: 'Aside', hint: 'AI가 따로 띄워서 웹 확인 · 자동화', bin: 'aside', envVar: 'AIHQ_ASIDE_BIN', command: 'aside', guide: 'aside' },
  { key: 'chrome', name: 'Chrome', hint: '평소 쓰는 웹 브라우저', bin: null, envVar: null, command: '', guide: '' },
];

// 자주 쓰는 오픈소스 도구/스킬의 쉬운 한국어 설명과 자동 매칭 키워드
export const OSS_CATALOG = [
  { key: 'reversebusiness', name: 'Reverse Business', hint: '경쟁사 사업·가격·수익 구조 분석', when: '사업 분석, 서비스 해부, 경쟁사, 가격 분석, 비즈니스, 리버스, 벤치마킹', skill: 'reversebusiness' },
  { key: 'reverse-engineer-anything', name: 'REA (구조 분석)', hint: '앱·웹·프로그램 내부 구조 분석', when: '역공학, 구조 분석, 앱 분석, 디컴파일, rea', skill: 'reverse-engineer-anything' },
  { key: 'blender', name: 'Blender', hint: '3D 모델·영상 만들기', when: '3d, 블렌더, blender, 렌더, 모델링, 애니메이션', bin: 'blender', command: 'blender' },
  { key: 'ffmpeg', name: 'ffmpeg', hint: '영상·소리 자르기, 합치기, 변환', when: '영상 변환, 자르기, 클립, ffmpeg, 인코딩, 소리 추출', bin: 'ffmpeg', command: 'ffmpeg' },
  { key: 'yt-dlp', name: 'yt-dlp', hint: '영상·자막 내려받기', when: '자막, 영상 다운, yt-dlp, 유튜브 다운', bin: 'yt-dlp', command: 'yt-dlp' },
  { key: 'whisper', name: 'Whisper', hint: '음성·영상을 글로 받아쓰기', when: '받아쓰기, 녹취, 음성 텍스트, whisper, 자막 생성', bin: 'whisper', command: 'whisper' },
];

// SKILL.md 앞쪽 frontmatter 에서 name 과 description 한 줄만 가볍게 읽는다
function readSkillMeta(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8').slice(0, 2000); } catch { return null; }
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!fm) return null;
  const pick = (k) => {
    const m = new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm[1]);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '').slice(0, 160) : '';
  };
  const name = pick('name');
  const description = pick('description');
  return name ? { name, description } : null;
}

const SKIP_SKILLS = new Set(['aihq-employee', 'ego-browser', 'swarm', 'swarm_monitor', 'hide', 'hide-issue', 'hide-mission']);

export function scanLocalSkills({ home = os.homedir(), cwd = process.cwd() } = {}) {
  const roots = [
    path.join(cwd, '.agents', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(home, '.claude', 'skills'),
    path.join(home, '.gemini', 'config', 'skills'),
  ];
  const seen = new Map();
  for (const dir of roots) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const skillFile = path.join(dir, ent.name, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      const meta = readSkillMeta(skillFile);
      const key = (meta?.name || ent.name).toLowerCase();
      if (SKIP_SKILLS.has(key) || seen.has(key)) continue;
      seen.set(key, { key, name: meta?.name || ent.name, description: meta?.description || '', skillPath: skillFile });
    }
  }
  return [...seen.values()];
}

export function detectBrowsers() {
  return BROWSER_CATALOG.map((b) => ({
    ...b,
    found: b.bin ? Boolean(findBin(b.bin, b.envVar)) : false,
  }));
}

export function detectOpenSource({ home = os.homedir(), cwd = process.cwd() } = {}) {
  const skills = scanLocalSkills({ home, cwd });
  const byKey = new Map(skills.map((s) => [s.key, s]));
  const out = [];
  const used = new Set();

  for (const c of OSS_CATALOG) {
    const sk = c.skill ? byKey.get(c.skill) : null;
    const hasBin = c.bin ? Boolean(findBin(c.bin, `AIHQ_${c.key.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_BIN`)) : false;
    const found = Boolean(sk || hasBin);
    used.add(c.key);
    out.push({
      key: c.key,
      name: c.name,
      hint: c.hint,
      when: c.when,
      command: c.command || '',
      skillPath: sk ? sk.skillPath : '',
      found,
    });
  }

  // 사용자가 직접 깔아 둔 그 밖의 오픈소스 스킬도 그대로 후보에 올린다
  for (const s of skills) {
    if (used.has(s.key)) continue;
    const shortDesc = s.description.split(/[.(]/)[0].trim().slice(0, 60) || '이 컴퓨터에 설치된 스킬';
    out.push({
      key: s.key,
      name: s.name,
      hint: shortDesc,
      when: `${s.name}, ${shortDesc}`,
      command: '',
      skillPath: s.skillPath,
      found: true,
    });
  }
  return out.slice(0, 20);
}

// 웹 확인·자동화·검색·로그인 사이트 작업인지 판단
export const WEB_WORDS = /(웹|사이트|페이지|브라우저|유튜브|스튜디오|스마트\s*스토어|쿠팡|인스타|블로그|네이버\s*클립|틱톡|tiktok|스레드|링크드인|카카오\s*채널|뉴스레터|브런치|검색|조사|리서치|확인|크롤링|\bqa\b|로그인|경쟁사|서비스\s*분석|홈페이지|쇼핑몰|댓글|답글|매출\s*확인|ego|에고|aside|어사이드|chrome|크롬)/i;

export function pickBrowser(text, resources, preferredId = null) {
  const browsers = (resources || []).filter((r) => r.kind === '브라우저' && r.status !== '꺼짐');
  if (!browsers.length) return null;
  const low = String(text || '').toLowerCase();
  // 할 일에 브라우저 이름이 직접 나오면 그 브라우저 우선
  const named = browsers.find((b) => {
    const n = String(b.name || '').toLowerCase();
    if (n && low.includes(n)) return true;
    if (b.preset === 'ego-lite' && /ego|에고/.test(low)) return true;
    if (b.preset === 'aside' && /aside|어사이드/.test(low)) return true;
    if (b.preset === 'chrome' && /chrome|크롬/.test(low)) return true;
    return false;
  });
  if (named) return named;
  // 연결 계정에 지정된 브라우저가 있으면 그 브라우저를 우선 사용
  if (preferredId) {
    const pref = browsers.find((b) => b.id === preferredId);
    if (pref) return pref;
  }
  if (!WEB_WORDS.test(low)) return null;
  return browsers.find((b) => b.isDefault) || browsers[0];
}

export function pickTools(text, resources, tokenize) {
  const oss = (resources || []).filter((r) => r.kind === '오픈소스' && r.status !== '꺼짐');
  if (!oss.length) return [];
  const low = String(text || '').toLowerCase();
  const tt = tokenize ? tokenize(low) : low.split(/\s+/).filter((w) => w.length >= 2);
  const scored = [];
  for (const r of oss) {
    let score = 0;
    const nm = String(r.name || '').toLowerCase();
    const preset = String(r.preset || '').toLowerCase();
    if (nm.length >= 2 && low.includes(nm)) score += 5;
    if (preset.length >= 2 && low.includes(preset)) score += 5;
    const phrases = String(r.when || '').toLowerCase().split(/[,·/|]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
    for (const p of phrases) {
      if (low.includes(p)) { score += 3; continue; }
      const pt = tokenize ? tokenize(p) : p.split(/\s+/).filter((w) => w.length >= 2);
      if (pt.length && pt.every((w) => tt.some((x) => x === w || (w.length >= 2 && x.includes(w))))) score += 2;
    }
    if (score > 0) scored.push({ r, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.r);
}
