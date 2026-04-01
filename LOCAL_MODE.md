# Local Mode

Local mode lets Sandcastle run Claude Code directly on the host instead of inside Docker.

## Why use it?

- You already use Claude Code CLI locally
- You want to reuse your existing Claude login/session
- You want Sandcastle's worktree + orchestration flow without container setup

## Tradeoffs

Pros:

- no Docker required
- no `ANTHROPIC_API_KEY` required for the default Claude provider
- less setup friction on a personal machine

Cons:

- less isolation than Docker mode
- depends on host-installed tools and host environment
- not as reproducible as a pinned container image

## Quick setup

```bash
npx sandcastle init --execution-mode local
cp .sandcastle/.env.example .sandcastle/.env
```

Then make sure these are true on the host:

- `claude` is on PATH
- `claude` is already logged in
- `git` is available
- optionally: `gh` is available and `GH_TOKEN` is set if your prompts/scripts use GitHub CLI

## JS API example

```ts
import { run } from "@ai-hero/sandcastle";

await run({
  promptFile: ".sandcastle/prompt.md",
  executionMode: "local",
});
```

## What stays the same

- git worktrees
- prompt preprocessing
- iteration loop
- completion signals
- merge-back behavior

## What changes

- Docker image is not used
- `.sandcastle/Dockerfile` is ignored
- Claude runs in the worktree on the host
