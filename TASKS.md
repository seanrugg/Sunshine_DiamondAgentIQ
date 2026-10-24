# Hackathon backlog

Each task is one small prompt (good for a local coding model): do it, `npm test`, commit, stop.
Owner column is for the team whiteboard.

## Must have for the demo
| # | Task | Owner |
|---|---|---|
| 1 | ~~Load the Sunshine house rules~~ Done: 39 rules in `data/league/house_rules.csv`, pitch tables in `data/league/pitch_rest.csv`. | |
| 2 | ~~Board clarifications~~ Done: see `data/league/board_clarifications.md`. | |
| 3 | Deploy: provision the VPS, point DNS, `docker compose up -d --build`, confirm `https://<domain>/api/health`. | |
| 4 | Deploy: turn on GitHub Pages (Actions) and install the app on two phones; test airplane mode. | |
| 5 | Model: on the VPS, run Ollama with a small model, set `LLM_BASE_URL`, confirm the header pill says `live`. | |
| 6 | Demo script: 5 questions, one per role plus a pitch count (see `docs/demo-script.md`). | |

## Should have
| # | Task | Owner |
|---|---|---|
| 7 | Retrieval: add a test question for each of the 39 house rules in `test/core.test.mjs` and fix any that don't come back first (add `keywords` in the CSV, not code). | |
| 8 | Data: add more Babe Ruth League rule summaries for 18U to `data/babe_ruth/rules_facts.csv` from the rulebook PDF the house rules link to. | |
| 9 | UI: add an "Ask about this rule" button on each rule card that fills the Ask box. | |
| 10 | Data: add Sunshine-specific lessons (inclusion, "protect and enjoy" the ballpark) to `data/coaching/lessons.csv`. | |
| 11 | League tab: replace TODO volunteer / umpire / sponsor steps in `data/league/league.json` with board answers. | |
| 12 | Icons: a Sunshine version of the mark (sun behind the "why" ball) in `app/icons/`, flat vector, no league or MLB logos. | |

## Stretch
| # | Task | Owner |
|---|---|---|
| 13 | Everything-on-device model: try WebLLM in the browser behind a "Use on-device AI" toggle (large download; laptop demo only). | |
| 14 | Umpire quick card: a printable one-page summary of the house rules per division. | |
| 15 | Quiz mode: 5 rule questions per division generated from `ll_facts` and house rules, scored on the phone. | |
| 16 | Feedback: a thumbs up/down on answers, logged by the server to a JSONL file for the board to review. | |
