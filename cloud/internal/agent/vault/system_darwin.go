//go:build darwin && cgo

package vault

/*
#cgo LDFLAGS: -framework Security -framework CoreFoundation -framework Foundation -framework LocalAuthentication
#include <stdlib.h>
#include "system_keychain_darwin.h"
*/
import "C"
import (
	"context"
	"unsafe"
)

type systemMasterStore struct{}

func NewSystemMasterStore() MasterStore { return systemMasterStore{} }
func (systemMasterStore) Read(ctx context.Context, id string) ([]byte, error) {
	if ctx.Err() != nil {
		return nil, ErrUnavailable
	}
	account := C.CString(id)
	defer C.free(unsafe.Pointer(account))
	key := make([]byte, 32)
	status := C.read_key(account, (*C.uchar)(unsafe.Pointer(&key[0])))
	if status == 0 {
		return key, nil
	}
	clear(key)
	if status == -25300 {
		return nil, ErrKeyMissing
	}
	return nil, ErrUnavailable
}
func (systemMasterStore) Create(ctx context.Context, id string, key []byte) error {
	if ctx.Err() != nil || len(key) != 32 {
		return ErrUnavailable
	}
	account := C.CString(id)
	defer C.free(unsafe.Pointer(account))
	status := C.create_key(account, (*C.uchar)(unsafe.Pointer(&key[0])))
	if status == 0 {
		return nil
	}
	if status == -25299 {
		return ErrKeyExists
	}
	return ErrUnavailable
}
func (systemMasterStore) Delete(ctx context.Context, id string) error {
	if ctx.Err() != nil {
		return ErrUnavailable
	}
	account := C.CString(id)
	defer C.free(unsafe.Pointer(account))
	status := C.delete_key(account)
	if status == 0 || status == -25300 {
		return nil
	}
	return ErrUnavailable
}
