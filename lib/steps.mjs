// 큰 할 일·매일 루틴 하나를 여러 AI 직원과 사무실(HQ, Office 1, Office 2)이 나눠 협업하는 단계 워크플로우.
import { STATUSES, nowIso, text } from './util.mjs';
import { ruleAssign } from './assign.mjs';
import { readHandoffFromDirSync, formatHandoffPromptBlock } from './handoff-protocol.mjs';

export const STEP_MODES = ['serial', 'parallel'];
export const STEP_MODE_LABELS = { serial: '순서대로 (릴레이)', parallel: '동시에 함께 (병렬)' };

export const STEP_TEMPLATES = [
  {
    key: 'growth-team',
    label: '알리는 팀 4단계 (글쓰기 → 번역 → 모션 → 마케터)',
    mode: 'serial',
    steps: [
      { title: '영상·자료로 멀티채널 글쓰기 (connect-ai-writer)', note: 'connect-ai-writer로 네이버 블로그·쓰레드·X·인스타 초안 작성 후 handoff.json(connect-ai-handoff/v1) 남기기', officeSlot: 0 },
      { title: '해외용 영어·다국어 버전 변환', note: '앞 단계 handoff.json을 읽어 원문 숫자·톤을 유지한 해외 채널(X·LinkedIn·Threads) 영어 버전 정리 후 handoff.json 갱신', officeSlot: 0 },
      { title: '모션그래픽·비주얼 영상 붙이기 (connect-ai-motion)', note: '앞 단계 핵심 문구로 9:16 · 16:9 모션그래픽 클립과 이미지 에셋을 생성해 공유 폴더에 저장하고 handoff.json 갱신', officeSlot: 1 },
      { title: '전 채널 임시저장 · 업로드 마무리 (connect-ai-marketer)', note: 'handoff.json의 초안·영상을 받아 Ego Lite로 각 채널 임시저장까지만 준비하고 대표 결재 요청', officeSlot: 0 },
    ],
  },
  {
    key: 'full-company-team',
    label: 'AI 기업 3팀 풀코스 (기획·분석 → 제작 → 알림)',
    mode: 'serial',
    steps: [
      { title: '[기획·분석 팀] 사업 해부 및 기회 도출 (reversebusiness)', note: '참고 서비스 1개를 6칸으로 해부해 내 버전 기획안과 handoff.json 작성', officeSlot: 0 },
      { title: '[제작 팀] XR·영상·모션 시안 제작', note: '기획안 handoff.json을 이어받아 WebXR/모션그래픽/편집 시안을 공유 폴더에 생성하고 handoff.json 갱신', officeSlot: 1 },
      { title: '[알리는 팀] 블로그·SNS 글쓰기 및 마케팅 준비', note: '제작 결과물 handoff.json으로 connect-ai-writer 초안과 connect-ai-marketer 임시저장 준비 후 대표 보고', officeSlot: 0 },
    ],
  },
  {
    key: 'video-edit',
    label: '영상 편집 4단계',
    mode: 'serial',
    steps: [
      { title: '자막 추출 · 컷 포인트 정리', note: '영상 원본에서 자막을 뽑고 편집할 핵심 구간 타임코드 정리', officeSlot: 0, estCost: 300 },
      { title: '블렌더 3D 모델링', note: '필요한 3D 씬 제작 및 렌더 결과를 공유 폴더에 저장', officeSlot: 1, estCost: 1500 },
      { title: '모션 그래픽 만들기 (Hyperframes / Remotion)', note: '자막·포인트에 맞춘 모션 그래픽 클립 생성 후 공유 폴더 저장', officeSlot: 2, estCost: 1200 },
      { title: '최종 확인 · 유튜브 비공개 등록', note: '합성 결과 확인 후 제목·설명·썸네일과 함께 비공개로 등록', officeSlot: 0, estCost: 500 },
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
  const validRes = (v) => ((d.resources || []).some((r) => r.id === v && !['브라우저', '오픈소스', '디자인'].includes(r.kind)) ? v : null);
  const validBr = (v) => ((d.resources || []).some((r) => r.id === v && r.kind === '브라우저') ? v : null);
  const validDesign = (v) => ((d.resources || []).some((r) => r.id === v && r.kind === '디자인') ? v : null);
  const validTools = (arr) => (Array.isArray(arr) ? [...new Set(arr.map(String))].filter((id) => (d.resources || []).some((r) => r.id === id && r.kind === '오픈소스')).slice(0, 4) : []);
  const status = asTemplate ? '대기' : (STATUSES.includes(raw?.status) ? raw.status : '대기');
  const rawCost = raw?.estCost === '' || raw?.estCost === null || raw?.estCost === undefined ? null : Number(raw.estCost);
  const estCost = rawCost !== null && Number.isFinite(rawCost) && rawCost >= 0 ? Math.round(rawCost) : null;
  return {
    id: /^s\d+$/.test(String(raw?.id || '')) ? String(raw.id) : fallbackId,
    title,
    assignee: validEmp(raw?.assignee),
    resource: validRes(raw?.resource),
    browser: validBr(raw?.browser),
    design: validDesign(raw?.design),
    tools: validTools(raw?.tools),
    estCost,
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
      const curIsHeavyStudio = Boolean(resource && /스튜디오|studio/i.test((d.resources || []).find((r) => r.id === resource)?.name || ''));
      if (picked && (!resource || !(d.resources || []).some((r) => r.id === resource && r.kind === '기계') || (officeSlot >= 1 && !curIsHeavyStudio))) {
        resource = picked.id;
      }
    }
  }
  return {
    title: text(title, 200),
    assignee: s.assignee,
    resource,
    browser: s.browser || null,
    design: s.design || null,
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
    if (item.estCost !== undefined) raw.estCost = item.estCost;
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
    design: s.design ?? null,
    tools: [...(s.tools || [])],
    estCost: s.estCost ?? null,
    note: s.note || '',
    status: '대기',
    doneAt: null,
    doneBy: null,
    output: '',
  }));
}

export function sumEstCost(item) {
  const steps = item?.steps || [];
  if (steps.length) {
    const stepSum = steps.reduce((acc, s) => acc + (Number(s.estCost) > 0 ? Number(s.estCost) : 0), 0);
    if (stepSum > 0) return stepSum;
  }
  return Number(item?.estCost) > 0 ? Number(item.estCost) : 0;
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
  const designObj = s.design ? (d.resources || []).find((r) => r.id === s.design && r.kind === '디자인') : null;
  return {
    id: s.id,
    title: s.title,
    assignee: s.assignee,
    assigneeName: empName(s.assignee),
    resource: s.resource,
    resourceName: resName(s.resource),
    browser: s.browser,
    browserName: resName(s.browser),
    design: designObj ? { id: designObj.id, name: designObj.name, rules: designObj.rules || '', assetPath: designObj.assetPath || '', refUrl: designObj.refUrl || '' } : null,
    tools: s.tools || [],
    toolNames: (s.tools || []).map(resName).filter(Boolean),
    estCost: s.estCost ?? null,
    note: s.note || '',
    status: s.status,
    output: s.output || '',
    active: activeIds.has(s.id),
  };
}

export function stepsPromptBlock(d, task, forEmpId = null, targetStepId = null) {
  const steps = task?.steps || [];
  if (!steps.length) return '';
  const doneCount = steps.filter((s) => s.status === '완료').length;
  const actSet = new Set(activeSteps(task).map((s) => s.id));
  const modeLabel = STEP_MODE_LABELS[task.stepMode === 'parallel' ? 'parallel' : 'serial'];
  const empName = (id) => (id === 'jay' ? `${d.owner?.name || ''} 대표`.trim() : (d.employees || []).find((e) => e.id === id)?.name || '미정');
  const resObj = (id) => (d.resources || []).find((r) => r.id === id);
  const resName = (id) => resObj(id)?.name || '';
  const totalCost = sumEstCost(task);
  const targetStep = targetStepId ? steps.find((s) => s.id === targetStepId) : null;
  const prevOutputs = steps
    .filter((s) => s.status === '완료' && s.output)
    .map((s, i) => `  [${i + 1}단계 · ${s.title} · ${empName(s.doneBy || s.assignee)}]\n  ${String(s.output).slice(0, 700).replace(/\n+/g, '\n  ')}`);
  const activePacket = task.handoffPacket || (task.sharedFolder ? readHandoffFromDirSync(task.sharedFolder) : null);
  const packetBlock = activePacket ? formatHandoffPromptBlock(activePacket) : '';
  const lines = [
    `AI 직원 협업 (${modeLabel} · ${doneCount}/${steps.length} 완료${totalCost ? ` · 예상 원가 ${totalCost.toLocaleString('ko-KR')}원` : ''})`,
    targetStep ? `★ 지금 내가 맡은 단계: ${targetStep.title} (${targetStep.id})${targetStep.note ? ` — ${targetStep.note}` : ''}` : '',
    task.sharedFolder ? `공유 폴더 (결과물·handoff.json 주고받는 곳): ${task.sharedFolder}` : '',
    ...steps.map((s, i) => {
      const isAct = actSet.has(s.id);
      const isMine = targetStepId ? s.id === targetStepId : (forEmpId && s.assignee === forEmpId && isAct);
      const tag = s.status === '완료' ? '완료' : isMine ? '내 차례 ★' : isAct ? '진행 차례' : s.status;
      const toolStrs = (s.tools || []).map((id) => {
        const o = resObj(id);
        if (!o) return '';
        const ref = [o.command, o.repo].filter(Boolean).join(' · ');
        return ref ? `${o.name}(${ref})` : o.name;
      }).filter(Boolean);
      const des = s.design ? resObj(s.design) : null;
      const meta = [empName(s.assignee), resName(s.resource), resName(s.browser), ...toolStrs, des ? `디자인:${des.name}` : '', s.estCost ? `예산 ${Number(s.estCost).toLocaleString('ko-KR')}원` : ''].filter(Boolean).join(' · ');
      const extra = [des?.rules ? `디자인 규칙: ${des.rules}` : '', des?.assetPath ? `에셋: ${des.assetPath}` : '', s.note ? `지침: ${s.note}` : '', s.output ? `결과: ${String(s.output).slice(0, 220)}` : ''].filter(Boolean).join(' / ');
      return `- [${tag}] ${i + 1}. ${s.title} (${s.id}, ${meta})${extra ? ` — ${extra}` : ''}`;
    }),
    packetBlock,
    prevOutputs.length ? `이전 단계 AI 직원 결과물 (반드시 이어받아 발전·검수하세요):\n${prevOutputs.join('\n')}` : '',
    '협업 단계를 끝내면 본인이 맡은 단계의 명확한 결과를 출력하고, 가능하면 connect-ai-handoff/v1 형식(MCP write_handoff_packet 또는 공유 폴더 handoff.json)으로 다음 직원에게 인계하세요.',
  ];
  return lines.filter(Boolean).join('\n');
}
