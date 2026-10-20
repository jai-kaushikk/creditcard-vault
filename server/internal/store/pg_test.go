package store

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Cloud Run reaches Cloud SQL over a unix socket; the secret's URL is written in this form.
func TestCloudSQLURLParses(t *testing.T) {
	cfg, err := pgxpool.ParseConfig("postgresql://cardvault:p%40ss%2Fword@localhost/cardvault?host=/cloudsql/proj:asia-south1:cardvault-db")
	if err != nil {
		t.Fatal(err)
	}
	c := cfg.ConnConfig
	if c.Host != "/cloudsql/proj:asia-south1:cardvault-db" || c.User != "cardvault" || c.Password != "p@ss/word" || c.Database != "cardvault" {
		t.Fatalf("parsed %q %q %q %q", c.Host, c.User, c.Password, c.Database)
	}
}
