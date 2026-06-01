-- WebLLM — teardown / reset
-- Drops everything DEPLOY_ALL.sql creates, so you can re-run DEPLOY_ALL.sql clean.
-- Safe to run on a project that only hosts WebLLM. Extensions (vector, pgcrypto)
-- are intentionally left in place; DEPLOY_ALL re-creates them with IF NOT EXISTS.

DROP TABLE IF EXISTS
  assistants,
  search_providers,
  mcp_servers,
  chunks,
  documents,
  knowledge_bases,
  messages,
  conversations,
  models,
  providers,
  users
CASCADE;

DROP FUNCTION IF EXISTS match_chunks(TEXT, FLOAT, INT, UUID);
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP TYPE IF EXISTS model_type;
