package gateway

import (
	"context"
	"net"
	"os"
)

type connInfoKey struct{}

// ConnInfo describes the listener and peer that accepted a connection.
type ConnInfo struct {
	Kind    string // gateway | direct
	PeerUID uint32
	PeerOK  bool
}

type wrappedConn struct {
	net.Conn
	info ConnInfo
}

func (c *wrappedConn) Unwrap() net.Conn { return c.Conn }

type wrappedListener struct {
	net.Listener
	kind     string
	trustAll bool
}

// Wrap tags accepted connections with their listener kind and Unix peer UID.
func Wrap(l net.Listener, kind string, trustAll bool) net.Listener {
	return &wrappedListener{Listener: l, kind: kind, trustAll: trustAll}
}

func (l *wrappedListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	uid, ok := peerUID(c)
	if l.trustAll {
		ok = true
	}
	return &wrappedConn{Conn: c, info: ConnInfo{Kind: l.kind, PeerUID: uid, PeerOK: ok}}, nil
}

// ConnContext stores listener metadata on the request context.
func ConnContext(ctx context.Context, c net.Conn) context.Context {
	if wc, ok := c.(*wrappedConn); ok {
		return context.WithValue(ctx, connInfoKey{}, wc.info)
	}
	return ctx
}

func FromContext(ctx context.Context) (ConnInfo, bool) {
	ci, ok := ctx.Value(connInfoKey{}).(ConnInfo)
	return ci, ok
}

// ListenUnix creates a Unix socket with conservative permissions.
func ListenUnix(path string) (net.Listener, error) {
	_ = os.Remove(path)
	l, err := net.Listen("unix", path)
	if err != nil {
		return nil, err
	}
	if err := os.Chmod(path, 0o660); err != nil {
		l.Close()
		return nil, err
	}
	return l, nil
}
