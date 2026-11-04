package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/ofterm/ofterm/internal/auth"
	"github.com/ofterm/ofterm/internal/config"
	"github.com/ofterm/ofterm/internal/gateway"
	"github.com/ofterm/ofterm/internal/httpapi"
	"github.com/ofterm/ofterm/internal/store"
	"github.com/ofterm/ofterm/internal/term"
)

var version = "dev"

func main() {
	flag.Parse()
	args := flag.Args()
	cmd := "serve"
	if len(args) > 0 {
		cmd = args[0]
	}
	switch cmd {
	case "version":
		fmt.Println("ofterm", version)
	case "serve":
		if err := serve(); err != nil {
			fmt.Fprintln(os.Stderr, "ofterm:", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n", cmd)
		os.Exit(2)
	}
}

func serve() error {
	cfg := config.Load(version)
	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	if err := os.MkdirAll(cfg.DataDir, 0o700); err != nil {
		return err
	}
	setSubreaper()

	st, err := store.Open(filepath.Join(cfg.DataDir, "ofterm.db"))
	if err != nil {
		return fmt.Errorf("store: %w", err)
	}
	defer st.Close()

	am := auth.New()
	tm := term.NewManager(cfg.Grace)
	defer tm.Shutdown()
	api := httpapi.New(cfg, st, am, tm, log)
	handler := api.Handler()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var servers []*http.Server
	var listeners []net.Listener

	start := func(l net.Listener, name string) {
		srv := &http.Server{
			Handler:           handler,
			ReadHeaderTimeout: 10 * time.Second,
			IdleTimeout:       120 * time.Second,
			ConnContext:       gateway.ConnContext,
		}
		servers = append(servers, srv)
		listeners = append(listeners, l)
		go func() {
			if err := srv.Serve(l); err != nil && !errors.Is(err, http.ErrServerClosed) {
				log.Error("listener stopped", "name", name, "error", err)
			}
		}()
		log.Info("listening", "name", name, "addr", l.Addr().String())
	}

	if cfg.SocketPath != "" {
		l, err := gateway.ListenUnix(cfg.SocketPath)
		if err != nil {
			return fmt.Errorf("unix socket: %w", err)
		}
		start(gateway.Wrap(l, "gateway", cfg.TrustUnixAll), "gateway")
	}
	if cfg.Listen != "" {
		l, err := net.Listen("tcp", cfg.Listen)
		if err != nil {
			return fmt.Errorf("tcp listen: %w", err)
		}
		start(gateway.Wrap(l, "direct", false), "direct")
	}
	if len(servers) == 0 {
		return errors.New("no listener configured: set OFTERM_SOCKET or OFTERM_LISTEN")
	}

	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				am.Cleanup()
			case <-ctx.Done():
				return
			}
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for _, srv := range servers {
		_ = srv.Shutdown(shutdownCtx)
	}
	for _, l := range listeners {
		_ = l.Close()
	}
	if cfg.SocketPath != "" {
		_ = os.Remove(cfg.SocketPath)
	}
	log.Info("stopped")
	return nil
}
