CREATE TABLE environments (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 name text NOT NULL CHECK(length(trim(name)) > 0),
 name_key text NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
 UNIQUE(project_id,id),
 UNIQUE(project_id,name_key)
);
CREATE TABLE connections (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 environment_id text,
 body jsonb NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
 UNIQUE(project_id,id),
 FOREIGN KEY(project_id,environment_id) REFERENCES environments(project_id,id)
);
CREATE TABLE variables (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 environment_id text,
 connection_id text,
 name text NOT NULL CHECK(name ~ '^[A-Za-z_][A-Za-z0-9_]*$'),
 type text NOT NULL CHECK(type IN ('string','number','boolean','json')),
 sensitive boolean NOT NULL,
 required boolean NOT NULL,
 value_json text NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version > 0),
 CHECK(NOT sensitive OR value_json = ''),
 UNIQUE(project_id,id),
 FOREIGN KEY(project_id,environment_id) REFERENCES environments(project_id,id),
 FOREIGN KEY(project_id,connection_id) REFERENCES connections(project_id,id)
);
CREATE UNIQUE INDEX variables_layer_name ON variables(project_id,COALESCE(environment_id,''),COALESCE(connection_id,''),name);
