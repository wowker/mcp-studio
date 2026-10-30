//go:build windows

package vault

import (
	"context"
	"golang.org/x/sys/windows"
	"unsafe"
)

type credential struct {
	Flags, Type             uint32
	TargetName, Comment     *uint16
	LastWritten             windows.Filetime
	BlobSize                uint32
	Blob                    *byte
	Persist, AttributeCount uint32
	Attributes              uintptr
	TargetAlias, UserName   *uint16
}
type systemMasterStore struct{}

var credDLL = windows.NewLazySystemDLL("advapi32.dll")
var credRead = credDLL.NewProc("CredReadW")
var credWrite = credDLL.NewProc("CredWriteW")
var credDelete = credDLL.NewProc("CredDeleteW")
var credFree = credDLL.NewProc("CredFree")

func NewSystemMasterStore() MasterStore { return systemMasterStore{} }
func target(id string) *uint16 {
	p, _ := windows.UTF16PtrFromString("mcp-studio.agent.master.v1:" + Hash([]byte(id)))
	return p
}
func (systemMasterStore) Read(ctx context.Context, id string) ([]byte, error) {
	if ctx.Err() != nil {
		return nil, ErrUnavailable
	}
	var c *credential
	ok, _, err := credRead.Call(uintptr(unsafe.Pointer(target(id))), 1, 0, uintptr(unsafe.Pointer(&c)))
	if ok == 0 {
		if err == windows.ERROR_NOT_FOUND {
			return nil, ErrKeyMissing
		}
		return nil, ErrUnavailable
	}
	defer credFree.Call(uintptr(unsafe.Pointer(c)))
	if c.BlobSize != 32 || c.Blob == nil {
		return nil, ErrUnavailable
	}
	return append([]byte(nil), unsafe.Slice(c.Blob, 32)...), nil
}
func (s systemMasterStore) Create(ctx context.Context, id string, key []byte) error {
	if ctx.Err() != nil || len(key) != 32 {
		return ErrUnavailable
	}
	if _, err := s.Read(ctx, id); err == nil {
		return ErrKeyExists
	} else if err != ErrKeyMissing {
		return ErrUnavailable
	}
	c := credential{Type: 1, TargetName: target(id), BlobSize: 32, Blob: &key[0], Persist: 2}
	ok, _, _ := credWrite.Call(uintptr(unsafe.Pointer(&c)), 0)
	if ok == 0 {
		return ErrUnavailable
	}
	return nil
}
func (systemMasterStore) Delete(ctx context.Context, id string) error {
	if ctx.Err() != nil {
		return ErrUnavailable
	}
	ok, _, err := credDelete.Call(uintptr(unsafe.Pointer(target(id))), 1, 0)
	if ok != 0 || err == windows.ERROR_NOT_FOUND {
		return nil
	}
	return ErrUnavailable
}
