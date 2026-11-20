// 수강생·팀원 공유용 워크플로우 청사진(Blueprint) 내보내기 / 가져오기.
// 개인정보(이름·매출·메시지·할 일 기록·로컬 경로·SSH 주소·비밀번호)는 자동으로 제외한다.
import { text, nextId, timeOrNull, nowIso } from './util.mjs';
import { accountConfig, platformByKey, presetPermissions } from './accounts.mjs';
import { INTERVAL_MINS, ensureRoutineTasks } from './scheduler.mjs';
import { STEP_MODES, autoFillStep, normalizeStep, nextStepId } from './steps.mjs';
import { ruleAssign, tokens } from './assign.mjs';
import { pickBrowser, pickTools, pickDesigns } from './tools.mjs';
import { pickAccount, resolveAccountBrowser } from './accounts.mjs';
import { detectGate } from './gates.mjs';

const LOCAL_PATH_RE = /(?:\/Users\/[^\s"'`]+|\/home\/[^\s"'`]+|[A-Za-z]:\\Users\\[^\s"'`]+)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SECRET_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|gho_[A-Za-z0-9]{12,}|xoxb-[A-Za-z0-9-]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g;

export function scrubPrivateText(raw, maxLen = 8000) {
  const s = String(raw || '')
    .replace(SECRET_RE, '[비공개 키]')
    .replace(LOCAL_PATH_RE, '~/작업폴더')
    .replace(EMAIL_RE, '[이메일]');
  return text(s, maxLen);
}

export function exportBlueprint(d) {
  const resById = new Map((d.resources || []).map((r) => [r.id, r]));
  const openSource = (d.resources || [])
    .filter((r) => r.kind === '오픈소스' && r.status !== '꺼짐')
    .map((r) => ({
      name: text(r.name, 80),
      preset: r.preset || '',
      when: scrubPrivateText(r.when || '', 300),
      command: scrubPrivateText(r.command || '', 300),
      repo: /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(r.repo || '') ? r.repo : '',
      note: scrubPrivateText(r.note || '', 200),
    }));

  const designs = (d.resources || [])
    .filter((r) => r.kind === '디자인' && r.status !== '꺼짐')
    .map((r) => ({
      name: text(r.name, 80),
      preset: r.preset || '',
      rules: scrubPrivateText(r.rules || '', 2000),
      refUrl: /^https?:\/\/\S+$/i.test(r.refUrl || '') ? r.refUrl : '',
      note: scrubPrivateText(r.note || '', 200),
    }));

  const accounts = (d.resources || [])
    .filter((r) => r.kind === '계정' && r.status !== '꺼짐')
    .map((r) => {
      const cfg = accountConfig(r);
      return {
        name: scrubPrivateText(r.name, 80),
        platform: cfg.platform,
        preset: cfg.preset,
        permissions: cfg.permissions,
        spaceName: scrubPrivateText(cfg.spaceName || '', 60),
        note: scrubPrivateText(r.note || '', 120),
      };
    });

  // 사람 개인 습관(운동 등)과 숨긴 기능 루틴은 빼고 AI 자율 운영 루틴만 공유
  const routines = (d.routines || [])
    .filter((r) => r.enabled !== false && !r.feature && r.assignee !== 'jay')
    .map((r) => ({
      title: scrubPrivateText(r.title, 200),
      days: Array.isArray(r.days) && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6],
      time: r.intervalMin ? null : (r.time || null),
      intervalMin: INTERVAL_MINS.includes(Number(r.intervalMin)) ? Number(r.intervalMin) : null,
      instruction: scrubPrivateText(r.instruction || '', 8000),
      estCost: Number.isFinite(Number(r.estCost)) && Number(r.estCost) > 0 ? Math.round(Number(r.estCost)) : null,
      stepMode: STEP_MODES.includes(r.stepMode) ? r.stepMode : 'serial',
      designName: r.design ? (resById.get(r.design)?.name || '') : '',
      accountName: r.account ? (resById.get(r.account)?.name || '') : '',
      toolNames: (r.tools || []).map((id) => resById.get(id)?.name).filter(Boolean),
      steps: (r.steps || []).map((s) => ({
        title: scrubPrivateText(s.title, 200),
        note: scrubPrivateText(s.note || '', 500),
        estCost: Number.isFinite(Number(s.estCost)) && Number(s.estCost) > 0 ? Math.round(Number(s.estCost)) : null,
        designName: s.design ? (resById.get(s.design)?.name || '') : '',
        toolNames: (s.tools || []).map((id) => resById.get(id)?.name).filter(Boolean),
      })),
    }));

  return {
    version: 1,
    kind: 'connect-ai-hq-blueprint',
    name: `${text(d.settings?.companyName, 60) || 'CONNECT AI HQ'} 워크플로우`,
    exportedAt: nowIso(),
    summary: {
      openSource: openSource.length,
      designs: designs.length,
      accounts: accounts.length,
      routines: routines.length,
    },
    openSource,
    designs,
    accounts,
    routines,
  };
}

export function importBlueprint(d, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('올바른 워크플로우 JSON 형식이 아닙니다.');
  }
  if (raw.kind && raw.kind !== 'connect-ai-hq-blueprint') {
    throw new Error('CONNECT AI HQ 워크플로우 파일이 아닙니다.');
  }
  const added = { openSource: 0, designs: 0, accounts: 0, routines: 0 };
  const skipped = { openSource: 0, designs: 0, accounts: 0, routines: 0 };

  const findRes = (kind, name, preset = '') => d.resources.find((r) =>
    r.kind === kind && (
      (preset && r.preset === preset) ||
      String(r.name || '').toLowerCase() === String(name || '').toLowerCase()
    ));

  // 1) 오픈소스
  for (const item of (Array.isArray(raw.openSource) ? raw.openSource : []).slice(0, 30)) {
    const name = text(item?.name, 80);
    if (!name) continue;
    if (findRes('오픈소스', name, item.preset)) { skipped.openSource++; continue; }
    d.resources.push({
      id: nextId(d, 'res'),
      kind: '오픈소스',
      name,
      preset: text(item.preset, 60),
      when: scrubPrivateText(item.when || '', 300),
      command: scrubPrivateText(item.command || '', 300),
      repo: /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(item.repo || '') ? item.repo : '',
      skillPath: '',
      status: '사용 가능',
      note: scrubPrivateText(item.note || item.when || '', 200),
    });
    added.openSource++;
  }

  // 2) 디자인 스타일
  for (const item of (Array.isArray(raw.designs) ? raw.designs : []).slice(0, 20)) {
    const name = text(item?.name, 80);
    if (!name) continue;
    if (findRes('디자인', name, item.preset)) { skipped.designs++; continue; }
    d.resources.push({
      id: nextId(d, 'res'),
      kind: '디자인',
      name,
      preset: text(item.preset, 60),
      rules: scrubPrivateText(item.rules || '', 2000),
      assetPath: '',
      refUrl: /^https?:\/\/\S+$/i.test(item.refUrl || '') ? item.refUrl : '',
      status: '사용 가능',
      note: scrubPrivateText(item.note || '', 200),
    });
    added.designs++;
  }

  // 3) 연결 계정 템플릿 (항상 안전한 권한으로 정규화 — 결제사·환불 잠금 유지)
  for (const item of (Array.isArray(raw.accounts) ? raw.accounts : []).slice(0, 20)) {
    const name = text(item?.name, 80);
    if (!name) continue;
    const plat = platformByKey(item.platform);
    const exists = d.resources.find((r) => r.kind === '계정' && (
      String(r.name || '').toLowerCase() === name.toLowerCase() ||
      (plat.key !== 'generic' && accountConfig(r)?.platform === plat.key)
    ));
    if (exists) { skipped.accounts++; continue; }
    const base = {
      id: nextId(d, 'res'),
      kind: '계정',
      name,
      platform: plat.key,
      preset: item.preset || (plat.key === 'payment' ? 'readonly' : 'approval'),
      permissions: item.permissions || presetPermissions(plat.key, item.preset || 'approval'),
      browser: null,
      spaceName: scrubPrivateText(item.spaceName || '', 60),
      assignee: null,
      status: '사용 가능',
      note: scrubPrivateText(item.note || '', 120),
    };
    const cfg = accountConfig(base);
    base.platform = cfg.platform;
    base.preset = cfg.preset;
    base.permissions = cfg.permissions;
    d.resources.push(base);
    added.accounts++;
  }

  // 4) AI 루틴 (중복 제목 건너뛰고, 학생의 AI 직원·사무실에 맞게 자동 배정)
  for (const item of (Array.isArray(raw.routines) ? raw.routines : []).slice(0, 30)) {
    const title = scrubPrivateText(item?.title, 200);
    if (!title) continue;
    if (d.routines.some((r) => r.title === title)) { skipped.routines++; continue; }
    const instruction = scrubPrivateText(item.instruction || '', 8000);
    const full = `${title} ${instruction}`;
    const iv = INTERVAL_MINS.includes(Number(item.intervalMin)) ? Number(item.intervalMin) : null;
    const days = Array.isArray(item.days)
      ? [...new Set(item.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
      : [0, 1, 2, 3, 4, 5, 6];
    const s = ruleAssign(title, instruction, d.employees, d.resources, d.settings?.assignMemory);
    const namedDesign = item.designName ? findRes('디자인', item.designName) : null;
    const namedAccount = item.accountName ? findRes('계정', item.accountName) : null;
    const namedTools = (Array.isArray(item.toolNames) ? item.toolNames : [])
      .map((n) => findRes('오픈소스', n)?.id)
      .filter(Boolean);
    const autoTools = pickTools(full, d.resources, tokens).map((x) => x.id);
    const accountId = namedAccount?.id || s.account || pickAccount(full, d.resources)?.id || null;
    const accObj = accountId ? d.resources.find((x) => x.id === accountId) : null;
    const browserId = s.browser || pickBrowser(full, d.resources, accObj ? resolveAccountBrowser(accObj, d.resources)?.id || null : null)?.id || null;
    const designId = namedDesign?.id || s.design || pickDesigns(full, d.resources, tokens)[0]?.id || null;
    const toolIds = [...new Set([...namedTools, ...(s.tools || []), ...autoTools])].slice(0, 6);

    const steps = [];
    for (const st of (Array.isArray(item.steps) ? item.steps : []).slice(0, 12)) {
      const stTitle = scrubPrivateText(st?.title, 200);
      if (!stTitle) continue;
      const auto = autoFillStep(stTitle, scrubPrivateText(st.note || '', 500), d);
      const stDes = st.designName ? findRes('디자인', st.designName)?.id : null;
      const stTools = (Array.isArray(st.toolNames) ? st.toolNames : []).map((n) => findRes('오픈소스', n)?.id).filter(Boolean);
      const norm = normalizeStep({
        ...auto,
        id: nextStepId(steps),
        design: stDes || auto.design || null,
        tools: [...new Set([...stTools, ...(auto.tools || [])])].slice(0, 4),
        estCost: st.estCost ?? null,
      }, d, { asTemplate: true, fallbackId: nextStepId(steps) });
      if (norm) steps.push(norm);
    }

    const r = {
      id: nextId(d, 'r'),
      title,
      where: '',
      days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
      time: iv ? null : timeOrNull(item.time),
      intervalMin: iv,
      lastIntervalAt: null,
      assignee: s.assignee === 'jay' && d.employees.length ? d.employees[0].id : s.assignee,
      resource: s.resource || null,
      account: accountId,
      browser: browserId,
      design: designId,
      tools: toolIds,
      estCost: Number.isFinite(Number(item.estCost)) && Number(item.estCost) > 0 ? Math.round(Number(item.estCost)) : null,
      stepMode: STEP_MODES.includes(item.stepMode) ? item.stepMode : 'serial',
      sharedFolder: '',
      steps,
      nextAssignee: null,
      alarm: false,
      enabled: true,
      instruction,
      gate: s.gate || detectGate(full),
      feature: null,
      log: {},
      reason: '워크플로우에서 가져옴',
      reasonBy: 'blueprint',
      noMatch: false,
      assignSource: 'jay',
    };
    d.routines.push(r);
    added.routines++;
  }

  ensureRoutineTasks(d);
  return { added, skipped };
}
