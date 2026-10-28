//go:build !local

// Command local is the single-binary local edition shell. The local edition is
// built with the `local` build tag so its entry always resolves to the local
// edition policy; a plain build refuses to start instead of serving cloud
// semantics under the local name.
package main

import (
	"log"
	"os"
)

func main() {
	log.Print("local edition requires the local build tag: go build -tags local ./apps/local")
	os.Exit(1)
}
