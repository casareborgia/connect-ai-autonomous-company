// 안전 정지 단어 시험. 실행: node --test qa/gates.test.mjs
// 첫 사용 시뮬레이션 (11-20) 의 47가지 위험한 말 + 오탐 7가지 + 영어와 일상 문장.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectGate } from '../lib/gates.mjs';

// [문장, 받아도 되는 확인 종류들]
export const MUST_STOP = [
  ['광고비 결제해줘', '결제'], ['새 마이크 구매', '결제'], ['원단 샘플 주문해줘', '결제'], ['도메인 사줘', '결제'], ['도메인 사 줘', '결제'],
  ['항공권 예매해줘', '결제'], ['항공권 예매하기', '결제'], ['KTX 표 끊어줘', '결제'], ['카드로 계산해줘', '결제'], ['거래처에 30만원 이체해줘', '결제'],
  ['송금해줘', '결제'], ['입금해줘', '결제'], ['구독 갱신해줘', '결제'], ['유료 플랜으로 업그레이드', '결제'], ['장바구니 상품 결재해줘', '결제'],
  ['환불 처리해줘', '결제'],
  ['유튜브에 영상 올려줘', '업로드'], ['쇼츠 올려 줘', '업로드'], ['파일 업로드', '업로드'], ['드라이브에 백업 올리기', '업로드'], ['인스타 스토리 올리기', '업로드'],
  ['쿠팡에 상품 등록해줘', '업로드'], ['스마트스토어에 신상 등록', '업로드'],
  ['블로그 글 게시', '게시'], ['인스타에 포스팅', '게시'], ['뉴스레터 발행', '게시'], ['트윗 해줘', '게시'], ['댓글 달아줘', '게시'], ['답글 달아줘', '게시'],
  ['고객에게 문자 보내기', '발송|게시'], ['협찬사에 메일 보내줘', '발송|게시'], ['카톡 공지 보내줘', '발송|게시'],
  ['npm 패키지 배포', '게시'], ['사이트 공개해줘', '게시'], ['PR 머지해줘', '게시'],
  ['오래된 파일 삭제', '삭제'], ['사진 지워줘', '삭제'], ['폴더 지우기', '삭제'], ['오래된 영상 없애줘', '삭제'], ['캐시 비워줘', '삭제'],
  ['휴지통 비우기', '삭제'], ['계정 탈퇴해줘', '삭제'], ['구독 해지', '삭제'], ['브랜치 제거', '삭제'], ['DB 테이블 drop', '삭제'],
  ['git push --force', '삭제'], ['상품 판매 중지하고 내리기', '삭제'],
];

export const MUST_NOT_STOP = [
  '카드뉴스 만들어줘', '결제 모듈 리팩터링', '썸네일 배경 지워줘', '게시판 기능 개발', '업로드용 썸네일 만들어', '가격 올려 잡은 견적서 초안', '결제 페이지 디자인 조사',
];

// 시뮬레이션의 할 일 표에서 기대한 확인 (없음 포함)
const FROM_TASK_TABLES = [
  ['신상 원피스 상세페이지 문구 써줘', null], ['인스타 카드뉴스 5장 만들어줘', null], ['고객 문의 답장 초안 작성', null],
  ['반품 요청 고객에게 사과 문자 보내기', '발송'], ['상품 썸네일 배경 지워줘', null], ['인스타에 신상 사진 올려줘', '업로드'],
  ['품절 상품 상세페이지 내리기', '게시|삭제'], ['원단 샘플 10만원어치 주문해줘', '결제'], ['매일 아침 주문 확인하고 송장 정리', null],
  ['협찬 광고주에게 답장 메일 보내기', '발송'], ['오래된 비공개 영상 지워줘', '삭제'], ['다음 달 콘텐츠 캘린더 짜줘', null],
  ['매일 댓글 확인하고 답글 초안', null], ['결제 모듈 리팩터링', null], ['배포 스크립트 작성', null], ['npm 패키지 새 버전 배포', '게시'],
  ['오래된 git 브랜치 삭제', '삭제'], ['클라우드 서버 요금 결제', '결제'], ['배포 서버의 오래된 로그 지워줘', '삭제'], ['광고비 5만원 결제', '결제'],
  ['경쟁사 원피스 가격 조사해줘', null], ['요즘 AI 트렌드 조사해줘', null], ['README 영어로 번역해줘', null], ['파일 내려받기', null],
];

const ENGLISH = [
  ['pay the invoice', '결제'], ['buy a new microphone', '결제'], ['order 10 fabric samples', '결제'], ['refund the customer', '결제'],
  ['book a flight to Busan', '결제'], ['upgrade to the pro plan', '결제'], ['transfer $300 to the vendor', '결제'],
  ['upload the video to YouTube', '업로드'], ['publish the blog post', '게시'], ['deploy to production', '게시'], ['post it on Instagram', '게시'],
  ['merge PR 42', '게시'], ['send an email to the sponsor', '발송'], ['text the customer', '발송'],
  ['delete old files', '삭제'], ['remove the old branch', '삭제'], ['drop the users table', '삭제'], ['empty the trash', '삭제'], ['cancel my subscription', '삭제'],
  ['design a payment page', null], ['refactor the checkout module', null], ['remove background from the thumbnail', null], ['write a blog post draft', null],
  ['summarize the meeting notes', null],
];

const ok = (got, want) => (want === null ? got === null : want.split('|').includes(got));

test('위험한 말 47가지는 모두 멈춘다', () => {
  assert.equal(MUST_STOP.length, 47);
  const missed = MUST_STOP.filter(([s, want]) => !ok(detectGate(s), want)).map(([s, want]) => `${s} (기대 ${want}, 감지 ${detectGate(s)})`);
  assert.deepEqual(missed, []);
});

test('오탐 7가지는 멈추지 않는다', () => {
  const wrong = MUST_NOT_STOP.filter((s) => detectGate(s) !== null).map((s) => `${s} → ${detectGate(s)}`);
  assert.deepEqual(wrong, []);
});

test('할 일 표의 문장', () => {
  const wrong = FROM_TASK_TABLES.filter(([s, want]) => !ok(detectGate(s), want)).map(([s, want]) => `${s} (기대 ${want}, 감지 ${detectGate(s)})`);
  assert.deepEqual(wrong, []);
});

test('영어', () => {
  const wrong = ENGLISH.filter(([s, want]) => !ok(detectGate(s), want)).map(([s, want]) => `${s} (기대 ${want}, 감지 ${detectGate(s)})`);
  assert.deepEqual(wrong, []);
});
