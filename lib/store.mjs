// data/hq.json 저장소. 쓰기는 한 줄로 줄 세우고, 임시 파일에 쓴 뒤 이름을 바꾼다 (원자적 쓰기).
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { ymd } from './util.mjs';

export class Store {
  constructor(file, seedFn) {
    this.file = file;
    this.dir = path.dirname(file);
    this.seedFn = seedFn;
    this.data = null;
    this.rev = 1;
    this.chain = Promise.resolve();
    this.lastBackupDay = null;
  }

  async load() {
    await fs.mkdir(this.dir, { recursive: true });
    let raw;
    try {
      raw = await fs.readFile(this.file, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      this.data = this.seedFn();
      await this.#write(this.data);
      return this.data;
    }
    // 파일이 깨졌으면 덮어쓰지 않고 멈춘다 (데이터 보호)
    try {
      this.data = JSON.parse(raw);
    } catch (e) {
      throw new Error(`data/hq.json 을 읽을 수 없습니다 (${e.message}). data/backups 에서 복구하세요.`);
    }
    return this.data;
  }

  // fn(draft) 은 복사본을 고친다. 에러가 나면 원본은 그대로.
  mutate(fn) {
    const run = this.chain.then(async () => {
      const draft = structuredClone(this.data);
      const result = await fn(draft);
      await this.#write(draft);
      this.data = draft;
      this.rev++;
      return result;
    });
    this.chain = run.catch(() => {});
    return run;
  }

  async #write(obj) {
    await this.#backupOncePerDay();
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    const fh = await fs.open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(JSON.stringify(obj, null, 2));
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, this.file);
  }

  // 하루 한 번, 첫 쓰기 전에 그날 백업을 남긴다. 최근 14개만 보관.
  async #backupOncePerDay() {
    const day = ymd();
    if (this.lastBackupDay === day) return;
    this.lastBackupDay = day;
    if (!fssync.existsSync(this.file)) return;
    const bdir = path.join(this.dir, 'backups');
    await fs.mkdir(bdir, { recursive: true });
    const target = path.join(bdir, `hq-${day}.json`);
    if (!fssync.existsSync(target)) await fs.copyFile(this.file, target);
    const files = (await fs.readdir(bdir)).filter((f) => /^hq-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 14))) await fs.unlink(path.join(bdir, f));
  }
}
