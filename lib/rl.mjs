// 대표 의사결정 기억 + 강화학습(RLHF / DPO) 데이터 축적 & 온라인 정책 학습 엔진
// 원칙:
//   1) 모든 결재(승인 / 수정 후 승인 / 반려)를 구조화된 보상(reward)과 선호도 쌍(chosen vs rejected)으로 로컬에만 기록한다.
//   2) 비슷한 상황의 다음 작업 프롬프트에 대표의 최근 수정·반려 기준을 자동 주입해 즉시 똑똑해진다.
//   3) ~/.connect-ai-hq/data/rl-decisions.jsonl 에 표준 DPO JSONL을 누적 저장해 추후 로컬 모델 파인튜닝에 바로 쓴다.
//   4) 결제·삭제는 몇 번 승인해도 절대 자동 승격하지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso, text } from './util.mjs';

export const RL_NEVER_AUTO_KINDS = new Set(['결제', '삭제']);
export const RL_PROMOTE_STREAK = 3;
const MAX_POLICY_MEMORY = 60;

export function rlJsonlPath(dataDir) {
  return path.join(dataDir, 'rl-decisions.jsonl');
}

export function normalizeOriginalText(orig) {
  if (!orig) return '';
  if (typeof orig === 'string') return text(orig, 800);
  if (typeof orig === 'object') {
    const author = orig.author || orig.from || orig.user || '';
    const body = orig.text || orig.comment || orig.body || orig.content || orig.message || '';
    const line = [author, body].filter(Boolean).join(': ');
    return text(line || JSON.stringify(orig), 800);
  }
  return text(String(orig), 800);
}

export function buildDecisionPrompt(approval, task = null) {
  const parts = [
    approval.kind ? `[유형: ${approval.kind}]` : '',
    approval.accountName ? `[채널: ${approval.accountName}${approval.accountAction ? ` · ${approval.accountAction}` : ''}]` : '',
    approval.what ? `요청: ${approval.what}` : '',
    task?.title ? `할 일: ${task.title}` : '',
    approval.original ? `원본 맥락: ${normalizeOriginalText(approval.original)}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export function createDecisionRecord(approval, { decision, finalText = null, note = '', task = null } = {}) {
  const draft = typeof approval.draft === 'string' ? approval.draft.trim() : '';
  const chosenRaw = decision === '승인' ? (typeof finalText === 'string' && finalText.trim() ? finalText.trim() : draft) : '';
  const edited = Boolean(decision === '승인' && draft && chosenRaw && chosenRaw !== draft);
  const outcome = decision === '반려' ? 'rejected' : edited ? 'edited' : 'approved';
  const reward = outcome === 'approved' ? 1.0 : outcome === 'edited' ? 0.6 : -1.0;
  const prompt = buildDecisionPrompt(approval, task);
  const cleanNote = text(note || approval.decisionNote || '', 300);

  return {
    id: `rl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    ts: nowIso(),
    approvalId: approval.id || '',
    taskId: approval.taskId || '',
    emp: approval.from || '',
    kind: approval.kind || '기타',
    accountId: approval.accountId || null,
    accountName: approval.accountName || '',
    what: text(approval.what || '', 200),
    original: normalizeOriginalText(approval.original),
    prompt,
    draft: text(draft, 2000),
    decision,
    outcome,
    reward,
    chosen: outcome === 'approved' || outcome === 'edited' ? text(chosenRaw, 2000) : '',
    rejected: outcome === 'edited' ? text(draft, 2000) : outcome === 'rejected' ? text(draft || approval.what || '', 2000) : '',
    reason: cleanNote,
  };
}

export function pushDecisionMemory(d, rec) {
  if (!Array.isArray(d.decisionMemory)) d.decisionMemory = [];
  d.decisionMemory.unshift(rec);
  if (d.decisionMemory.length > MAX_POLICY_MEMORY) {
    d.decisionMemory = d.decisionMemory.slice(0, MAX_POLICY_MEMORY);
  }
}

export async function appendRlTrajectory(dataDir, rec) {
  if (!dataDir || !rec) return;
  const file = rlJsonlPath(dataDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const row = {
    id: rec.id,
    ts: rec.ts,
    kind: rec.kind,
    account: rec.accountName || '',
    emp: rec.emp || '',
    outcome: rec.outcome,
    reward: rec.reward,
    prompt: rec.prompt,
    ...(rec.chosen ? { chosen: rec.chosen } : {}),
    ...(rec.rejected ? { rejected: rec.rejected } : {}),
    ...(rec.reason ? { reason: rec.reason } : {}),
  };
  await fs.appendFile(file, `${JSON.stringify(row)}\n`, 'utf8');
}

// 비위험 유형(댓글/게시 등)에서 무수정 승인이 연속 N회 쌓이면 자동 실행 승격 후보 제안
export function checkAutoPromoteSuggestion(d, rec) {
  if (!rec || rec.outcome !== 'approved') return null;
  if (RL_NEVER_AUTO_KINDS.has(rec.kind)) return null;
  const list = Array.isArray(d.decisionMemory) ? d.decisionMemory : [];
  const same = list.filter((x) => x.kind === rec.kind && (x.accountId || '') === (rec.accountId || ''));
  let streak = 0;
  for (const item of same) {
    if (item.outcome === 'approved') streak++;
    else break;
  }
  if (streak < RL_PROMOTE_STREAK) return null;
  return {
    kind: rec.kind,
    accountId: rec.accountId || null,
    accountName: rec.accountName || '',
    streak,
    message: `${rec.accountName ? `${rec.accountName} ` : ''}${rec.kind}을 ${streak}번 연속 그대로 승인했어요 · 원하시면 바로 실행으로 전환할 수 있어요`,
  };
}

// 현재 작업과 관련된 대표의 과거 의사결정 기준(수정 선호 · 반려 이유)을 추출해 프롬프트에 자동 주입
export function resolveDecisionPolicyHints(d, { task = null, routine = null, max = 3 } = {}) {
  const list = Array.isArray(d?.decisionMemory) ? d.decisionMemory : [];
  if (!list.length) return [];
  const full = `${task?.title || ''} ${task?.note || ''} ${routine?.instruction || ''}`.toLowerCase();
  const accId = task?.account || routine?.account || null;

  const scored = list
    .filter((rec) => rec.outcome === 'edited' || rec.outcome === 'rejected' || (rec.outcome === 'approved' && rec.chosen))
    .map((rec) => {
      let score = 0;
      if (accId && rec.accountId && rec.accountId === accId) score += 6;
      if (rec.accountName && full.includes(rec.accountName.toLowerCase().split(' ')[0])) score += 3;
      if (rec.kind === '댓글 답글' && /(댓글|답글|유튜브|인스타|스레드|커뮤니티)/.test(full)) score += 4;
      if (rec.kind === '게시' && /(게시|포스팅|올려|트윗|스레드|인스타)/.test(full)) score += 3;
      if (rec.kind === '메시지 발송' && /(이메일|메일|메시지|발송|답장)/.test(full)) score += 4;
      // 수정 후 승인(선호쌍)과 반려(금지 기준)는 학습 가치가 가장 높다
      if (rec.outcome === 'edited') score += 3;
      if (rec.outcome === 'rejected') score += 2.5;
      // 키워드 겹침 가산
      const kws = `${rec.what} ${rec.reason}`.toLowerCase().split(/[^가-힣a-z0-9]+/).filter((w) => w.length >= 2);
      for (const w of kws.slice(0, 8)) if (full.includes(w)) score += 1;
      return { rec, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || String(b.rec.ts).localeCompare(String(a.rec.ts)));

  return scored.slice(0, max).map((x) => x.rec);
}

export function formatDecisionPolicyBlock(hints = []) {
  if (!hints.length) return '';
  const lines = ['대표의 과거 의사결정 기준 (승인·수정·반려 학습 메모리 · 반드시 반영):'];
  for (const h of hints) {
    const tag = h.accountName ? `${h.accountName} · ${h.kind}` : h.kind;
    if (h.outcome === 'edited') {
      lines.push(`- [수정 선호 · ${tag}] AI 초안("${h.rejected.slice(0, 90)}") → 대표 수정본("${h.chosen.slice(0, 140)}")${h.reason ? ` · 메모: ${h.reason}` : ''}`);
    } else if (h.outcome === 'rejected') {
      lines.push(`- [반려 기준 · ${tag}] "${h.what}" 거절됨${h.reason ? ` · 이유: ${h.reason}` : ''}`);
    } else if (h.chosen) {
      lines.push(`- [승인 선호 · ${tag}] 대표가 그대로 승인한 톤 참고: "${h.chosen.slice(0, 120)}"`);
    }
  }
  return lines.join('\n');
}

export function summarizeRlStats(d) {
  const list = Array.isArray(d?.decisionMemory) ? d.decisionMemory : [];
  const approved = list.filter((x) => x.outcome === 'approved').length;
  const edited = list.filter((x) => x.outcome === 'edited').length;
  const rejected = list.filter((x) => x.outcome === 'rejected').length;
  const dpoPairs = list.filter((x) => x.chosen && x.rejected).length;
  const avgReward = list.length
    ? Number((list.reduce((s, x) => s + (Number(x.reward) || 0), 0) / list.length).toFixed(2))
    : null;
  return {
    total: list.length,
    approved,
    edited,
    rejected,
    dpoPairs,
    avgReward,
    recent: list.slice(0, 8).map((x) => ({
      id: x.id, ts: x.ts, kind: x.kind, accountName: x.accountName, what: x.what,
      outcome: x.outcome, reward: x.reward, reason: x.reason,
      hasPair: Boolean(x.chosen && x.rejected),
    })),
  };
}

export async function readRlJsonl(dataDir) {
  try {
    return await fs.readFile(rlJsonlPath(dataDir), 'utf8');
  } catch {
    return '';
  }
}
