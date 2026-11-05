CREATE TABLE kt_ops.agent_actions (
 id uuid PRIMARY KEY,owner_id text NOT NULL REFERENCES kt_auth.users(id),kind text NOT NULL,
 payload_sha256 text NOT NULL,result jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE kt_ops.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kt_ops.agent_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY own_agent_actions ON kt_ops.agent_actions TO kt_app USING(owner_id=current_setting('kt.actor_id',true)) WITH CHECK(owner_id=current_setting('kt.actor_id',true));
GRANT SELECT,INSERT,UPDATE ON kt_ops.agent_actions TO kt_app;
