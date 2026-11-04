package term

import (
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/creack/pty"
)

type execAdapter struct{ *exec.Cmd }

func (e execAdapter) ProcessID() int {
	if e.Cmd.Process == nil {
		return 0
	}
	return e.Cmd.Process.Pid
}

func defaultShell() string {
	if shell := os.Getenv("SHELL"); shell != "" {
		if st, err := os.Stat(shell); err == nil && st.Mode()&0o111 != 0 {
			return shell
		}
	}
	for _, candidate := range []string{"/bin/zsh", "/bin/bash", "/bin/sh"} {
		if st, err := os.Stat(candidate); err == nil && st.Mode()&0o111 != 0 {
			return candidate
		}
	}
	return "/bin/sh"
}

func resolveShell(requested string) (string, error) {
	if requested == "" {
		return defaultShell(), nil
	}
	if !filepath.IsAbs(requested) {
		return "", fmt.Errorf("shell must be an absolute path")
	}
	st, err := os.Stat(requested)
	if err != nil {
		return "", fmt.Errorf("shell: %w", err)
	}
	if st.Mode()&0o111 == 0 {
		return "", fmt.Errorf("shell is not executable")
	}
	return requested, nil
}

// RunAs identifies the fnOS user a shell should run as. Empty values mean the
// process user (development mode).
type RunAs struct {
	UID      string
	Username string
}

func resolveRunAs(runAs *RunAs) (*user.User, uint32, uint32, []uint32, bool, error) {
	if runAs == nil || (runAs.UID == "" && runAs.Username == "") {
		u, err := user.Current()
		if err != nil {
			return nil, 0, 0, nil, false, err
		}
		uid, err := strconv.ParseUint(u.Uid, 10, 32)
		if err != nil {
			return nil, 0, 0, nil, false, err
		}
		gid, err := strconv.ParseUint(u.Gid, 10, 32)
		if err != nil {
			return nil, 0, 0, nil, false, err
		}
		return u, uint32(uid), uint32(gid), nil, false, nil
	}
	var u *user.User
	var err error
	if runAs.UID != "" {
		u, err = user.LookupId(runAs.UID)
	}
	if u == nil && runAs.Username != "" {
		u, err = user.Lookup(runAs.Username)
	}
	if err != nil || u == nil {
		return nil, 0, 0, nil, false, fmt.Errorf("lookup user: %w", err)
	}
	uid, err := strconv.ParseUint(u.Uid, 10, 32)
	if err != nil {
		return nil, 0, 0, nil, false, err
	}
	gid, err := strconv.ParseUint(u.Gid, 10, 32)
	if err != nil {
		return nil, 0, 0, nil, false, err
	}
	var groups []uint32
	if raw, err := u.GroupIds(); err == nil {
		for _, g := range raw {
			if n, err := strconv.ParseUint(g, 10, 32); err == nil {
				groups = append(groups, uint32(n))
			}
		}
	}
	return u, uint32(uid), uint32(gid), groups, true, nil
}

// CreateLocal starts a login shell inside a PTY. When runAs identifies a fnOS
// user, the shell runs as that user (the web service itself may run as root to
// perform the switch). sudo is intentionally left to the user inside the shell.
func (m *Manager) CreateLocal(uid string, runAs *RunAs, cols, rows int, requestedShell string, grace time.Duration) (*Session, error) {
	if cols <= 0 || cols > 1000 {
		cols = 80
	}
	if rows <= 0 || rows > 1000 {
		rows = 24
	}
	if grace < 0 {
		grace = m.grace
	}
	shell, err := resolveShell(requestedShell)
	if err != nil {
		return nil, err
	}
	id, err := newSessionID()
	if err != nil {
		return nil, err
	}
	token, err := newResumeToken()
	if err != nil {
		return nil, err
	}

	target, targetUID, targetGID, groups, switchUser, err := resolveRunAs(runAs)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(shell, "-l")
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"OFTERM=1",
		"OFTERM_SESSION="+id,
	)
	home := ""
	if target != nil {
		cmd.Env = append(cmd.Env,
			"HOME="+target.HomeDir,
			"USER="+target.Username,
			"LOGNAME="+target.Username,
			"SHELL="+shell,
		)
		home = target.HomeDir
	} else {
		home, _ = os.UserHomeDir()
	}
	cmd.Dir, err = sessionStartDir(home)
	if err != nil {
		return nil, err
	}
	attrs := &syscall.SysProcAttr{}
	if switchUser {
		if os.Geteuid() != 0 && targetUID != uint32(os.Geteuid()) {
			return nil, fmt.Errorf("cannot switch to uid %d without root", targetUID)
		}
		attrs.Credential = &syscall.Credential{Uid: targetUID, Gid: targetGID, Groups: groups}
	}
	cmd.SysProcAttr = attrs

	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
	if err != nil {
		return nil, fmt.Errorf("start %q in directory %q: %w", shell, cmd.Dir, err)
	}

	s := &Session{
		ID:          id,
		ResumeToken: token,
		Kind:        "local",
		UID:         uid,
		Cols:        cols,
		Rows:        rows,
		Grace:       grace,
		cmd:         execAdapter{cmd},
		ptmx:        ptmx,
		parent:      m,
		done:        make(chan struct{}),
		baseSeq:     1,
	}
	if err := m.add(s); err != nil {
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		return nil, err
	}
	s.startLoops()
	return s, nil
}

func setSize(ptmx *os.File, cols, rows int) error {
	return pty.Setsize(ptmx, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)})
}

func currentUsername(uid string) string {
	if u, err := user.LookupId(uid); err == nil {
		return u.Username
	}
	return uid
}
