import type { Log } from "../../types/log.js";

export function createConsoleLogger(): Log {
  return {
    http: (m) => console.log(`[http] ${m}`),
    info: (m) => console.info(`[info] ${m}`),
    warn: (m) => console.warn(`[warn] ${m}`),
    error: (m) => {
      if (m instanceof Error) console.error(m);
      else console.error(`[error] ${m}`);
    },
    debug: (m) => console.debug(`[debug] ${m}`),
  };
}
