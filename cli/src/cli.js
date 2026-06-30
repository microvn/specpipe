import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

export function cli(argv) {
  const program = new Command();

  program
    .name('specpipe')
    .description('CLI toolkit for spec-first development with agentic AI coding agents')
    .version(pkg.version);

  program
    .command('init [path]')
    .description('Initialize a project with the dev-kit')
    .option('-f, --force', 'Overwrite existing files')
    .option('-g, --global', 'Install skills globally (per-agent user-level dirs, all projects); honors --agents, defaults to claude')
    .option('--agents <list>', 'Target agent(s): claude,codex,cursor,antigravity,openclaw,hermes or "all" (default: claude)')
    .option('--skills <list>', 'Skills to install: all | core | comma list e.g. sp-build,sp-fix (default: all)')
    .option('--hooks <list>', 'Guard hooks to install: all | none | comma list e.g. shell,read (default: all)')
    .option('-y, --yes', 'Skip interactive prompts and use defaults (per-project, claude, all skills)')
    .option('--only <components>', 'Install only specific components (comma-separated: hooks,skills,docs,config)')
    .option('--adopt', 'Adopt existing kit files without overwriting (migration from setup.sh)')
    .option('--dry-run', 'Show what would be done without making changes')
    .action(async (path, opts) => {
      try {
        const { initCommand } = await import('./commands/init.js');
        await initCommand(path || '.', opts);
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });

  program
    .command('upgrade [path]')
    .description('Smart upgrade — preserves customized files')
    .option('-f, --force', 'Overwrite even customized files')
    .option('-g, --global', 'Upgrade the global install (every agent installed globally)')
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
    .option('-g, --global', 'Remove global install (per-agent global sp-* skill dirs + Claude hooks/settings)')
    .option('--agents <list>', 'Remove only these agent(s), keeping the rest (e.g. codex,cursor); shared files are kept while any remaining agent needs them')
    .option('--dry-run', 'Show what would be removed without deleting anything')
    .action(async (path, opts) => {
      const { removeCommand } = await import('./commands/remove.js');
      await removeCommand(path || '.', opts);
    });

  program.parse(argv);
}
