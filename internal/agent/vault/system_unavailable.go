//go:build (!darwin && !windows && !linux) || (darwin && !cgo)

package vault

import "context"

type systemMasterStore struct{}

func NewSystemMasterStore() MasterStore                                { return systemMasterStore{} }
func (systemMasterStore) Read(context.Context, string) ([]byte, error) { return nil, ErrUnavailable }
func (systemMasterStore) Create(context.Context, string, []byte) error { return ErrUnavailable }
func (systemMasterStore) Delete(context.Context, string) error         { return ErrUnavailable }
