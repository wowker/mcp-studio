//go:build local

// Command local is the single-binary local edition shell. Startup sequencing is
// owned by internal/platform; embedded PostgreSQL and local subject
// initialization arrive with E05.
package main

import (
	_ "embed"
	"log"
	"mcp-studio/internal/platform"
	"os"
)

//go:embed config.default.json
var editionDefaults []byte

func main() {
	if err := platform.RunLocal(platform.Options{Defaults: editionDefaults}); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
