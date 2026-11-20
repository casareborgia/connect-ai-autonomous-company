// 큰 할 일·매일 루틴 하나를 여러 AI 직원과 사무실(HQ, Office 1, Office 2)이 나눠 협업하는 단계 워크플로우.
import { STATUSES, nowIso, text } from './util.mjs';
import { ruleAssign } from './assign.mjs';

export const STEP_MODES = ['serial', 'parallel'];
export const STEP_MODE_LABELS = { serial: '순서대로 (릴레이)', parallel: '동시에 함께 (병렬)' };

export const STEP_TEMPLATES = [
  {
    key: 'video-edit',
    label: '영상 편집 4단계',
    mode: 'serial',
    steps: [
      { title: '자막 추출 · 컷 포인트 정리', note: '영상 원본에서 자막을 뽑고 편집할 핵심 구간 타임코드 정리', officeSlot: 0 },
      { title: '블렌더 3D 모델링', note: '필요한 3D 씬 제작 및 렌더 결과를 공유 폴더에 저장', officeSlot: 1 },
      { title: '모션 그래픽 만들기', note: '자막·포인트에 맞춘 모션 그래픽 클립 생성 후 공유 폴더 저장', officeSlot: 2 },
      { title: '최종 확인 · 유튜브 비공개 등록', note: '합성 결과 확인 후 제목·설명·썸네일과 함께 비공개로 등록', officeSlot: 0 },
    ],
  },
  {
    key: 'content-pipeline',
    label: '리버스 해부 → 멀티채널 3단계',
    mode: 'serial',
    steps: [
      { title: '리버스 비즈니스 서비스 해부', note: '참고 서비스 1개의 구조·가격·유입 경로를 6칸으로 분석', officeSlot: 0 },
      { title: '블로그·SNS 6채널 초안 작성', note: '해부 결과에서 유튜브 쇼츠·인스타·네이버 블로그·클립 초안 작성', officeSlot: 1 },
      { title: '네이버 블로그·유튜브 임시저장', note: 'Ego Lite로 로그인된 채널에 임시저장까지만 준비하고 대표 결재 요청', officeSlot: 0 },
    ],
  },
];

export function nextStepId(steps = []) {
  let max = 0;
  for (const s of steps) {
    const m = /^s(\d+)$/.exec(String(s?.id || ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

export function normalizeStep(raw, d, { asTemplate = false, fallbackId = 's1' } = {}) {
  const title = text(raw?.title, 200);
  if (!title) return null;
  const validEmp = (v) => (v === 'jay' ? 'jay' : (d.employees || []).some((e) => e.id === v) ? v : null);
  const validRes = (v) => ((d.resources || []).some((r) => r.id === v && !['브라우저', '오픈소스'].includes(r.kind)) ? v : null);
  const validBr = (v) => ((d.resources || []).some((r) => r.id === v && r.kind === '브라우저') ? v : null);
  const validTools = (arr) => (Array.isArray(arr) ? [...new Set(arr.map(String))].filter((id) => (d.resources || []).some((r) => r.id === id && r.kind === '오픈소스')).slice(0, 4) : []);
  const status = asTemplate ? '대기' : (STATUSES.includes(raw?.status) ? raw.status : '대기');
  return {
    id: /^s\d+$/.test(String(raw?.id || '')) ? String(raw.id) : fallbackId,
    title,
    assignee: validEmp(raw?.assignee),
    resource: validRes(raw?.resource),
    browser: validBr(raw?.browser),
    tools: validTools(raw?.tools),
    note: text(raw?.note, 500),
    status,
    doneAt: asTemplate || status !== '완료' ? null : (raw?.doneAt || nowIso()),
    doneBy: asTemplate || status !== '완료' ? null : (raw?.doneBy || null),
    output: asTemplate ? '' : text(raw?.output, 2000),
  };
}

export function normalizeSteps(list, d, { asTemplate = false } = {}) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, 20)) {
    let id = /^s\d+$/.test(String(raw?.id || '')) && !seen.has(String(raw.id)) ? String(raw.id) : nextStepId(out);
    const s = normalizeStep(raw, d, { asTemplate, fallbackId: id });
    if (!s) continue;
    s.id = id;
    seen.add(id);
    out.push(s);
  }
  return out;
}

// 사무실 기계 정렬: [0] = 이 맥(HQ), [1] = 맥 스튜디오 우선, [2+] = 나머지 사무실(Office 2 등)
function orderedOffices(resources = []) {
  const machines = resources.filter((r) => r.kind === '기계' && r.status !== '꺼짐');
  const hq = machines.find((r) => r.isThisMac) || machines[0] || null;
  const others = machines.filter((r) => r !== hq);
  const studio = others.find((r) => /스튜디오|studio|office\s*1/i.test(r.name));
  const rest = others.filter((r) => r !== studio);
  return [hq, studio, ...rest].filter(Boolean);
}

export function autoFillStep(title, note, d, { officeSlot = null } = {}) {
  const s = ruleAssign(title, note || '', d.employees || [], d.resources || []);
  let resource = s.resource || null;
  if (officeSlot !== null) {
    const offices = orderedOffices(d.resources || []);
    if (offices.length) {
      const picked = offices[Math.min(officeSlot, offices.length - 1)];
      if (picked && (!resource || !(d.resources || []).some((r) => r.id === resource && r.kind === '기계'))) {
        resource = picked.id;
      } else if (picked && officeSlot >= 2) {
        // 3번째 슬롯(예: Office 2)에 다른 사무실이 있으면 분산 배정
        resource = picked.id;
      }
    }
  }
  return {
    title: text(title, 200),
    assignee: s.assignee,
    resource,
    browser: s.browser || null,
    tools: [...(s.tools || [])],
    note: text(note, 500),
    status: '대기',
    doneAt: null,
    doneBy: null,
    output: '',
  };
}

export function buildTemplateSteps(templateKey, d, { asTemplate = false } = {}) {
  const tpl = STEP_TEMPLATES.find((x) => x.key === templateKey);
  if (!tpl) return null;
  const steps = [];
  for (const item of tpl.steps) {
    const raw = autoFillStep(item.title, item.note, d, { officeSlot: item.officeSlot });
    raw.id = nextStepId(steps);
    const norm = normalizeStep(raw, d, { asTemplate, fallbackId: raw.id });
    if (norm) steps.push(norm);
  }
  return { mode: tpl.mode, label: tpl.label, steps };
}

export function cloneRoutineSteps(routineSteps = []) {
  return (routineSteps || []).map((s, i) => ({
    id: s.id || `s${i + 1}`,
    title: s.title,
    assignee: s.assignee ?? null,
    resource: s.resource ?? null,
    browser: s.browser ?? null,
    tools: [...(s.tools || [])],
    note: s.note || '',
    status: '대기',
    doneAt: null,
    doneBy: null,
    output: '',
  }));
}

export function activeSteps(task) {
  const steps = task?.steps || [];
  if (!steps.length) return [];
  if (task.stepMode === 'parallel') return steps.filter((s) => s.status !== '완료');
  const first = steps.find((s) => s.status !== '완료');
  return first ? [first] : [];
}

export function stepView(d, s, activeIds) {
  const empName = (id) => (id === 'jay' ? `${d.owner?.name || ''} 대표`.trim() : (d.employees || []).find((e) => e.id === id)?.name || null);
  const resName = (id) => (d.resources || []).find((r) => r.id === id)?.name || null;
  return {
    id: s.id,
    title: s.title,
    assignee: s.assignee,
    assigneeName: empName(s.assignee),
    resource: s.resource,
    resourceName: resName(s.resource),
    browser: s.browser,
    browserName: resName(s.browser),
    tools: s.tools || [],
    toolNames: (s.tools || []).map(resName).filter(Boolean),
    note: s.note || '',
    status: s.status,
    output: s.output || '',
    active: activeIds.has(s.id),
  };
}

export function stepsPromptBlock(d, task, forEmpId = null) {
  const steps = task?.steps || [];
  if (!steps.length) return '';
  const doneCount = steps.filter((s) => s.status === '완료').length;
  const actSet = new Set(activeSteps(task).map((s) => s.id));
  const modeLabel = STEP_MODE_LABELS[task.stepMode === 'parallel' ? 'parallel' : 'serial'];
  const empName = (id) => (id === 'jay' ? `${d.owner?.name || ''} 대표`.trim() : (d.employees || []).find((e) => e.id === id)?.name || '미정');
  const resName = (id) => (d.resources || []).find((r) => r.id === id)?.name || '';
  const lines = [
    `팀 협업 워크플로우 (${modeLabel} · ${doneCount}/${steps.length} 완료)`,
    task.sharedFolder ? `공유 폴더 (결과물 주고받는 곳): ${task.sharedFolder}` : '',
    ...steps.map((s, i) => {
      const isAct = actSet.has(s.id);
      const isMine = forEmpId && s.assignee === forEmpId && isAct;
      const tag = s.status === '완료' ? '완료' : isMine ? '내 차례 ★' : isAct ? '진행 차례' : s.status;
      const meta = [empName(s.assignee), resName(s.resource), resName(s.browser), ...(s.tools || []).map(resName)].filter(Boolean).join(' · ');
      const extra = [s.note ? `메모: ${s.note}` : '', s.output ? `결과: ${s.output}` : ''].filter(Boolean).join(' / ');
      return `- [${tag}] ${i + 1}. ${s.title} (${s.id}, ${meta})${extra ? ` — ${extra}` : ''}`;
    }),
    '협업 단계를 끝내면 update_step (또는 단계 상태 보고) 으로 본인이 맡은 단계 아이디와 결과 파일 경로를 남긴다.',
  ];
  return lines.filter(Boolean).join('\n');
}
