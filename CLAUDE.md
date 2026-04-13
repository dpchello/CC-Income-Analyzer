# Harvest — CC Income Analyzer

## gstack

Install gstack to get the full skill suite used on this project:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Requires [bun](https://bun.sh). If not installed:
```bash
curl -fsSL https://bun.sh/install | bash
```

### Web browsing

Always use the `/browse` skill for all web browsing and browser interaction.
**Never use `mcp__claude-in-chrome__*` tools.**

### Available skills

| Skill | Purpose |
|-------|---------|
| `/office-hours` | YC Office Hours — startup diagnostic + builder brainstorm |
| `/plan-ceo-review` | CEO-level plan review |
| `/plan-eng-review` | Engineering plan review |
| `/plan-design-review` | Design plan review (report-only audit) |
| `/design-consultation` | Design system from scratch |
| `/design-shotgun` | Visual design exploration |
| `/design-html` | HTML/CSS design implementation |
| `/review` | PR review |
| `/ship` | Ship workflow (pre-merge checklist + PR) |
| `/land-and-deploy` | Merge → deploy → canary verify |
| `/canary` | Post-deploy monitoring loop |
| `/benchmark` | Performance regression detection |
| `/browse` | Headless browser (Playwright) — use for all web browsing |
| `/connect-chrome` | Open gstack browser / connect Chrome |
| `/qa` | Full QA pass with fixes |
| `/qa-only` | QA report only, no fixes |
| `/design-review` | Design audit + fix loop |
| `/setup-browser-cookies` | One-time cookie/auth setup for browser |
| `/setup-deploy` | One-time deploy config |
| `/retro` | Retrospective |
| `/investigate` | Systematic root-cause debugging |
| `/document-release` | Post-ship doc updates |
| `/codex` | Multi-AI second opinion via OpenAI Codex |
| `/cso` | OWASP Top 10 + STRIDE security audit |
| `/autoplan` | Auto-review pipeline: CEO → design → eng |
| `/plan-devex-review` | DevEx plan review |
| `/devex-review` | DevEx audit + fix loop |
| `/careful` | Careful mode — slow down, double-check |
| `/freeze` | Freeze a file or directory from edits |
| `/guard` | Guard mode — watch for regressions |
| `/unfreeze` | Unfreeze a frozen file or directory |
| `/gstack-upgrade` | Upgrade gstack to latest |
| `/learn` | Learn mode — explain what gstack is doing |

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
