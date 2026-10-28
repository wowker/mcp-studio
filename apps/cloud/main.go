// Command cloud is the cloud service edition shell. Startup sequencing and
// configuration parsing live in internal/platform so edition entry points stay
// free of domain logic.
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
	if err := platform.Run(platform.Options{Defaults: editionDefaults}); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
