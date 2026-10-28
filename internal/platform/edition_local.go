//go:build local

package platform

// CurrentEdition is the distribution compiled into this binary. The `local`
// build tag selects the single-binary local edition.
const CurrentEdition = EditionLocal
