//go:build linux

package term

import (
	"os"
	"strconv"
	"strings"

	"golang.org/x/sys/unix"
)

// foregroundJobName returns the command name of the process group currently
// in the PTY's foreground — the same mechanism iTerm2 (and tmux's
// pane_current_command) use to title tabs with the running job. Interactive
// login shells place each command in its own process group, so the
// foreground group leader is the program the user is actually running
// (zsh at the prompt, claude/vim/node while they run).
func foregroundJobName(ptmx *os.File) string {
	pgid, err := unix.IoctlGetInt(int(ptmx.Fd()), unix.TIOCGPGRP)
	if err != nil || pgid <= 0 {
		return ""
	}
	if name := readComm(pgid); name != "" {
		return name
	}
	// The group leader may have exited while a pipeline member lives on.
	return scanProcForPgrp(pgid)
}

func readComm(pid int) string {
	raw, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/comm")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func scanProcForPgrp(pgid int) string {
	want := strconv.Itoa(pgid)
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return ""
	}
	for _, e := range entries {
		name := e.Name()
		if name[0] < '0' || name[0] > '9' {
			continue
		}
		raw, err := os.ReadFile("/proc/" + name + "/stat")
		if err != nil {
			continue
		}
		s := string(raw)
		// comm may contain spaces/parens; fields resume after the last ')'.
		i := strings.LastIndexByte(s, ')')
		if i < 0 || i+2 >= len(s) {
			continue
		}
		fields := strings.Fields(s[i+2:])
		// fields: state ppid pgrp ...
		if len(fields) < 3 || fields[2] != want {
			continue
		}
		pid, err := strconv.Atoi(name)
		if err != nil {
			continue
		}
		if comm := readComm(pid); comm != "" {
			return comm
		}
	}
	return ""
}
