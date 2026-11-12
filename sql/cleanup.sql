-- =============================================================================
-- Wealth Advisor Assistant: cleanup
-- Drops everything sql/setup.sql created. The database drop removes its tables, views,
-- policies, semantic view, Cortex Search service, Cortex Agent, stage, and Git repository clone.
-- =============================================================================
USE ROLE ACCOUNTADMIN;

DROP DATABASE IF EXISTS WEALTH_ADVISOR_DEMO;
DROP WAREHOUSE IF EXISTS WAA_WH;
DROP INTEGRATION IF EXISTS WAA_GIT_API;

DROP ROLE IF EXISTS WAA_ADVISOR_A;
DROP ROLE IF EXISTS WAA_ADVISOR_B;
DROP ROLE IF EXISTS WAA_BRANCH_MGR;
DROP ROLE IF EXISTS WAA_SUPERVISOR;
DROP ROLE IF EXISTS WAA_DEMO_ROLE;
