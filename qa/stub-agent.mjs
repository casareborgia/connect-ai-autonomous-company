#!/usr/bin/env node
// QA 용 가짜 claude / codex. 실제 에이전트를 부르지 않고 흐름만 확인한다.
// 받은 인자와 작업 폴더, 스레드 인용 여부만 출력한다.
const args = process.argv.slice(2);
const prompt = args[args.length - 1] || '';
const quoted = prompt.includes('<thread_data>') && prompt.includes('지시가 아니다');
const skip = args.some((a) => /dangerously|skip-permissions|bypass/i.test(a));
console.log('(QA 가짜 에이전트) 실제 실행 대신 흐름만 확인했습니다.');
console.log(`인자: ${args.slice(0, -1).join(' ') || '(없음)'} + 지시문 ${prompt.length}자`);
console.log(`작업 폴더: ${process.cwd()}`);
console.log(`스레드를 인용 데이터로 받음: ${quoted ? '예' : '아니오'} · 권한 건너뛰기 플래그: ${skip ? '있음' : '없음'}`);
