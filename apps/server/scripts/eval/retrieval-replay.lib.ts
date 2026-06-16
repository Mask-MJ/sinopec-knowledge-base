/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, unicorn/no-process-exit, turbo/no-undeclared-env-vars */
// cspell:disable-file
// scripts/eval/ 是开发评测工具，file-level disable 说明见 run.ts。

export function parseIdList(csv: string): number[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isInteger(n));
}
