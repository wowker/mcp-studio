#!/bin/sh
set -eu
# Only a generated hex password is interpolated into the private SQL input.
password=$(cat /run/secrets/app_db_password)
case "$password" in ''|*[!0-9a-f]*) echo 'Invalid application database password format' >&2; exit 1;; esac
[ "${#password}" = 64 ] || { echo 'Invalid application database password length' >&2; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE mcp_studio_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '$password';
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA app AUTHORIZATION mcp_studio_app;
ALTER ROLE mcp_studio_app IN DATABASE mcp_studio SET search_path TO app;
SQL
unset password
