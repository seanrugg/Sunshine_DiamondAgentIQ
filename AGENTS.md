# Working in Sunshine DiamondAgentIQ

Read README.md first. This is a one-day hackathon build: keep it simple.

## Hard rules
- **Zero npm dependencies.** Node 22 built-ins only (node:http, node:test, fetch). The app is plain HTML/CSS/ES modules, no bundler, no framework.
- **`app/js/core/` must run in both the browser and Node.** No `fs`, no `process`, no DOM in core files.
- **Never invent rules.** House rules come only from the league's document (`data/league/house_rules_source.txt`, split into `house_rules.csv`). A blank `rule_text` means "not entered yet".
- **10U and 13U use Little League rules; 18U uses Babe Ruth League rules.** Never answer an 18U question from Little League facts.
- **Pitch math stays in code** (`core/pitchRest.js`, from `data/league/pitch_rest.csv`). Never let the model compute rest days.
- **The umpire is the authority on the field.** Judgment calls are never "wrong" in an answer.
- Data files in `data/` are the source of truth. `app/data/kb.json` is generated: run `npm run build:data`, never edit it by hand.
- When you change any file in `app/`, bump `VERSION` in `app/sw.js`.
- Run `npm test` before every commit.

## One task at a time
Tasks in TASKS.md are sized for one small prompt each. Do one, run the tests, commit, stop.

## Commands
- `npm run build:data` · `npm test` · `npm start` (http://localhost:8787)
- With a model: `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.2:3b npm start`
