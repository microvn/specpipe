import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

export function cli(argv) {
  const program = new Command();

  program
    .name('agentpipe')
    .description('CLI toolkit for spec-first development with agentic AI coding agents')
    .version(pkg.version);

  program
    .command('init [path]')
    .description('Initialize a project with the dev-kit')
    .option('-f, --force', 'Overwrite existing files')
    .option('-g, --global', 'Install skills globally to ~/.claude/skills/ (available in all projects)')
    .option('--agents <list>', 'Target agent(s): claude,codex,cursor,antigravity,openclaw,hermes or "all" (default: claude)')
    .option('--only <components>', 'Install only specific components (comma-separated: hooks,skills,scripts,docs,config)')
    .option('--adopt', 'Adopt existing kit files without overwriting (migration from setup.sh)')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (path, opts) => {
      const { initCommand } = await import('./commands/init.js');
      await initCommand(path || '.', opts);
    });

  program
    .command('upgrade [path]')
    .description('Smart upgrade — preserves customized files')
    .option('-f, --force', 'Overwrite even customized files')
    .option('-g, --global', 'Upgrade skills globally in ~/.claude/skills/')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (path, opts) => {
      const { upgradeCommand } = await import('./commands/upgrade.js');
      await upgradeCommand(path || '.', opts);
    });

  program
    .command('check [path]')
    .description('Check if an update is available')
    .action(async (path) => {
      const { checkCommand } = await import('./commands/check.js');
      await checkCommand(path || '.');
    });

  program
    .command('list [path]')
    .description('List installed components and their status')
    .action(async (path) => {
      const { listCommand } = await import('./commands/list.js');
      await listCommand(path || '.');
    });

  program
    .command('diff [path]')
    .description('Show differences between installed and latest kit files')
    .action(async (path) => {
      const { diffCommand } = await import('./commands/diff.js');
      await diffCommand(path || '.');
    });

  program
    .command('remove [path]')
    .description('Uninstall dev-kit (preserves CLAUDE.md and docs/)')
    .option('-g, --global', 'Remove global install (~/.claude/skills/, ~/.claude/hooks/, hook entries from ~/.claude/settings.json)')
    .action(async (path, opts) => {
      const { removeCommand } = await import('./commands/remove.js');
      await removeCommand(path || '.', opts);
    });

  program.parse(argv);
}
