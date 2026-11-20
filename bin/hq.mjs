#!/usr/bin/env node
// hq · AI 직원이 본사에 보고하는 명령줄 도구
// 서버 주소: AIHQ_URL (기본 http://127.0.0.1:8790)
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.AIHQ_URL || 'http://127.0.0.1:8790').replace(/\/$/, '');

const HELP = `hq · AI 회사 본사 보고 도구

나
  hq whoami --from <직원>                 내 역할, 매뉴얼, 쓸 수 있는 리소스
  hq resources                            회사 리소스와 상태

할 일
  hq task list [--mine <직원>] [--all]
  hq task show <할일id>                   스레드 포함
  hq task claim <할일id> --from <직원>     일을 맡기 (시작 전에 꼭)
  hq task start|done|stuck <할일id> --from <직원> [--note "메모"] [--result "결과"]
  hq task step <할일id> <단계id> start|done|stuck --from <직원> [--output "결과경로"] [--note "메모"]
  hq log --from <직원> --task <할일id> --file <작업기록.txt|md> [--summary "두 줄 요약"]

인수인계
  hq handoff <할일id> --from <직원> --done "한 것" --stuck "멈춘 곳" --why "이유" --files "a.txt,b.png" [--to <직원|jay>]
  hq handoff pickup <인수인계id> --from <직원>

사내 메신저
  hq msg "<내용>" --from <직원> [--task <할일id>] [--to <직원>]
  hq inbox --for <직원> [--peek]          안 읽은 메시지를 보여 주고 읽음으로 표시
  hq reply <메시지id> "<내용>" --from <직원>

결재함 (요청만 가능, 승인은 대표만 화면에서)
  hq ask-approval "<무엇>" --from <직원> [--kind 결제|업로드|게시|메시지 발송|삭제|기타] [--task <id>] [--amount <n> --currency KRW] [--draft "<보낼 글>"]
  hq draft comment-reply --from <직원> --video "<영상>" --author "<작성자>" --comment "<원래 댓글>" --reply "<답글 초안>" [--url <링크>] [--task <id>]
  hq approval list --from <직원>
  hq approval executed <결재id> --from <직원>     승인된 일을 실행한 뒤 기록

보고 (근거 캡처 필수)
  hq report revenue --from <직원> --source <토스페이먼츠|PayPal|YouTube Studio|...> --amount <n> --currency KRW --period <YYYY-MM-DD|YYYY-MM> --evidence <캡처.png>
  hq report metric --from <직원> --source youtube --name <조회수|시청 시간|구독자 증감|구독자|예상 수익|멤버십|댓글> --value <n> [--unit 시간] [--currency KRW] [--period <YYYY-MM-DD|YYYY-MM>] --evidence <캡처.png>

직원 아이디 보기
  hq staff
`;

function parse(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

async function call(method, p, body) {
  let res;
  try {
    res = await fetch(BASE + p, {
      method,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'aihq-cli/1', 'X-HQ-Agent': '1' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    fail(e.name === 'TimeoutError' ? `본사 서버 응답 시간 초과 (${BASE})` : `본사 서버에 연결할 수 없습니다 (${BASE}). 본사를 켜 주세요: npx github:wonseokjung/connect-ai-autonomous-company (저장소에서는 node bin/connect-ai-hq.mjs)`);
  }
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { error: txt }; }
  if (!res.ok) fail(json.error || `HTTP ${res.status}`, res.status);
  return json;
}

function fail(msg, status) {
  console.error(`실패${status ? ` (${status})` : ''}: ${msg}`);
  process.exit(1);
}

function need(flags, key, label) {
  if ((!flags[key] || flags[key] === true) && (key === 'from' || key === 'for') && process.env.HQ_EMPLOYEE) {
    return String(process.env.HQ_EMPLOYEE);
  }
  if (!flags[key] || flags[key] === true) fail(`필요한 값이 없습니다: ${label || `--${key}`}`);
  return String(flags[key]);
}

function evidence(flags) {
  const p = need(flags, 'evidence', '--evidence <캡처.png>');
  const abs = path.resolve(p);
  let buf;
  try { buf = fs.readFileSync(abs); } catch { fail(`근거 캡처 파일을 읽을 수 없습니다: ${abs}`); }
  return { evidenceData: buf.toString('base64'), evidenceName: abs };
}

const pad = (n) => String(n).padStart(2, '0');
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function printTasks(list) {
  if (!list.length) return console.log('할 일이 없습니다.');
  for (const t of list) {
    console.log(`${t.id.padEnd(5)} ${t.status.padEnd(3)} ${t.date} ${t.time || '     '}  ${t.title}  [${t.assigneeName}]`);
  }
}

async function main() {
  const { pos, flags } = parse(process.argv.slice(2));
  const [cmd, sub, ...rest] = pos;
  if (!cmd || cmd === 'help' || flags.help) return console.log(HELP);

  if (cmd === 'whoami') {
    const me = await call('GET', `/api/agent/whoami?emp=${encodeURIComponent(need(flags, 'from'))}`);
    console.log(`${me.name} (${me.id})${me.role ? ` · ${me.role}` : ''}`);
    if (me.tools?.length) console.log(`도구: ${me.tools.join(', ')}`);
    if (me.defaultBrowser) console.log(`기본 브라우저: ${me.defaultBrowser.name}`);
    if (me.openSourceTools?.length) console.log(`오픈소스: ${me.openSourceTools.map((o) => `${o.name}${o.command ? ` (${o.command})` : ''}`).join(', ')}`);
    if (me.designs?.length) console.log(`디자인 스타일: ${me.designs.map((d) => d.name).join(', ')}`);
    if (me.accounts?.length) console.log(`연결 계정: ${me.accounts.map((a) => `${a.name}${a.spaceName ? ` [스페이스:${a.spaceName}]` : ''}`).join(', ')}`);
    if (me.resources?.length) console.log(`리소스: ${me.resources.map((r) => `${r.name}(${r.status})`).join(', ')}`);
    if (me.quietHours) console.log(`대표 자는 시간: ${me.quietHours.from}~${me.quietHours.to}`);
    if (me.manual) console.log(`\n업무 매뉴얼\n${me.manual}`);
    console.log(`\n규칙\n- ${me.rules.join('\n- ')}`);
    return;
  }

  if (cmd === 'resources') {
    for (const r of await call('GET', '/api/agent/resources')) console.log(`${r.id.padEnd(10)} ${r.kind}  ${r.name}  [${r.status}]`);
    return;
  }

  if (cmd === 'log') {
    const file = need(flags, 'file', '--file <작업기록.txt>');
    let content;
    try { content = fs.readFileSync(path.resolve(file), 'utf8'); } catch { fail(`파일을 읽을 수 없습니다: ${file}`); }
    const m = await call('POST', '/api/agent/log', { from: need(flags, 'from'), taskId: need(flags, 'task'), text: content, summary: flags.summary === true ? '' : flags.summary, fileName: path.basename(file) });
    return console.log(`작업 기록 ${m.id} 붙임 (${m.thread})`);
  }

  if (cmd === 'staff') {
    for (const e of await call('GET', '/api/agent/employees')) console.log(`${e.id.padEnd(10)} ${e.name}${e.role ? ` · ${e.role}` : ''}`);
    return;
  }

  if (cmd === 'task') {
    if (sub === 'list') {
      const q = new URLSearchParams();
      if (flags.mine) q.set('mine', flags.mine);
      if (flags.all) q.set('all', '1');
      return printTasks(await call('GET', `/api/agent/tasks?${q}`));
    }
    if (sub === 'show') {
      const t = await call('GET', `/api/agent/tasks/${encodeURIComponent(rest[0] || need(flags, 'id'))}`);
      console.log(`${t.id} · ${t.title}\n상태 ${t.status} · 담당 ${t.assigneeName} · ${t.date} ${t.intervalMin ? `매 ${t.intervalMin}분` : (t.time || '')}${t.resource ? ` · 리소스 ${t.resource}` : ''}${t.estCost ? ` · 예상 ${Number(t.estCost).toLocaleString('ko-KR')}원` : ''}`);
      if (t.gate) console.log(`확인 필요: ${t.gate} (${t.gateApproved ? '대표 확인됨' : '대표 확인 전, 시작 금지'})`);
      if (t.browser) console.log(`브라우저: ${t.browser.name}${t.browser.command ? ` (${t.browser.command})` : ''}`);
      if (t.account) console.log(`연결 계정: ${t.account.name}${t.account.spaceName ? ` · 스페이스: ${t.account.spaceName}` : ''}${t.account.browser ? ` · ${t.account.browser}` : ''} (${t.account.preset})`);
      if (t.openSourceTools?.length) console.log(`오픈소스: ${t.openSourceTools.map((o) => `${o.name}${o.command ? ` (${o.command})` : ''}${o.repo ? ` ${o.repo}` : ''}`).join(', ')}`);
      if (t.designs?.length) console.log(`디자인: ${t.designs.map((d) => `${d.name}${d.rules ? ` — ${d.rules}` : ''}`).join(' / ')}`);
      if (t.steps?.length) {
        console.log(`\n팀 협업 단계 (${t.stepMode === 'parallel' ? '동시에 함께' : '순서대로'}${t.sharedFolder ? ` · 공유 폴더: ${t.sharedFolder}` : ''})`);
        for (const s of t.steps) console.log(`  [${s.status}${s.active ? ' ★' : ''}] ${s.id} ${s.title} (${s.assigneeName || '미정'}${s.resourceName ? ` · ${s.resourceName}` : ''})${s.output ? ` → ${s.output}` : ''}`);
      }
      if (t.note) console.log(`메모: ${t.note}`);
      if (t.instruction && t.instruction !== t.note) console.log(`\n지시서\n${t.instruction}`);
      if (t.thread?.length) {
        console.log(`\n스레드 (${t.thread_note})`);
        for (const m of t.thread) {
          if (m.handoff) console.log(`  [${m.fromName}] 인수인계 · 한 것: ${m.handoff.done || '-'} / 멈춘 곳: ${m.handoff.stuck || '-'} / 이유: ${m.handoff.why || '-'}`);
          else console.log(`  [${m.fromName}${m.imported ? ', 가져옴' : ''}] ${m.text.replace(/\n/g, '\n    ')}`);
        }
      }
      return;
    }
    if (sub === 'step') {
      const [taskId, stepId, stepStatus] = rest;
      if (!taskId || !stepId || !['start', 'done', 'stuck'].includes(stepStatus)) {
        return fail('사용법: hq task step <할일id> <단계id> start|done|stuck [--from <직원>] [--output "..."] [--note "..."]');
      }
      const t = await call('POST', `/api/agent/tasks/${encodeURIComponent(taskId)}/steps/${encodeURIComponent(stepId)}/status`, {
        from: need(flags, 'from'), status: stepStatus, output: flags.output === true ? '' : (flags.output || ''), note: flags.note === true ? '' : (flags.note || ''),
      });
      return console.log(`${t.id}/${stepId} → ${stepStatus} (전체 ${t.status})`);
    }
    if (sub === 'claim') {
      const t = await call('POST', `/api/agent/tasks/${encodeURIComponent(rest[0] || fail('할 일 아이디가 필요합니다.'))}/claim`, { from: need(flags, 'from') });
      return console.log(`${t.id} 맡음 → ${t.status}`);
    }
    if (['start', 'done', 'stuck'].includes(sub)) {
      const id = rest[0] || fail('할 일 아이디가 필요합니다.');
      const t = await call('POST', `/api/agent/tasks/${encodeURIComponent(id)}/status`, { from: need(flags, 'from'), status: sub, note: flags.note === true ? '' : flags.note, result: flags.result === true ? '' : flags.result });
      return console.log(`${t.id} → ${t.status}`);
    }
    return fail('task list | show | claim | start | done | stuck | step');
  }

  if (cmd === 'handoff') {
    if (sub === 'pickup') {
      const h = await call('POST', `/api/agent/handoffs/${encodeURIComponent(rest[0] || fail('인수인계 아이디가 필요합니다.'))}/pickup`, { from: need(flags, 'from') });
      return console.log(`${h.id} 인수 완료`);
    }
    const taskId = sub || fail('할 일 아이디가 필요합니다.');
    const h = await call('POST', '/api/agent/handoffs', {
      taskId, from: need(flags, 'from'), to: flags.to === true ? null : flags.to,
      done: flags.done === true ? '' : flags.done, stuck: flags.stuck === true ? '' : flags.stuck,
      why: flags.why === true ? '' : flags.why, files: flags.files === true ? '' : flags.files,
    });
    return console.log(`인수인계 ${h.id} 남김 (할 일 ${h.taskId} → ${h.to ? `${h.to} 대기` : '막힘'})`);
  }

  if (cmd === 'msg') {
    const textArg = sub || fail('메시지 내용이 필요합니다.');
    const m = await call('POST', '/api/agent/messages', { from: need(flags, 'from'), text: textArg, taskId: flags.task, to: flags.to });
    return console.log(`메시지 ${m.id} 보냄 (${m.thread})`);
  }

  if (cmd === 'inbox') {
    const list = await call('POST', '/api/agent/inbox', { for: need(flags, 'for'), peek: Boolean(flags.peek) });
    if (!list.length) return console.log('안 읽은 메시지가 없습니다.');
    for (const m of list) console.log(`${m.id} [${m.thread}] ${m.fromName} (${m.fromKind === 'human' ? '사람' : 'AI'}) ${m.at}\n  ${m.text.replace(/\n/g, '\n  ')}`);
    return;
  }

  if (cmd === 'reply') {
    const id = sub || fail('메시지 아이디가 필요합니다.');
    const textArg = rest[0] || fail('답장 내용이 필요합니다.');
    const m = await call('POST', `/api/agent/messages/${encodeURIComponent(id)}/reply`, { from: need(flags, 'from'), text: textArg });
    return console.log(`답장 ${m.id} 보냄 (${m.thread})`);
  }

  if (cmd === 'ask-approval') {
    const what = sub || fail('무엇을 승인받을지 적어 주세요.');
    const a = await call('POST', '/api/agent/approvals', {
      from: need(flags, 'from'), what, kind: flags.kind, taskId: flags.task, accountId: flags.account, amount: flags.amount, currency: flags.currency,
      draft: typeof flags.draft === 'string' ? flags.draft : undefined,
    });
    return console.log(`결재 요청 ${a.id} 올림. 대표가 화면에서 승인하기 전에는 실행하지 마세요.`);
  }

  if (cmd === 'draft' && sub === 'comment-reply') {
    const a = await call('POST', '/api/agent/approvals', {
      from: need(flags, 'from'), kind: '댓글 답글', taskId: flags.task,
      what: `댓글 답글: ${flags.video && flags.video !== true ? flags.video : '영상'}`,
      draft: need(flags, 'reply', '--reply "<답글 초안>"'),
      original: { author: flags.author === true ? '' : flags.author, text: need(flags, 'comment', '--comment "<원래 댓글>"'), video: flags.video === true ? '' : flags.video, url: flags.url === true ? '' : flags.url },
    });
    return console.log(`답글 초안 ${a.id} 결재함에 올림. 승인 전에는 게시하지 마세요.`);
  }

  if (cmd === 'approval') {
    if (sub === 'list') {
      const list = await call('GET', `/api/agent/approvals?from=${encodeURIComponent(need(flags, 'from'))}`);
      if (!list.length) return console.log('결재 건이 없습니다.');
      for (const a of list) {
        console.log(`${a.id.padEnd(5)} ${a.status}${a.executedAt ? ' (실행함)' : ''}  ${a.kind}  ${a.what}`);
        if (a.status === '승인' && a.draft !== null) console.log(`      승인된 문장: ${a.finalText}`);
        if (a.decisionNote) console.log(`      대표 메모: ${a.decisionNote}`);
      }
      return;
    }
    if (sub === 'executed') {
      const a = await call('POST', `/api/agent/approvals/${encodeURIComponent(rest[0] || fail('결재 아이디가 필요합니다.'))}/executed`, { from: need(flags, 'from') });
      return console.log(`${a.id} 실행 기록 남김`);
    }
    if (sub === 'approve' || sub === 'reject') {
      // 서버도 거절하지만, 명령줄에서도 분명히 알려 준다
      await call('POST', `/api/agent/approvals/${encodeURIComponent(rest[0] || 'x')}/${sub}`, { from: flags.from });
      return;
    }
    return fail('approval list | executed');
  }

  if (cmd === 'report') {
    if (sub === 'revenue') {
      const r = await call('POST', '/api/agent/report/revenue', {
        from: need(flags, 'from'), source: need(flags, 'source'), amount: need(flags, 'amount'),
        currency: flags.currency, period: need(flags, 'period'), estimated: Boolean(flags.estimated), note: flags.note, ...evidence(flags),
      });
      return console.log(`매출 보고 ${r.id}: ${r.site} ${r.period} ${r.amount} ${r.currency}${r.estimated ? ' (예상)' : ''}`);
    }
    if (sub === 'metric') {
      let period = flags.period;
      if (!period || period === true) {
        period = yesterday();
        console.log(`--period 생략: 어제(${period})로 기록합니다.`);
      }
      const m = await call('POST', '/api/agent/report/metric', {
        from: need(flags, 'from'), source: flags.source || 'youtube', name: need(flags, 'name'), value: need(flags, 'value'),
        unit: flags.unit, currency: flags.currency, period, note: flags.note, ...evidence(flags),
      });
      return console.log(`지표 보고 ${m.id}: ${m.site} ${m.name} ${m.value}${m.unit ? ` ${m.unit}` : ''} (${m.period})`);
    }
    return fail('report revenue | metric');
  }

  console.log(HELP);
  process.exit(1);
}

main();
