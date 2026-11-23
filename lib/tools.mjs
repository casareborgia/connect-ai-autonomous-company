// 브라우저(Ego Lite, Aside 등)와 내가 설치한 오픈소스 도구/스킬 자동 감지 및 매칭.
// 읽기만 한다. 설정 파일이나 스킬을 임의로 고치거나 설치하지 않는다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findBin } from './agents.mjs';

export const BROWSER_CATALOG = [
  { key: 'ego-lite', name: 'Ego Lite', hint: '로그인한 사이트를 AI와 함께 보기 · 스페이스 지원', bin: 'ego-browser', appPath: '/Applications/Ego Lite.app', envVar: 'AIHQ_EGO_BIN', command: 'ego-browser nodejs', guide: 'ego-browser skill' },
  { key: 'aside', name: 'Aside', hint: 'AI가 따로 띄워 웹 확인 · 자동화', bin: 'aside', appPath: '/Applications/Aside.app', envVar: 'AIHQ_ASIDE_BIN', command: 'aside', guide: 'aside' },
  { key: 'chrome', name: 'Chrome', hint: '평소 쓰는 크롬 · Chrome DevTools MCP 연동', bin: 'google-chrome', appPath: '/Applications/Google Chrome.app', envVar: null, command: '', guide: 'Chrome DevTools MCP 또는 브라우저 창' },
  { key: 'dia', name: 'Dia', hint: 'AI 내장 브라우저 · 웹 리서치', bin: null, appPath: '/Applications/Dia.app', envVar: null, command: '', guide: 'Dia 브라우저 창' },
  { key: 'comet', name: 'Comet', hint: 'Perplexity AI 브라우저 · 검색·자동화', bin: null, appPath: '/Applications/Comet.app', envVar: null, command: '', guide: 'Comet 브라우저 창' },
  { key: 'arc', name: 'Arc', hint: '스페이스 기반 웹 브라우저', bin: null, appPath: '/Applications/Arc.app', envVar: null, command: '', guide: 'Arc 브라우저 스페이스' },
  { key: 'safari', name: 'Safari', hint: 'macOS 기본 웹 브라우저', bin: null, appPath: '/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app', altAppPath: '/Applications/Safari.app', envVar: null, command: '', guide: 'Safari 창' },
];

export const PHONE_MODES = [
  { key: 'iphone-mirror', name: '아이폰 미러링 (Computer Use)', short: '아이폰 미러링', hint: '맥의 iPhone Mirroring 창을 Computer Use로 조작' },
  { key: 'android-adb', name: '안드로이드 (adb · scrcpy)', short: '안드로이드', hint: 'USB·와이파이 연결된 안드로이드를 adb/scrcpy로 조작' },
  { key: 'mobile-ai', name: '모바일 AI (피클 등)', short: '모바일 AI', hint: '이동 중 스마트폰 전용 AI 직원에게 전달' },
];

// 자주 쓰는 오픈소스 도구/스킬의 쉬운 한국어 설명, GitHub 주소, npx/CLI 명령, 자동 매칭 키워드
export const OSS_CATALOG = [
  { key: 'remotion', name: 'Remotion', team: 'design', hint: 'React 코드로 모션그래픽·쇼츠 영상 자동 생성', when: '리모션, remotion, 모션그래픽, 모션 그래픽, 영상편집, 영상 편집, 코드 영상, 쇼츠, 인트로, 영상 렌더링', command: 'npx remotion', repo: 'https://github.com/remotion-dev/remotion' },
  { key: 'hyperframes', name: 'Hyperframes', team: 'design', hint: 'HTML/코드 기반 모션그래픽·자막 영상 제작', when: '모션그래픽, 모션 그래픽, 하이퍼프레임, hyperframes, 인트로, 자막 모션, 영상 템플릿, 영상편집', command: 'npx hyperframes', repo: 'https://github.com/heygen-com/hyperframes' },
  { key: 'ffmpeg', name: 'ffmpeg', team: 'design', hint: '영상·소리 자르기, 합치기, 인코딩 변환', when: '영상편집, 영상 편집, 영상 변환, 자르기, 클립, ffmpeg, 인코딩, 소리 추출, 컷편집', bin: 'ffmpeg', command: 'ffmpeg', repo: 'https://github.com/FFmpeg/FFmpeg' },
  { key: 'blender', name: 'Blender', team: 'design', hint: '3D 모델·모션·영상 렌더링', when: '3d, 블렌더, blender, 렌더, 모델링, 애니메이션', bin: 'blender', command: 'blender', repo: 'https://github.com/blender/blender' },
  { key: 'yt-dlp', name: 'yt-dlp', team: 'marketing', hint: '유튜브·SNS 영상 및 자막 내려받기', when: '자막, 영상 다운, yt-dlp, 유튜브 다운, 벤치마크 영상', bin: 'yt-dlp', command: 'yt-dlp', repo: 'https://github.com/yt-dlp/yt-dlp' },
  { key: 'whisper', name: 'Whisper', team: 'plan', hint: '음성·영상을 텍스트·자막(SRT)으로 받아쓰기', when: '받아쓰기, 녹취, 음성 텍스트, whisper, 자막 생성, 대본 추출', bin: 'whisper', command: 'whisper', repo: 'https://github.com/openai/whisper' },
  { key: 'orca-computer', name: 'Orca Computer Use', team: 'ops', hint: '로컬 맥 앱 · 아이폰 미러링 창 접근성 트리 조작', when: '컴퓨터 유즈, 화면 조작, 아이폰 미러링, 데스크탑 앱, orca computer', bin: 'orca', command: 'orca computer', repo: 'https://github.com/stablyai/orca' },
  { key: 'playwright', name: 'Playwright', team: 'dev', hint: '브라우저 자동화 · 웹 E2E 테스트 · 스크린샷', when: '브라우저 자동화, 웹 테스트, e2e, playwright, 플레이라이트, 크롤링', command: 'npx playwright', repo: 'https://github.com/microsoft/playwright' },
  { key: 'firecrawl', name: 'Firecrawl', team: 'research', hint: '웹페이지를 AI가 읽기 좋은 마크다운으로 수집', when: '웹 수집, 크롤링, 스크래핑, firecrawl, 문서 수집, 리서치', command: 'npx firecrawl', repo: 'https://github.com/mendableai/firecrawl' },
  { key: 'reversebusiness', name: 'Reverse Business', team: 'research', hint: '경쟁사 사업·가격·수익 구조 분석', when: '사업 분석, 서비스 해부, 경쟁사, 가격 분석, 비즈니스, 리버스, 벤치마킹', skill: 'reversebusiness' },
  { key: 'reverse-engineer-anything', name: 'REA (구조 분석)', team: 'research', hint: '앱·웹·프로그램 내부 구조 분석', when: '역공학, 구조 분석, 앱 분석, 디컴파일, rea', skill: 'reverse-engineer-anything' },
];

export const DESIGN_PRESETS = [
  {
    key: 'connect-minimal',
    name: 'CONNECT AI 흑백 미니멀',
    rules: '흰 배경(#fff), 검정 글자(#111), 넓은 여백, 불필요한 그라데이션·이모지 남발 금지, 한눈에 읽히는 표와 카드 중심.',
    assetPath: '',
    refUrl: '',
  },
  {
    key: 'youtube-thumb',
    name: '유튜브 썸네일 · 고대비',
    rules: '핵심 키워드 3~5단어 큰 글씨, 인물/캐릭터 1명 클로즈업, 배경 단순화, 모바일 작은 화면에서도 즉시 읽히는 고대비 배색.',
    assetPath: '',
    refUrl: '',
  },
  {
    key: 'shorts-vertical',
    name: '9:16 숏폼 · 자막 중심',
    rules: '세로 1080x1920, 첫 2초 후크 문구 상단 고정, 하단 안전영역 위 굵은 자막, 네이버 클립·쇼츠·릴스 공통 규격.',
    assetPath: '',
    refUrl: '',
  },
];

// 안전한 스킬/저장소 URL 검증 (https:// 만 허용, javascript:/file:/data: 차단)
export function sanitizeSkillRepoUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) return `https://github.com/${s}`;
  if (/^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/i.test(s)) return `https://github.com/${s.slice(7)}`;
  if (!/^https:\/\/\S+$/i.test(s)) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return '';
    return u.href.replace(/\.git$/i, '').slice(0, 400);
  } catch {
    return '';
  }
}

// GitHub 주소(모노레포 하위 폴더 포함), owner/repo, 또는 npx 명령 1줄에서 이름·저장소·실행 명령 자동 추출
export function parseOpenSourceInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return { name: '', repo: '', command: '' };
  const ghUrl = /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(\/.*)?$/i.exec(s);
  if (ghUrl) {
    const owner = ghUrl[1];
    const repoName = ghUrl[2];
    const subpath = (ghUrl[3] || '').replace(/\/+$/, '');
    const subParts = subpath.split('/').filter(Boolean);
    // 모노레포 하위 스킬 폴더(예: /tree/main/skills/video-edit)가 있으면 폴더 이름을 스킬 이름으로 추천하고 원본 링크 유지
    const subLeaf = subParts.length >= 3 && (subParts[0] === 'tree' || subParts[0] === 'blob')
      ? subParts[subParts.length - 1].replace(/\.(md|mjs|js|ts|py)$/i, '')
      : '';
    const keepSub = subParts.length >= 3 && (subParts[0] === 'tree' || subParts[0] === 'blob');
    return {
      name: subLeaf && subLeaf.toLowerCase() !== 'skill' ? subLeaf : repoName,
      repo: keepSub ? `https://github.com/${owner}/${repoName}${subpath}` : `https://github.com/${owner}/${repoName}`,
      command: `npx github:${owner}/${repoName}`,
    };
  }
  const ghShort = /^(?:npx\s+(?:-y\s+)?)?github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/i.exec(s);
  if (ghShort) {
    return {
      name: ghShort[2],
      repo: `https://github.com/${ghShort[1]}/${ghShort[2]}`,
      command: s.startsWith('npx') ? s : `npx ${s}`,
    };
  }
  const ownerRepo = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(s);
  if (ownerRepo && !s.startsWith('@')) {
    return {
      name: ownerRepo[2],
      repo: `https://github.com/${ownerRepo[1]}/${ownerRepo[2]}`,
      command: `npx github:${ownerRepo[1]}/${ownerRepo[2]}`,
    };
  }
  const npxCmd = /^npx\s+(?:-y\s+)?(@?[A-Za-z0-9_./@-]+)/i.exec(s);
  if (npxCmd) {
    const pkg = npxCmd[1].split('/').pop().replace(/@[^@]+$/, '');
    return { name: pkg || s, repo: '', command: s };
  }
  if (/^https:\/\/\S+$/i.test(s)) {
    const clean = sanitizeSkillRepoUrl(s);
    const tail = clean ? new URL(clean).pathname.split('/').filter(Boolean).pop() || '' : '';
    return { name: tail || s.slice(0, 60), repo: clean, command: '' };
  }
  return { name: s, repo: '', command: '' };
}

export function normalizeEmployeeSkill(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw.sourceInput || raw.repo ? parseOpenSourceInput(raw.sourceInput || raw.repo) : { name: '', repo: '', command: '' };
  const presetObj = raw.preset ? OSS_CATALOG.find((c) => c.key === raw.preset) : null;
  const name = String(raw.name || parsed.name || presetObj?.name || '').trim().slice(0, 80);
  if (!name) return null;
  const repo = sanitizeSkillRepoUrl(raw.repo || parsed.repo || presetObj?.repo || '');
  const command = String(raw.command ?? parsed.command ?? presetObj?.command ?? '').trim().slice(0, 240);
  const when = String(raw.when ?? presetObj?.when ?? '').trim().slice(0, 300);
  const note = String(raw.note ?? presetObj?.hint ?? '').trim().slice(0, 240);
  const skillPath = String(raw.skillPath || '').trim().slice(0, 300);
  const id = String(raw.id || `sk_${idx + 1}_${name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '').slice(0, 12) || 'item'}`).slice(0, 48);
  return { id, name, preset: String(raw.preset || presetObj?.key || '').slice(0, 60), repo, command, when, note, skillPath };
}

export function matchEmployeeSkills(text, emp, tokenize) {
  const skills = Array.isArray(emp?.skills) ? emp.skills : [];
  if (!skills.length) return [];
  const low = String(text || '').toLowerCase();
  const tt = tokenize ? tokenize(low) : low.split(/\s+/).filter((w) => w.length >= 2);
  const scored = [];
  for (const sk of skills) {
    let score = 0;
    const nm = String(sk.name || '').toLowerCase().trim();
    const preset = String(sk.preset || '').toLowerCase().trim();
    const repoLeaf = sk.repo ? sk.repo.split('/').filter(Boolean).pop().toLowerCase() : '';
    if (nm.length >= 2 && low.includes(nm)) score += 6;
    if (preset.length >= 2 && low.includes(preset)) score += 6;
    if (repoLeaf.length >= 3 && low.includes(repoLeaf)) score += 5;
    const phrases = String(sk.when || '').toLowerCase().split(/[,·/|]+/).map((s) => s.trim()).filter((s) => s.length >= 2);
    for (const p of phrases) {
      if (low.includes(p)) { score += 4; continue; }
      const pt = tokenize ? tokenize(p) : p.split(/\s+/).filter((w) => w.length >= 2);
      if (pt.length && pt.every((w) => tt.some((x) => x === w || (w.length >= 2 && x.includes(w))))) score += 2;
    }
    if (score > 0) scored.push({ sk, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.sk);
}

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

function hasAppPath(p) {
  if (!p) return false;
  try { return fs.existsSync(p); } catch { return false; }
}

export function detectBrowsers() {
  return BROWSER_CATALOG.map((b) => {
    const cliFound = b.bin ? Boolean(findBin(b.bin, b.envVar)) : false;
    const appFound = process.platform === 'darwin' && (hasAppPath(b.appPath) || hasAppPath(b.altAppPath));
    return {
      ...b,
      cliFound,
      found: cliFound || appFound,
    };
  });
}

// 컴퓨터 유즈 · 스마트폰 브리지 자동 감지 (읽기 전용 확인)
export function detectDesktopBridges() {
  return {
    orca: Boolean(findBin('orca', 'AIHQ_ORCA_BIN')),
    adb: Boolean(findBin('adb', 'AIHQ_ADB_BIN')),
    scrcpy: Boolean(findBin('scrcpy', 'AIHQ_SCRCPY_BIN')),
    iphoneMirroringApp: process.platform === 'darwin' && (
      hasAppPath('/System/Applications/iPhone Mirroring.app') ||
      hasAppPath('/Applications/iPhone Mirroring.app')
    ),
  };
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
      repo: c.repo || '',
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
export const WEB_WORDS = /(웹|사이트|페이지|브라우저|이메일|메일|gmail|hotmail|유튜브|스튜디오|스마트\s*스토어|쿠팡|인스타|블로그|네이버\s*클립|틱톡|tiktok|스레드|링크드인|카카오\s*채널|뉴스레터|브런치|검색|조사|리서치|확인|크롤링|\bqa\b|로그인|경쟁사|서비스\s*분석|홈페이지|쇼핑몰|댓글|답글|매출\s*확인|ego|에고|aside|어사이드|chrome|크롬|dia|디아|comet|코멧|arc|아크|safari|사파리)/i;

// 스마트폰 · 아이폰 미러링 · 모바일 앱 작업인지 판단
export const PHONE_WORDS = /(스마트폰|아이폰|iphone|미러링|안드로이드|android|갤럭시|휴대폰|핸드폰|폰\s*앱|모바일\s*앱|인스타\s*앱|카톡\s*앱|카카오톡\s*앱|당근|문자|sms|피클)/i;

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
    if (b.preset === 'dia' && /\bdia\b|디아/.test(low)) return true;
    if (b.preset === 'comet' && /comet|코멧/.test(low)) return true;
    if (b.preset === 'arc' && /\barc\b|아크/.test(low)) return true;
    if (b.preset === 'safari' && /safari|사파리/.test(low)) return true;
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

export function pickPhone(text, resources) {
  const phones = (resources || []).filter((r) => r.kind === '스마트폰' && r.status !== '꺼짐');
  if (!phones.length) return null;
  const low = String(text || '').toLowerCase();
  const named = phones.find((p) => {
    const n = String(p.name || '').toLowerCase();
    if (n.length >= 2 && low.includes(n)) return true;
    if (p.phoneMode === 'iphone-mirror' && /아이폰|iphone|미러링/.test(low)) return true;
    if (p.phoneMode === 'android-adb' && /안드로이드|android|갤럭시|adb|scrcpy/.test(low)) return true;
    if (p.phoneMode === 'mobile-ai' && /피클/.test(low)) return true;
    return false;
  });
  if (named) return named;
  if (!PHONE_WORDS.test(low)) return null;
  return phones[0];
}

export function phonePromptBlock(phone, resources = [], bridges = null) {
  if (!phone) return '';
  const host = phone.hostMachine ? resources.find((r) => r.id === phone.hostMachine) : null;
  const hostName = host ? host.name : '이 맥';
  const mode = phone.phoneMode || 'iphone-mirror';
  const lines = [`연결 스마트폰: ${phone.name}`];
  if (mode === 'iphone-mirror') {
    const cuHint = bridges?.orca ? 'orca computer CLI 또는 Computer Use 화면 조작' : 'Computer Use 화면 조작';
    lines.push(`- 접속 방식: ${hostName}의 iPhone Mirroring 앱 창을 ${cuHint}으로 열어 확인·조작합니다.`);
  } else if (mode === 'android-adb') {
    lines.push(`- 접속 방식: ${hostName}에 연결된 안드로이드 기기를 adb 또는 scrcpy 창으로 확인·조작합니다.`);
  } else {
    lines.push('- 접속 방식: 모바일 전용 AI 직원(피클 등)으로 전달해 처리합니다.');
  }
  lines.push('- 스마트폰 고정 안전선: 잠금 해제·Touch ID·비밀번호 입력·결제·송금·문자/카톡 실제 전송은 금지이며, 필요하면 초안만 준비하고 대표 승인을 요청합니다.');
  return lines.join('\n');
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
  return scored.sort((a, b) => b.score - a.score).slice(0, 4).map((x) => x.r);
}

const DESIGN_INTENT = /(스타일|디자인|컨셉|톤|느낌|테마|썸네일|모션|영상\s*편집|카드\s*뉴스|배너|포스터|숏폼|화면|브랜드|\bui\b|\bux\b)/i;

// 프롬프트에 디자인 스타일 이름이나 핵심 키워드가 들어 있으면 자동 연결한다
export function pickDesigns(text, resources, tokenize) {
  const designs = (resources || []).filter((r) => r.kind === '디자인' && r.status !== '꺼짐');
  if (!designs.length) return [];
  const low = String(text || '').toLowerCase();
  const tt = tokenize ? tokenize(low) : low.split(/\s+/).filter((w) => w.length >= 2);
  const hasIntent = DESIGN_INTENT.test(low);
  const scored = [];
  for (const r of designs) {
    let score = 0;
    let hits = 0;
    const nm = String(r.name || '').toLowerCase().trim();
    if (nm.length >= 2 && low.includes(nm)) {
      score += 8;
      hits += 2;
    } else {
      const parts = nm.split(/[\s·,/()-]+/).filter((w) => w.length >= 2 && !/^(ai|스타일|디자인|기본|브랜드|중심)$/.test(w));
      for (const p of parts) {
        const hit = /^[a-z0-9]+$/.test(p) ? new RegExp(`\\b${p}\\b`, 'i').test(low) : low.includes(p);
        if (hit) { score += 3; hits++; }
        else if (tt.some((x) => x === p)) { score += 2; hits++; }
      }
    }
    // 스타일 전체 이름이거나 2단어 이상 일치, 또는 디자인 의도가 함께 있을 때만 자동 연결 (유튜브 통계 조회 등 오탐 방지)
    if (score >= 6 || (hits >= 1 && hasIntent && score >= 3)) scored.push({ r, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.r);
}
