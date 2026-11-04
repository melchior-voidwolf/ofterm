//go:build !linux

package gateway

import "net"

func peerUID(c net.Conn) (uint32, bool) {
	return 0, false
}
