package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Mode             string // gateway | direct
	SocketPath       string
	Listen           string
	DataDir          string
	BasePath         string
	Grace            time.Duration
	TrustUnixAll     bool
	FrameAncestors   string
	Dev              bool
	Version          string
}

func Load(version string) Config {
	c := Config{
		Mode:           os.Getenv("OFTERM_MODE"),
		SocketPath:     os.Getenv("OFTERM_SOCKET"),
		Listen:         os.Getenv("OFTERM_LISTEN"),
		DataDir:        os.Getenv("OFTERM_DATA_DIR"),
		BasePath:       os.Getenv("OFTERM_BASE"),
		Grace:          0,
		FrameAncestors: os.Getenv("OFTERM_FRAME_ANCESTORS"),
		Dev:            os.Getenv("OFTERM_DEV") == "1",
		Version:        version,
	}
	if c.Mode == "" {
		if c.SocketPath != "" {
			c.Mode = "gateway"
		} else {
			c.Mode = "direct"
		}
	}
	if c.DataDir == "" {
		if v := os.Getenv("TRIM_PKGVAR"); v != "" {
			c.DataDir = v
		} else {
			c.DataDir = "/tmp/ofterm-data"
		}
	}
	if c.BasePath == "" {
		if c.Mode == "gateway" {
			c.BasePath = "/app/ofterm"
		}
	}
	c.Grace = 15 * time.Second
	if v, ok := os.LookupEnv("OFTERM_GRACE_SECONDS"); ok {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= 3600 {
			c.Grace = time.Duration(n) * time.Second
		}
	}
	if c.Listen == "" && c.Mode == "direct" {
		c.Listen = "127.0.0.1:5122"
	}
	c.TrustUnixAll = os.Getenv("OFTERM_TRUST_UNIX_ALL") == "1"
	if c.FrameAncestors == "" {
		c.FrameAncestors = "'self'"
	}
	c.BasePath = strings.TrimSuffix(c.BasePath, "/")
	return c
}
