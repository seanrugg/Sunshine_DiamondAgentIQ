# Hackathon backlog

Each task is one small prompt (good for a local coding model): do it, `npm test`, commit, stop.
Owner column is for the team whiteboard.

## Must have for the demo
| # | Task | Owner |
|---|---|---|
| 1 | Board: fill `rule_text` for H001-H008 in `data/league/house_rules.csv` (set `status=draft`), then `npm run build:data`. | |
| 2 | Board: answer the 18U pitch-count question (H003). If Sunshine sets a limit, add rows for ages 17-18 to `data/little_league/pitch_rest.csv` with `source_id=SUNSHINE` and a test in `test/core.test.mjs`. | |
| 3 | Deploy: provision the VPS, point DNS, `docker compose up -d --build`, confirm `https://<domain>/api/health`. | |
| 4 | Deploy: turn on GitHub Pages (Actions) and install the app on two phones; test airplane mode. | |
| 5 | Model: on the VPS, run Ollama with a small model, set `LLM_BASE_URL`, confirm the header pill says `live`. | |
| 6 | Demo script: 5 questions, one per role plus a pitch count (see `docs/demo-script.md`). | |

## Should have
| # | Task | Owner |
|---|---|---|
| 7 | Retrieval: for bat questions, rank the fact whose `division` matches the player's age first (`core/retrieve.js`), with a test. | |
| 8 | UI: show the selected division's Little League division hint under the Rules heading (`app/js/app.js`, `renderRules`). | |
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
