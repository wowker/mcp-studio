package infrastructure

import (
	"errors"
	"io"
	"os"
	"strings"
)

// Secret accepts a value or a mounted file, never ambiguous sources. Errors
// contain no paths, file contents or credential values.
func Secret(name string) (string, error) {
	value, path := os.Getenv(name), os.Getenv(name+"_FILE")
	if path == "" {
		return value, nil
	}
	fail := func() (string, error) { return "", errors.New("secret configuration invalid: " + name) }
	if value != "" {
		return fail()
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 65536 {
		return fail()
	}
	f, err := os.Open(path)
	if err != nil {
		return fail()
	}
	defer f.Close()
	actual, err := f.Stat()
	if err != nil || !os.SameFile(info, actual) {
		return fail()
	}
	raw, err := io.ReadAll(io.LimitReader(f, 65537))
	if err != nil || len(raw) > 65536 {
		return fail()
	}
	value = strings.TrimSuffix(strings.TrimSuffix(string(raw), "\n"), "\r")
	if value == "" || strings.ContainsRune(value, 0) {
		return fail()
	}
	return value, nil
}
