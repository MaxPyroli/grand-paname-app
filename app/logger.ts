export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogEntry = { ts: number; level: LogLevel; msg: string };

const MAX = 200;
let _logs: LogEntry[] = [];
const _listeners = new Set<() => void>();

// Les messages restent dans le journal de l'app (Paramètres) ; ils ne sont plus
// recopiés dans le terminal de Metro (passer à true pour les y revoir en dev).
const LOGS_DANS_TERMINAL = false;

function push(level: LogLevel, msg: string) {
  _logs = [{ ts: Date.now(), level, msg }, ..._logs].slice(0, MAX);
  _listeners.forEach(fn => fn());
}

export const logger = {
  info:  (msg: string) => { if (__DEV__ && LOGS_DANS_TERMINAL) console.log('[INFO]', msg);  push('INFO',  msg); },
  warn:  (msg: string) => { if (__DEV__ && LOGS_DANS_TERMINAL) console.warn('[WARN]', msg); push('WARN',  msg); },
  error: (msg: string) => { if (__DEV__ && LOGS_DANS_TERMINAL) console.error('[ERR]', msg); push('ERROR', msg); },
  get:   () => [..._logs],
  clear: () => { _logs = []; _listeners.forEach(fn => fn()); },
  subscribe: (fn: () => void) => {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },
};
