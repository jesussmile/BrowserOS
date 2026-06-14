//go:build !windows

package config

import "os"

func isExecutableFile(_ string, info os.FileInfo) bool {
	return !info.IsDir() && info.Mode()&0111 != 0
}
