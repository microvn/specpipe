import { intro, outro, select, multiselect, isCancel, cancel } from '@clack/prompts';
import { AGENT_IDS, AGENTS } from '../lib/agents.js';
import { ALL_SKILL_NAMES, OPTIONAL_SKILLS } from '../lib/installer.js';
import { HOOK_IDS, HOOKS } from '../lib/hooks.js';

/**
 * Interactive `specpipe init` picker (clack). Three questions: scope, agents, skills.
 * Returns { scope: 'project'|'global', agents: string[], skills: string|null } where
 * skills is a comma list, or null when every skill is selected (= the `all` default).
 * Returns null if the user cancels (Ctrl-C / Esc).
 */
export async function runInteractiveInit() {
  intro('specpipe init');

  const scope = await select({
    message: 'Install where?',
    options: [
      { value: 'project', label: 'This project', hint: 'default — ./.claude, ./.agents, …' },
      { value: 'global', label: 'Globally', hint: 'available in every project (~/.claude/skills, …)' },
    ],
    initialValue: 'project',
  });
  if (isCancel(scope)) { cancel('Cancelled — nothing installed.'); return null; }

  const agents = await multiselect({
    message: 'Which agents? (space to toggle, enter to confirm)',
    options: AGENT_IDS.map((id) => ({ value: id, label: AGENTS[id].label })),
    initialValues: ['claude'],
    required: true,
  });
  if (isCancel(agents)) { cancel('Cancelled — nothing installed.'); return null; }

  const skills = await multiselect({
    message: 'Which skills? (all on by default; deselect what you don\'t need)',
    options: ALL_SKILL_NAMES.map((name) => ({
      value: name,
      label: name,
      hint: OPTIONAL_SKILLS.includes(name) ? 'optional' : undefined,
    })),
    initialValues: [...ALL_SKILL_NAMES],
    required: true,
  });
  if (isCancel(skills)) { cancel('Cancelled — nothing installed.'); return null; }

  // Only offer guards at least one selected agent can hook-ENFORCE. Most guards are
  // Claude-only (they hook Claude tool events like Edit/Glob/Write); Codex & Antigravity
  // enforce shell-guard only, Cursor shell+read. The unsupported guards still reach a
  // non-Claude agent as advisory rules in its rules file — just not as a blocking hook.
  const enforceable = HOOK_IDS.filter((id) => agents.some((a) => !!HOOKS[id].wiring[a]));
  const claudeOnly = HOOK_IDS.filter((id) => !enforceable.includes(id));
  const hookMsg = claudeOnly.length
    ? `Which guard hooks to ENFORCE for ${agents.map((a) => AGENTS[a].label).join(', ')}? (${claudeOnly.join(', ')} are Claude-only — they ship as advisory rules for the others)`
    : 'Which guard hooks? (block secrets + wasteful-dir exploration; clear all to disable guardrails)';
  const hooks = await multiselect({
    message: hookMsg,
    options: enforceable.map((id) => ({ value: id, label: id, hint: HOOKS[id].desc })),
    initialValues: [...enforceable],
    required: false,
  });
  if (isCancel(hooks)) { cancel('Cancelled — nothing installed.'); return null; }

  const allSkills = skills.length === ALL_SKILL_NAMES.length;
  // 'none' = explicitly cleared; null = every enforceable guard selected (the default);
  // else the explicit subset. resolveHooks then re-filters per agent at emit time.
  const hooksArg = hooks.length === 0 ? 'none'
    : hooks.length === enforceable.length ? null
    : hooks.join(',');
  outro(`Installing ${skills.length} skill(s) + ${hooks.length} enforced hook(s) for ${agents.map((a) => AGENTS[a].label).join(', ')} (${scope}).`);

  return { scope, agents, skills: allSkills ? null : skills.join(','), hooks: hooksArg };
}
