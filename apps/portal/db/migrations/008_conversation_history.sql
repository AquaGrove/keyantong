CREATE TABLE kt_ops.conversation_history (
  owner_id text NOT NULL REFERENCES kt_auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  snapshot jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, id)
);
CREATE INDEX conversation_history_recent ON kt_ops.conversation_history (owner_id, updated_at DESC);
ALTER TABLE kt_ops.conversation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE kt_ops.conversation_history FORCE ROW LEVEL SECURITY;
CREATE POLICY conversation_owner ON kt_ops.conversation_history TO kt_app
  USING (owner_id = current_setting('kt.actor_id', true))
  WITH CHECK (owner_id = current_setting('kt.actor_id', true));
GRANT SELECT, INSERT, UPDATE ON kt_ops.conversation_history TO kt_app;
