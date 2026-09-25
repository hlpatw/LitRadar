function log(level: string, ...args: unknown[]) {
  const prefix = `[${level.toUpperCase()}]`;
  switch (level) {
    case 'error': console.error(prefix, ...args); break;
    case 'warn': console.warn(prefix, ...args); break;
    case 'info': console.info(prefix, ...args); break;
    default: console.log(prefix, ...args);
  }
}

export const logger = {
  debug: (...args: unknown[]) => log('debug', ...args),
  info: (...args: unknown[]) => log('info', ...args),
  warn: (...args: unknown[]) => log('warn', ...args),
  error: (...args: unknown[]) => log('error', ...args),
  success: (...args: unknown[]) => log('success', ...args),
  log: (opts: { level: string; args: unknown[] }) => log(opts.level, ...opts.args),
};