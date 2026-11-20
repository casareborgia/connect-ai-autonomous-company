// 자동 배분 (간단 규칙) 시험. 실행: node --test qa/assign.test.mjs
// 로컬 AI 없이 받는 결과. 세 사람 45개 중 40개 이상 맞아야 한다 (시뮬레이션 당시 28/45).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleAssign, tokens } from '../lib/assign.mjs';
import { PERSONAS } from './personas.mjs';

test('한국어 어미를 뗀다', () => {
  assert.deepEqual(tokens('README 영어로 번역해줘'), ['readme', '영어', '번역']);
  assert.ok(tokens('요약해줘').includes('요약'));
  assert.ok(tokens('분석해 줘').includes('분석'));
});

test('세 사람 45개 배분', () => {
  let ok = 0;
  const wrong = [];
  for (const [p, def] of Object.entries(PERSONAS)) {
    for (const [title, expect] of def.tasks) {
      const r = ruleAssign(title, '', def.employees, def.resources);
      if (expect.split('|').includes(r.assignee ?? 'null')) ok++;
      else wrong.push(`${p}: ${title} → ${r.assignee} (기대 ${expect}) · ${r.reason}`);
    }
  }
  console.log(`규칙 배분 ${ok}/45`, wrong);
  assert.ok(ok >= 40, wrong.join('\n'));
});

test('직원이 없으면 담당 미정이고 이유를 알려 준다', () => {
  const r = ruleAssign('신상 원피스 상세페이지 문구 써줘', '', [], []);
  assert.equal(r.assignee, null);
  assert.match(r.reason, /직원/);
});
