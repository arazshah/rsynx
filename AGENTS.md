# AGENTS.md

Guide for Codex when working in this repository.

## About the project

rsynx is an open-source command-line tool for live terminal sharing between two
people — like AnyDesk, but for the terminal, with no need for SSH, a public IP, or
firewall configuration. One person hosts (`rsynx host`), which generates a six-digit
code and a four-character password; the other side connects with `rsynx join <code>`.
Once the host approves, the guest can watch the terminal live, chat, and — if the host
approves again — temporarily take typing control. All communication is end-to-end
encrypted; the relay server never has access to the decryption key or message content.
Project owner: Araz Shahkarami (mail@araz.me) — github.com/arazshah/rsynx — MIT license.

The full protocol spec is at [`docs/SPEC.md`](docs/SPEC.md) — before changing anything
related to the protocol, encryption, or message formats, read that file, and if a
protocol behavior change is needed, update SPEC.md first.

## Hard rules (non-negotiable)

- **Bun only.** Never use npm/yarn/pnpm or the Node.js runtime anywhere — not in
  scripts, not in the Dockerfile, not in CI.
- **strict: true** in every project's tsconfig (root and every workspace).
- **The relay must never:** store encrypted payloads on disk, attempt to decrypt them,
  keep a session alive after it ends, or log payload content. Relay logs contain only
  session-id, message type, and timestamp.
- **No control operation runs without the host's explicit approval** — not accepting a
  join, not the guest taking typing control.
- **File names in kebab-case.**
- **Commit messages in Conventional Commits format.**

## Commit convention

Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, ...).
Each logical stage of work (e.g. each workspace package, each CLI sub-step) must be
committed separately after its relevant tests pass (typecheck and/or `bun test`) —
don't create large commits that bundle multiple stages together.

## Project-specific technical notes

- Protocol message types (envelope, relay-level and user-level message kinds) must be
  written as discriminated unions to keep full type-safety between apps/cli and
  apps/relay.
