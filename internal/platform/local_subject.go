package platform

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"mcp-studio/internal/infrastructure"
	"mcp-studio/internal/wire"
	"os"
	"path/filepath"
)

// ensureLocalSubject verifies or creates the single local user, its owning
// team, a personal project and the bootstrap flag. We run it inside the same
// transaction that migrations wrote into, so a first-launch interrupted mid
// creation cannot leave the cluster half-seeded.
//
// On every subsequent launch we just read back the seeded rows — the local
// edition is single-user, so there is nothing else to reconcile.
func ensureLocalSubject(ctx context.Context, tx pgx.Tx) (wire.User, []wire.Team, error) {
	var initialized bool
	if err := tx.QueryRow(ctx, `SELECT initialized FROM bootstrap WHERE singleton`).Scan(&initialized); err != nil {
		return wire.User{}, nil, err
	}
	if initialized {
		return loadLocalSubject(ctx, tx)
	}
	return seedLocalSubject(ctx, tx)
}

func seedLocalSubject(ctx context.Context, tx pgx.Tx) (wire.User, []wire.Team, error) {
	uid, tid, pid := id(), id(), id()
	// The local edition never serves a password-protected login — the role is
	// created inside initdb and connection happens via the local Unix socket
	// or loopback with peer authentication. The users row still needs a NOT
	// NULL password_hash, so we store an empty byte slice. No auth code path
	// ever hashes against it on the local edition.
	if _, err := tx.Exec(ctx, `INSERT INTO users VALUES($1,$2,$3,'',true)`, uid, localSubjectEmail, localSubjectName); err != nil {
		return wire.User{}, nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO teams VALUES($1,$2)`, tid, localTeamName); err != nil {
		return wire.User{}, nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO team_members VALUES($1,$2,'owner')`, tid, uid); err != nil {
		return wire.User{}, nil, err
	}
	nameKey := canonical(localProjectName)
	if _, err := tx.Exec(ctx, `INSERT INTO projects VALUES($1,$2,$3,$4,'')`, pid, tid, localProjectName, nameKey); err != nil {
		return wire.User{}, nil, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'maintainer')`, pid, uid); err != nil {
		return wire.User{}, nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE bootstrap SET initialized=true WHERE singleton`); err != nil {
		return wire.User{}, nil, err
	}
	u := wire.User{ID: uid, Email: localSubjectEmail, Name: localSubjectName, Verified: true}
	return u, []wire.Team{{ID: tid, Name: localTeamName, Role: "owner"}}, nil
}

func loadLocalSubject(ctx context.Context, tx pgx.Tx) (wire.User, []wire.Team, error) {
	var u wire.User
	if err := tx.QueryRow(ctx,
		`SELECT id,email,name,verified FROM users WHERE email=$1`,
		localSubjectEmail,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Verified); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return wire.User{}, nil, errors.New("bootstrap claimed initialized but local user is missing — data directory is inconsistent")
		}
		return wire.User{}, nil, err
	}
	rows, err := tx.Query(ctx,
		`SELECT t.id,t.name,tm.role FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=$1`,
		u.ID,
	)
	if err != nil {
		return wire.User{}, nil, err
	}
	defer rows.Close()
	teams := []wire.Team{}
	for rows.Next() {
		var t wire.Team
		if err := rows.Scan(&t.ID, &t.Name, &t.Role); err != nil {
			return wire.User{}, nil, err
		}
		teams = append(teams, t)
	}
	if err = rows.Err(); err != nil {
		return wire.User{}, nil, err
	}
	if len(teams) == 0 {
		return wire.User{}, nil, errors.New("bootstrap claimed initialized but local user has no team")
	}
	return u, teams, nil
}

// ensureRoleAndDB provisions the application role and database inside the
// freshly-started PostgreSQL cluster. We connect as the bootstrap superuser —
// the application role itself does not yet exist.
func ensureRoleAndDB(ctx context.Context, superURL string) error {
	pool, err := infrastructure.LocalDatabase(ctx, superURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	// Role and database names are package constants — inline them. pgx cannot
	// bind parameters inside a DO block (the $$ body breaks $n parsing).
	if _, err := pool.Exec(ctx,
		`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='`+localRoleName+`') THEN CREATE ROLE `+localRoleName+` WITH LOGIN; END IF; END $$`,
	); err != nil {
		return err
	}
	// CREATE DATABASE cannot run inside a transaction block; we check
	// existence with pg_database first.
	var exists bool
	if err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1)`, localDBName).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		if _, err = pool.Exec(ctx, `CREATE DATABASE `+localDBName+` OWNER `+localRoleName); err != nil {
			return err
		}
	}
	return nil
}

// localSuperURL builds a connection string against the embedded cluster as
// the bootstrap superuser. Role/db provisioning happens before the
// application database exists, so we always connect to the `postgres`
// maintenance database. We use the Unix socket inside the data directory
// when it exists and fall back to localhost TCP otherwise; the socket form
// must carry the port explicitly — pgx otherwise defaults to 5432 and looks
// for the wrong socket file.
func localSuperURL(port, dataDir string) string {
	socket := filepath.Join(dataDir, ".s.PGSQL."+port)
	if _, err := os.Stat(socket); err == nil {
		return fmt.Sprintf("postgres://%s@/postgres?host=%s&port=%s&sslmode=disable", localSuperUser, dataDir, port)
	}
	return fmt.Sprintf("postgres://%s@127.0.0.1:%s/postgres?sslmode=disable", localSuperUser, port)
}

// localRoleURL builds a connection string against the embedded cluster as the
// application role — same socket + data-dir fallback, same explicit port.
func localRoleURL(port, dataDir string) string {
	socket := filepath.Join(dataDir, ".s.PGSQL."+port)
	if _, err := os.Stat(socket); err == nil {
		return fmt.Sprintf("postgres://%s@/%s?host=%s&port=%s&sslmode=disable", localRoleName, localDBName, dataDir, port)
	}
	return fmt.Sprintf("postgres://%s@127.0.0.1:%s/%s?sslmode=disable", localRoleName, port, localDBName)
}
