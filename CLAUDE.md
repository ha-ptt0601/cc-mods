# cc-mods

Claude Code mods (function-hook plugins). **This repository is public** — everything committed here is visible to anyone.

## Never commit private data

Nothing from the owner's work, machine or accounts goes into code, tests, docs, fixtures or commit messages:

- Secrets: tokens, API keys, passwords, cookies, `.env` values, private keys.
- Company or client names, product or repo names from work, and anything listed in `CLAUDE.local.md` (gitignored; read it before committing).
- Private links: work GitHub repos/PRs/issues, Jira, Confluence, Slack, Sentry, internal dashboards or hosts.
- Real local data: home paths with the real username (`/Users/<name>/...`), session IDs, transcript lines, PR numbers, branch names, emails.

Use made-up placeholders instead: `/Users/me/work/api`, `example.com`, `acme/api#123`, `Fix login bug`. When a test needs data that came from a real transcript, rewrite it as generic data — never paste it.

## Before every commit

- Stage files by name (`git add <path>`), never `git add -A` / `git add .`.
- Review `git diff --cached` for the items above and for build output.
- Don't commit generated files: type-check with `tsc -p <plugin> --noEmit` (a plain `tsc` writes `.js` files next to the sources).
- If something private was already committed, say so before pushing — unpushed history can still be cleaned.

## Releasing a plugin change

The installed copy is cached per version: bump `version` in `<plugin>/.claude-plugin/plugin.json`, then `claude plugin marketplace update cc-mods` and `claude plugin update <plugin>@cc-mods`, then restart Claude Code.
