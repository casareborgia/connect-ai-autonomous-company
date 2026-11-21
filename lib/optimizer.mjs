// AI 토큰·한도 우회(Fallback) + 컴퓨터 RAM/부하 최적화(Backpressure & Spillover) 엔진.
// 원칙:
//   1) AI 직원은 대표가 직접 정한 담당이 최우선. 토큰/한도 소진(쿨다운) 시에만 대체 순위(fallbackTo)로 자동 전환.
//   2) 컴퓨터(사무실)는 RAM·디스크·CPU 부하·작업 무게(무거운/가벼운)를 보고 자동 배분. 85% 상한 초과 시 다른 컴퓨터로 우회하거나 대기열로 보호.
//   3) 민감한 로컬 전용 작업은 외부 클라우드 AI로 절대 우회하지 않는다.
import { HEAVY_WORDS } from './assign.mjs';
import { allowedTemplates, isOffice } from './office.mjs';

export const DEFAULT_MAX_RAM_PCT = 85;
export const DEFAULT_MIN_FREE_GB = 2;
export const DEFAULT_MIN_DISK_GB = 5;
export const DEFAULT_MAX_HEAVY = 1;

// CLI·API·웹 오류 문구에서 토큰·사용 한도·과부하 감지
const QUOTA_PATTERNS = [
  { re: /(?:5[\s-]?hour|weekly|daily|monthly|session)\s+limit|usage\s+limit|hit\s+your\s+limit|limit\s+reached|한도\s*(초과|도달|소진)|사용량\s*한도/i, kind: 'limit', defaultMin: 60, label: '멤버십 사용 한도 도달' },
  { re: /rate[\s_-]?limit|too\s+many\s+requests|\bhttp\s*429\b|\bstatus[:\s]*429\b|resource[\s_-]?exhausted/i, kind: 'rate', defaultMin: 30, label: '요청 한도(429) 도달' },
  { re: /insufficient[\s_-]?quota|quota[\s_-]?exceeded|out\s+of\s+(?:tokens|credits|usage)|credit[s]?\s*(?:exhausted|too\s+low|balance)|billing[\s_-]?limit|토큰\s*(소진|부족|초과|한도)/i, kind: 'quota', defaultMin: 120, label: '토큰·크레딧 소진' },
  { re: /overloaded|temporarily\s+unavailable|capacity\s+(?:exceeded|reached)|high\s+demand|\b529\b/i, kind: 'overload', defaultMin: 15, label: 'AI 서버 혼잡(과부하)' },
];

const SENSITIVE_LOCAL_RE = /(매출\s*원본|세금\s*신고|계좌\s*내역|주민등록|여권\s*번호|비밀번호|계약서\s*원본|로컬\s*전용|외부\s*유출\s*금지|비공개\s*재무)/i;

export function parseCooldownMinutes(rawText, fallbackMin = 60, now = new Date()) {
  const s = String(rawText || '');
  // "try again in 45 minutes", "retry after 2 hours", "30분 뒤", "3시간 후"
  const hrMin = /(?:in|after|약)?\s*(\d{1,2})\s*(?:hours?|hrs?|시간)\s*(?:and\s*)?(?:(\d{1,2})\s*(?:minutes?|mins?|분))?/i.exec(s);
  if (hrMin) {
    const mins = Number(hrMin[1]) * 60 + Number(hrMin[2] || 0);
    if (mins >= 5) return Math.min(720, mins);
  }
  const onlyMin = /(?:in|after|약)?\s*(\d{1,3})\s*(?:minutes?|mins?|분)\s*(?:later|뒤|후)?/i.exec(s);
  if (onlyMin) {
    const mins = Number(onlyMin[1]);
    if (mins >= 1) return Math.min(720, Math.max(5, mins));
  }
  const sec = /(?:retry[- ]?after|in)\s*(\d{2,5})\s*(?:seconds?|secs?|초)/i.exec(s);
  if (sec) {
    const mins = Math.ceil(Number(sec[1]) / 60);
    if (mins >= 1) return Math.min(720, Math.max(5, mins));
  }
  // "resets at 15:00" / "15:30에 초기화"
  const at = /(?:resets?\s+at|until|복귀|초기화[^0-9]{0,6})\s*(\d{1,2}):(\d{2})/i.exec(s);
  if (at) {
    const hh = Number(at[1]);
    const mm = Number(at[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      const target = new Date(now);
      target.setHours(hh, mm, 0, 0);
      if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
      const diff = Math.ceil((target.getTime() - now.getTime()) / 60000);
      if (diff >= 5 && diff <= 720) return diff;
    }
  }
  return fallbackMin;
}

export function detectQuotaError(rawText, now = new Date()) {
  const s = String(rawText || '');
  if (!s.trim()) return null;
  for (const p of QUOTA_PATTERNS) {
    if (p.re.test(s)) {
      const minutes = parseCooldownMinutes(s, p.defaultMin, now);
      return { kind: p.kind, label: p.label, minutes };
    }
  }
  return null;
}

export function isCoolingDown(emp, now = Date.now()) {
  if (!emp || !emp.cooldownUntil) return false;
  const ts = Date.parse(emp.cooldownUntil);
  return Number.isFinite(ts) && ts > now;
}

export function cooldownRemainingMin(emp, now = Date.now()) {
  if (!isCoolingDown(emp, now)) return 0;
  return Math.max(1, Math.ceil((Date.parse(emp.cooldownUntil) - now) / 60000));
}

export function isSensitiveLocalTask(t, emp = null) {
  if (t?.localOnly) return true;
  const full = `${t?.title || ''} ${t?.note || ''}`;
  if (SENSITIVE_LOCAL_RE.test(full)) return true;
  if (emp?.engine === 'local' && /(매출|세무|정산|고객\s*명단|개인정보)/.test(full)) return true;
  return false;
}

export function isHeavyTask(t, emp = null) {
  const full = `${t?.title || ''} ${t?.note || ''}`;
  if (HEAVY_WORDS.test(full)) return true;
  if (emp?.engine === 'local') return true;
  if (t?.officeJob && ['blender-render', 'remotion-render'].includes(t.officeJob.template)) return true;
  return false;
}

// 대체 AI 직원 탐색: 1) 대표가 지정한 fallbackTo 체인(A→B→C) 우선, 2) 같은 실행 가능 풀 내 여유 직원
export function pickFallbackEmployee(d, startEmpId, {
  task = null,
  workingIds = new Set(),
  canRunFn = null,
  requireRunnable = true,
  requireLocal = false,
  excludeIds = new Set(),
  now = Date.now(),
} = {}) {
  const employees = d.employees || [];
  const byId = new Map(employees.map((e) => [e.id, e]));
  const startEmp = byId.get(startEmpId) || null;
  const mustLocal = requireLocal || isSensitiveLocalTask(task, startEmp);

  const eligible = (e) => {
    if (!e || e.id === startEmpId || excludeIds.has(e.id)) return false;
    if (isCoolingDown(e, now)) return false;
    if (workingIds.has(e.id)) return false;
    if (mustLocal && e.engine !== 'local') return false;
    if (requireRunnable && canRunFn && !canRunFn(e)) return false;
    return true;
  };

  // 1) 대표가 지정한 대체 순위 체인 (순환 방지)
  const visited = new Set([startEmpId]);
  let cur = startEmp;
  let hops = 0;
  while (cur && cur.fallbackTo && !visited.has(cur.fallbackTo)) {
    visited.add(cur.fallbackTo);
    hops++;
    const cand = byId.get(cur.fallbackTo);
    if (!cand) break;
    if (eligible(cand)) {
      return { emp: cand, viaChain: true, hops, reason: `${startEmp?.name || startEmpId} 대체 순위(${hops}차) → ${cand.name}` };
    }
    cur = cand;
  }

  // 2) 체인에 지정된 직원이 없거나 모두 불가할 때: 자동 최적화가 켜져 있으면 여유 AI 후보 탐색
  if (d.settings?.autoOptimize === false) return null;
  const candidates = employees.filter((e) => !visited.has(e.id) && eligible(e));
  if (!candidates.length) return null;

  // 우선순위: 같은 역할 키워드 겹침 > 로컬/클라우드 적합 > 실행 가능(CLI/로컬) > 일반 AI
  const startRole = String(startEmp?.role || '').toLowerCase();
  const score = (e) => {
    let sc = 0;
    if (canRunFn && canRunFn(e)) sc += 30;
    if (e.engine === 'local') sc += 10; // 무료·토큰 무제한 가산점
    if (startRole && e.role) {
      const words = startRole.split(/[,\s·/]+/).filter((w) => w.length >= 2);
      for (const w of words) if (e.role.toLowerCase().includes(w)) sc += 15;
    }
    if (e.general) sc += 5;
    return sc;
  };
  candidates.sort((a, b) => score(b) - score(a));
  const best = candidates[0];
  return { emp: best, viaChain: false, hops: 1, reason: `여유 AI 자동 우회 → ${best.name}` };
}

// 컴퓨터 1대의 건강 신호등 평가: ok(여유) | busy(혼잡) | overload(과부하) | down(꺼짐/안닿음)
export function evaluateMachineHealth(r, { localStat = null, officeView = null, activeHeavy = 0, activeTotal = 0 } = {}) {
  const maxRamPct = Math.min(95, Math.max(55, Number(r?.maxRamPct) || DEFAULT_MAX_RAM_PCT));
  const maxHeavy = Math.max(1, Number(r?.maxHeavy) || DEFAULT_MAX_HEAVY);

  if (!r || r.status === '꺼짐') {
    return { id: r?.id || null, name: r?.name || '', level: 'down', maxRamPct, maxHeavy, activeHeavy, activeTotal, reason: '꺼짐' };
  }

  if (r.isThisMac) {
    if (!localStat || !localStat.memory?.total) {
      return { id: r.id, name: r.name, level: activeHeavy >= maxHeavy ? 'busy' : 'ok', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct: null, availGB: null, totalGB: null, diskFreeGB: null, loadRatio: null, reason: activeHeavy >= maxHeavy ? `무거운 작업 ${activeHeavy}개 실행 중` : '여유' };
    }
    const total = localStat.memory.total;
    const avail = Math.max(0, localStat.memory.available ?? 0);
    const ramPct = Math.round((1 - avail / total) * 100);
    const availGB = Math.round((avail / 1024 ** 3) * 10) / 10;
    const totalGB = Math.round((total / 1024 ** 3) * 10) / 10;
    const diskFreeGB = localStat.disk ? Math.round((localStat.disk.free / 1024 ** 3) * 10) / 10 : null;
    const cpus = Math.max(1, Number(localStat.cpus) || 1);
    const load1 = Number(localStat.load?.[0]) || 0;
    const loadRatio = Math.round((load1 / cpus) * 100) / 100;

    if (ramPct >= maxRamPct || availGB < DEFAULT_MIN_FREE_GB) {
      return { id: r.id, name: r.name, level: 'overload', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `RAM ${ramPct}% (여유 ${availGB}GB · 상한 ${maxRamPct}%)` };
    }
    if (diskFreeGB !== null && diskFreeGB < DEFAULT_MIN_DISK_GB) {
      return { id: r.id, name: r.name, level: 'overload', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `디스크 여유 ${diskFreeGB}GB 부족` };
    }
    if (activeHeavy >= maxHeavy) {
      return { id: r.id, name: r.name, level: 'busy', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `무거운 작업 ${activeHeavy}/${maxHeavy} 실행 중 · RAM ${ramPct}%` };
    }
    if (ramPct >= maxRamPct - 10 || loadRatio >= 1.5) {
      return { id: r.id, name: r.name, level: 'busy', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `혼잡 (RAM ${ramPct}% · 부하 ${load1})` };
    }
    return { id: r.id, name: r.name, level: 'ok', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `RAM ${ramPct}% · 여유 ${availGB}GB` };
  }

  // 원격 사무실 컴퓨터 (SSH 연결 또는 일반 등록 기계)
  const o = officeView || null;
  if (o && o.state === 'down') {
    return { id: r.id, name: r.name, level: 'down', maxRamPct, maxHeavy, activeHeavy, activeTotal, reason: o.reason || '연결 안 됨' };
  }
  if (o && o.state === 'busy') {
    return { id: r.id, name: r.name, level: 'busy', maxRamPct, maxHeavy, activeHeavy: Math.max(1, activeHeavy), activeTotal: Math.max(1, activeTotal), reason: o.title ? `실행 중: ${o.title}` : '다른 작업 실행 중' };
  }
  if (r.lastCheck && r.lastCheck.ok === false) {
    return { id: r.id, name: r.name, level: 'down', maxRamPct, maxHeavy, activeHeavy, activeTotal, reason: r.lastCheck.reason || '연결 안 됨' };
  }
  if (r.health && typeof r.health.ramPct === 'number') {
    const { ramPct, availGB, totalGB, diskFreeGB, loadRatio } = r.health;
    if (ramPct >= maxRamPct || (typeof availGB === 'number' && availGB < DEFAULT_MIN_FREE_GB)) {
      return { id: r.id, name: r.name, level: 'overload', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `RAM ${ramPct}% (상한 ${maxRamPct}%)` };
    }
    if (ramPct >= maxRamPct - 10 || activeHeavy >= maxHeavy) {
      return { id: r.id, name: r.name, level: 'busy', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `혼잡 · RAM ${ramPct}%` };
    }
    return { id: r.id, name: r.name, level: 'ok', maxRamPct, maxHeavy, activeHeavy, activeTotal, ramPct, availGB, totalGB, diskFreeGB, loadRatio, reason: `RAM ${ramPct}%${availGB ? ` · 여유 ${availGB}GB` : ''}` };
  }
  const hasSsh = isOffice(r);
  return {
    id: r.id,
    name: r.name,
    level: activeHeavy >= maxHeavy ? 'busy' : 'ok',
    maxRamPct,
    maxHeavy,
    activeHeavy,
    activeTotal,
    reason: activeHeavy >= maxHeavy ? '다른 작업 실행 중' : hasSsh ? '연결 가능 · 쉬는 중' : '사용 가능',
  };
}

// 현재 실행 중인 작업 기준 컴퓨터별 활성 부하 계산
export function countMachineLoads(d, workingList = []) {
  const map = new Map();
  const add = (resId, heavy) => {
    if (!resId) return;
    const cur = map.get(resId) || { heavy: 0, total: 0 };
    cur.total++;
    if (heavy) cur.heavy++;
    map.set(resId, cur);
  };
  const thisMac = (d.resources || []).find((r) => r.kind === '기계' && r.isThisMac);
  for (const w of workingList) {
    const t = (d.tasks || []).find((x) => x.id === w.taskId);
    const e = (d.employees || []).find((x) => x.id === w.emp);
    const resId = w.kind === 'office'
      ? (t?.remote?.res || t?.resource)
      : (t?.resource && (d.resources || []).find((r) => r.id === t.resource && r.kind === '기계')?.id) || thisMac?.id;
    add(resId, isHeavyTask(t, e));
  }
  return map;
}

export function buildMachineHealthMap(d, { localStat = null, offices = [], workingList = [] } = {}) {
  const loads = countMachineLoads(d, workingList);
  const byOffice = new Map((offices || []).map((o) => [o.id, o]));
  const out = new Map();
  for (const r of (d.resources || []).filter((x) => x.kind === '기계')) {
    const ld = loads.get(r.id) || { heavy: 0, total: 0 };
    out.set(r.id, evaluateMachineHealth(r, {
      localStat: r.isThisMac ? localStat : null,
      officeView: byOffice.get(r.id) || null,
      activeHeavy: ld.heavy,
      activeTotal: ld.total,
    }));
  }
  return out;
}

// 이 작업에 최적인 컴퓨터 자동 선택 (무게·명시·건강·대체 순위 반영)
// 반환: { resource, health, rerouted, queued, reason }
export function pickOptimalMachine(d, task, emp, {
  localStat = null,
  offices = [],
  workingList = [],
  preferredResId = null,
  requireRunnableHost = false, // true: 실제 실행 시 SSH 가능 사무실 또는 이 컴퓨터만 후보
} = {}) {
  const machines = (d.resources || []).filter((r) => r.kind === '기계' && r.status !== '꺼짐');
  if (!machines.length) return { resource: null, health: null, rerouted: false, queued: false, reason: '' };

  const healthMap = buildMachineHealthMap(d, { localStat, offices, workingList });
  const heavy = isHeavyTask(task, emp);
  const full = `${task?.title || ''} ${task?.note || ''}`.toLowerCase();
  const thisMac = machines.find((r) => r.isThisMac) || null;
  const studio = machines.find((r) => /(스튜디오|studio)/i.test(r.name)) || null;
  const jobTemplate = task?.officeJob?.template || (heavy ? 'blender-render' : 'ai-text');

  // 1) 1순위 컴퓨터 결정: 명시 지정 > 프롬프트 내 기계 이름 > 무거운 일(스튜디오) > 가벼운 일(이 컴퓨터)
  let primary = preferredResId ? machines.find((r) => r.id === preferredResId) || null : null;
  if (!primary) {
    primary = machines.find((r) => !r.isThisMac && r.name.length >= 2 && full.includes(r.name.toLowerCase().split('(')[0].trim())) || null;
  }
  if (!primary && heavy && studio) primary = studio;
  if (!primary && thisMac) primary = thisMac;
  if (!primary) primary = machines[0];

  const canHandle = (r) => {
    if (!r) return false;
    if (requireRunnableHost && !r.isThisMac && !isOffice(r)) return false;
    if (requireRunnableHost && !r.isThisMac && !allowedTemplates(r).includes(jobTemplate)) return false;
    const h = healthMap.get(r.id);
    if (!h) return true;
    if (h.level === 'down' || h.level === 'overload') return false;
    if (heavy && h.level === 'busy') return false;
    return true;
  };

  const pHealth = healthMap.get(primary.id);
  if (canHandle(primary)) {
    return {
      resource: primary,
      health: pHealth,
      rerouted: false,
      queued: false,
      reason: pHealth?.reason ? `${primary.name} (${pHealth.reason})` : primary.name,
    };
  }

  // 2) 1순위가 과부하/혼잡/꺼짐 → 대체 컴퓨터 체인(fallbackTo) 탐색
  const visited = new Set([primary.id]);
  let cur = primary;
  while (cur && cur.fallbackTo && !visited.has(cur.fallbackTo)) {
    visited.add(cur.fallbackTo);
    const fb = machines.find((r) => r.id === cur.fallbackTo);
    if (!fb) break;
    if (canHandle(fb)) {
      const fh = healthMap.get(fb.id);
      return {
        resource: fb,
        health: fh,
        rerouted: true,
        fromResource: primary,
        queued: false,
        reason: `${primary.name} ${pHealth?.reason || '혼잡'} → 대체 컴퓨터 ${fb.name}로 우회`,
      };
    }
    cur = fb;
  }

  // 3) 체인에 없거나 모두 바쁠 때 → 여유 있는 다른 컴퓨터 점수순 탐색
  if (d.settings?.autoOptimize !== false) {
    const alts = machines.filter((r) => !visited.has(r.id) && canHandle(r));
    if (alts.length) {
      const rank = (r) => {
        const h = healthMap.get(r.id);
        let sc = h?.level === 'ok' ? 100 : 50;
        if (typeof h?.ramPct === 'number') sc += (100 - h.ramPct);
        if (heavy && /(스튜디오|studio)/i.test(r.name)) sc += 30;
        if (!heavy && r.isThisMac) sc += 20;
        return sc;
      };
      alts.sort((a, b) => rank(b) - rank(a));
      const best = alts[0];
      const bh = healthMap.get(best.id);
      return {
        resource: best,
        health: bh,
        rerouted: true,
        fromResource: primary,
        queued: false,
        reason: `${primary.name} ${pHealth?.reason || '혼잡'} → 여유 컴퓨터 ${best.name}로 우회`,
      };
    }
  }

  // 4) 모든 컴퓨터가 과부하/사용 중 → 뻗지 않도록 대기열(Queue) 보호
  return {
    resource: primary,
    health: pHealth,
    rerouted: false,
    queued: true,
    reason: `${primary.name} ${pHealth?.reason || '과부하'} · 대체 컴퓨터도 여유가 없어 대기열에서 기다립니다`,
  };
}
