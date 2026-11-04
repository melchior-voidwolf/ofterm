//go:build !linux

package term

import "os"

// Job-name watching needs /proc (Linux). On other platforms (local dev) the
// watcher stays silent; OSC 0/1/2 titles still work.
func foregroundJobName(_ *os.File) string { return "" }
