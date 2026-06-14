//go:build windows

package config

import (
	"os"
	"path/filepath"
	"strings"
)

func isExecutableFile(path string, info os.FileInfo) bool {
	return !info.IsDir() && strings.EqualFold(filepath.Ext(path), ".exe")
}
