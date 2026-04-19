# Harvest — CC Income Analyzer

## Strategy Alignment (read first, every session)

**At the start of every session, read `STRATEGY.md` before doing anything else.**

Before creating any plan, implementing any feature, or changing any behavior:
1. Check the request against `STRATEGY.md` — positioning, pricing, audience, locked decisions
2. If it conflicts, surface the conflict explicitly: "This conflicts with [section] in STRATEGY.md — approve the change?"
3. If approved, update `STRATEGY.md` first, then cascade to `MARKETING_PLAN.md` and `PIPELINE.md`
4. After shipping any feature, add it to the Feature Log in `STRATEGY.md`

**PIPELINE.md and MARKETING_PLAN.md do not override STRATEGY.md. STRATEGY.md is the source of truth.**

When creating a new plan:
- Read `STRATEGY.md` → confirm the plan aligns with vision, audience, and locked decisions
- Read `PIPELINE.md` → confirm no duplicate work is queued
- Read `MARKETING_PLAN.md` → confirm the launch sequence is consistent

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

Add as a new top-level ## section in global CLAUDE.md (~/.claude/CLAUDE.md) since this is an environment-level constraint.\n\n## Screenshot & Browser Testing
- Do NOT use Playwright/Chromium for screenshots on this machine - it's blocked by macOS Gatekeeper and the browse daemon exits 137.
- For visual verification, ask the user to share a screenshot instead of attempting screencapture (which grabs the desktop/VS Code, not the browser).
Add under a ## Python or ## Language Conventions section in the project CLAUDE.md.\n\n## Python Version
- Target Python 3.9 compatibility - avoid 3.10+ union type syntax (`X | Y`); use `Union[X, Y]` from typing instead.
Add under ## Workflow or create a new ## Planning section in global CLAUDE.md.\n\n## Planning Workflow
- When presenting a plan for review, write it to a markdown file (e.g., `PLAN.md`) instead of using plan-mode artifacts, so the user can add inline comments that persist.
Add under a ## Database or ## Supabase section in the relevant project's CLAUDE.md.\n\n## Database Migrations Checklist
- After writing SQL migrations, verify: (1) semicolons at end of each statement, (2) any referenced trigger functions exist, (3) RLS policies cover all CRUD ops, (4) date/nullable params are explicitly typed.
- Never make foreign-key columns like `practice_id` nullable without explicit user approval.