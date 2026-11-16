# Wealth Advisor Assistant

Help financial advisors prioritize their day. The app ranks next best actions across each advisor's book, explains them with an AI coach, and prepares client meetings. The coach only sees that advisor's own clients.

This is a Snowflake example on **synthetic data**: a Next.js app with a no-account mode and a live mode backed by row access policies, a Cortex Agent (Cortex Analyst + Cortex Search), AI_COMPLETE with Cortex Guard, AI_SENTIMENT, and AI Observability.

**[Try the hosted example](https://sfc-gh-ooral.github.io/sfguide-wealth-advisor-assistant/try/)** · **[Guide](https://sfc-gh-ooral.github.io/sfguide-wealth-advisor-assistant/)**

> Synthetic data and illustrative logic only. This is not investment, tax, regulatory, or compliance advice. Next best actions are suggestions for advisor review.

## What it does

| Screen | What you see | Snowflake capability (live mode) |
| --- | --- | --- |
| Morning brief | Top 5 next best actions with expected impact and reason, an AI explanation for each, and Schedule call / Snooze / Done with a note | Rules in SQL, `AI_COMPLETE` with Cortex Guard, decisions written to `APP.ADVISOR_ACTIONS` |
| Book overview | AUM trend, net flows, segmentation, drift vs. model, a household explorer, and a coaching table for branch managers | Row access policies on every household table |
| Client prep | Household 360 (accounts, holdings, concentration, drift, cash and logins, life events, notes, cases) and an AI-drafted agenda | `AI_SENTIMENT` on notes, `AI_COMPLETE` with Cortex Guard |
| Coach | Chat with an agent about your book; **Ask as all three** runs one question as each persona side by side | Cortex Agent with Cortex Analyst (semantic view) and Cortex Search; the agent runs as the caller's role, so row access policies apply |
| View as | Advisor A / Advisor B / Branch manager switcher with a "Row access policy applied" badge | One Snowflake role per persona; `CURRENT_ROLE()` drives the policies |
| Sample / Live switch | Header switch that shows which mode is on. Sample keeps the bundled data even with a connection; Live with no connection shows setup steps instead of asking for credentials. AI buttons show staged reasoning steps; in Sample mode a scripted answer arrives after a few seconds | `/api/mode` reports whether `.env.local` is configured; live calls report measured latency and never fall back to sample data |
| Supervision log | Every AI prompt and response with user, role, time, sources, guardrail result, and measured latency; plus agent traces | Append-only `APP.AI_INTERACTION_LOG` (insert-only for advisors), AI Observability via `GET_AI_OBSERVABILITY_EVENTS` |

### Story on this synthetic data set

Advisor A (Dana Whitfield) starts the morning with five actions:

1. The Martinez household shows attrition risk.
2. 18 households have held idle cash for 6+ months.
3. The Okafor household is 30% in one stock.
4. 9 clients turn 73 and need required minimum distribution (RMD) planning.
5. An outgoing transfer went to a competitor.

The coach answers the RMD question with exactly those 9 clients. Switch to Advisor B, and the same question returns 4 different clients, while "Summarize the Martinez household" returns "not in your book." The supervision log shows each exchange. See [data/README.md](data/README.md) for how the stories are planted.

## Prerequisites

| | |
| --- | --- |
| No-account mode | Node.js **20.19+ or 22.12+** (required by Tailwind CSS 4) and npm. Nothing else. |
| Live mode: edition | **Enterprise Edition or higher** (row access policies; Cortex AI Guardrails) |
| Live mode: features | Cortex AI functions (`AI_COMPLETE`, `AI_SENTIMENT`), Cortex Agents, Cortex Analyst, Cortex Search, and Git repository clones. The default model is `claude-sonnet-4-5`; if it isn't in your region, enable [cross-region inference](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cross-region-inference) or set `SNOWFLAKE_COMPLETE_MODEL`. |
| Live mode: role | `ACCOUNTADMIN` for the short account-level block in `sql/setup.sql` (roles, warehouse, database, API integration). Everything else runs as the least-privilege `WAA_DEMO_ROLE`. |
| Optional | [Cortex AI Guardrails](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-ai-guardrails) for agents is an account setting (`AI_SETTINGS`). This example doesn't change it. |
| Preview features | None. Everything used here is generally available as of November 2026 (Cortex Agents, Cortex Analyst, Cortex Search, AI_COMPLETE, AI_SENTIMENT, Cortex Guard, Cortex AI Guardrails, row access policies, semantic views). |
| Tested | Next.js 16.3, Node 22.23, snowflake-sdk 3.4, on an Enterprise account in AWS US East 1, November 2026 |

## Quick start: no account

```bash
git clone https://github.com/sfc-gh-ooral/sfguide-wealth-advisor-assistant.git
cd sfguide-wealth-advisor-assistant
npm install
npm run dev
```

Open http://localhost:3000. With no `.env.local`, the app uses the bundled synthetic data (branch Lakeside: 8 advisors, about 1,100 households). Every AI output is labeled **Sample AI response**.

To regenerate the data (same seed, same files): `npm run generate-data`.

## Live mode: deploy to your account

1. **Run the setup.** Open a Snowsight SQL worksheet, paste [`sql/setup.sql`](sql/setup.sql), and run all. It takes about 10 minutes on XSMALL. The script loads the synthetic CSVs straight from this public repository through a Git repository clone, so there's no upload step.
2. **Create a key pair** for the user that ran setup. Setup grants that user the persona roles. Keep the key outside the repository:

   ```bash
   mkdir -p ~/.snowflake/keys
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out ~/.snowflake/keys/waa_rsa_key.p8 -nocrypt
   openssl rsa -in ~/.snowflake/keys/waa_rsa_key.p8 -pubout
   ```

   ```sql
   -- Uses the second key slot so an existing key is not replaced.
   ALTER USER <YOUR_USER> SET RSA_PUBLIC_KEY_2 = '<public key body without header lines>';
   ```

3. **Configure the app.** Copy `.env.example` to `.env.local` and fill in your account identifier (`<org>-<account>`), user, and key path.
4. **Run it.** Run `npm run dev`. Each screen now shows a **Live · <role> · <ms>** badge, and AI outputs carry **Powered by** badges.

The app opens one connection per persona role, runs `USE SECONDARY ROLES NONE`, and uses bind variables for every statement.

### Objects created

| Object | Name | Notes |
| --- | --- | --- |
| Roles | `WAA_DEMO_ROLE` | Owns the database and warehouse; least privilege |
| | `WAA_ADVISOR_A`, `WAA_ADVISOR_B`, `WAA_BRANCH_MGR` | Persona roles: read the book through row access policies, use the agent, insert into the logs |
| | `WAA_SUPERVISOR` | Reads the AI and action logs and agent traces (MONITOR); no access to book tables |
| Warehouse | `WAA_WH` | XSMALL, `AUTO_SUSPEND = 60`, starts suspended |
| Database | `WEALTH_ADVISOR_DEMO` | Schemas `BOOK` and `APP` |
| Integration | `WAA_GIT_API` | `git_https_api`, limited to this repository, no credentials |
| Tables (BOOK) | 15 source tables, `NOTE_SENTIMENT` | About 1.2M synthetic rows |
| Policies | `RAP_ADVISOR`, `RAP_HOUSEHOLD` | Row access keyed on `ADVISOR_SCOPE` (role to advisor) |
| Rule views | `V_HOUSEHOLD_METRICS`, `V_NEXT_BEST_ACTIONS`, `V_CLIENTS`, `V_CRM_NOTES`, `V_LIFE_EVENTS` | The rules, readable as SQL |
| Materialized outputs | `HOUSEHOLD_METRICS`, `NEXT_BEST_ACTIONS`, `CLIENT_PROFILES`, `NOTES_ENRICHED`, `EVENTS_ENRICHED` | What the agent and app read, each with a row access policy |
| Semantic view | `BOOK_SV` | For Cortex Analyst |
| Cortex Search | `PRODUCT_DOCS_SEARCH` | Firm playbooks and fictional product sheets only |
| Cortex Agent | `ADVISOR_COACH` | Tools: `BookAnalyst` (BOOK_SV), `FirmPlaybooks` (search) |
| Tables (APP) | `AI_INTERACTION_LOG`, `ADVISOR_ACTIONS` | Insert-only for personas; readable by the supervisor |
| Stage and Git clone | `WAA_DATA`, `WAA_REPO` | Synthetic CSVs |

**Cleanup:** run [`sql/cleanup.sql`](sql/cleanup.sql). It drops the database, warehouse, integration, and all five roles. If you registered a key for this example, also run `ALTER USER <YOUR_USER> UNSET RSA_PUBLIC_KEY_2;`. Agent traces already written to `SNOWFLAKE.LOCAL.AI_OBSERVABILITY_EVENTS` can't be modified or deleted.

### Expected cost and time

- **Setup:** about 10 minutes. In our test, the setup plus a session of about 20 AI calls used **0.6 warehouse credits** on XSMALL.
- **AI credits:** Cortex AI functions, Cortex Agents, Cortex Search, and Cortex Guard are billed separately by tokens. Most of the setup's AI cost is `AI_SENTIMENT` over about 9,200 recent notes. Check your actual usage in `SNOWFLAKE.ACCOUNT_USAGE.CORTEX_FUNCTIONS_USAGE_HISTORY` and `CORTEX_AGENT_USAGE_HISTORY`; those views can lag by up to a few hours. See the [Service Consumption Table](https://www.snowflake.com/legal-files/CreditConsumptionTable.pdf) for rates.
- **Measured latency** in our test on XSMALL, from the app server:
  - Book load: 1.5–4.9 s.
  - Client prep: about 2 s.
  - AI explanation: about 7 s.
  - Agenda: about 11 s.
  - Coach: 7–29 s.

  Yours will differ. The app shows the measured time on each live response.

### Scale

For tens of thousands of advisors, you'd run the app's queries on a [multi-cluster warehouse](https://docs.snowflake.com/en/user-guide/warehouses-multicluster) (Enterprise Edition) so concurrent sessions queue less. You'd refresh the materialized outputs on a schedule or as dynamic tables, and map `ADVISOR_SCOPE` from your identity provider rather than one role per advisor. This example doesn't measure performance at that scale.

## Known limitations

- **Cortex Search uses owner's rights.** It doesn't apply the caller's row access policies ([docs](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-search/query-cortex-search-service)), so it indexes only firm-wide playbooks. All client data goes through the semantic view, where the policies apply.
- **One role per persona.** The policies key on `CURRENT_ROLE()` through `ADVISOR_SCOPE`, which keeps the example readable. In production you'd usually key on `CURRENT_USER()` or an identity-provider attribute.
- **Materialized outputs are a snapshot.** The agent timed out when it queried the policy-scoped views directly, because every query recomputed metrics over all positions. Setup builds small tables from those views instead. Re-run step 2d-2 after data changes.
- **The attrition score is rules-based** (logins, note sentiment, flows, complaints), not a trained model. Expected-impact values are illustrative.
- **Guardrails.** `AI_COMPLETE` runs with Cortex Guard (`guardrails: TRUE`); a filtered response is marked flagged. For the agent, the app records guardrail status only if the response carries a guardrail signal. In our test, an out-of-scope request was declined by the agent with no guardrail signal, and the log shows exactly that. Account-level AI Guardrails activity is in `SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AI_GUARDRAILS_USAGE_HISTORY`.
- **Live answers vary run to run.** In live mode, note sentiment comes from `AI_SENTIMENT`, so borderline notes can differ from the no-account samples. On this data set, the next-best-action counts matched exactly.
- **The hosted example** stores its supervision log in your browser's local storage only.

## Customize with Cortex Code

- "Map these tables to my CRM and custodial feeds, and propose the advisor-to-household mapping for the row access policy. Don't change any objects until I approve the plan."
- "Add a next best action for held-away 401(k) rollovers, with eligibility rules I can review, in both `sql/setup.sql` and `scripts/generate-data.mjs`."
- "Load-test the coach with 50 concurrent advisors and report p50/p95 latency and cost per call. Then recommend a warehouse size and multi-cluster settings."

## Project layout

```text
app/                 Next.js App Router pages and the /api/data route
components/          Shell (navigation, View as), UI pieces
lib/advisor-data.ts  Data interface used by every screen
lib/mock-data.ts     No-account implementation (also runs in the browser for /try/)
lib/live-data.ts     Snowflake implementation (server only)
lib/snowflake.ts     Per-role connections, bind variables
scripts/             generate-data.mjs (seeded), build-hosted-example.mjs, capture-screenshots.mjs
sql/                 setup.sql, cleanup.sql
data/                Synthetic CSVs and data README
docs/                GitHub Pages guide, screenshots, and the /try/ static example
```

`npm run build:example` builds the static, no-account example into `docs/try/`.

### Refresh the screenshots

```bash
npx playwright install chromium   # first time only
npm run build:example
npm run capture                   # COLOR_SCHEME=light npm run capture for light mode
```

`scripts/capture-screenshots.mjs` serves `docs/try/` locally and clicks through the walkthrough in a fresh headless browser at a fixed 1600×1000 viewport. It writes the landing-page images (`docs/images/*.png`, 2000×1250) and the catalog cards (`docs/catalog/*.jpg`, 960×600). Image size never depends on your screen, and no sign-in or account details can appear. Edit the `SHOTS` list when screens change, and review every image before publishing.

## License and disclaimer

[Apache 2.0](LICENSE). This is an illustrative example provided as is. It is not an official Snowflake product and is not supported by Snowflake Support. It contains no customer data. Review and test before any production use.

Owner: Oz Oral · Last reviewed: November 2026
