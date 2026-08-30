-- plugins/claw/migrations/V5__devx_chat_mirror.sql
-- The eve session id (code_session_id, for that transport) and the devx chat
-- id used to mirror the turn into devx.chats/devx.messages are different
-- identifiers — track the mirror chat in its own column rather than
-- overloading code_session_id.
ALTER TABLE claw.orchestrations
  ADD COLUMN IF NOT EXISTS devx_chat_id text;
