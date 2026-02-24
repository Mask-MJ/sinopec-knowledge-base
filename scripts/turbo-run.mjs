#!/usr/bin/env node

/**
 * Interactive turbo task runner.
 * Lists all workspace packages that have the specified script and lets you choose which to run.
 *
 * Usage: node scripts/turbo-run.mjs <command>
 * Example: node scripts/turbo-run.mjs dev
 */

import { cancel, isCancel, select } from '@clack/prompts';
import { getPackages } from '@manypkg/get-packages';
import { execaCommand } from 'execa';

const command = process.argv[2];

if (!command) {
  console.error('Please enter the command to run');
  console.error('Usage: node scripts/turbo-run.mjs <command>');
  process.exit(1);
}

const { packages } = await getPackages(process.cwd());

// 只显示有对应命令的包
const selectPkgs = packages.filter((pkg) => {
  return pkg?.packageJson?.scripts?.[command];
});

if (selectPkgs.length === 0) {
  console.error(`No package found with script "${command}"`);
  process.exit(1);
}

let selectPkg;

if (selectPkgs.length > 1) {
  selectPkg = await select({
    message: `Select the app you need to run [${command}]:`,
    options: selectPkgs.map((item) => ({
      label: item.packageJson.name,
      value: item.packageJson.name,
    })),
  });

  if (isCancel(selectPkg) || !selectPkg) {
    cancel('👋 Has cancelled');
    process.exit(0);
  }
} else {
  selectPkg = selectPkgs[0]?.packageJson?.name ?? '';
}

if (!selectPkg) {
  console.error('No app found');
  process.exit(1);
}

execaCommand(`pnpm --filter=${selectPkg} run ${command}`, {
  stdio: 'inherit',
});
