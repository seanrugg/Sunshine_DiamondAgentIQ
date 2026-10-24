# Sunshine DiamondAgentIQ

**The Sunshine Baseball League's learning companion, on any phone.** Parents, coaches, players and umpires ask what happened on the field and get the Sunshine house rule first, the Little League (10U, 13U) or Babe Ruth League (18U) rule behind it, whether it was the umpire's judgment or a written rule, and a life lesson to take home.

Hack for Humanity 2026 · a league edition of [DiamondAgentIQ](https://github.com/seanrugg/diamondagentiq)

> Sunshine Ballpark's mission is to offer sports programs and educational opportunities that help young people, especially those who are disadvantaged or facing physical, developmental and other challenges, learn critical life lessons.

The league already pays for a website that handles registration and team formation. This app does the other job: **helping everyone learn the league and the game** so the season is fair, safe and fun.

## What it does

| Tab | For | What you get |
|---|---|---|
| **Ask** | everyone | Pick parent / coach / player / umpire, ask a question. Answer card with a call-type stamp (Written rule, Umpire's judgment, Judgment + rule, Coaching moment), what it means for *you*, a life lesson, a tip, and the sources. |
| **Rules** | everyone | All 39 Sunshine house rules for your division, grouped by topic, then the rulebook behind them: Little League for 10U and 13U, Babe Ruth League for 18U. Searchable, with a link to the full house rules document. |
| **Pitch count** | coaches, parents | Age (or division) + pitches + date → rest days and the exact date they can pitch again. Done in code from the Sunshine house pitch-count tables (75 / 85 / 105 a day). |
| **Learn** | everyone | The team's life lessons, with what each means for a player, coach, parent and umpire. |
| **League** | families, volunteers | Mission, divisions, how to get involved, fields, contact. |

Divisions: **10U** (ages 8-10, 46 ft mound / 60 ft bases), **13U** (11-13, 50 / 70), **18U** (14-18, Babe Ruth rules). Season June 1 to mid-August at Sunshine Ballpark, 1200 Wicklow Drive, Fredericksburg.

## Two ways to run it

The same app runs both ways; the header pill shows which (`offline`, `server`, or `live` when a model is answering).

**1. Everything on the phone (no server, no internet after install).** The app is a static PWA. All rules and lessons ship in `app/data/kb.json`, and answers are composed on the phone from that data. Publish `app/` over HTTPS once (GitHub Pages workflow included), open it on the phone, *Add to Home Screen*, and it works in airplane mode.

**2. Phone + VPS (model-written answers).** `server/server.mjs` serves the same app and adds `POST /api/ask`, which sends only the retrieved rules to any OpenAI-compatible model (Ollama on the VPS, or a hosted API). The model may cite only rules it was given; anything else is dropped. Pitch math never goes to the model. If the model fails, the server returns the offline answer.

```
phone ──► app (PWA, kb.json cached) ──► offline answer
              │
              └─(if reachable)─► VPS: server.mjs ─► retrieve ─► model ─► citation check ─► answer
```

## Quick start

Node 22, no npm install needed (zero dependencies).

```bash
git clone https://github.com/seanrugg/Sunshine_DiamondAgentIQ && cd Sunshine_DiamondAgentIQ
npm run build:data     # data/*.csv + league.json -> app/data/kb.json
npm test               # 22 tests, no network
npm start              # http://localhost:8787  (offline answers)
```

With a local model:

```bash
ollama pull llama3.2:3b
LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.2:3b npm start
```

On a phone on the same Wi-Fi, open `http://<laptop-ip>:8787`. (Install-to-home-screen and offline caching need HTTPS; use the VPS or GitHub Pages for that.)

### Deploy to a VPS (HTTPS)

```bash
# on the VPS, with Docker and a DNS A record pointing at it
git clone https://github.com/seanrugg/Sunshine_DiamondAgentIQ && cd Sunshine_DiamondAgentIQ
cp .env.example .env                       # optionally set LLM_BASE_URL / LLM_MODEL / LLM_API_KEY
DOMAIN=sunshine.example.com docker compose up -d --build
# optional local model on the VPS:
#   set LLM_BASE_URL=http://ollama:11434/v1 in .env, then
DOMAIN=sunshine.example.com docker compose --profile ollama up -d --build
docker compose exec ollama ollama pull llama3.2:3b
```

Caddy gets the TLS certificate automatically. Open `https://sunshine.example.com` on the phone and add it to the home screen.

### Phone-only via GitHub Pages

Settings → Pages → Source: **GitHub Actions**. Every push to `main` runs the tests and publishes `app/`. To point a Pages copy at the VPS for live answers, open it once as `https://<pages-url>/?api=https://sunshine.example.com` (remembered on that phone).

## Data

| File | What | Who edits |
|---|---|---|
| `data/league/house_rules_source.txt` | The Sunshine house rules exactly as the league published them ([Google Doc](https://docs.google.com/document/d/1E8swMukyyqRpu9ARidIRSdz_ffPzK-Fx76xJpE69Aqo)) | Board |
| `data/league/house_rules.csv` | The same rules split into 39 rows the app can search: division (`10U`, `13U`, `18U`, `10U;13U` or `all`), topic, section, search keywords, rule text, which rulebook fact it overrides, and whether it is a written rule or the umpire's judgment | Team, from the source above |
| `data/league/pitch_rest.csv` | The house pitch-count tables: 10U 75/day, 13U 85/day, 18U 105/day, with rest-day tiers | Team, from the source above |
| `data/league/league.json` | Mission, divisions (with their rulebook and field), fields, contact, get-involved roles | Board |
| `data/little_league/` | 65 Little League baseball rule summaries for ages 8-18, each with a source link (10U and 13U) | Team, from DiamondAgentIQ |
| `data/babe_ruth/` | Babe Ruth League baseball rule summaries (18U): bats, field, extra innings, lightning | Team, from DiamondAgentIQ |
| `data/coaching/*.csv` | Life lessons, tips, game situations and stories (team-written) | Coach / umpire on the team |

After editing, run `npm run build:data` and bump `VERSION` in `app/sw.js` so installed phones refresh. If the board changes the Google Doc, update `house_rules_source.txt` and the matching rows in `house_rules.csv` together.

How answers use the data: Sunshine house rules always come first. A house rule that overrides a rulebook rule (bats, pitch counts, dropped third strike, batting order) hides that rulebook rule from the answer. 18U answers never use Little League rules. The Little League and Babe Ruth summaries are marked as drafts until someone checks them; the house rules are marked as the league's own.

### Open questions for the Sunshine Board

- **18U pitch count at exactly 25 pitches:** the house rules say "fewer than 25" needs no rest and "26-50" needs one day. The app treats 25 as no rest.
- **13U warm-up pitches:** the house rules give 10U and 18U only.
- **18U home field:** the 18U heading says JMHS stadium; the cleats rule names Walker-Grant Middle School Armstrong Field.
- Volunteer, umpire and sponsor sign-up steps and the league email.

## Project layout

```
app/                 the PWA (static; this folder is what Pages publishes)
  index.html  styles.css  manifest.webmanifest  sw.js
  js/app.js          UI
  js/core/           shared by phone and server: retrieve, answer, pitchRest, philosophy
  data/kb.json       generated by scripts/build-data.mjs
server/server.mjs    optional API + static server (node:http, zero deps)
scripts/build-data.mjs
data/                source data (CSV/JSON)
test/                node:test
deploy/Caddyfile  docker-compose.yml  Dockerfile  .github/workflows/pages.yml
```

## What carried over from DiamondAgentIQ, and what didn't

Kept: the call-type idea (judgment vs. rule vs. coaching), role-specific answers, the team's learning philosophy and coaching data, Little League and Babe Ruth rule facts with sources, house rules that override the rulebook, pitch math in code, citation checking, and "draft until verified".

Left out for a one-day, phone-first build: Zetaris, Postgres/PGlite, the multi-agent pipeline, H-MEM memory, Nightshift routing, box-score and play-by-play review, and every sanction except Little League and Babe Ruth baseball. Those stay in the main repo.

---

This is a learning tool, not an official ruling. The umpire is the authority on the field, and the Sunshine Board has the final word on league rules.
