# Working on Legend Rising from a home PC

The cloud session drives the build and owns the branch `claude/awesome-babbage-o53g6x`.
A PC session takes one package at a time on its own branch, pushes, and the cloud merges it.

## One-time setup (Windows)

1. Install Git: https://git-scm.com/download/win (defaults are fine).
2. Install Node.js 22 LTS: https://nodejs.org (defaults are fine).
3. Install Claude Code (or use the Claude desktop app's Code tab) and sign in.
4. Open PowerShell and run:

```
cd $HOME
git clone https://github.com/Brany3112/LegendRising.git
cd LegendRising
git checkout claude/awesome-babbage-o53g6x
npm install -g playwright
npx playwright install chromium
```

5. Open the `LegendRising` folder in Claude Code and paste the starting message the cloud session gave you.

## Rules for every PC session

- Read `plan/TRAINING-SPEC.md` (the user's approved brief; it wins over everything), then your package entry in
  `plan/BUILD-PLAN.md` (find headings with a search for `### P4-A` etc.), section 0 (ground rules) and Gate G0.
  Inspection notes with file:line evidence are in `plan/notes/`. User-reported bugs are in `plan/USER-ISSUES.md`.
- Work only on your own branch (for example `pc/p4a`). Never push to `claude/awesome-babbage-o53g6x`.
- Only edit the files your package owns. Anything else goes in a `HOOKS.md` note on your branch for the cloud to apply.
- The game lives in the `LegendRising/` subfolder. Serve it with `node qa/serve.mjs` from that folder (env `QA_PORT`, default port in the script).
- Tests: `qa/lib.mjs`, `qa/wpC-det.mjs` and `qa/wpK-lib.mjs` import Playwright from a Linux path (`/opt/node22/...`).
  You may change that import (and only that) so it tries the Linux path first and falls back to the globally installed
  `playwright` package, and on Windows uses the real GPU instead of the SwiftShader flags. Keep the Linux behaviour unchanged.
  Then `node qa/run.mjs unit lint smoke` and the browser tests run on the PC. Say in your summary which tests ran.
- No em dash (the long dash character) anywhere you write. Player-facing text must read like a real person talking.
- Never touch the intro, the boot path or the black fades.
- No model names in commits or code.
- Commit messages end with your own Co-Authored-By / session lines if your tool adds them.

## Stopping

Before turning the PC off, type: **wrap up and push**. The session commits what it has (finished or not),
writes `PC-STATUS.md` on the branch (done, not done, what to do next, which tests ran), and pushes the branch.
Then tell the cloud session "PC pushed". The cloud merges finished work and finishes anything left.
