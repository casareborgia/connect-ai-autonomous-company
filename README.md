# CONNECT AI HQ

**AI Autonomous Company · 나의 AI 자율 회사 본사**

CONNECT AI HQ는 인공지능 자율 회사를 만들기 위한 루틴화 도구입니다. 내 AI 직원, 내 사무실(컴퓨터), 내 할 일, 매일 할 일을 한 곳에 두면 누가 어디서 할지 알아서 나누고, 매일 자동으로 돌립니다. 사람은 결정과 승인을 하고, 인공지능은 일하고 인수인계합니다. 목표는 인공지능으로만 운영되는 AI native company입니다. 개인과 5인 미만 팀은 무료이고 소스는 공개되어 있습니다.

무료 · 소스 공개 · 의존성 0 · 데이터는 내 컴퓨터 안에만 · [English](README.en.md)

![내 할 일: 할 일마다 담당 AI 직원과 이유가 한 줄로 붙는다](docs/home.png)

## 시작하기

```
npx github:wonseokjung/connect-ai-autonomous-company
```

Node 20 이상이면 됩니다. 설치할 패키지도, 넣을 키도 없습니다. 본사가 켜지고 브라우저에서 `http://127.0.0.1:8790` 이 열립니다. 끄려면 터미널에서 Ctrl+C.

처음 열면 1분 시작하기가 뜹니다. 자세한 건 묻지 않습니다.

1. **대표 이름, 회사 이름**
2. **AI 직원**: 이 컴퓨터에서 찾은 AI(Claude Code, Codex, Gemini CLI, Ollama, LM Studio)는 미리 체크되어 있고, 웹에서 쓰는 AI(ChatGPT, Claude, Gemini, Perplexity, Grok, Canva AI)는 눌러서 고릅니다.
3. **사무실**: 이 컴퓨터는 본사로 자동으로 들어갑니다. `~/.ssh/config` 에 있는 컴퓨터는 이름만 읽어 보여 주고, 눌러서 확인하면 사무실이 됩니다 (접속은 하지 않음).
4. **자는 시간**: 이 시간에는 AI가 대표를 부르지 않습니다. 일은 계속하고, 메시지와 확인 요청은 아침에 보게 남겨 둡니다.
5. **AI 도구 연결**: 찾은 도구에 본사 출입증(MCP)과 직원 수첩(스킬)을 넣을지 묻습니다. 넣을 도구를 누르면 명령을 보여 줄 뿐, 앱이 내 설정을 바꾸지 않습니다.
6. **안전 규칙 한 줄**: 돈과 공개는 대표 손으로만.

![1분 시작하기: 이 컴퓨터에서 찾은 AI는 미리 체크](docs/start.png)

데이터는 `~/.connect-ai-hq/data/hq.json` 한 파일입니다. 저장할 때마다 임시 파일에 쓰고 바꿔 끼우며, 하루 한 번 `backups/` 에 복사본을 남깁니다 (14개 보관). 예시 회사로 둘러보려면 데이터 폴더를 따로 정하고 켭니다.

```
AIHQ_SEED=example AIHQ_DATA_DIR=./example-data npx github:wonseokjung/connect-ai-autonomous-company
```

저장소에서 바로 켤 때는 `node bin/connect-ai-hq.mjs` 입니다.

## 화면 네 개

| 화면 | 하는 일 |
| --- | --- |
| **내 할 일** | 할 일을 적으면 (말로 해도 됨) 담당과 리소스를 정하고 이유를 한 줄로 보여 줍니다. 담당 칩을 눌러 바꾸고, 체크로 끝내고, 일을 누르면 대화 스레드가 열립니다. |
| **매일 할 일** | 켜 둔 루틴은 매일 아침 담당이 정해진 채 오늘 할 일로 들어갑니다. 내 일은 맥 알림을, AI 일은 자동 실행 직원이면 시간이 되면 혼자 시작합니다. |
| **내 직원** | 역할, 도구, 업무 매뉴얼, 월급(구독료), 연결 방식. 직원이 바뀌면 담당 미정이던 일을 다시 나눕니다. 맨 아래에서 자는 시간을 바꿉니다. |
| **내 리소스** | 기계(사무실), 멤버십, 계정, 폴더. 이 컴퓨터는 메모리와 디스크를 바로 읽고, 다른 컴퓨터는 연결 확인을 누를 때만 닿는지 봅니다. |

![내 직원](docs/staff.png)

## AI 직원이 본사에 들어오는 문

- **복사해서 맡기기** (ChatGPT, Claude, Gemini 같은 웹 멤버십): 할 일을 열면 지시문 복사 버튼과 그 서비스 열기 링크가 있습니다. 받은 답을 붙여 넣으면 그 직원의 결과로 남습니다. 설치가 필요 없습니다.
- **이 컴퓨터의 로컬 AI** (Ollama, LM Studio): 앱 안에서 바로 답합니다. 민감한 일은 로컬 AI에게 나눕니다.
- **이 컴퓨터의 Claude Code, Codex**: 직원마다 작업 폴더(`~/.connect-ai-hq/workspaces/<직원>/`)에서 한 번 실행합니다. 권한 건너뛰기 옵션은 쓰지 않습니다.
- **MCP 서버 (출입증)**: 할 일 보기, 맡기, 남기기, 넘기기, 끝내기, 승인 요청. 승인하기와 직원 명단 바꾸기 도구는 없습니다.
- **스킬 (직원 수첩)**: `skills/aihq-employee/SKILL.md`, 일하는 방식과 지킬 것.

연결은 터미널에서 한 번에 합니다. 찾은 도구마다 먼저 묻고, 기본 답은 "아니요"(명령만 보여 줌)입니다.

```
npx github:wonseokjung/connect-ai-autonomous-company connect
```

직접 넣고 싶다면 (직원 아이디는 내 직원 화면에 있습니다)

```
claude mcp add -s user aihq -e HQ_EMPLOYEE=claudecode -- npx -y github:wonseokjung/connect-ai-autonomous-company mcp
codex mcp add aihq --env HQ_EMPLOYEE=codex -- npx -y github:wonseokjung/connect-ai-autonomous-company mcp
```

Gemini CLI (`~/.gemini/settings.json`), LM Studio (`~/.lmstudio/mcp.json`) 는 같은 모양을 `mcpServers` 에 합칩니다.

```json
{
  "mcpServers": {
    "aihq": { "command": "npx", "args": ["-y", "github:wonseokjung/connect-ai-autonomous-company", "mcp"], "env": { "HQ_EMPLOYEE": "gemini" } }
  }
}
```

스크립트와 다른 에이전트는 같은 일을 명령줄로 합니다.

```
npx github:wonseokjung/connect-ai-autonomous-company task list --mine codex
npx github:wonseokjung/connect-ai-autonomous-company task claim t5 --from codex
npx github:wonseokjung/connect-ai-autonomous-company handoff t5 --from codex --done "3곳 비교" --stuck "결제 화면" --why "카드 결제 필요" --to jay
npx github:wonseokjung/connect-ai-autonomous-company ask-approval "항공권 결제" --from codex --kind 결제 --task t5
npx github:wonseokjung/connect-ai-autonomous-company hq help
```

## 자동화 직원 (이미 쓰는 스크립트를 본사에서 돌리기)

이 컴퓨터에서 이미 돌리던 스크립트(수집, 정리, 리포트)를 직원으로 올리면, 매일 할 일의 켜짐 스위치와 시간, 할 일의 실행 버튼, 안전 정지가 그 스크립트에도 그대로 통합니다. 시간이 되면 본사가 직접 실행하고, 출력은 스레드의 결과로, 종료 코드는 완료(0)와 막힘(그 밖)으로 남습니다.

1. 실행할 명령을 등록 파일에 적습니다. 위치는 데이터 폴더 옆 `~/.connect-ai-hq/automations.json` (`AIHQ_AUTOMATIONS` 로 바꿀 수 있음).

```json
{
  "automations": [
    { "id": "listen", "title": "마케팅 리스닝", "command": ["/usr/bin/python3", "/Users/me/tools/listen.py", "daily"], "timeoutMinutes": 20 }
  ]
}
```

2. `chmod 600 ~/.connect-ai-hq/automations.json` (다른 사용자가 고칠 수 있는 파일은 읽지 않습니다).
3. 내 직원 → 편집 → 일 시키는 방법을 **자동화**로, 자동화를 골라 저장. 실행을 **자동 실행**으로 두면 매일 할 일의 시간에 혼자 시작합니다.

지키는 것

- 등록 파일에 있는 명령만 실행합니다. 명령은 화면과 API(CLI, MCP)로 바꿀 수 없고, 직원에 자동화를 붙이는 것도 대표가 화면에서만 합니다.
- 명령은 인자 배열로 실행하고 셸을 거치지 않습니다. 실행 파일은 전체 경로여야 합니다.
- 할 일의 제목, 메모, 대화는 명령에도 환경에도 들어가지 않습니다. 스크립트가 받는 것은 `AIHQ_TASK_ID`, `AIHQ_EMPLOYEE`, `AIHQ_TRIGGERED_BY_HQ=1` 뿐입니다.
- 결제, 업로드, 게시, 삭제, 발송이 들어간 할 일은 다른 직원과 똑같이 대표가 누를 때까지 멈춥니다.
- 직원 하나가 자동화 하나를 맡고, 한 번에 하나만 돕니다. `timeoutMinutes`(기본 15, 최대 180)가 넘으면 하위 프로세스까지 멈춥니다.
- 본사가 꺼져 있으면 돌지 않습니다. 그날 안에 다시 켜지면 시간이 지난 일을 이어서 실행합니다.

## 할 일마다 스레드

일마다 스레드 하나에 모든 직원의 대화, 결과, 작업 기록(두 줄 요약으로 접힘), 가져온 대화, 인수인계(한 것, 멈춘 곳, 이유)가 쌓입니다. 담당을 바꾸면 스레드 전체가 다음 담당에게 인용 데이터로 넘어갑니다. 지시로 넘기지 않습니다.

## 한 가지 안전 규칙

결제, 업로드, 게시, 삭제, 메시지 발송이 들어간 일은 대표가 화면에서 누를 때까지 멈춥니다. 영어 표현도 잡고, 카드뉴스, 결제 모듈, 배경 지워줘처럼 명사나 편집으로 쓰인 말은 잡지 않습니다. AI 직원은 승인을 요청만 할 수 있고, 멈춘 일을 시작하거나 끝난 일로 바꾸지 못합니다 (CLI, MCP 모두 서버가 거절).

## 사무실에서 실행

할 일의 리소스를 다른 컴퓨터(사무실)로 고르면 "그 사무실에서 실행" 스위치가 생깁니다. 본사가 ssh 로 정해진 일만 보내고 (사무실 로컬 AI 글 일, ffmpeg 시험 클립, Remotion 렌더, Blender 렌더 한 장), 결과를 본사로 가져옵니다. 새로 여는 포트가 없고, 할 일 제목은 명령에 들어가지 않으며, sudo 를 쓰지 않습니다. 사무실 쪽 작업 폴더는 `~/render-node/` 입니다. 사무실에 닿지 않으면 1분, 2분, 4분 … 최대 15분 간격으로 다시 보냅니다.

## Muse 읽기 (읽기만, 기본 꺼짐)

내 리소스의 Muse 스위치를 켜면 30분마다 ego lite 브라우저에서 Muse 대화의 새 메시지를 읽어 "Muse 대화" 할 일에 가져옴 표시로 남깁니다. 읽는 곳은 이 컴퓨터 또는 사무실 하나를 고릅니다. 아무것도 누르거나 입력하지 않고, Muse 로는 아무것도 보내지 않습니다. 처음 한 번은 대표가 그 컴퓨터의 ego lite 에서 Muse 에 직접 로그인해 둡니다.

## 폰에서 보기

내 리소스의 "같은 와이파이의 폰에서 보기" 스위치를 켜면 같은 와이파이의 폰에서 열립니다 (기본 꺼짐, 인터넷으로는 열리지 않음). 처음 한 번은 컴퓨터 화면에 뜬 6자리 코드(10분, 한 번만)를 폰에 넣습니다.

<img src="docs/phone.png" alt="폰 화면" width="320">

## 환경변수 (모두 선택)

| 이름 | 쓰임 |
| --- | --- |
| AIHQ_PORT | 기본 8790 (`--port` 와 같음) |
| AIHQ_DATA_DIR, AIHQ_WORKSPACES | 데이터 폴더와 AI 직원 작업 폴더 (기본 `~/.connect-ai-hq/`) |
| AIHQ_SEED | `example` 이면 데이터 파일이 없을 때 예시 회사로 시작 |
| AIHQ_URL | CLI 와 MCP 가 부를 본사 주소 |
| AIHQ_LLM_MODEL | 배분에 쓸 Ollama 모델 (없으면 자동 선택, 모델이 없으면 규칙으로) |
| AIHQ_OLLAMA_URL, AIHQ_LMSTUDIO_URL | 로컬 모델 주소 |
| AIHQ_CLAUDE_BIN, AIHQ_CODEX_BIN, AIHQ_GEMINI_BIN | 실행 파일 경로 (없으면 PATH 에서 찾음) |
| AIHQ_NO_OPEN | `1` 이면 브라우저를 열지 않음 (`--no-open` 과 같음) |
| AIHQ_AUTOMATIONS | 자동화 등록 파일 경로 (기본 데이터 폴더 옆 `automations.json`) |
| AIHQ_DISPATCH | `0` 이면 배차, Muse 읽기, 모델 확인을 켜지 않음 (시험용) |

## 보안

- `127.0.0.1` 에만 묶입니다. 폰에서 보기를 켰을 때만 같은 와이파이 주소가 더 열리고, 연결 코드로 받은 쿠키 없이는 연결 화면만 보입니다. 다른 사이트에서 오는 요청과 모르는 호스트 이름은 거절합니다.
- 사람 쪽 요청은 같은 출처, 화면 전용 머리말, HttpOnly 세션 쿠키를 모두 봅니다. AI 쪽 요청(CLI, MCP)은 승인과 직원 명단 변경이 막혀 있습니다.
- AI 가 쓴 글은 데이터로만 보여 주고 실행하지 않습니다. 비밀번호나 키를 화면이나 파일에 저장하지 않습니다.
- 브라우저 세션 확인이지, 이 컴퓨터에서 이미 악성 코드가 돌고 있을 때까지 막는 장치는 아닙니다.

## 시험

```
npm test
```

안전 정지, 배분, 배차 화이트리스트, 모델 기록, Muse 읽기 (가짜 화면, 읽는 곳), AI 도구 연결 명령, 자는 시간, 자동화 직원(등록 검사, 실행, 서버째 시험)을 봅니다. macOS 에서 만들고 시험했습니다.

## 라이선스

무료 · 소스 공개 (fair-code). 개인과 5인 미만 조직은 내부에서 무료로 쓰고 고칠 수 있습니다. 5인 이상 조직, 판매, 호스팅 서비스, 이 소프트웨어로 만드는 유료 강의는 CONNECT AI LAB 의 허락이 필요합니다. 이름과 로고는 CONNECT AI LAB 의 것입니다. 자세한 조건은 [LICENSE.ko.md](LICENSE.ko.md) (영문 [LICENSE.md](LICENSE.md) 가 우선)를 봐 주세요.

CONNECT AI LAB · 모두를 위한 AI 교육
