-- Migration connections own DDL. Runtime logins inherit only the named service roles.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='kt_auth_service') THEN CREATE ROLE kt_auth_service NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='kt_app') THEN CREATE ROLE kt_app NOLOGIN NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='kt_dispatcher') THEN CREATE ROLE kt_dispatcher NOLOGIN NOBYPASSRLS; END IF;
END $$;
CREATE SCHEMA kt_auth;
CREATE SCHEMA kt_ops;
CREATE SCHEMA kt_storage;
CREATE SCHEMA kt_knowledge;
REVOKE ALL ON SCHEMA kt_auth,kt_ops,kt_storage,kt_knowledge FROM PUBLIC;
GRANT USAGE ON SCHEMA kt_auth TO kt_auth_service;
GRANT USAGE ON SCHEMA kt_storage,kt_knowledge TO kt_app;
GRANT USAGE ON SCHEMA kt_ops TO kt_auth_service,kt_app,kt_dispatcher;

CREATE TABLE kt_auth.users (
  id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 200),
  email text NOT NULL CHECK(email=lower(btrim(email))),
  password_hash text NOT NULL,
  campus_verified_at timestamptz,
  trial_ends_at timestamptz,
  membership text NOT NULL CHECK(membership IN ('trial','lifetime','expired')),
  lifetime_granted_at timestamptz,
  account_role text NOT NULL DEFAULT 'member' CHECK(account_role IN ('member','moderator','admin')),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1,
  UNIQUE(email)
);
CREATE TABLE kt_auth.devices (
  user_id text NOT NULL REFERENCES kt_auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 200),
  label text NOT NULL,
  last_seen timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id,id)
);
CREATE INDEX devices_active ON kt_auth.devices(user_id,last_seen) WHERE NOT revoked;
CREATE TABLE kt_auth.verification_codes (
  email text NOT NULL REFERENCES kt_auth.users(email) ON UPDATE CASCADE ON DELETE CASCADE,
  purpose text NOT NULL CHECK(purpose IN ('register','login')),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
  PRIMARY KEY(email,purpose)
);
CREATE TABLE kt_auth.sessions (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  device_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,device_id) REFERENCES kt_auth.devices(user_id,id) ON DELETE CASCADE
);
CREATE INDEX sessions_expiry ON kt_auth.sessions(expires_at);
CREATE INDEX sessions_user_device ON kt_auth.sessions(user_id,device_id);
CREATE TABLE kt_auth.audit_events (
  id uuid PRIMARY KEY,
  actor_id text REFERENCES kt_auth.users(id),
  subject_id text REFERENCES kt_auth.users(id),
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE kt_ops.data_imports (
  id uuid PRIMARY KEY,
  scope text NOT NULL,
  source_sha256 text NOT NULL,
  counts jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope,source_sha256)
);
CREATE TABLE kt_ops.outbox (
  id uuid PRIMARY KEY,
  topic text NOT NULL,
  aggregate_id text NOT NULL,
  owner_id text REFERENCES kt_auth.users(id),
  payload jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','published','dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON kt_ops.outbox(available_at,created_at) WHERE state IN ('pending','leased');
GRANT SELECT,INSERT,UPDATE,DELETE ON kt_auth.users,kt_auth.devices,kt_auth.verification_codes,kt_auth.sessions TO kt_auth_service;
GRANT SELECT,INSERT ON kt_auth.audit_events TO kt_auth_service;
GRANT INSERT ON kt_ops.outbox TO kt_auth_service,kt_app;
GRANT SELECT,UPDATE ON kt_ops.outbox TO kt_dispatcher;
-- Identity tables are reachable only by the trusted authentication service pool.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','devices','verification_codes','sessions','audit_events'] LOOP
    EXECUTE format('ALTER TABLE kt_auth.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE kt_auth.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY auth_service ON kt_auth.%I TO kt_auth_service USING (true) WITH CHECK (true)',t);
  END LOOP;
END $$;
