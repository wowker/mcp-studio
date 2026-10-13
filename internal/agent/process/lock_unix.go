//go:build !windows

package process

import (
	"errors"
	"os"
	"path/filepath"
	"syscall"
)

type FileLock struct{ file *os.File }

func Lock(path string) (*FileLock, error) {
	if !filepath.IsAbs(path) {
		return nil, errors.New("absolute_lock_path_required")
	}
	if info, e := os.Lstat(path); e == nil && info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("unsafe_lock_path")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, errors.New("agent_already_running")
	}
	return &FileLock{f}, nil
}
func (l *FileLock) Close() error {
	syscall.Flock(int(l.file.Fd()), syscall.LOCK_UN)
	return l.file.Close()
}
