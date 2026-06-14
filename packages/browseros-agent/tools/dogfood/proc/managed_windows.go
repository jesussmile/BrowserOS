//go:build windows

package proc

import (
	"os"
	"os/exec"
	"syscall"
)

func configureManagedCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP}
}

func terminateManagedProcess(proc *os.Process) {
	_ = proc.Kill()
}

func killManagedProcess(proc *os.Process) {
	_ = proc.Kill()
}
