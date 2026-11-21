// 대표 헬스 · 컨디션 최적화 엔진 (로컬 전용 — 외부 공유·청사진·클라우드 AI 전송에서 완전 제외)
// Apple Health(iOS 단축어 / Health Auto Export), Android(Health Connect / MacroDroid / Tasker),
// 또는 대시보드 5초 빠른 기록을 통합해 대표 컨디션 점수·7일 추이·AI 위임 제안을 계산한다.
import crypto from 'node:crypto';
import { addDays, nowIso, text, ymd } from './util.mjs';

export const DEFAULT_HEALTH_GOALS = {
  steps: 8000,
  sleepHours: 7.5,
  exerciseMin: 30,
  restingHrMax: 75,
};

const clampNum = (v, min, max, decimals = 0) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const c = Math.max(min, Math.min(max, n));
  if (decimals <= 0) return Math.round(c);
  const f = 10 ** decimals;
  return Math.round(c * f) / f;
};

export function ensureHealth(d) {
  if (!d.health || typeof d.health !== 'object') d.health = {};
  if (!d.health.goals || typeof d.health.goals !== 'object') d.health.goals = { ...DEFAULT_HEALTH_GOALS };
  for (const [k, v] of Object.entries(DEFAULT_HEALTH_GOALS)) {
    if (!Number.isFinite(Number(d.health.goals[k]))) d.health.goals[k] = v;
  }
  if (!d.health.token || typeof d.health.token !== 'string' || d.health.token.length < 16) {
    d.health.token = crypto.randomBytes(16).toString('hex');
  }
  if (!d.health.entries || typeof d.health.entries !== 'object') d.health.entries = {};
  return d.health;
}

export function rotateHealthToken(d) {
  const h = ensureHealth(d);
  h.token = crypto.randomBytes(16).toString('hex');
  return h.token;
}

// Health Auto Export(iOS) 중첩 JSON 포맷까지 유연하게 파싱한다
function extractAutoExportMetrics(body) {
  const metrics = body?.data?.metrics;
  if (!Array.isArray(metrics)) return {};
  const out = {};
  for (const m of metrics) {
    const name = String(m?.name || '').toLowerCase();
    const rows = Array.isArray(m?.data) ? m.data : [];
    if (!rows.length) continue;
    const sumQty = () => rows.reduce((s, r) => s + (Number(r?.qty ?? r?.value ?? 0) || 0), 0);
    const lastVal = () => {
      const r = rows[rows.length - 1];
      return Number(r?.Avg ?? r?.avg ?? r?.qty ?? r?.value ?? NaN);
    };
    if (/step/.test(name)) out.steps = sumQty();
    else if (/resting_heart_rate/.test(name)) out.restingHr = lastVal();
    else if (/heart_rate_variability|hrv/.test(name)) out.hrv = lastVal();
    else if (/heart_rate/.test(name)) out.heartRate = lastVal();
    else if (/exercise_time|workout/.test(name)) out.exerciseMin = sumQty();
    else if (/sleep/.test(name)) {
      const r = rows[rows.length - 1];
      const totalHrs = Number(r?.totalSleep ?? r?.asleep ?? r?.qty ?? NaN);
      if (Number.isFinite(totalHrs)) out.sleepHours = totalHrs > 24 ? totalHrs / 60 : totalHrs;
    }
  }
  return out;
}

export function normalizeHealthPayload(body = {}, todayStr = ymd()) {
  const ae = extractAutoExportMetrics(body);
  const pick = (...keys) => {
    for (const k of keys) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== '') return body[k];
      if (ae[k] !== undefined && ae[k] !== null && ae[k] !== '') return ae[k];
    }
    return null;
  };
  const rawDate = String(body.date || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayStr;
  // 수면이 분 단위(예: 420)로 들어온 경우 시간(7.0)으로 자동 변환
  let sleepRaw = pick('sleepHours', 'sleep_hours', 'sleep');
  if (sleepRaw !== null && Number.isFinite(Number(sleepRaw)) && Number(sleepRaw) > 24 && Number(sleepRaw) <= 1440) {
    sleepRaw = Number(sleepRaw) / 60;
  }
  const steps = clampNum(pick('steps', 'stepCount', 'step_count'), 0, 200000, 0);
  const sleepHours = clampNum(sleepRaw, 0, 24, 1);
  const heartRate = clampNum(pick('heartRate', 'heart_rate', 'bpm', 'hr'), 30, 240, 0);
  const restingHr = clampNum(pick('restingHr', 'resting_hr', 'restingHeartRate'), 30, 200, 0);
  const hrv = clampNum(pick('hrv', 'heartRateVariability'), 1, 300, 0);
  const exerciseMin = clampNum(pick('exerciseMin', 'exercise_min', 'workoutMin', 'activeMin'), 0, 1440, 0);
  const energy = clampNum(pick('energy', 'mood', 'condition'), 1, 5, 0);
  const note = body.note !== undefined ? text(body.note, 200) : null;
  const source = text(body.source || (body?.data?.metrics ? 'health-auto-export' : 'manual'), 40) || 'manual';

  return {
    date,
    steps,
    sleepHours,
    heartRate,
    restingHr,
    hrv,
    exerciseMin,
    energy,
    note,
    source,
  };
}

export function ingestHealthEntry(d, body, todayStr = ymd()) {
  const h = ensureHealth(d);
  if (body.goals && typeof body.goals === 'object') {
    const g = body.goals;
    const steps = clampNum(g.steps, 1000, 50000, 0);
    const sleepHours = clampNum(g.sleepHours, 4, 12, 1);
    const exerciseMin = clampNum(g.exerciseMin, 5, 240, 0);
    const restingHrMax = clampNum(g.restingHrMax, 50, 110, 0);
    if (steps !== null) h.goals.steps = steps;
    if (sleepHours !== null) h.goals.sleepHours = sleepHours;
    if (exerciseMin !== null) h.goals.exerciseMin = exerciseMin;
    if (restingHrMax !== null) h.goals.restingHrMax = restingHrMax;
  }

  const norm = normalizeHealthPayload(body, todayStr);
  const hasAnyMetric = ['steps', 'sleepHours', 'heartRate', 'restingHr', 'hrv', 'exerciseMin', 'energy', 'note']
    .some((k) => norm[k] !== null && norm[k] !== '');

  let entry = h.entries[norm.date] || null;
  if (hasAnyMetric) {
    const prev = h.entries[norm.date] || { date: norm.date };
    const next = { ...prev, date: norm.date };
    for (const k of ['steps', 'sleepHours', 'heartRate', 'restingHr', 'hrv', 'exerciseMin', 'energy']) {
      if (norm[k] !== null) next[k] = norm[k];
    }
    if (norm.note !== null) next.note = norm.note;
    next.source = norm.source;
    next.updatedAt = nowIso();
    h.entries[norm.date] = next;
    entry = next;

    // 최근 90일만 유지
    const keys = Object.keys(h.entries).sort();
    for (const oldKey of keys.slice(0, Math.max(0, keys.length - 90))) delete h.entries[oldKey];
  }
  return entry;
}

export function scoreEntry(entry, goals = DEFAULT_HEALTH_GOALS, nowHour = 18, isToday = false) {
  if (!entry) return null;
  let weighted = 0;
  let weightSum = 0;

  // 1) 수면 (40%)
  if (typeof entry.sleepHours === 'number') {
    const ratio = entry.sleepHours / Math.max(4, goals.sleepHours || 7.5);
    const s = entry.sleepHours < 5 ? Math.max(20, ratio * 75) : Math.min(100, ratio * 100);
    weighted += s * 40;
    weightSum += 40;
  }

  // 2) 걸음 수 (30%) — 오늘은 현재 시각에 맞춰 기대 걸음을 부드럽게 보정
  if (typeof entry.steps === 'number') {
    const target = Math.max(1000, goals.steps || 8000);
    const pace = isToday ? Math.min(1, Math.max(0.25, (nowHour - 6) / 14)) : 1;
    const expected = target * pace;
    const s = Math.min(100, (entry.steps / Math.max(500, expected)) * 100);
    weighted += s * 30;
    weightSum += 30;
  }

  // 3) 운동 시간 (15%)
  if (typeof entry.exerciseMin === 'number') {
    const target = Math.max(10, goals.exerciseMin || 30);
    const s = Math.min(100, (entry.exerciseMin / target) * 100);
    weighted += s * 15;
    weightSum += 15;
  }

  // 4) 심박 / HRV / 체감 컨디션 (15%)
  const hrVal = typeof entry.restingHr === 'number' ? entry.restingHr : entry.heartRate;
  if (typeof entry.energy === 'number' || typeof hrVal === 'number') {
    let s = 80;
    if (typeof entry.energy === 'number') s = entry.energy * 20;
    if (typeof hrVal === 'number') {
      const hrMax = goals.restingHrMax || 75;
      const hrScore = hrVal <= hrMax ? 95 : Math.max(35, 95 - (hrVal - hrMax) * 3);
      s = typeof entry.energy === 'number' ? (s + hrScore) / 2 : hrScore;
    }
    weighted += s * 15;
    weightSum += 15;
  }

  if (!weightSum) return null;
  return Math.round(Math.max(0, Math.min(100, weighted / weightSum)));
}

const DAY_K = ['일', '월', '화', '수', '목', '금', '토'];

export function evaluateHealth(rawHealth, todayStr = ymd(), nowHour = new Date().getHours()) {
  const goals = { ...DEFAULT_HEALTH_GOALS, ...(rawHealth?.goals || {}) };
  const entries = rawHealth?.entries && typeof rawHealth.entries === 'object' ? rawHealth.entries : {};
  const today = entries[todayStr] || null;
  const allKeys = Object.keys(entries).sort();
  const latestKey = allKeys[allKeys.length - 1] || null;
  const latest = latestKey ? entries[latestKey] : null;
  const connected = allKeys.length > 0;

  // 7일 추이 (실제 기록만 숫자로, 없는 날은 null)
  const baseDate = new Date(`${todayStr}T12:00:00`);
  const trend7 = [];
  for (let i = 6; i >= 0; i--) {
    const dt = addDays(baseDate, -i);
    const key = ymd(dt);
    const e = entries[key] || null;
    trend7.push({
      date: key,
      label: i === 0 ? '오늘' : DAY_K[dt.getDay()],
      score: scoreEntry(e, goals, nowHour, i === 0),
      steps: typeof e?.steps === 'number' ? e.steps : null,
      sleepHours: typeof e?.sleepHours === 'number' ? e.sleepHours : null,
      heartRate: typeof e?.restingHr === 'number' ? e.restingHr : (typeof e?.heartRate === 'number' ? e.heartRate : null),
      exerciseMin: typeof e?.exerciseMin === 'number' ? e.exerciseMin : null,
    });
  }

  const active = today || (latest && latestKey >= ymd(addDays(baseDate, -1)) ? latest : null);
  const score = scoreEntry(active, goals, nowHour, Boolean(today));
  let level = 'none';
  let levelLabel = '연동 대기';
  let advice = '아이폰 단축어 · 안드로이드 헬스 연동 또는 5초 기록으로 대표 컨디션 최적화를 시작해 보세요.';
  let delegateRecommended = false;

  if (score !== null) {
    const lowSleep = typeof active?.sleepHours === 'number' && active.sleepHours < 6;
    const highHr = typeof (active?.restingHr ?? active?.heartRate) === 'number' && (active.restingHr ?? active.heartRate) > (goals.restingHrMax + 10);
    const lowStepsAfternoon = Boolean(today) && nowHour >= 14 && typeof today.steps === 'number' && today.steps < Math.round(goals.steps * 0.3);

    if (score >= 80 && !lowSleep) {
      level = 'best';
      levelLabel = '컨디션 최상';
      advice = '컨디션 최상 — 기획·촬영·의사결정에 집중하고, 조사·정리·반복 업무는 AI 직원에게 맡기세요.';
    } else if (score >= 60 && !lowSleep) {
      level = 'good';
      levelLabel = '컨디션 양호';
      advice = lowStepsAfternoon
        ? `오늘 걸음 ${(today.steps || 0).toLocaleString('ko-KR')}보 — 15분 산책이나 스트레칭 후 다음 업무를 이어가세요.`
        : '안정적인 컨디션입니다. AI 자동 루틴을 켜 두고 대표님은 핵심 결정에 집중하세요.';
    } else if (score >= 40) {
      level = 'caution';
      levelLabel = '컨디션 주의';
      delegateRecommended = true;
      advice = lowSleep
        ? `수면 ${active.sleepHours}시간으로 피로 주의 — 오늘 직접 할 일은 핵심 2~3개만 남기고 나머지는 AI 직원에게 넘기세요.`
        : highHr
          ? `심박(${active.restingHr ?? active.heartRate} bpm)이 평소보다 높아요 — 무리한 일정은 줄이고 AI 위임을 늘리세요.`
          : '컨디션 주의 구간 — 단순 반복·조사 업무는 AI에게 맡기고 휴식 시간을 확보하세요.';
    } else {
      level = 'rest';
      levelLabel = '휴식 우선';
      delegateRecommended = true;
      advice = '회복이 먼저입니다 — 오늘은 꼭 필요한 결재·연락만 챙기고, 나머지 업무는 AI 자동 루틴과 내일로 미루세요.';
    }
  }

  return {
    connected,
    score,
    level,
    levelLabel,
    advice,
    delegateRecommended,
    today: today ? { ...today } : null,
    activeDate: active?.date || null,
    goals,
    trend7,
    lastSyncAt: latest?.updatedAt || null,
    lastSource: latest?.source || null,
  };
}
