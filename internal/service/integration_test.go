package service

import (
	"database/sql"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/ory/dockertest/v3"
)

var testDB *sql.DB

func TestMain(m *testing.M) {
	os.Exit(testMain(m))
}

func testMain(m *testing.M) int {
	pool, err := dockertest.NewPool("")
	if err != nil {
		fmt.Printf("could not create docker pool: %v\n", err)
		return 1
	}

	var cleanup func() error
	testDB, cleanup, err = setupTestDB(pool)
	if err != nil {
		fmt.Printf("could not setup test db: %v\n", err)
		return 1
	}

	defer cleanup()

	return m.Run()
}

func setupTestDB(pool *dockertest.Pool) (*sql.DB, func() error, error) {
	resource, err := pool.RunWithOptions(&dockertest.RunOptions{
		Repository: "cockroachdb/cockroach",
		Tag:        "latest",
		Cmd:        []string{"start-single-node", "--insecure"},
	})
	if err != nil {
		return nil, nil, fmt.Errorf("could not create cockroach resource: %w", err)
	}

	var db *sql.DB
	err = pool.Retry(func() (err error) {
		hostPort := resource.GetHostPort("26257/tcp")
		db, err = sql.Open("postgres", "postgresql://root@"+hostPort+"/nakama?sslmode=disable")
		if err != nil {
			return fmt.Errorf("could not open db: %w", err)
		}

		// do not close db

		if err = db.Ping(); err != nil {
			return fmt.Errorf("could not ping db: %w", err)
		}

		wd, err := os.Getwd()
		if err != nil {
			return fmt.Errorf("could not get wd: %w", err)
		}

		schemaPath := filepath.Join(wd, "..", "..", "schema.sql")
		schemaFile, err := os.Open(schemaPath)
		if err != nil {
			return fmt.Errorf("could not open %q file: %w", schemaPath, err)
		}

		defer schemaFile.Close()

		schema, err := io.ReadAll(schemaFile)
		if err != nil {
			return fmt.Errorf("could not read schema.sql contents: %w", err)
		}

		_, err = db.Exec(string(schema))
		if err != nil {
			return fmt.Errorf("could not exec schema: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, nil, err
	}

	return db, func() error {
		return pool.Purge(resource)
	}, nil
}
