-- =============================================================================
-- Wealth Advisor Assistant: Snowflake setup
-- Synthetic data only. Illustrative logic; not investment, tax, or compliance advice.
--
-- Run top to bottom in a Snowsight SQL worksheet (about 10 minutes on an XSMALL warehouse).
-- Requirements (see README): Enterprise Edition or higher (row access policies,
-- Cortex AI Guardrails), Cortex AI functions in your region or cross-region inference,
-- and a role that can create roles, warehouses, databases, and API integrations.
--
-- Creates (and sql/cleanup.sql drops):
--   roles      WAA_DEMO_ROLE (owner), WAA_ADVISOR_A, WAA_ADVISOR_B, WAA_BRANCH_MGR, WAA_SUPERVISOR
--   warehouse  WAA_WH (XSMALL, AUTO_SUSPEND = 60)
--   database   WEALTH_ADVISOR_DEMO (schemas BOOK, APP)
--   integration WAA_GIT_API (read-only access to the public example repository)
-- It changes nothing that already exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1. Account-level objects (ACCOUNTADMIN, or SECURITYADMIN + SYSADMIN)
-- -----------------------------------------------------------------------------
USE ROLE ACCOUNTADMIN;

-- Least-privilege owner role: owns the example database and nothing else.
CREATE ROLE IF NOT EXISTS WAA_DEMO_ROLE COMMENT = 'Wealth Advisor Assistant example: object owner';
-- Persona roles used by the "View as" switcher. Row access is keyed on these role names.
CREATE ROLE IF NOT EXISTS WAA_ADVISOR_A  COMMENT = 'Wealth Advisor Assistant example: advisor Dana Whitfield (ADV001)';
CREATE ROLE IF NOT EXISTS WAA_ADVISOR_B  COMMENT = 'Wealth Advisor Assistant example: advisor Marcus Lee (ADV002)';
CREATE ROLE IF NOT EXISTS WAA_BRANCH_MGR COMMENT = 'Wealth Advisor Assistant example: Lakeside branch manager (BR01)';
CREATE ROLE IF NOT EXISTS WAA_SUPERVISOR COMMENT = 'Wealth Advisor Assistant example: supervision reviewer (AI interaction log only)';

GRANT ROLE WAA_DEMO_ROLE TO ROLE SYSADMIN;
SET my_user = CURRENT_USER();
GRANT ROLE WAA_DEMO_ROLE  TO USER IDENTIFIER($my_user);
GRANT ROLE WAA_ADVISOR_A  TO USER IDENTIFIER($my_user);
GRANT ROLE WAA_ADVISOR_B  TO USER IDENTIFIER($my_user);
GRANT ROLE WAA_BRANCH_MGR TO USER IDENTIFIER($my_user);
GRANT ROLE WAA_SUPERVISOR TO USER IDENTIFIER($my_user);

CREATE WAREHOUSE IF NOT EXISTS WAA_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Wealth Advisor Assistant example';
GRANT OWNERSHIP ON WAREHOUSE WAA_WH TO ROLE WAA_DEMO_ROLE;

CREATE DATABASE IF NOT EXISTS WEALTH_ADVISOR_DEMO COMMENT = 'Wealth Advisor Assistant example (synthetic data)';
GRANT OWNERSHIP ON DATABASE WEALTH_ADVISOR_DEMO TO ROLE WAA_DEMO_ROLE;

-- Cortex AI functions, Cortex Agents, and Cortex Search for the owner and personas.
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE WAA_DEMO_ROLE;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE WAA_ADVISOR_A;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE WAA_ADVISOR_B;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE WAA_BRANCH_MGR;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE WAA_SUPERVISOR;  -- reads agent traces

-- Read-only access to the public GitHub repository that holds the synthetic CSVs.
CREATE API INTEGRATION IF NOT EXISTS WAA_GIT_API
  API_PROVIDER = git_https_api
  API_ALLOWED_PREFIXES = ('https://github.com/sfc-gh-ooral/sfguide-wealth-advisor-assistant')
  ENABLED = TRUE
  COMMENT = 'Wealth Advisor Assistant example: public repo, no credentials';
GRANT USAGE ON INTEGRATION WAA_GIT_API TO ROLE WAA_DEMO_ROLE;

-- -----------------------------------------------------------------------------
-- Part 2. Everything else runs as the least-privilege owner role.
-- -----------------------------------------------------------------------------
USE ROLE WAA_DEMO_ROLE;
USE WAREHOUSE WAA_WH;
USE DATABASE WEALTH_ADVISOR_DEMO;
CREATE SCHEMA IF NOT EXISTS BOOK COMMENT = 'Advisor book of business (synthetic)';
CREATE SCHEMA IF NOT EXISTS APP  COMMENT = 'App-written records: AI interaction log, advisor actions';
USE SCHEMA BOOK;

-- 2a. Load the synthetic CSVs from the public repository ---------------------
CREATE OR REPLACE GIT REPOSITORY WAA_REPO
  API_INTEGRATION = WAA_GIT_API
  ORIGIN = 'https://github.com/sfc-gh-ooral/sfguide-wealth-advisor-assistant.git';
CREATE STAGE IF NOT EXISTS WAA_DATA COMMENT = 'Synthetic CSVs copied from the repository';
COPY FILES INTO @WAA_DATA FROM @WAA_REPO/branches/main/data/csv/;

CREATE OR REPLACE FILE FORMAT WAA_CSV
  TYPE = CSV COMPRESSION = GZIP SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"' EMPTY_FIELD_AS_NULL = TRUE;

CREATE OR REPLACE TABLE ADVISORS        (advisor_id VARCHAR, advisor_name VARCHAR, branch_id VARCHAR, branch_name VARCHAR, hire_year INT);
CREATE OR REPLACE TABLE BRANCH_MANAGERS (branch_id VARCHAR, manager_name VARCHAR);
CREATE OR REPLACE TABLE MODEL_PORTFOLIOS(model_id VARCHAR, model_name VARCHAR, asset_class VARCHAR, target_pct NUMBER(6,2));
CREATE OR REPLACE TABLE SECURITIES      (security_id VARCHAR, name VARCHAR, asset_class VARCHAR, is_single_stock BOOLEAN);
CREATE OR REPLACE TABLE PRODUCT_DOCS    (doc_id VARCHAR, title VARCHAR, doc_type VARCHAR, body VARCHAR);
CREATE OR REPLACE TABLE HOUSEHOLDS      (household_id VARCHAR, advisor_id VARCHAR, household_name VARCHAR, last_name VARCHAR, segment VARCHAR, model_id VARCHAR, city VARCHAR, state VARCHAR, client_since DATE);
CREATE OR REPLACE TABLE CLIENTS         (client_id VARCHAR, household_id VARCHAR, first_name VARCHAR, last_name VARCHAR, birth_date DATE, is_primary BOOLEAN);
CREATE OR REPLACE TABLE ACCOUNTS        (account_id VARCHAR, household_id VARCHAR, client_id VARCHAR, account_type VARCHAR, opened_date DATE);
CREATE OR REPLACE TABLE POSITIONS       (account_id VARCHAR, household_id VARCHAR, security_id VARCHAR, market_value NUMBER(14,2), as_of_date DATE);
CREATE OR REPLACE TABLE CASH_BALANCES   (household_id VARCHAR, month_end DATE, total_value NUMBER(14,2), cash_value NUMBER(14,2), cash_pct NUMBER(6,2));
CREATE OR REPLACE TABLE TRANSACTIONS    (txn_id VARCHAR, account_id VARCHAR, household_id VARCHAR, txn_date DATE, txn_type VARCHAR, amount NUMBER(14,2), counterparty VARCHAR);
CREATE OR REPLACE TABLE LIFE_EVENTS     (event_id VARCHAR, household_id VARCHAR, client_id VARCHAR, event_type VARCHAR, event_date DATE, detail VARCHAR);
CREATE OR REPLACE TABLE CRM_NOTES       (note_id VARCHAR, household_id VARCHAR, advisor_id VARCHAR, note_date DATE, author VARCHAR, note_text VARCHAR);
CREATE OR REPLACE TABLE SERVICE_CASES   (case_id VARCHAR, household_id VARCHAR, opened_date DATE, status VARCHAR, category VARCHAR, subject VARCHAR);
CREATE OR REPLACE TABLE PORTAL_LOGINS   (household_id VARCHAR, month_end DATE, logins INT);

COPY INTO ADVISORS         FROM @WAA_DATA/advisors.csv.gz         FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO BRANCH_MANAGERS  FROM @WAA_DATA/branch_managers.csv.gz  FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO MODEL_PORTFOLIOS FROM @WAA_DATA/model_portfolios.csv.gz FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO SECURITIES       FROM @WAA_DATA/securities.csv.gz       FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO PRODUCT_DOCS     FROM @WAA_DATA/product_docs.csv.gz     FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO HOUSEHOLDS       FROM @WAA_DATA/households.csv.gz       FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO CLIENTS          FROM @WAA_DATA/clients.csv.gz          FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO ACCOUNTS         FROM @WAA_DATA/accounts.csv.gz         FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO POSITIONS        FROM @WAA_DATA/positions.csv.gz        FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO CASH_BALANCES    FROM @WAA_DATA/cash_balances.csv.gz    FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO TRANSACTIONS     FROM @WAA_DATA/transactions.csv.gz     FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO LIFE_EVENTS      FROM @WAA_DATA/life_events.csv.gz      FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO CRM_NOTES        FROM @WAA_DATA/crm_notes.csv.gz        FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO SERVICE_CASES    FROM @WAA_DATA/service_cases.csv.gz    FILE_FORMAT = (FORMAT_NAME = WAA_CSV);
COPY INTO PORTAL_LOGINS    FROM @WAA_DATA/portal_logins.csv.gz    FILE_FORMAT = (FORMAT_NAME = WAA_CSV);

-- 2b. AI_SENTIMENT on recent CRM notes (the attrition rule uses notes since 2026-08-01)
CREATE OR REPLACE TABLE NOTE_SENTIMENT AS
SELECT note_id, household_id, note_date,
       AI_SENTIMENT(note_text):categories[0]:sentiment::VARCHAR AS sentiment
FROM CRM_NOTES
WHERE note_date >= '2026-08-01';

-- 2c. Per-advisor isolation: row access policies ------------------------------
-- Which persona role may see which advisor's book. The branch manager sees every BR01 advisor.
CREATE OR REPLACE TABLE ADVISOR_SCOPE (role_name VARCHAR, advisor_id VARCHAR);
INSERT INTO ADVISOR_SCOPE
  SELECT 'WAA_ADVISOR_A', 'ADV001' UNION ALL
  SELECT 'WAA_ADVISOR_B', 'ADV002' UNION ALL
  SELECT 'WAA_BRANCH_MGR', advisor_id FROM ADVISORS WHERE branch_id = 'BR01';
-- Household-to-advisor lookup used by the policy. Persona roles get no grant on these two tables.
CREATE OR REPLACE TABLE HOUSEHOLD_ADVISOR AS SELECT household_id, advisor_id FROM HOUSEHOLDS;

-- CURRENT_ROLE() is the session's primary role; the app runs each persona with USE ROLE and
-- USE SECONDARY ROLES NONE. The owner role sees everything (for setup and these checks).
CREATE OR REPLACE ROW ACCESS POLICY RAP_ADVISOR AS (advisor VARCHAR) RETURNS BOOLEAN ->
  CURRENT_ROLE() = 'WAA_DEMO_ROLE'
  OR EXISTS (SELECT 1 FROM ADVISOR_SCOPE s WHERE s.role_name = CURRENT_ROLE() AND s.advisor_id = advisor);

CREATE OR REPLACE ROW ACCESS POLICY RAP_HOUSEHOLD AS (hh VARCHAR) RETURNS BOOLEAN ->
  CURRENT_ROLE() = 'WAA_DEMO_ROLE'
  OR EXISTS (SELECT 1 FROM HOUSEHOLD_ADVISOR ha JOIN ADVISOR_SCOPE s ON s.advisor_id = ha.advisor_id
             WHERE s.role_name = CURRENT_ROLE() AND ha.household_id = hh);

ALTER TABLE ADVISORS       ADD ROW ACCESS POLICY RAP_ADVISOR   ON (advisor_id);
ALTER TABLE HOUSEHOLDS     ADD ROW ACCESS POLICY RAP_ADVISOR   ON (advisor_id);
ALTER TABLE CRM_NOTES      ADD ROW ACCESS POLICY RAP_ADVISOR   ON (advisor_id);
ALTER TABLE CLIENTS        ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE ACCOUNTS       ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE POSITIONS      ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE CASH_BALANCES  ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE TRANSACTIONS   ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE LIFE_EVENTS    ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE SERVICE_CASES  ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE PORTAL_LOGINS  ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);
ALTER TABLE NOTE_SENTIMENT ADD ROW ACCESS POLICY RAP_HOUSEHOLD ON (household_id);

-- 2d. Household metrics and next best actions (rules mirror scripts/generate-data.mjs) ----
-- Views, so the row access policies above apply to every reader, including the agent.
CREATE OR REPLACE VIEW V_HOUSEHOLD_METRICS AS
WITH pos AS (
  SELECT p.household_id, SUM(p.market_value) AS aum,
         SUM(IFF(s.asset_class = 'Cash', p.market_value, 0)) AS cash_value
  FROM POSITIONS p JOIN SECURITIES s ON s.security_id = p.security_id GROUP BY 1),
stock AS (
  SELECT p.household_id, p.security_id, SUM(p.market_value) AS mv
  FROM POSITIONS p JOIN SECURITIES s ON s.security_id = p.security_id
  WHERE s.is_single_stock GROUP BY 1, 2
  QUALIFY ROW_NUMBER() OVER (PARTITION BY p.household_id ORDER BY mv DESC) = 1),
cls AS (
  SELECT p.household_id, s.asset_class, SUM(p.market_value) AS mv
  FROM POSITIONS p JOIN SECURITIES s ON s.security_id = p.security_id GROUP BY 1, 2),
drift AS (
  SELECT h.household_id, MAX(ABS(COALESCE(c.mv, 0) / NULLIF(pos.aum, 0) * 100 - m.target_pct)) AS max_drift
  FROM HOUSEHOLDS h JOIN pos ON pos.household_id = h.household_id
  JOIN MODEL_PORTFOLIOS m ON m.model_id = h.model_id
  LEFT JOIN cls c ON c.household_id = h.household_id AND c.asset_class = m.asset_class
  GROUP BY 1),
cash AS (  -- consecutive month-ends above 10% cash, ending at the snapshot
  SELECT household_id,
         MAX(IFF(month_end = '2026-10-31', cash_pct, NULL)) AS cash_pct,
         COUNT_IF(month_end > COALESCE(last_low, '1900-01-01')) AS cash_months
  FROM (SELECT household_id, month_end, cash_pct,
               MAX(IFF(cash_pct <= 10, month_end, NULL)) OVER (PARTITION BY household_id) AS last_low
        FROM CASH_BALANCES)
  GROUP BY 1),
logins AS (
  SELECT household_id,
         AVG(IFF(month_end >= '2026-08-31', logins, NULL)) AS last3,
         AVG(IFF(month_end BETWEEN '2026-05-31' AND '2026-07-31', logins, NULL)) AS prior3
  FROM PORTAL_LOGINS GROUP BY 1),
flows AS (
  SELECT household_id, SUM(amount) AS net_flow_12m,
         MAX(IFF(txn_type = 'ACAT_OUT' AND txn_date >= '2026-10-01', -amount, NULL)) AS acat_out_amount
  FROM TRANSACTIONS GROUP BY 1),
neg AS (SELECT DISTINCT household_id FROM NOTE_SENTIMENT WHERE sentiment = 'negative'),
complaint AS (SELECT DISTINCT household_id FROM SERVICE_CASES WHERE status = 'Open' AND category = 'Complaint'),
rmd AS (
  SELECT c.household_id, COUNT(DISTINCT c.client_id) AS rmd_clients
  FROM CLIENTS c JOIN ACCOUNTS a ON a.client_id = c.client_id AND a.account_type = 'IRA'
  WHERE YEAR(c.birth_date) = 1953 GROUP BY 1)
SELECT h.household_id, h.household_name, h.advisor_id, a.advisor_name, a.branch_id, h.segment, h.model_id,
       h.city || ', ' || h.state AS city,
       pos.aum, pos.cash_value, cash.cash_pct, cash.cash_months,
       stock.security_id AS top_stock, ROUND(stock.mv / NULLIF(pos.aum, 0) * 100, 2) AS top_stock_pct,
       ROUND(drift.max_drift, 2) AS max_drift,
       COALESCE(flows.net_flow_12m, 0) AS net_flow_12m, flows.acat_out_amount,
       COALESCE(logins.prior3 > 0 AND logins.last3 < logins.prior3 * 0.5, FALSE) AS login_decline,
       neg.household_id IS NOT NULL AS negative_note,
       complaint.household_id IS NOT NULL AS open_complaint,
       COALESCE(rmd.rmd_clients, 0) AS rmd_clients,
       IFF(login_decline, 40, 0) + IFF(negative_note, 30, 0) + IFF(net_flow_12m < 0, 15, 0) + IFF(open_complaint, 15, 0) AS attrition_score
FROM HOUSEHOLDS h
JOIN ADVISORS a ON a.advisor_id = h.advisor_id
JOIN pos ON pos.household_id = h.household_id
LEFT JOIN stock ON stock.household_id = h.household_id
LEFT JOIN drift ON drift.household_id = h.household_id
LEFT JOIN cash ON cash.household_id = h.household_id
LEFT JOIN logins ON logins.household_id = h.household_id
LEFT JOIN flows ON flows.household_id = h.household_id
LEFT JOIN neg ON neg.household_id = h.household_id
LEFT JOIN complaint ON complaint.household_id = h.household_id
LEFT JOIN rmd ON rmd.household_id = h.household_id;

CREATE OR REPLACE VIEW V_NEXT_BEST_ACTIONS AS
SELECT household_id, household_name, advisor_id, action_type, priority, impact, reason FROM (
  SELECT *, 'ATTRITION_RISK' AS action_type, 1 AS priority, aum AS impact,
         'Attrition score ' || attrition_score || '/100: logins down, negative recent notes, open complaint' AS reason
  FROM V_HOUSEHOLD_METRICS WHERE attrition_score >= 70
  UNION ALL
  SELECT *, 'ACAT_OUT', 2, acat_out_amount, 'Outgoing ACAT transfer of ' || TO_VARCHAR(acat_out_amount, '$9,999,999') || ' this month'
  FROM V_HOUSEHOLD_METRICS WHERE acat_out_amount IS NOT NULL
  UNION ALL
  SELECT *, 'CONCENTRATION', 3, aum * (top_stock_pct - 10) / 100, ROUND(top_stock_pct) || '% of household in ' || top_stock
  FROM V_HOUSEHOLD_METRICS WHERE top_stock_pct >= 20
  UNION ALL
  SELECT *, 'CASH_DRAG', 4, cash_value, cash_pct || '% cash for ' || cash_months || ' straight months'
  FROM V_HOUSEHOLD_METRICS WHERE cash_months >= 6
  UNION ALL
  SELECT *, 'RMD', 5, aum, rmd_clients || ' client(s) turn 73 in 2026 and hold an IRA'
  FROM V_HOUSEHOLD_METRICS WHERE rmd_clients > 0
  UNION ALL
  SELECT *, 'DRIFT', 6, aum, 'Max drift ' || max_drift || ' pts vs model'
  FROM V_HOUSEHOLD_METRICS WHERE max_drift > 10 AND cash_months = 0
);

CREATE OR REPLACE VIEW V_CLIENTS AS
SELECT c.client_id, c.household_id, h.household_name, h.advisor_id, c.first_name, c.last_name, c.birth_date,
       DATEDIFF('year', c.birth_date, '2026-12-31'::DATE) AS age_at_year_end,
       YEAR(c.birth_date) = 1953 AS turns_73_in_2026,
       EXISTS (SELECT 1 FROM ACCOUNTS a WHERE a.client_id = c.client_id AND a.account_type = 'IRA') AS has_ira
FROM CLIENTS c JOIN HOUSEHOLDS h ON h.household_id = c.household_id;

CREATE OR REPLACE VIEW V_CRM_NOTES AS
SELECT n.note_id, n.household_id, h.household_name, n.advisor_id, n.note_date, n.author, n.note_text, s.sentiment
FROM CRM_NOTES n JOIN HOUSEHOLDS h ON h.household_id = n.household_id
LEFT JOIN NOTE_SENTIMENT s ON s.note_id = n.note_id;

CREATE OR REPLACE VIEW V_LIFE_EVENTS AS
SELECT e.event_id, e.household_id, h.household_name, h.advisor_id, e.event_type, e.event_date, e.detail
FROM LIFE_EVENTS e JOIN HOUSEHOLDS h ON h.household_id = e.household_id;


-- 2d-2. Materialize the rule outputs for fast, policy-scoped reads -------------
-- The views above recompute over every position; the agent and app read these small tables
-- instead. Built by the owner role (which sees every row), then scoped by advisor_id.
-- Re-run this block after the base data changes (see "Customize with Cortex Code" for a
-- dynamic-table version).
CREATE OR REPLACE TABLE HOUSEHOLD_METRICS AS SELECT * FROM V_HOUSEHOLD_METRICS;
CREATE OR REPLACE TABLE NEXT_BEST_ACTIONS AS SELECT * FROM V_NEXT_BEST_ACTIONS;
CREATE OR REPLACE TABLE CLIENT_PROFILES   AS SELECT * FROM V_CLIENTS;
CREATE OR REPLACE TABLE NOTES_ENRICHED    AS SELECT * FROM V_CRM_NOTES;
CREATE OR REPLACE TABLE EVENTS_ENRICHED   AS SELECT * FROM V_LIFE_EVENTS;
ALTER TABLE HOUSEHOLD_METRICS ADD ROW ACCESS POLICY RAP_ADVISOR ON (advisor_id);
ALTER TABLE NEXT_BEST_ACTIONS ADD ROW ACCESS POLICY RAP_ADVISOR ON (advisor_id);
ALTER TABLE CLIENT_PROFILES   ADD ROW ACCESS POLICY RAP_ADVISOR ON (advisor_id);
ALTER TABLE NOTES_ENRICHED    ADD ROW ACCESS POLICY RAP_ADVISOR ON (advisor_id);
ALTER TABLE EVENTS_ENRICHED   ADD ROW ACCESS POLICY RAP_ADVISOR ON (advisor_id);

-- 2e. Semantic view for Cortex Analyst ---------------------------------------
CREATE OR REPLACE SEMANTIC VIEW BOOK_SV
  TABLES (
    hh AS HOUSEHOLD_METRICS PRIMARY KEY (household_id)
      COMMENT = 'One row per household in the advisor book, with AUM, cash, concentration, drift, flows, and attrition signals',
    cl AS CLIENT_PROFILES PRIMARY KEY (client_id) COMMENT = 'Individual clients in each household',
    nt AS NOTES_ENRICHED PRIMARY KEY (note_id) COMMENT = 'Advisor CRM notes with AI_SENTIMENT for recent notes',
    ev AS EVENTS_ENRICHED PRIMARY KEY (event_id) COMMENT = 'Life events such as turning 73 (RMD age), retirement, new baby',
    nba AS NEXT_BEST_ACTIONS COMMENT = 'Rules-based next best actions per household'
  )
  RELATIONSHIPS (
    cl_to_hh AS cl (household_id) REFERENCES hh,
    nt_to_hh AS nt (household_id) REFERENCES hh,
    ev_to_hh AS ev (household_id) REFERENCES hh,
    nba_to_hh AS nba (household_id) REFERENCES hh
  )
  FACTS (
    hh.aum_fact AS aum, hh.cash_pct_fact AS cash_pct, hh.attrition_fact AS attrition_score,
    nba.impact_fact AS impact
  )
  DIMENSIONS (
    hh.household_id AS household_id, hh.household_name AS household_name
      WITH SYNONYMS = ('household', 'family', 'client household') COMMENT = 'Household display name, e.g. Martinez Household',
    hh.advisor_name AS advisor_name, hh.branch_id AS branch_id, hh.segment AS segment
      COMMENT = 'Emerging, Core, Premier, or Private by AUM',
    hh.model_id AS model_id, hh.city AS city, hh.top_stock AS top_stock,
    hh.top_stock_pct AS top_stock_pct COMMENT = 'Largest single-stock position as a percent of household value',
    hh.cash_months AS cash_months COMMENT = 'Consecutive month-ends with more than 10 percent cash',
    hh.max_drift AS max_drift COMMENT = 'Largest asset-class drift from the model, in percentage points',
    hh.login_decline AS login_decline, hh.negative_note AS negative_note, hh.open_complaint AS open_complaint,
    hh.attrition_score AS attrition_score COMMENT = 'Rules-based attrition score 0-100 (not a trained model)',
    hh.rmd_clients AS rmd_clients COMMENT = 'Number of clients turning 73 in 2026 who hold an IRA',
    cl.client_name AS first_name || ' ' || last_name, cl.birth_date AS birth_date, cl.age_at_year_end AS age_at_year_end,
    cl.turns_73_in_2026 AS turns_73_in_2026
      WITH SYNONYMS = ('RMD', 'required minimum distribution', 'RMD age') COMMENT = 'True if the client turns 73 during 2026 (first RMD year)',
    cl.has_ira AS has_ira,
    cl.birth_month AS MONTH(birth_date) COMMENT = 'Birth month number; use for "this month" RMD questions (snapshot month is November 2026)',
    nt.note_date AS note_date, nt.note_text AS note_text, nt.sentiment AS sentiment,
    ev.event_type AS event_type, ev.event_date AS event_date,
    nba.action_type AS action_type COMMENT = 'ATTRITION_RISK, ACAT_OUT, CONCENTRATION, CASH_DRAG, RMD, or DRIFT',
    nba.priority AS priority, nba.reason AS reason
  )
  METRICS (
    hh.total_aum AS SUM(hh.aum_fact) COMMENT = 'Total assets under management',
    hh.household_count AS COUNT(hh.household_id),
    hh.avg_cash_pct AS AVG(hh.cash_pct_fact),
    cl.client_count AS COUNT(cl.client_id),
    nba.total_impact AS SUM(nba.impact_fact) COMMENT = 'Illustrative dollar impact of next best actions'
  )
  COMMENT = 'Wealth Advisor Assistant: advisor book of business. Row access policies on the base tables limit each persona to its own households.';

-- 2f. Cortex Search over product docs and playbooks (no client data) ----------
-- Cortex Search answers with the owner's rights and does not apply the caller's row access
-- policies, so it indexes only firm-wide content. Client data goes through BOOK_SV instead.
CREATE OR REPLACE CORTEX SEARCH SERVICE PRODUCT_DOCS_SEARCH
  ON body
  ATTRIBUTES doc_type, title
  WAREHOUSE = WAA_WH
  TARGET_LAG = '1 day'
  COMMENT = 'Firm playbooks, policies, and fictional product sheets'
  AS SELECT doc_id, title, doc_type, body FROM PRODUCT_DOCS;

-- 2g. Cortex Agent: the advisor coach ----------------------------------------
-- The agent runs with the caller's role, so Cortex Analyst inherits the row access policies.
CREATE OR REPLACE AGENT ADVISOR_COACH
  COMMENT = 'Wealth Advisor Assistant coach (synthetic data)'
  PROFILE = '{"display_name": "Advisor Coach"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: auto
  orchestration:
    budget:
      seconds: 60
      tokens: 16000
  instructions:
    system: >
      You are a coach for financial advisors at a fictional wealth management firm. The data is synthetic.
      The snapshot date is 2026-10-31 and today is in November 2026.
      Only discuss households returned by your tools; never guess about households you cannot see.
      If a household is not found, say it is not in the user's book or not visible to their role.
    orchestration: >
      Use BookAnalyst for any question about households, clients, AUM, cash, concentration, RMDs, notes,
      sentiment, attrition, or next best actions. Use FirmPlaybooks for how-to guidance, policies, and products.
      For "RMDs this month" questions, list clients where turns_73_in_2026 is true and has_ira is true.
    response: >
      Be concise and practical. Use short bullets. Name households and clients. Cite the playbook title
      when you use one. End with: "Suggestions for advisor review only; not investment or tax advice."
    sample_questions:
      - question: "Which clients should I call about RMDs this month?"
      - question: "Summarize the Martinez household before my 2pm."
  tools:
    - tool_spec:
        type: "cortex_analyst_text_to_sql"
        name: "BookAnalyst"
        description: "Answers questions about the advisor's book of business: households, clients, AUM, cash, single-stock concentration, model drift, RMD-age clients, CRM notes and sentiment, attrition signals, and next best actions."
    - tool_spec:
        type: "cortex_search"
        name: "FirmPlaybooks"
        description: "Searches firm playbooks, policies, and fictional product sheets (RMD checklist, idle cash, concentrated stock, retention, ACAT transfers, rollovers, supervision policy)."
  tool_resources:
    BookAnalyst:
      semantic_view: "WEALTH_ADVISOR_DEMO.BOOK.BOOK_SV"
      execution_environment:
        type: "warehouse"
        warehouse: "WAA_WH"
    FirmPlaybooks:
      search_service: "WEALTH_ADVISOR_DEMO.BOOK.PRODUCT_DOCS_SEARCH"
      max_results: 3
      title_column: "TITLE"
      id_column: "DOC_ID"
  $$;

-- 2h. App-written records ------------------------------------------------------
USE SCHEMA APP;
-- Append-only by grants: persona roles can INSERT but not UPDATE, DELETE, or SELECT.
-- Only WAA_SUPERVISOR (and the owner) can read it.
CREATE OR REPLACE TABLE AI_INTERACTION_LOG (
  interaction_id VARCHAR DEFAULT UUID_STRING(),
  logged_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  user_name VARCHAR DEFAULT CURRENT_USER(),
  role_name VARCHAR DEFAULT CURRENT_ROLE(),
  surface VARCHAR,          -- coach, agenda, explanation
  prompt VARCHAR,
  response VARCHAR,
  sources VARIANT,          -- tools and documents used
  guardrail_flags VARIANT,  -- Cortex Guard / guardrail results
  latency_ms NUMBER,
  request_id VARCHAR
);
CREATE OR REPLACE TABLE ADVISOR_ACTIONS (
  action_id VARCHAR DEFAULT UUID_STRING(),
  logged_at TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  user_name VARCHAR DEFAULT CURRENT_USER(),
  role_name VARCHAR DEFAULT CURRENT_ROLE(),
  household_id VARCHAR, action_type VARCHAR, decision VARCHAR, note VARCHAR
);

-- 2i. Grants for persona roles -----------------------------------------------
USE SCHEMA BOOK;
GRANT USAGE ON WAREHOUSE WAA_WH TO ROLE WAA_ADVISOR_A;
GRANT USAGE ON WAREHOUSE WAA_WH TO ROLE WAA_ADVISOR_B;
GRANT USAGE ON WAREHOUSE WAA_WH TO ROLE WAA_BRANCH_MGR;
GRANT USAGE ON WAREHOUSE WAA_WH TO ROLE WAA_SUPERVISOR;
GRANT USAGE ON DATABASE WEALTH_ADVISOR_DEMO TO ROLE WAA_ADVISOR_A;
GRANT USAGE ON DATABASE WEALTH_ADVISOR_DEMO TO ROLE WAA_ADVISOR_B;
GRANT USAGE ON DATABASE WEALTH_ADVISOR_DEMO TO ROLE WAA_BRANCH_MGR;
GRANT USAGE ON DATABASE WEALTH_ADVISOR_DEMO TO ROLE WAA_SUPERVISOR;

-- Advisors and the branch manager: read the book (through policies), use the coach, write logs.
GRANT USAGE ON SCHEMA BOOK TO ROLE WAA_ADVISOR_A;
GRANT USAGE ON SCHEMA BOOK TO ROLE WAA_ADVISOR_B;
GRANT USAGE ON SCHEMA BOOK TO ROLE WAA_BRANCH_MGR;
GRANT USAGE ON SCHEMA APP  TO ROLE WAA_ADVISOR_A;
GRANT USAGE ON SCHEMA APP  TO ROLE WAA_ADVISOR_B;
GRANT USAGE ON SCHEMA APP  TO ROLE WAA_BRANCH_MGR;
GRANT USAGE ON SCHEMA APP  TO ROLE WAA_SUPERVISOR;

-- One object per GRANT (a comma-separated object list is not a valid GRANT target).
GRANT SELECT ON TABLE ADVISORS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE HOUSEHOLDS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE CLIENTS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE ACCOUNTS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE POSITIONS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE CASH_BALANCES TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE TRANSACTIONS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE LIFE_EVENTS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE CRM_NOTES TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE SERVICE_CASES TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE PORTAL_LOGINS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE NOTE_SENTIMENT TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE MODEL_PORTFOLIOS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE SECURITIES TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE ADVISORS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE HOUSEHOLDS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE CLIENTS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE ACCOUNTS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE POSITIONS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE CASH_BALANCES TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE TRANSACTIONS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE LIFE_EVENTS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE CRM_NOTES TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE SERVICE_CASES TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE PORTAL_LOGINS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE NOTE_SENTIMENT TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE MODEL_PORTFOLIOS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE SECURITIES TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE ADVISORS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE HOUSEHOLDS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE CLIENTS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE ACCOUNTS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE POSITIONS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE CASH_BALANCES TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE TRANSACTIONS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE LIFE_EVENTS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE CRM_NOTES TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE SERVICE_CASES TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE PORTAL_LOGINS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE NOTE_SENTIMENT TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE MODEL_PORTFOLIOS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE SECURITIES TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE HOUSEHOLD_METRICS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE NEXT_BEST_ACTIONS TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE CLIENT_PROFILES TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE NOTES_ENRICHED TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE EVENTS_ENRICHED TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON TABLE HOUSEHOLD_METRICS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE NEXT_BEST_ACTIONS TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE CLIENT_PROFILES TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE NOTES_ENRICHED TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE EVENTS_ENRICHED TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON TABLE HOUSEHOLD_METRICS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE NEXT_BEST_ACTIONS TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE CLIENT_PROFILES TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE NOTES_ENRICHED TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON TABLE EVENTS_ENRICHED TO ROLE WAA_BRANCH_MGR;
GRANT SELECT ON SEMANTIC VIEW BOOK_SV TO ROLE WAA_ADVISOR_A;
GRANT SELECT ON SEMANTIC VIEW BOOK_SV TO ROLE WAA_ADVISOR_B;
GRANT SELECT ON SEMANTIC VIEW BOOK_SV TO ROLE WAA_BRANCH_MGR;
GRANT USAGE ON CORTEX SEARCH SERVICE PRODUCT_DOCS_SEARCH TO ROLE WAA_ADVISOR_A;
GRANT USAGE ON CORTEX SEARCH SERVICE PRODUCT_DOCS_SEARCH TO ROLE WAA_ADVISOR_B;
GRANT USAGE ON CORTEX SEARCH SERVICE PRODUCT_DOCS_SEARCH TO ROLE WAA_BRANCH_MGR;
GRANT USAGE ON AGENT ADVISOR_COACH TO ROLE WAA_ADVISOR_A;
GRANT USAGE ON AGENT ADVISOR_COACH TO ROLE WAA_ADVISOR_B;
GRANT USAGE ON AGENT ADVISOR_COACH TO ROLE WAA_BRANCH_MGR;

GRANT INSERT ON TABLE APP.AI_INTERACTION_LOG TO ROLE WAA_ADVISOR_A;
GRANT INSERT ON TABLE APP.AI_INTERACTION_LOG TO ROLE WAA_ADVISOR_B;
GRANT INSERT ON TABLE APP.AI_INTERACTION_LOG TO ROLE WAA_BRANCH_MGR;
GRANT INSERT ON TABLE APP.ADVISOR_ACTIONS TO ROLE WAA_ADVISOR_A;
GRANT INSERT ON TABLE APP.ADVISOR_ACTIONS TO ROLE WAA_ADVISOR_B;
GRANT INSERT ON TABLE APP.ADVISOR_ACTIONS TO ROLE WAA_BRANCH_MGR;
-- Supervision reads the AI log and the action log; it gets no access to the book.
GRANT SELECT ON TABLE APP.AI_INTERACTION_LOG TO ROLE WAA_SUPERVISOR;
GRANT SELECT ON TABLE APP.ADVISOR_ACTIONS   TO ROLE WAA_SUPERVISOR;
-- AI Observability: the supervisor reads Cortex Agent traces (MONITOR), but no table in BOOK.
GRANT USAGE ON SCHEMA BOOK TO ROLE WAA_SUPERVISOR;
GRANT MONITOR ON AGENT ADVISOR_COACH TO ROLE WAA_SUPERVISOR;

-- 2j. Quick checks: the same query, three personas ------------------------------
USE SECONDARY ROLES NONE;
USE ROLE WAA_ADVISOR_A;  SELECT 'Advisor A' AS persona, COUNT(*) AS households FROM BOOK.HOUSEHOLDS;
USE ROLE WAA_ADVISOR_B;  SELECT 'Advisor B' AS persona, COUNT(*) AS households FROM BOOK.HOUSEHOLDS;
USE ROLE WAA_BRANCH_MGR; SELECT 'Branch manager' AS persona, COUNT(*) AS households FROM BOOK.HOUSEHOLDS;
USE ROLE WAA_DEMO_ROLE;
SELECT action_type, COUNT(*) FROM BOOK.NEXT_BEST_ACTIONS WHERE advisor_id = 'ADV001' GROUP BY 1 ORDER BY 1;
