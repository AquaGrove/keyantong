CREATE TABLE kt_ops.execution_control(name text PRIMARY KEY,paused boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO kt_ops.execution_control(name) VALUES('omics');
REVOKE ALL ON kt_ops.execution_control FROM PUBLIC;
GRANT SELECT ON kt_ops.execution_control TO kt_app,kt_dispatcher;
