//go:build windows

package process

import (
	"errors"
	"golang.org/x/sys/windows"
	"os"
	"path/filepath"
)

type FileLock struct {
	file       *os.File
	overlapped windows.Overlapped
}

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
	l := &FileLock{file: f}
	if err = windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &l.overlapped); err != nil {
		f.Close()
		return nil, errors.New("agent_already_running")
	}
	return l, nil
}
func (l *FileLock) Close() error {
	windows.UnlockFileEx(windows.Handle(l.file.Fd()), 0, 1, 0, &l.overlapped)
	return l.file.Close()
}
