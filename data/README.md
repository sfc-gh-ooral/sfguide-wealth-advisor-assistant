# Synthetic data

Everything here is **synthetic** and comes from a seeded, deterministic generator. Running it again gives the same files byte for byte. The people, advisors, branches, firms, funds, and stock tickers are fictional. Any resemblance to real people or securities is coincidental.

```bash
node scripts/generate-data.mjs     # seed 20261112, snapshot date 2026-10-31
```

| Output | Used by |
| --- | --- |
| `data/csv/*.csv.gz` | Full data set, loaded by `sql/setup.sql` |
| `lib/mock/book.json` | Branch BR01 (Lakeside) summaries, actions, and monthly trend, bundled for no-account mode |
| `public/mock/hh/<id>.json` | Per-household detail for BR01, fetched on demand in no-account mode |

## Tables

| Table | Rows | Notes |
| --- | ---: | --- |
| advisors | 200 | 12 branches; BR01 Lakeside has 8 advisors |
| branch_managers | 12 | One per branch |
| households | 24,978 | Segment by AUM (assets under management): Emerging < $250K, Core < $1M, Premier < $5M, Private ≥ $5M |
| clients | 40,545 | 1–2 per household |
| accounts | 51,467 | Advisory, IRA, Brokerage, 401(k) rollover-eligible (held away, no positions) |
| positions | 324,226 | As of 2026-10-31; 10 fictional funds plus 10 fictional single stocks |
| cash_balances | 299,736 | 12 month-ends per household (2025-11 to 2026-10) |
| transactions | 100,266 | Deposits, withdrawals, and planted ACAT transfers |
| life_events | 1,777 | Includes derived "Turns 73 (RMD age)" events |
| crm_notes | 37,384 | Free text from templates; live mode scores them with AI_SENTIMENT |
| service_cases | 6,961 | Service, money movement, and complaint cases |
| portal_logins | 299,736 | Monthly login counts |
| model_portfolios | 25 | 5 models × 5 asset classes |
| securities | 20 | Fictional |
| product_docs | 12 | Playbooks and policies indexed by Cortex Search. No client data. |

## Planted stories (Advisor A = ADV001 Dana Whitfield, branch BR01)

The generator checks these at the end of each run and fails if any count drifts.

| # | Story | Where | How it shows up |
| --- | --- | --- | --- |
| 1 | **18 households with idle cash**: more than 10% cash for 6, 9, or 12 straight months | ADV001 | One grouped "Cash drag" action in the morning brief |
| 2 | **Okafor Household** (HH000002): 30% of $2.1M in Northwind Robotics (NWRB) | ADV001 | Concentration action; client prep shows the concentration bar and the drift vs. Moderate model |
| 3 | **9 clients turning 73 in 2026** (born 1953) with IRAs, so they need required minimum distribution (RMD) planning | ADV001 | RMD action; coach answer to "Which clients should I call about RMDs this month?" |
| 4 | **Martinez Household** (HH000001): $4.2M, portal logins fall from 9 to 0, two negative CRM notes, an open complaint case, and a withdrawal | ADV001 | Top attrition action (score 100/100); coach answer to "Summarize the Martinez household before my 2pm" |
| 5 | **Chen-Whitaker Household** (HH000003): $642K ACAT transfer out to "Harborview Investments" (fictional) on 2026-10-21 | ADV001 | Outgoing-transfer action |

Isolation story: **Advisor B (ADV002 Marcus Lee)** has 4 different RMD-age clients and no Martinez household. The same coach questions return different rows, or nothing, depending on who is viewing. The branch manager sees all of BR01, which has 22 RMD households.

To keep the stories clean, background households for ADV001 and ADV002 never get birth year 1953, complaint cases, falling logins, or negative notes. ADV001 also gets no background single stocks. Other advisors get these at low background rates, so the branch and firm views look realistic.

## Rules (mirrored in `sql/setup.sql`)

These are illustrative rules, not a trained model and not investment advice.

| Action | Rule | "Impact" shown |
| --- | --- | --- |
| Attrition risk | Score ≥ 70. Score = 40 if average logins in the last 3 months are under half the prior 3 months, + 30 if any note since 2026-08-01 is negative, + 15 if 12-month net flow is negative, + 15 if a complaint case is open. | Household AUM |
| Outgoing transfer | ACAT_OUT transaction since 2026-10-01 | Amount transferred |
| Concentration | One single stock ≥ 20% of household value | Value above a 10% guideline |
| Cash drag | Cash > 10% for 6 or more consecutive month-ends, ending at the snapshot | Cash value |
| RMD | A client born in 1953 who owns an IRA | Household AUM |
| Drift | Any asset class more than 10 points away from the model, and no cash-drag flag | Household AUM |

Household names are unique within each advisor's book; repeated surnames become double-barreled names.

In no-account mode, note sentiment comes from the generator's template tone and is labeled **Sample AI response**. In live mode, it comes from `AI_SENTIMENT` over the note text, so a few borderline notes may score differently.
