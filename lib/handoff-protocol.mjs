// CONNECT AI LAB 직원 간 공통 인계 규격 (connect-ai-handoff/v1)
// 원칙:
//   1) 어느 AI 직원(글쓰기 · 번역 · 모션 · 영상편집 · XR · 사업분석 · 마케터 등)이 끝나든
//      같은 모양의 handoff.json 1장을 남기면 다음 직원이 사람 손 없이 바로 이어받는다.
//   2) 경로 탈출(..), 비밀키(sk-/ghp_/AIza/Bearer), 프롬프트 인젝션 태그는 저장·읽기 전 자동 정제한다.
//   3) connect-ai-writer 등 기존 직원이 남기는 handoff/ 폴더도 자동으로 인식해 v1 패킷으로 정규화한다.
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { nowIso, text } from './util.mjs';

export const HANDOFF_SCHEMA = 'connect-ai-handoff/v1';

// CONNECT AI 기업 3개 팀 × 11명 직원 구조 (AI 직원 만들기 → AI 팀 만들기 → AI 기업 만들기)
export const CONNECT_AI_TEAMS = [
  {
    key: 'plan',
    name: '기획·분석 팀',
    summary: '무엇을 만들지 사업 구조·수익·기회를 먼저 분석합니다.',
    employees: ['reversebusiness'],
  },
  {
    key: 'build',
    name: '제작 팀',
    summary: 'XR · 영상 편집 · 모션그래픽 · 상품 사진 · 발표 자료 · 3D 웹 · 블렌더 결과물을 만듭니다.',
    employees: [
      'connect-ai-xr',
      'connect-ai-video-motion',
      'connect-ai-motion',
      'connect-ai-product-photo',
      'connect-ai-slides-web',
      'connect-ai-three',
      'connect-ai-blender',
    ],
  },
  {
    key: 'growth',
    name: '알리는 팀',
    summary: '영상·결과물 하나로 글쓰기 → 해외 번역 → 마케팅 임시저장까지 한 팀으로 내보냅니다.',
    employees: [
      'connect-ai-writer',
      'connect-ai-translator',
      'connect-ai-marketer',
    ],
  },
];

const SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|gho_[A-Za-z0-9]{12,}|xoxb-[A-Za-z0-9-]{12,}|AIza[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/-]{16,}=*)\b/gi;
const INJECT_RE = /<\/?(?:thread_data|system|assistant|user|instructions?)>/gi;

function cleanField(raw, maxLen = 400) {
  return text(String(raw || '').replace(SECRET_RE, '[비공개]').replace(INJECT_RE, ' '), maxLen);
}

function safeArtifactPath(raw) {
  const s = String(raw || '').trim().replace(/\\/g, '/');
  if (!s || s.length > 300) return '';
  if (s.includes('\0') || /(^|\/)\.\.(\/|$)/.test(s)) return '';
  return s;
}

export function normalizeHandoffPacket(raw = {}, fallback = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const nextRaw = Array.isArray(src.next)
    ? src.next
    : typeof src.next === 'string' && src.next.trim()
      ? src.next.split(/[,/]+/)
      : Array.isArray(fallback.next) ? fallback.next : [];
  const next = [...new Set(nextRaw.map((x) => cleanField(x, 60)).filter(Boolean))].slice(0, 6);

  const artifactsRaw = Array.isArray(src.artifacts)
    ? src.artifacts
    : Array.isArray(src.files)
      ? src.files.map((p) => ({ kind: 'file', path: p }))
      : [];
  const artifacts = artifactsRaw
    .slice(0, 24)
    .map((a) => {
      if (typeof a === 'string') {
        const p = safeArtifactPath(a);
        return p ? { kind: 'file', platform: '', path: p, label: path.basename(p) } : null;
      }
      if (!a || typeof a !== 'object') return null;
      const p = safeArtifactPath(a.path || a.file || '');
      if (!p) return null;
      return {
        kind: cleanField(a.kind || 'file', 32) || 'file',
        platform: cleanField(a.platform || '', 32),
        path: p,
        label: cleanField(a.label || path.basename(p), 80),
      };
    })
    .filter(Boolean);

  return {
    schema: HANDOFF_SCHEMA,
    from: cleanField(src.from || fallback.from || 'unknown', 60),
    next,
    taskId: cleanField(src.taskId || fallback.taskId || '', 40),
    stepId: cleanField(src.stepId || fallback.stepId || '', 20),
    createdAt: src.createdAt || nowIso(),
    title: cleanField(src.title || fallback.title || '', 160),
    summary: cleanField(src.summary || fallback.summary || '', 800),
    sourceDir: safeArtifactPath(src.sourceDir || fallback.sourceDir || ''),
    artifacts,
    lang: cleanField(src.lang || fallback.lang || 'ko', 16) || 'ko',
    readyForDraft: src.readyForDraft !== false,
    notesForNext: cleanField(src.notesForNext || src.note || fallback.notesForNext || '', 600),
  };
}

export async function writeHandoffPacket(dirPath, packet) {
  if (!dirPath) throw new Error('handoff.json을 저장할 폴더 경로가 필요합니다.');
  const norm = normalizeHandoffPacket(packet);
  const absDir = path.resolve(dirPath);
  await fs.mkdir(absDir, { recursive: true });
  const filePath = path.join(absDir, 'handoff.json');
  await fs.writeFile(filePath, `${JSON.stringify(norm, null, 2)}\n`, 'utf8');
  return { filePath, packet: norm };
}

export function readHandoffFromDirSync(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return null;
  try {
    const absDir = path.resolve(dirPath);
    const candidates = [
      path.join(absDir, 'handoff.json'),
      path.join(absDir, 'handoff', 'handoff.json'),
      path.join(absDir, 'handoff', 'manifest.json'),
    ];
    for (const f of candidates) {
      if (!fssync.existsSync(f)) continue;
      const parsed = JSON.parse(fssync.readFileSync(f, 'utf8'));
      return normalizeHandoffPacket(parsed, { sourceDir: absDir });
    }
    // connect-ai-writer 등 기존 handoff/ 디렉토리 자동 적응
    const handoffSub = path.join(absDir, 'handoff');
    if (fssync.existsSync(handoffSub) && fssync.statSync(handoffSub).isDirectory()) {
      const files = fssync.readdirSync(handoffSub)
        .filter((name) => !name.startsWith('.'))
        .slice(0, 16)
        .map((name) => ({ kind: 'handoff-file', platform: name.replace(/\.[^.]+$/, ''), path: `handoff/${name}`, label: name }));
      if (files.length) {
        return normalizeHandoffPacket({
          from: 'connect-ai-writer',
          next: ['connect-ai-translator', 'connect-ai-motion', 'connect-ai-marketer'],
          summary: `공유 폴더 handoff/에서 ${files.length}개 인계 파일 감지`,
          sourceDir: absDir,
          artifacts: files,
        });
      }
    }
  } catch { /* 읽기 실패 시 무시 */ }
  return null;
}

export function formatHandoffPromptBlock(packet) {
  if (!packet || typeof packet !== 'object') return '';
  const p = normalizeHandoffPacket(packet);
  const lines = [
    `직원 간 표준 인계 패킷 (${p.schema} · 이전 직원: ${p.from}${p.next.length ? ` → 다음: ${p.next.join(', ')}` : ''}):`,
    p.summary ? `- 핵심 결과: ${p.summary}` : '',
    p.sourceDir ? `- 인계 폴더: ${p.sourceDir}` : '',
    p.artifacts.length
      ? `- 산출물 파일:\n${p.artifacts.slice(0, 10).map((a) => `  * [${a.platform || a.kind}] ${a.label}: ${a.path}`).join('\n')}`
      : '',
    p.notesForNext ? `- 다음 직원 참고: ${p.notesForNext}` : '',
    '- 이 단계를 마치면 같은 형식(connect-ai-handoff/v1)의 handoff.json(또는 MCP write_handoff_packet)으로 다음 직원에게 결과를 넘기세요.',
  ];
  return lines.filter(Boolean).join('\n');
}
