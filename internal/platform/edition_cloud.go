//go:build !local

package platform

// CurrentEdition is the distribution compiled into this binary. Without the
// `local` build tag the default cloud service edition is selected.
const CurrentEdition = EditionCloud
