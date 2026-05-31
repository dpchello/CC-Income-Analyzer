# The "What's Next" Prompt — raw + why it's built this way

This is the paste-in version of the `/whats-next` skill (`.claude/skills/whats-next/SKILL.md`).
Use the skill day-to-day (`/whats-next`). Use this doc when you want to read, edit,
or run it without the skill.

---

## Paste-in prompt

> Act as Harvest's product strategist. Do **not** write code or touch PIPELINE.md —
> produce a ranked recommendation memo and nothing else.
>
> 1. Read STRATEGY.md in full; skim PIPELINE.md (Feature Log + pending/approved/failed
>    items) and MARKETING_PLAN.md headers. Respect the Locked Decisions.
> 2. Spawn ONE Explore subagent to report — conclusions only, no file dumps — on:
>    what's wired end-to-end vs. stubbed, the biggest gaps between STRATEGY.md "Done"
>    and the real code, and any half-finished work in the tree. Do not read the
>    codebase file-by-file yourself.
> 3. Generate 6–12 candidate next moves (from "What's Next", pending items, the gaps
>    found, AND net-new ideas). Each must name which goal it serves.
> 4. Score each on Impact (×3), Reach (×2), Effort (×1, inverse) and rank.
> 5. Write WHATS_NEXT.md: TL;DR, the bet, top 3–5 ranked recs (each with goal #,
>    why now, expected effect on the North Star, effort, ready-to-queue?), a scoring
>    table, deferred items, strategy conflicts, and paste-ready pipeline blocks for
>    the top 1–2. Then give me a 3-line summary in chat.
>
> The goal you optimize for — the covered-call writer (a *holder*, not a trader):
> (1) capture income they're leaving on the table [competitor is inaction];
> (2) keep the shares they want to keep; (3) write at the right time (regime-aware);
> (4) manage without grinding; (5) trust it, zero jargon;
> (6) repair positions that get tested — when a short call goes deep ITM and
> assignment looms, give a concrete escape plan: roll up/out/up-and-out to lift the
> assignment ceiling (prefer a net credit), and when a roll can't fund the buyback,
> surface short-dated low-delta income trades (high chance of expiring worthless)
> whose premium generates cash to close the tested call; track cost-to-close and
> financing runway (how many income cycles to neutralize it).
> **North Star: $ of covered-call income captured per active user per month.**
> **Leading indicators: capture rate = captured ÷ theoretically-available; and
> positions defended without forced assignment.** Score every idea on "does this
> move capture rate, defend captured shares/gains, or build trust for someone who'd
> otherwise do nothing or get assigned by surprise?"

---

## Why it's built this way (and why it'll cut your spend)

You told me you feel your tokens/spend go to waste. Here's the diagnosis and the fix,
baked into the prompt above:

1. **You re-derive context every session.** The fix isn't a longer prompt — it's that
   STRATEGY.md *is* the context. The prompt reads canon, not your memory. Cheap, repeatable.

2. **The expensive part is reading the codebase, and it's done in the main thread.**
   Every file you open lives in the main context window for the rest of the session and
   gets re-billed on every turn. The prompt **delegates all codebase discovery to one
   subagent** that reads excerpts and returns *only the conclusion*. You pay for the
   search once, in a throwaway context, and keep just the answer. This is the single
   biggest lever.

3. **No target = wandering = burned tokens.** The North Star + 5-goal rubric forces
   every output to be a decision, not an essay. "A list of 12" becomes "build this, here's
   the proof."

4. **Strategy/build separation.** This prompt *never builds*. Your `cron-executor.md`
   robot already builds the first `approved` item each morning. Keep the two jobs apart:
   `/whats-next` fills the queue with proven bets; the cron drains it. Don't pay Opus to
   both think and type in the same session.

### General token-efficiency habits for this repo
- **Delegate fan-out reads** ("where is X handled", "is Y wired up") to the Explore or
  general-purpose subagent. Keep the conclusion, not the files.
- **Use plan mode** for anything non-trivial before it writes code — approve the plan,
  then let it run, instead of correcting mid-build.
- **One job per session.** Strategy, build, QA, and review are separate skills for a
  reason — bundling them keeps stale context resident and re-billed.
- **Let STRATEGY.md and memory carry state across sessions** instead of re-explaining.
- **Right-size the model.** Mechanical work (queue draining, lint fixes, doc sync)
  doesn't need Opus; reserve it for the strategist/architect calls like this one.
