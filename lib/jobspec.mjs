// 사무실(다른 맥)에서 돌릴 수 있는 일의 목록. 이 목록에 없는 일은 보내지도, 돌리지도 않는다.
// 이 파일은 본사와 사무실 양쪽에서 쓴다 (사무실에는 실행기와 함께 복사된다). node 기본 모듈만 쓴다.
// 할 일 제목이나 메모는 명령에 절대 들어가지 않는다. 인자는 아래 정해진 모양과 검사한 값으로만 만든다.

export const TEMPLATES = {
  'ai-text': { label: '글 일 (사무실 로컬 AI)', kind: 'ai', heavy: false, timeoutMin: 10 },
  'ffmpeg-test': { label: 'ffmpeg 시험 클립', kind: 'render', heavy: false, timeoutMin: 3 },
  'remotion-render': { label: 'Remotion 렌더', kind: 'render', heavy: true, timeoutMin: 90 },
  'blender-render': { label: 'Blender 렌더 (한 장)', kind: 'render', heavy: true, timeoutMin: 90 },
};

export const LIGHT_TEMPLATES = Object.keys(TEMPLATES).filter((k) => !TEMPLATES[k].heavy);

const COMP = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const FRAMES = /^(\d{1,6})-(\d{1,6})$/;
const MODEL = /^[A-Za-z0-9][\w.:/-]{0,120}$/;

// 사무실 홈 아래 상대 경로만 (render-node/ 로 시작, .. 없음, - 로 시작하는 조각 없음)
export function safeRelPath(p, ext) {
  if (typeof p !== 'string' || p.length > 300) return null;
  const s = p.trim();
  if (!/^(render-node)\//.test(s)) return null;
  if (!s.endsWith(ext)) return null;
  if (/[\u0000-\u001f\\`$"'*?<>|;&]/.test(s)) return null;
  const parts = s.split('/');
  if (parts.some((x) => x === '' || x === '.' || x === '..' || x.startsWith('-'))) return null;
  return s;
}

function intIn(v, lo, hi, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : NaN;
}

// 할 일에 붙은 일 모양을 검사하고 정리한다. 틀리면 { error } (한국어, 화면에 그대로 보여 줌)
export function validateJob(job) {
  const template = job?.template || 'ai-text';
  if (!Object.hasOwn(TEMPLATES, template)) return { error: '정해진 일 종류가 아니에요. (글 일, ffmpeg 시험 클립, Remotion 렌더, Blender 렌더 중 하나)' };
  const p = job?.params && typeof job.params === 'object' ? job.params : {};
  if (template === 'ai-text') return { job: { template, params: {} } };
  if (template === 'ffmpeg-test') {
    const seconds = intIn(p.seconds, 1, 10, 1);
    if (Number.isNaN(seconds)) return { error: 'ffmpeg 시험 클립은 1~10초만 돼요.' };
    return { job: { template, params: { seconds } } };
  }
  if (template === 'remotion-render') {
    const composition = String(p.composition || '').trim();
    if (!COMP.test(composition)) return { error: 'Remotion 컴포지션 이름은 영문, 숫자, -, _ 만 써 주세요.' };
    const frames = String(p.frames || '').trim();
    if (frames) {
      const m = FRAMES.exec(frames);
      if (!m || Number(m[1]) > Number(m[2])) return { error: '프레임은 0-29 처럼 써 주세요.' };
    }
    return { job: { template, params: frames ? { composition, frames } : { composition } } };
  }
  // blender-render
  const blend = safeRelPath(String(p.blend || ''), '.blend');
  if (!blend) return { error: 'Blender 파일은 사무실의 render-node/… 아래 .blend 경로로 써 주세요.' };
  const frame = intIn(p.frame, 0, 1000000, 1);
  if (Number.isNaN(frame)) return { error: '프레임 번호는 0 이상의 정수예요.' };
  return { job: { template, params: { blend, frame } } };
}

// 사무실에서 실제로 돌릴 명령. 셸을 거치지 않고 인자 배열로만 실행한다.
// home: 사무실 홈, jobDir: 이 일의 폴더 (절대 경로)
export function buildCommand(job, { home, jobDir }) {
  const v = validateJob(job);
  if (v.error) throw new Error(v.error);
  const { template, params } = v.job;
  const out = `${jobDir}/out`;
  if (template === 'ffmpeg-test') {
    return {
      cmd: 'ffmpeg', cwd: jobDir,
      args: ['-hide_banner', '-nostdin', '-y', '-f', 'lavfi', '-i', `testsrc=duration=${params.seconds}:size=1280x720:rate=30`, '-pix_fmt', 'yuv420p', `${out}/test.mp4`],
    };
  }
  if (template === 'remotion-render') {
    const cwd = `${home}/render-node/remotion`;
    const args = ['render', 'src/index.ts', params.composition, `${out}/${params.composition}.mp4`];
    if (params.frames) args.push(`--frames=${params.frames}`);
    return { cmd: `${cwd}/node_modules/.bin/remotion`, cwd, args, gpu: true };
  }
  if (template === 'blender-render') {
    return {
      cmd: 'blender', cwd: jobDir, gpu: true,
      // -Y: .blend 안의 파이썬 자동 실행 끄기
      args: ['-b', '-Y', `${home}/${params.blend}`, '-o', `${out}/frame_####`, '-F', 'PNG', '-f', String(params.frame)],
    };
  }
  return null; // ai-text 는 명령이 아니라 사무실 Ollama 에 묻는다
}

export function validModel(m) {
  return typeof m === 'string' && MODEL.test(m);
}
