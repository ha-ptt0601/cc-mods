# cc-mods

Small Claude Code mods: function-hook plugins that add panes, bands and commands inside Claude Code.

## Mods

### session-switcher

A sidebar listing the current project's sessions. Pick one to resume it.

- `☰ Sessions` above the prompt, or `/sessions`, opens the pane with the keyboard on it
- `1`–`9` or `Enter` resumes a session, `r` refreshes, `x` closes, `Esc` goes back to the prompt
- `/sessions close` hides the pane from the prompt
- Sessions with no typed prompt are left out; the open one is marked `▸ (this session)`

## Install

```
/plugin install session-switcher --marketplace ha-ptt0601/cc-mods
```

Answer `y` to add the marketplace, then pick the user scope.

## Develop

Run a mod straight from its folder, reloading on save:

```
claude --plugin-dir ./session-switcher
```

Check it:

```
claude plugin validate ./session-switcher
claude plugin test ./session-switcher
```
