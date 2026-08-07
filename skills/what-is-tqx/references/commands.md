# TQX Skill Installation Commands

Use this reference when this Skill was loaded from a temporary network URL, or when the user asks to install or update the TQX skill set locally.

## Selection rule

Use this order for all three TQX Skills:

1. Inspect the current harness. If the requested Skill is already loaded or a usable local copy exists, use it directly and do not install or fetch another copy.
2. Identify the harness's native Skill manager and use it when available.
3. Only when no native manager is available, check `npx` and use `npx skills` when it exists.
4. Only when `npx` is unavailable, check SkillHub and use it when it exists.
5. When none of these options is available, explain the available choices and ask before installing a manager.

Use one manager and one installation scope only. Do not install a second manager merely to install these Skills, install both project and global copies, or automatically overwrite a same-named local Skill. Do not use a browser to access installation links; the agent can run the selected manager directly.

The public source repository is:

```text
https://github.com/tqx-ai/tqx-ts
```

The three skill names are `tqx-research`, `tqx-trading`, and `what-is-tqx`.

## Check the harness and managers

First inspect the active harness's loaded Skills and native management documentation or capability. The exact command is harness-specific; use its native mechanism rather than assuming an external CLI. If the requested Skill is loaded or locally available, stop here and use it.

Only when the harness has no usable native manager, check `npx` first. Check SkillHub only if `npx` is unavailable.

On POSIX shells:

```bash
command -v npx && npx --version
```

On PowerShell:

```powershell
Get-Command npx -ErrorAction SilentlyContinue
```

If `npx` is not found, then check SkillHub:

```bash
command -v skillhub && skillhub --version
```

```powershell
Get-Command skillhub -ErrorAction SilentlyContinue
```

Do not ask the user to repeat these commands in their own terminal; run them from the current agent context when the environment permits.

## Install with npx skills

Use `npx skills` only when no harness-native manager is available and `npx` exists. Before installing, inspect the chosen target directory. If a same-named TQX Skill already exists, use it and do not overwrite it automatically.

List the skills discovered in the repository:

```bash
npx skills add tqx-ai/tqx-ts --list
```

Install all three Skills in one selected scope. Set `--agent` to the agent matching the current harness (for example the CLI or IDE agent you are running in); do not assume a specific one. For a project installation, use:

```bash
npx skills add tqx-ai/tqx-ts \
  --skill tqx-research \
  --skill tqx-trading \
  --skill what-is-tqx \
  --agent <your-agent> \
  --yes
```

For a global installation, use this instead, never in addition to the project command:

```bash
npx skills add tqx-ai/tqx-ts \
  --skill tqx-research \
  --skill tqx-trading \
  --skill what-is-tqx \
  --agent <your-agent> \
  --global \
  --yes
```

The CLI also supports `--skill '*'` to install every discovered skill, but prefer the three explicit names above so unrelated future skills in the repository are not installed accidentally.

## Install with SkillHub

Use SkillHub only when neither a harness-native manager nor `npx` is available, and `skillhub --version` succeeds. Before installing, inspect the one selected destination. Do not overwrite a same-named local Skill. The official SkillHub instructions require an explicit `--dir` pointing to the active agent's skill directory; do not rely on its default `./skills/` directory.

Search for the TQX skills:

```bash
skillhub search tqx
```

Install each result using the exact skill identifier returned by the search:

```bash
skillhub install <tqx-research-result> --dir <agent-skills-directory>
skillhub install <tqx-trading-result> --dir <agent-skills-directory>
skillhub install <what-is-tqx-result> --dir <agent-skills-directory>
```

Point `--dir` at the current agent's own skill directory — global or project scope, but never both. Resolve the directory from the harness you are running in rather than assuming a fixed path. If SkillHub does not return a TQX result, report that the fallback source did not find the Skills; do not install another manager solely as a fallback.

If `skillhub` is not installed and the user explicitly asks to install it, read the official instructions at `https://skillhub.cn/install/skillhub.md` and obtain confirmation before adding the CLI. The documented CLI-only installer is:

```bash
curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh | bash -s -- --cli-only
```

## Verify

After installation, verify that all three `SKILL.md` files exist in the selected agent directory and that their frontmatter contains `name` and `description`. Reload the agent if it does not discover newly installed skills immediately.

## Temporary network access

Fetch `main` from the public repository only for temporary network access when no usable local copy exists. Do not fetch remote `main` merely to replace, refresh, or compare an already loaded or local TQX Skill.
