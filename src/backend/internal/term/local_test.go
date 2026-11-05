package term

import (
	"runtime"
	"slices"
	"testing"
)

func TestUTF8LocaleAddsLocaleWhenMissing(t *testing.T) {
	got := utf8Locale([]string{"TERM=xterm-256color", "LANG="})
	want := "C.UTF-8"
	if runtime.GOOS == "darwin" {
		want = "en_US.UTF-8"
	}
	if !slices.Contains(got, "LANG="+want) || !slices.Contains(got, "LC_CTYPE="+want) {
		t.Fatalf("missing UTF-8 locale in %v (want %s)", got, want)
	}
}

func TestUTF8LocaleRespectsConfiguration(t *testing.T) {
	for _, env := range [][]string{
		{"LANG=zh_CN.UTF-8"},
		{"LC_CTYPE=en_US.UTF-8"},
		{"LC_ALL=C"},
	} {
		got := utf8Locale(append([]string{}, env...))
		if len(got) != len(env) || !slices.Equal(got, env) {
			t.Fatalf("utf8Locale(%v) = %v; environment should be unchanged", env, got)
		}
	}
}
