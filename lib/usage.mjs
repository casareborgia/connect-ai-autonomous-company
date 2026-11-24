// 로컬 세션 기반 AI 토큰 사용량 스캐너 (읽기 전용 · 외부 네트워크 호출 없음 · 비밀번호 미접근)
// Claude Code(~/.claude/projects/**/*.jsonl) 및 Codex(~/.codex/sessions/**/*.jsonl)의
// 최근 24시간 파일 끝부분(최대 512KB)만 안전하게 읽어 5시간 롤링 한도(%)와 리셋 예정 시각을 추정한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TAIL_BYTES = 512 * 1024;
const MAX_FILES_PER_PROVIDER = 24;

const CLAUDE_PRO_5H_BUDGET = 4_000_000;
const CLAUDE_MAX5X_5H_BUDGET = 16_000_000;
const CLAUDE_MAX20X_5H_BUDGET = 50_000_000;
const CODEX_5H_BUDGET = Math.max(100000, Number(process.env.AIHQ_CODEX_5H_BUDGET) || 15_000_000);

// ~/.claude.json 의 플랜 티어(Ultra / Max 20x / Max 5x / Pro)를 읽기 전용으로 안전하게 감지 (토큰/비밀키 미접근)
export function detectClaudePlanTier(home = os.homedir()) {
  if (process.env.AIHQ_CLAUDE_5H_BUDGET) {
    const custom = Math.max(100000, Number(process.env.AIHQ_CLAUDE_5H_BUDGET) || CLAUDE_PRO_5H_BUDGET);
    return { tier: 'custom', label: '로컬 Claude 세션', budget5h: custom };
  }
  try {
    const p = path.join(home, '.claude.json');
    if (!fs.existsSync(p)) return { tier: 'pro', label: '로컬 Claude 세션', budget5h: CLAUDE_PRO_5H_BUDGET };
    const raw = fs.readFileSync(p, 'utf8');
    if (raw.length > 2 * 1024 * 1024) return { tier: 'pro', label: '로컬 Claude 세션', budget5h: CLAUDE_PRO_5H_BUDGET };
    const o = JSON.parse(raw);
    const oa = o?.oauthAccount || {};
    const tierStr = `${oa.organizationRateLimitTier || ''} ${oa.userRateLimitTier || ''} ${oa.organizationType || ''}`.toLowerCase();
    if (/20x|ultra/.test(tierStr)) {
      return { tier: 'max_20x', label: 'Claude Ultra · Max 20x', budget5h: CLAUDE_MAX20X_5H_BUDGET };
    }
    if (/5x|claude_max|\bmax\b/.test(tierStr)) {
      return { tier: 'max_5x', label: 'Claude Max 5x', budget5h: CLAUDE_MAX5X_5H_BUDGET };
    }
  } catch { /* 기본 Pro 기준 유지 */ }
  return { tier: 'pro', label: '로컬 Claude 세션 (Pro)', budget5h: CLAUDE_PRO_5H_BUDGET };
}

function findRecentJsonl(rootDir, cutoffMs, maxDepth = 4) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p, depth + 1);
      } else if (e.name.endsWith('.jsonl')) {
        try {
          const st = fs.statSync(p);
          if (st.mtimeMs >= cutoffMs && st.size > 0) found.push({ path: p, mtimeMs: st.mtimeMs, size: st.size });
        } catch { /* 건너뜀 */ }
      }
    }
  };
  walk(rootDir, 0);
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.slice(0, MAX_FILES_PER_PROVIDER);
}

// 4GB 같은 초대형 jsonl 파일에서도 메모리 폭주 없이 끝부분만 안전하게 읽는다
function readTailLines(filePath, fileSize, maxBytes = MAX_TAIL_BYTES) {
  const start = Math.max(0, fileSize - maxBytes);
  const len = fileSize - start;
  if (len <= 0) return [];
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, len, start);
  } finally {
    fs.closeSync(fd);
  }
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  // 중간에서 잘렸으면 첫 줄은 불완전할 수 있으므로 건너뛴다
  return start > 0 ? lines.slice(1) : lines;
}

export function scanClaudeUsage(claudeProjectsDir, nowMs = Date.now(), budget5h = null, planMeta = null) {
  const effectiveBudget = Math.max(100000, Number(budget5h) || Number(planMeta?.budget5h) || CLAUDE_PRO_5H_BUDGET);
  const cutoff24h = nowMs - DAY_MS;
  const cutoff5h = nowMs - FIVE_HOURS_MS;
  const files = findRecentJsonl(claudeProjectsDir, cutoff24h, 3);
  const seenMsgIds = new Set();
  let billable5h = 0;
  let raw5h = 0;
  let turns5h = 0;
  let raw24h = 0;
  let turns24h = 0;
  let oldest5hTs = null;
  let latestTs = null;

  for (const f of files) {
    let lines;
    try { lines = readTailLines(f.path, f.size); } catch { continue; }
    for (const line of lines) {
      if (!line || !line.includes('"usage"')) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const u = o?.message?.usage;
      if (!u || typeof u !== 'object') continue;
      const ts = Date.parse(o.timestamp || '');
      if (!Number.isFinite(ts) || ts < cutoff24h || ts > nowMs + 60000) continue;
      const msgId = o.message?.id || o.uuid;
      if (msgId) {
        if (seenMsgIds.has(msgId)) continue;
        seenMsgIds.add(msgId);
      }
      const inp = Number(u.input_tokens) || 0;
      const out = Number(u.output_tokens) || 0;
      const cc = Number(u.cache_creation_input_tokens) || 0;
      const cr = Number(u.cache_read_input_tokens) || 0;
      const raw = inp + out + cc + cr;
      // 출력 토큰 가중치(5x) · 캐시 읽기(0.1x)로 실제 5시간 쿼터 소진 체감에 가깝게 추정
      const billable = inp + out * 5 + Math.round(cc * 1.25) + Math.round(cr * 0.1);
      if (raw <= 0) continue;

      raw24h += raw;
      turns24h += 1;
      if (!latestTs || ts > latestTs) latestTs = ts;
      if (ts >= cutoff5h) {
        billable5h += billable;
        raw5h += raw;
        turns5h += 1;
        if (oldest5hTs === null || ts < oldest5hTs) oldest5hTs = ts;
      }
    }
  }

  const pct5h = turns5h > 0 ? Math.min(100, Math.max(1, Math.round((billable5h / effectiveBudget) * 100))) : 0;
  const resetInMin = oldest5hTs ? Math.max(1, Math.round((oldest5hTs + FIVE_HOURS_MS - nowMs) / 60000)) : null;

  return {
    provider: 'claude',
    planTier: planMeta?.tier || 'pro',
    detected: files.length > 0,
    pct5h,
    billable5h,
    tokens5h: raw5h,
    tokensToday: raw24h,
    turns5h,
    turnsToday: turns24h,
    resetInMin,
    warning80: pct5h >= 80,
    latestAt: latestTs ? new Date(latestTs).toISOString() : null,
    source: planMeta?.label || '로컬 Claude 세션',
  };
}

export function scanCodexUsage(codexSessionsDir, nowMs = Date.now(), budget5h = CODEX_5H_BUDGET) {
  const cutoff24h = nowMs - DAY_MS;
  const cutoff5h = nowMs - FIVE_HOURS_MS;
  const files = findRecentJsonl(codexSessionsDir, cutoff24h, 4);
  let tokens5h = 0;
  let turns5h = 0;
  let tokens24h = 0;
  let turns24h = 0;
  let oldest5hTs = null;
  let latestTs = null;
  let explicitPct = null;
  let explicitResetMin = null;
  let explicitTs = 0;

  for (const f of files) {
    let lines;
    try { lines = readTailLines(f.path, f.size); } catch { continue; }
    let prevTotal = null;
    for (const line of lines) {
      if (!line || !line.includes('token_count')) continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      if (o?.payload?.type !== 'token_count') continue;
      const ts = Date.parse(o.timestamp || '');
      if (!Number.isFinite(ts) || ts < cutoff24h || ts > nowMs + 60000) continue;

      const rl = o.payload?.rate_limits?.primary;
      if (rl && typeof rl.used_percent === 'number' && ts >= explicitTs) {
        explicitTs = ts;
        explicitPct = Math.min(100, Math.max(0, Math.round(rl.used_percent)));
        if (rl.resets_at) {
          const rMs = typeof rl.resets_at === 'number'
            ? (rl.resets_at > 1e12 ? rl.resets_at : rl.resets_at * 1000)
            : Date.parse(rl.resets_at);
          if (Number.isFinite(rMs) && rMs > nowMs) explicitResetMin = Math.max(1, Math.round((rMs - nowMs) / 60000));
        }
      }

      const lastU = o.payload?.info?.last_token_usage;
      const totU = o.payload?.info?.total_token_usage;
      let delta = 0;
      if (lastU && typeof lastU.total_tokens === 'number' && lastU.total_tokens > 0) {
        delta = lastU.total_tokens;
      } else if (totU && typeof totU.total_tokens === 'number') {
        if (prevTotal !== null && totU.total_tokens >= prevTotal) delta = totU.total_tokens - prevTotal;
        else if (prevTotal === null) delta = Math.min(totU.total_tokens, 500_000);
        prevTotal = totU.total_tokens;
      }
      if (delta <= 0) continue;

      tokens24h += delta;
      turns24h += 1;
      if (!latestTs || ts > latestTs) latestTs = ts;
      if (ts >= cutoff5h) {
        tokens5h += delta;
        turns5h += 1;
        if (oldest5hTs === null || ts < oldest5hTs) oldest5hTs = ts;
      }
    }
  }

  const estPct = turns5h > 0 ? Math.min(100, Math.max(1, Math.round((tokens5h / budget5h) * 100))) : 0;
  const pct5h = explicitPct !== null ? explicitPct : estPct;
  const resetInMin = explicitResetMin !== null
    ? explicitResetMin
    : (oldest5hTs ? Math.max(1, Math.round((oldest5hTs + FIVE_HOURS_MS - nowMs) / 60000)) : null);

  return {
    provider: 'codex',
    detected: files.length > 0,
    pct5h,
    tokens5h,
    tokensToday: tokens24h,
    turns5h,
    turnsToday: turns24h,
    resetInMin,
    warning80: pct5h >= 80,
    exactRateLimit: explicitPct !== null,
    latestAt: latestTs ? new Date(latestTs).toISOString() : null,
    source: explicitPct !== null ? 'Codex 한도 정보' : '로컬 Codex 세션',
  };
}

let cachedUsage = null;
let cachedAt = 0;

export function clearUsageCache() {
  cachedUsage = null;
  cachedAt = 0;
}

export function scanLocalUsage({
  claudeDir = process.env.AIHQ_CLAUDE_DIR || path.join(os.homedir(), '.claude', 'projects'),
  codexDir = process.env.AIHQ_CODEX_DIR || path.join(os.homedir(), '.codex', 'sessions'),
  homeDir = os.homedir(),
  nowMs = Date.now(),
} = {}) {
  const planMeta = detectClaudePlanTier(homeDir);
  return {
    claude: scanClaudeUsage(claudeDir, nowMs, planMeta.budget5h, planMeta),
    codex: scanCodexUsage(codexDir, nowMs),
    scannedAt: new Date(nowMs).toISOString(),
  };
}

export function scanLocalUsageCached(ttlMs = 15000) {
  const now = Date.now();
  if (cachedUsage && now - cachedAt < ttlMs) return cachedUsage;
  cachedUsage = scanLocalUsage({ nowMs: now });
  cachedAt = now;
  return cachedUsage;
}

export function buildEmployeeUsageMap(d, localUsage, todayYmd, nowMs = Date.now()) {
  const out = {};
  const todayLogs = (d.worklog || []).filter((w) => String(w.start || '').slice(0, 10) === todayYmd);

  for (const e of d.employees || []) {
    const myLogs = todayLogs.filter((w) => w.emp === e.id);
    const cooling = Boolean(e.cooldownUntil && Date.parse(e.cooldownUntil) > nowMs);
    const coolMin = cooling ? Math.max(1, Math.ceil((Date.parse(e.cooldownUntil) - nowMs) / 60000)) : null;

    let prov = null;
    if (e.engine === 'claude' || e.catalog === 'claudecode' || e.catalog === 'claude' || /\bclaude\b|클로드/i.test(e.name)) {
      prov = localUsage?.claude || null;
    } else if (e.engine === 'codex' || e.catalog === 'codex' || /\bcodex\b/i.test(e.name)) {
      prov = localUsage?.codex || null;
    }

    if (prov && (prov.detected || cooling)) {
      const pct = cooling ? 100 : prov.pct5h;
      out[e.id] = {
        pct5h: pct,
        tokens5h: prov.tokens5h,
        tokensToday: prov.tokensToday,
        turns5h: prov.turns5h,
        runsToday: myLogs.length,
        resetInMin: cooling ? coolMin : prov.resetInMin,
        warning80: pct >= 80,
        cooling,
        source: cooling ? '한도 휴식 중' : prov.source,
      };
    } else {
      // 로컬/웹/클라우드 직원은 HQ 오늘 실행 횟수 + 쿨다운 상태로 가볍게 표시
      const pct = cooling ? 100 : Math.min(100, myLogs.length * 12);
      out[e.id] = {
        pct5h: myLogs.length || cooling ? pct : null,
        tokens5h: null,
        tokensToday: null,
        turns5h: myLogs.length,
        runsToday: myLogs.length,
        resetInMin: cooling ? coolMin : null,
        warning80: cooling || pct >= 80,
        cooling,
        source: cooling ? '한도 휴식 중' : (e.engine === 'local' ? '무제한 · 로컬' : 'HQ 실행 기록'),
      };
    }
  }
  return out;
}
