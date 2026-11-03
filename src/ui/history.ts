// Training records storage (no UI dependencies).
import { store } from './dom';

export interface Attempt {
  id: string;
  date: string;
  student: string;
  scenario: string;
  approach: string;
  mode: 'training' | 'checkride';
  score: number;
  grade: string;
  acs: string;
  failedTasks: string[];
  failures: string[];
  durationSec: number;
}

const KEY = 'ifr.history.v1';
export const history = {
  all(): Attempt[] {
    return store.get<Attempt[]>(KEY, []);
  },
  add(a: Attempt) {
    const list = history.all();
    list.unshift(a);
    store.set(KEY, list.slice(0, 500));
  },
  clear() {
    store.set(KEY, []);
  },
  csv(list: Attempt[]): string {
    const head = ['date', 'student', 'mode', 'scenario', 'approach', 'acs', 'score', 'grade', 'failed_tasks', 'failures', 'duration_s'];
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    return [head.join(','), ...list.map((a) => [a.date, a.student, a.mode, a.scenario, a.approach, a.acs, a.score, a.grade, a.failedTasks.join('; '), a.failures.join('; '), Math.round(a.durationSec)].map(q).join(','))].join('\n');
  },
};

