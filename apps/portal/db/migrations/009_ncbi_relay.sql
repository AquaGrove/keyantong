CREATE TABLE kt_ops.ncbi_relay_batches (
  owner_id text NOT NULL,
  task_id uuid NOT NULL,
  id uuid NOT NULL UNIQUE,
  files jsonb NOT NULL,
  total_bytes bigint NOT NULL CHECK (total_bytes > 0),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  PRIMARY KEY (owner_id, task_id),
  FOREIGN KEY (owner_id, task_id) REFERENCES kt_ops.conversation_history(owner_id, id) ON DELETE CASCADE
);
ALTER TABLE kt_ops.ncbi_relay_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE kt_ops.ncbi_relay_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY ncbi_relay_owner ON kt_ops.ncbi_relay_batches TO kt_app
  USING (owner_id = current_setting('kt.actor_id', true))
  WITH CHECK (owner_id = current_setting('kt.actor_id', true));
GRANT SELECT, INSERT, UPDATE ON kt_ops.ncbi_relay_batches TO kt_app;
