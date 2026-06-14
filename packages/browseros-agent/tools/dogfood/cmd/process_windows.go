//go:build windows

package cmd

import (
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

func configureBackgroundProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}

func notifyShutdownSignals(sigCh chan<- os.Signal) {
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
}
