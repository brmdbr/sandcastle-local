# Sandcastle Local Fork Plan

Goal: create a fork of Sandcastle that supports a local execution mode using the host's installed Claude CLI and existing Claude login, without requiring Docker or an Anthropic API key for that mode.

## Desired end-state

- [ ] Repo renamed/documented as a local-mode-capable Sandcastle fork
- [ ] New execution mode supports `local` and existing `docker`
- [ ] Local mode runs Claude CLI directly on the host in the git worktree
- [ ] Local mode does not require `ANTHROPIC_API_KEY`
- [ ] Existing worktree + merge-back orchestration still works in local mode
- [ ] CLI init flow supports choosing local vs docker mode
- [ ] README clearly explains tradeoffs: local mode vs docker mode
- [ ] Local mode has at least one basic test path or documented smoke test

## First implementation slice

- [ ] Inspect current sandbox abstractions and identify smallest seam for execution-mode split
- [ ] Add a host/local sandbox implementation for `exec` and `execStreaming`
- [ ] Add config for execution mode to init + runtime
- [ ] Make env requirements conditional on provider/mode
- [ ] Update scaffolded files for local mode
- [ ] Update docs
- [ ] Smoke test on a machine with Claude CLI already logged in

## Notes

Principle: preserve as much upstream architecture as possible, especially:
- worktree management
- prompt preprocessing
- iteration loop
- completion signal handling
- merge-back behavior

Main change should be execution backend selection, not a rewrite.
