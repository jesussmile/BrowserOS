//go:build !windows

package proc

import (
	"os"
	"os/exec"
	"syscall"
)

func configureManagedCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func terminateManagedProcess(proc *os.Process) {
	_ = syscall.Kill(-proc.Pid, syscall.SIGTERM)
}

func killManagedProcess(proc *os.Process) {
	_ = syscall.Kill(-proc.Pid, syscall.SIGKILL)
}
