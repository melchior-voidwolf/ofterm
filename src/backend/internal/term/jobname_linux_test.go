//go:build linux

package term

import (
	"os"
	"os/exec"
	"testing"
	"time"

	"github.com/creack/pty"
)

// TestForegroundJobName starts an interactive bash in a PTY and checks that
// the reported foreground job tracks the running command, the same way
// iTerm2 derives its tab titles.
func TestForegroundJobName(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("bash not available")
	}
	cmd := exec.Command("bash", "-i")
	ptmx, err := pty.Start(cmd)
	if err != nil {
		t.Fatalf("pty.Start: %v", err)
	}
	defer func() {
		_ = ptmx.Close()
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	waitFor := func(want string, timeout time.Duration) bool {
		deadline := time.Now().Add(timeout)
		for time.Now().Before(deadline) {
			if got := foregroundJobName(ptmx); got == want {
				return true
			}
			time.Sleep(50 * time.Millisecond)
		}
		return false
	}

	if !waitFor("bash", 3*time.Second) {
		t.Fatalf("foreground job = %q, want bash", foregroundJobName(ptmx))
	}
	if _, err := ptmx.Write([]byte("exec sleep 30\n")); err != nil {
		t.Fatalf("write: %v", err)
	}
	if !waitFor("sleep", 3*time.Second) {
		t.Fatalf("foreground job = %q, want sleep", foregroundJobName(ptmx))
	}
}

// TestForegroundJobNameClosedFile ensures a dead PTY reports no job instead
// of an error leaking into the watcher.
func TestForegroundJobNameClosedFile(t *testing.T) {
	f, err := os.Open("/dev/null")
	if err != nil {
		t.Skip(err)
	}
	defer func() { _ = f.Close() }()
	if got := foregroundJobName(f); got != "" {
		t.Fatalf("foreground job on /dev/null = %q, want empty", got)
	}
}
