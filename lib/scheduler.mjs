// 매일 할 일 → 오늘 할 일 만들기, 습관 알람 (macOS 알림), AI 자동 실행 깨우기.
// 30초마다 한 번 확인한다. 알람은 기본 꺼짐.
import { execFile } from 'node:child_process';
import { ymd, hm, nowIso, nextId, orderFor } from './util.mjs';
import { cloneRoutineSteps } from './steps.mjs';

const fired = new Set();

function asString(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function notify(title, body) {
  return new Promise((resolve) => {
    const script = `display notification ${asString(body)} with title ${asString(title)} sound name "Glass"`;
    execFile('/usr/bin/osascript', ['-e', script], { timeout: 5000 }, (err) => resolve(!err));
  });
}

export function minutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// 자는 시간 { from, to } 안인가 (자정을 넘겨도 됨)
export function isQuiet(q, now = new Date()) {
  if (!q || !q.from || !q.to) return false;
  const cur = minutes(hm(now));
  const a = minutes(q.from);
  const b = minutes(q.to);
  return a < b ? cur >= a && cur < b : cur >= a || cur < b;
}

export function routineActive(r, features) {
  return r.enabled !== false && (!r.feature || Boolean(features?.[r.feature]));
}

// 지금 울려야 할 사람 습관 (정해진 시각부터 3분 안, 오늘 아직 안 울린 것)
export function dueAlarms(routines, now = new Date(), features = {}) {
  const day = now.getDay();
  const cur = minutes(hm(now));
  const date = ymd(now);
  return routines.filter((r) => {
    if (!routineActive(r, features) || r.assignee !== 'jay' || !r.alarm || !r.time || !r.days.includes(day)) return false;
    const diff = cur - minutes(r.time);
    return diff >= 0 && diff < 3 && !fired.has(`${r.id}|${date}`);
  });
}

export const INTERVAL_MINS = [5, 15, 30, 60];

// 반복 간격 루틴(예: 5분마다 이메일 체크)이 다시 돌아야 할 시점인가
export function intervalDue(r, now = new Date()) {
  const iv = Number(r?.intervalMin);
  if (!iv || iv < 1) return false;
  if (!r.lastIntervalAt) return true;
  const elapsed = now.getTime() - Date.parse(r.lastIntervalAt);
  return Number.isNaN(elapsed) || elapsed >= iv * 60 * 1000;
}

// 켜진 매일 할 일마다 오늘 할 일을 하나 만든다 (이미 있으면 그대로). 담당은 매일 할 일에 정한 그대로.
// intervalMin(5분/15분/30분/1시간마다)이 켜진 AI 루틴은 완료된 뒤 주기가 지나면 다시 대기 상태로 돌려 반복한다.
export function ensureRoutineTasks(draft, now = new Date()) {
  const date = ymd(now);
  let created = 0;
  for (const r of draft.routines) {
    if (!routineActive(r, draft.settings.features) || !r.days.includes(now.getDay())) continue;
    const existing = draft.tasks.find((t) => t.routineId === r.id && t.date === date);
    if (existing) {
      if (r.intervalMin && existing.status === '완료' && intervalDue(r, now)) {
        existing.status = '대기';
        existing.runStartedAt = null;
        existing.handedAt = null;
        existing.relayedAt = null;
        if (existing.gate) existing.gateApprovedAt = null;
        if (Array.isArray(r.steps) && r.steps.length) existing.steps = cloneRoutineSteps(r.steps);
        existing.time = hm(now);
        existing.reason = `${r.intervalMin}분마다 반복 · 다시 확인`;
        r.lastIntervalAt = nowIso();
        created++;
      }
      continue;
    }
    const steps = cloneRoutineSteps(r.steps);
    const stepMode = r.stepMode === 'parallel' ? 'parallel' : 'serial';
    const first = steps.length && stepMode === 'serial' ? steps[0] : null;
    const initAssignee = first ? first.assignee : r.assignee;
    const t = {
      id: nextId(draft, 't'), order: 0, title: r.title, kind: initAssignee === 'jay' ? 'human' : 'ai', assignee: initAssignee,
      date, time: r.intervalMin ? hm(now) : r.time, status: '대기', note: r.instruction || r.where || '',
      resource: (first && first.resource) || r.resource || null,
      account: r.account || null,
      browser: (first && first.browser) || r.browser || null,
      design: (first && first.design) || r.design || null,
      tools: first && first.tools?.length ? [...first.tools] : [...(r.tools || [])],
      estCost: r.estCost ?? null,
      intervalMin: r.intervalMin || null,
      stepMode, sharedFolder: r.sharedFolder || '', steps,
      gate: r.gate || null, gateApprovedAt: null,
      reason: steps.length ? (stepMode === 'parallel' ? `동시 협업 0/${steps.length} 완료` : `협업 1/${steps.length}단계 · ${first.title}`) : (r.intervalMin ? `${r.intervalMin}분마다 반복` : (r.reason || '매일 할 일')),
      assignSource: 'routine', routineId: r.id, jobId: null,
      createdAt: nowIso(), createdBy: 'system', history: [], runStartedAt: null,
    };
    if (r.intervalMin) r.lastIntervalAt = nowIso();
    t.order = orderFor(draft, t);
    draft.tasks.push(t);
    created++;
  }
  return created;
}

export function startScheduler(store, { autoRun, log = console.log } = {}) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    const now = new Date();
    try {
      const d = store.data;
      const date = ymd(now);
      const need = d.routines.some((r) => {
        if (!routineActive(r, d.settings.features) || !r.days.includes(now.getDay())) return false;
        const ex = d.tasks.find((t) => t.routineId === r.id && t.date === date);
        if (!ex) return true;
        return Boolean(r.intervalMin && ex.status === '완료' && intervalDue(r, now));
      });
      if (need) await store.mutate((x) => ensureRoutineTasks(x, now));
      if (d.settings.alarmsEnabled) {
        for (const r of dueAlarms(d.routines, now, d.settings.features)) {
          fired.add(`${r.id}|${date}`);
          const ok = await notify('AI 회사 본사 · 매일 할 일', `${r.time} ${r.title}${r.where ? ` (${r.where})` : ''}`);
          log(`[알람] ${r.time} ${r.title} ${ok ? '보냄' : '실패'}`);
        }
      }
      if (autoRun) await autoRun(now);
    } catch (e) {
      log(`[스케줄러] ${e.message}`);
    } finally {
      busy = false;
    }
  };
  tick();
  return setInterval(tick, 30 * 1000);
}
