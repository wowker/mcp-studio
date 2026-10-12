package infrastructure

import (
	"context"
	"testing"
)

func TestDatabaseRequiresExplicitConfiguration(t *testing.T) {
	db, err := Database(context.Background(), "")
	if err == nil || db != nil {
		t.Fatal("implicit database access")
	}
}
