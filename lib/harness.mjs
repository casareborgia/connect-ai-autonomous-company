// AI 에이전트 하네스 핵심 엔진 (Context Compaction · Progressive Disclosure · Deterministic Verification Sensor · Self-Repair)
// 최신 하네스 엔지니어링(Anthropic · OpenAI · Claude Code · Aside) 표준 원칙:
//   1) Context Compaction: 긴 스레드(예: 반복 작업 60건)를 최신 6건 + 대표 지시 + 압축 체크포인트로 정제해 컨텍스트 부패(Context Rot) 방지.
//   2) Progressive Disclosure: 매칭되지 않은 기타 스킬은 1줄 색인으로만 제공해 시스템 프롬프트 비대화 차단.
//   3) Verification Sensors: 실행 완료 후 결정론적 검증 센서(빈 출력 · 런타임 막힘 · 승인 완료 후 재정지 · 말로만 약속)로 품질 점검.
//   4) Bounded Self-Repair: 복구 가능한 미달 항목은 최대 1회만 구체 피드백을 주입해 자동 보완 (무한 루프 · 미승인 게이트 우회 절대 금지).
import { nowIso, text } from './util.mjs';

export const HARD_BLOCKER_RE = /(?:누르지\s*못|게시하지\s*못|올리지\s*못|보내지\s*못|발송하지\s*못|완료하지\s*못|실행하지\s*못|Ego\s*Lite\s*연결이\s*끊|Failed\s+to\s+start\s+ego\s+lite|게시\s*상태는\s*\*?\*?미게시|접근이\s*거부됐|ECONNREFUSED|ERR_CONNECTION_REFUSED)/i;

// 이미 대표 승인(gateApprovedAt 또는 autoApprove)을 받은 일인데도 AI가 다시 승인을 묻고 멈춘 경우 감지
const PREMATURE_APPROVAL_STOP_RE = /(?:대표(?:님)?(?:의)?\s*(?:승인|확인|결재)(?:을|이|를)?\s*(?:기다리|받은\s*뒤|받으면|후에?\s*(?:진행|게시|업로드|등록|발송))|(?:승인|결재)\s*(?:요청을?\s*올렸|전이라\s*멈췄|해\s*주시면\s*(?:바로\s*)?(?:게시|업로드|등록|진행)))/i;

// 실제 결과물 없이 "진행하겠습니다 / 확인해 보겠습니다" 식의 짧은 미래형 약속만 남기고 끝난 경우 감지
const LAZY_PROMISE_RE = /^(?:에헴![^\n]*\n+)?(?:네[,!.\s]*|알겠습니다[,!.\s]*|좋습니다[,!.\s]*)?[\s\S]{0,110}(?:진행하겠습니다|확인해\s*보겠습니다|작업하겠습니다|처리하겠습니다|작성해\s*드리겠습니다|준비하겠습니다|살펴보겠습니다)[.!~\s]*$/i;

export function ensureHarnessStats(d) {
  if (!d || typeof d !== 'object') return defaultHarnessStats();
  if (!d.harnessStats || typeof d.harnessStats !== 'object') d.harnessStats = defaultHarnessStats();
  const hs = d.harnessStats;
  for (const k of ['verifiedTotal', 'verifiedPassed', 'verifiedFailed', 'selfRepaired', 'compactions', 'compactedCharsSaved']) {
    if (!Number.isFinite(Number(hs[k]))) hs[k] = 0;
  }
  return hs;
}

export function defaultHarnessStats() {
  return {
    verifiedTotal: 0,
    verifiedPassed: 0,
    verifiedFailed: 0,
    selfRepaired: 0,
    compactions: 0,
    compactedCharsSaved: 0,
  };
}

function formatMessageLine(m, d, nameOf) {
  const who = `${nameOf(d, m.from)}${m.fromKind === 'ai' ? ' (AI)' : m.fromKind === 'human' ? ' (사람)' : ''}${m.imported ? ' (가져옴)' : ''}`;
  if (m.kind === 'handoff' && m.handoff) {
    return `${who} 인수인계: 한 것: ${m.handoff.done || '-'} / 멈춘 곳: ${m.handoff.stuck || '-'} / 이유: ${m.handoff.why || '-'}${m.handoff.files?.length ? ` / 파일: ${m.handoff.files.join(', ')}` : ''}`;
  }
  if (m.kind === 'transcript') return `${who} 작업 기록 요약: ${m.summary || ''}`;
  return `${who}: ${m.text}`;
}

// 긴 스레드 자동 압축: 대표(사람) 메시지와 최근 6건은 보존하고, 오래된 AI/시스템 반복 로그는 체크포인트 1블록으로 압축
export function compactThreadForPrompt(messages = [], d = null, { nameOf = (_, id) => id, maxRecent = 6, maxChars = 4200 } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  if (!list.length) {
    return { lines: [], compacted: false, originalCount: 0, keptCount: 0, savedChars: 0 };
  }
  const fullLines = list.map((m) => formatMessageLine(m, d, nameOf));
  const rawTotalChars = fullLines.reduce((sum, l) => sum + l.length + 1, 0);

  if (list.length <= maxRecent && rawTotalChars <= maxChars) {
    return { lines: fullLines, compacted: false, originalCount: list.length, keptCount: list.length, savedChars: 0 };
  }

  const splitIdx = Math.max(0, list.length - maxRecent);
  const older = list.slice(0, splitIdx);
  const recent = list.slice(splitIdx);

  const lines = [];
  if (older.length) {
    const olderResults = older.filter((m) => m.kind === 'result');
    const olderHuman = older.filter((m) => m.fromKind === 'human' && m.text).slice(-3);
    const olderHandoff = [...older].reverse().find((m) => m.kind === 'handoff' && m.handoff);
    const lastOlderResult = olderResults[olderResults.length - 1];
    const lastHint = lastOlderResult ? text(String(lastOlderResult.text || '').replace(/\s+/g, ' '), 160) : '';
    lines.push(`[이전 스레드 자동 압축 · 총 ${list.length}건 중 앞 ${older.length}건 요약 · 이전 결과 ${olderResults.length}건${lastHint ? ` · 직전 핵심: ${lastHint}` : ''}]`);
    for (const hm of olderHuman) {
      lines.push(`[대표 이전 지시] ${text(formatMessageLine(hm, d, nameOf), 320)}`);
    }
    if (olderHandoff) {
      lines.push(`[이전 인수인계] ${text(formatMessageLine(olderHandoff, d, nameOf), 320)}`);
    }
  }

  for (const m of recent) {
    const rawLine = formatMessageLine(m, d, nameOf);
    const limit = m.fromKind === 'human' ? 600 : 720;
    lines.push(rawLine.length > limit ? `${rawLine.slice(0, limit)}…` : rawLine);
  }

  // 최종 글자 예산 강제 준수 (가장 오래된 비-사람 줄부터 정리)
  let total = lines.reduce((s, l) => s + l.length + 1, 0);
  while (total > maxChars && lines.length > 2) {
    const dropIdx = lines.findIndex((l, idx) => idx > 0 && idx < lines.length - 2 && !l.startsWith('[대표 이전 지시]'));
    const removeAt = dropIdx >= 0 ? dropIdx : 0;
    const [removed] = lines.splice(removeAt, 1);
    total -= (removed.length + 1);
  }

  const savedChars = Math.max(0, rawTotalChars - total);
  return {
    lines,
    compacted: true,
    originalCount: list.length,
    keptCount: lines.length,
    savedChars,
  };
}

// Progressive Disclosure: 현재 작업과 직접 매칭되지 않은 기타 스킬은 1줄 색인으로만 제공
export function formatProgressiveSkillsBlock(otherSkills = []) {
  if (!Array.isArray(otherSkills) || !otherSkills.length) return '';
  const names = otherSkills
    .slice(0, 12)
    .map((x) => `${x.name}${x.command ? `(${x.command})` : ''}`)
    .filter(Boolean);
  if (!names.length) return '';
  return `보유 중인 기타 스킬 (필요 시 활용): ${names.join(', ')}`;
}

// 결정론적 완료 검증 센서 (Verification Sensor)
export function verifyRunOutcome({ task = null, output = '', ok = true, code = 0, hung = false, aborted = false, routine = null } = {}) {
  const raw = String(output || '').trim();
  const stripped = raw
    .replace(/^에헴![^\n]*\n?/i, '')
    .replace(/^멍!\s*솜이가[^\n]*\n?/i, '')
    .trim();

  const exitOk = Boolean(ok && !hung && !aborted && (code === 0 || code === null || code === undefined));
  const nonEmpty = Boolean(stripped.length >= 8 && stripped !== '(출력 없음)');
  const noRuntimeBlocker = !HARD_BLOCKER_RE.test(raw);

  const isPreApproved = Boolean(
    (task?.gate && task?.gateApprovedAt)
    || ((task?.autoApprove || routine?.autoApprove) && (!task?.gate || ['게시', '업로드', '발송'].includes(task.gate))),
  );
  const prematureStop = Boolean(
    isPreApproved
    && PREMATURE_APPROVAL_STOP_RE.test(raw)
    && !/(?:게시\s*완료|등록\s*완료|답글\s*\d+건\s*(?:게시|등록)|업로드\s*완료|발송\s*완료|정상\s*노출\s*확인)/.test(raw),
  );
  const honoredApproval = !prematureStop;

  const isLazyPromise = Boolean(
    exitOk
    && stripped.length > 0
    && stripped.length <= 130
    && LAZY_PROMISE_RE.test(stripped)
    && !/(?:완료|저장|생성|작성했|정리했|확인했|http|\/Users\/|\d+건|변동\s*없음)/.test(stripped),
  );
  const noLazyPromise = !isLazyPromise;

  const checks = {
    exit_ok: exitOk,
    non_empty: nonEmpty,
    no_runtime_blocker: noRuntimeBlocker,
    honored_approval: honoredApproval,
    no_lazy_promise: noLazyPromise,
  };

  const issues = [];
  if (!exitOk) {
    issues.push({
      code: hung ? 'hung' : 'exit_failed',
      severity: 'error',
      message: hung ? '무응답(먹통)으로 중단됨' : `실행 종료 코드 ${code}`,
      fixHint: '실패 원인을 확인하고 필요한 도구 호출을 다시 수행하세요.',
    });
  }
  if (exitOk && !nonEmpty) {
    issues.push({
      code: 'empty_output',
      severity: 'warn',
      message: '결과 출력이 비어 있음',
      fixHint: '대표가 바로 읽을 수 있는 구체적인 실행 결과 요약을 한국어로 출력하세요.',
    });
  }
  if (!noRuntimeBlocker) {
    issues.push({
      code: 'runtime_blocker',
      severity: 'error',
      message: '실행 중 도구·브라우저·권한 막힘 감지',
      fixHint: '막힌 원인(브라우저 연결/권한/요소)을 점검하거나 대체 경로로 완료하세요.',
    });
  }
  if (!honoredApproval) {
    issues.push({
      code: 'premature_stop_after_approval',
      severity: 'warn',
      message: '대표 승인 완료 작업인데 다시 승인을 묻고 멈춤',
      fixHint: '이미 대표 승인이 완료된 작업입니다. 다시 승인을 묻지 말고 실제 실행(게시/등록/업로드)까지 끝까지 완료한 뒤 결과를 보고하세요.',
    });
  }
  if (!noLazyPromise) {
    issues.push({
      code: 'lazy_promise',
      severity: 'warn',
      message: '실제 작업 결과 없이 진행 예정 문구만 출력됨',
      fixHint: '"진행하겠습니다"만 쓰지 말고 지금 바로 실제 작업(조회·작성·실행)을 끝낸 뒤 구체적 결과를 보고하세요.',
    });
  }

  const checkValues = Object.values(checks);
  const passCount = checkValues.filter(Boolean).length;
  const score = Math.round((passCount / checkValues.length) * 100);
  const passed = issues.length === 0;

  // 복구 가능한 미달(빈 출력, 승인 후 재정지, 말로만 약속)만 1회 자동 보완 대상 (미승인 게이트 절대 우회 안 함)
  const hasUnapprovedGate = Boolean(task?.gate && !task?.gateApprovedAt);
  const retryableCodes = new Set(['empty_output', 'premature_stop_after_approval', 'lazy_promise']);
  const retryable = Boolean(
    !passed
    && !aborted
    && !hung
    && exitOk
    && noRuntimeBlocker
    && !hasUnapprovedGate
    && issues.every((i) => retryableCodes.has(i.code)),
  );

  return {
    passed,
    score,
    retryable,
    blocked: !noRuntimeBlocker,
    issues,
    checks,
    verifiedAt: nowIso(),
  };
}

export function buildRepairFeedbackBlock(verification) {
  if (!verification || verification.passed || !Array.isArray(verification.issues) || !verification.issues.length) return '';
  const lines = [
    '[하네스 자동 검증 피드백 · 보완 실행 1/1]',
    '직전 실행에서 아래 항목이 미달로 감지되었습니다. 이번 실행에서는 반드시 해결해 끝까지 완료하세요:',
    ...verification.issues.map((i) => `- ${i.message} → ${i.fixHint}`),
  ];
  return lines.join('\n');
}

export function recordVerificationStat(d, verification, { wasRepair = false } = {}) {
  const hs = ensureHarnessStats(d);
  hs.verifiedTotal++;
  if (verification?.passed) {
    hs.verifiedPassed++;
    if (wasRepair) hs.selfRepaired++;
  } else {
    hs.verifiedFailed++;
  }
}

export function recordCompactionStat(d, comp) {
  if (!comp?.compacted) return;
  const hs = ensureHarnessStats(d);
  hs.compactions++;
  hs.compactedCharsSaved += Number(comp.savedChars) || 0;
}

export function summarizeHarnessStats(d, memorySummary) {
  const hs = ensureHarnessStats(d);
  const passRate = hs.verifiedTotal > 0 ? Math.round((hs.verifiedPassed / hs.verifiedTotal) * 100) : null;
  return {
    autoMemory: d.settings?.autoMemory !== false,
    autoVerify: d.settings?.autoVerify !== false,
    memory: memorySummary,
    verification: {
      total: hs.verifiedTotal,
      passed: hs.verifiedPassed,
      failed: hs.verifiedFailed,
      repaired: hs.selfRepaired,
      passRate,
    },
    compaction: {
      total: hs.compactions,
      savedChars: hs.compactedCharsSaved,
    },
  };
}
