package term

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

type Session struct {
	ID          string
	ResumeToken string
	Kind        string
	UID         string
	Cols        int
	Rows        int
	Grace       time.Duration

	cmd    execCmd
	ptmx   *os.File
	parent *Manager

	mu          sync.Mutex
	seq         uint64
	baseSeq     uint64
	buffer      []Frame
	bufferBytes int
	sub         *Subscriber
	killTimer   *time.Timer
	closing     bool
	exited      bool
	exitCode    int
	exitSignal  string
	done        chan struct{}
	closeOnce   sync.Once
}

// execCmd is a small interface to keep session.go testable without exposing
// os/exec details everywhere.
type execCmd interface {
	Wait() error
	ProcessID() int
}

func newSessionID() (string, error) {
	b := make([]byte, 9)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func newResumeToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func (s *Session) startLoops() {
	go s.readLoop()
	go s.waitLoop()
}

func (s *Session) readLoop() {
	// Decouple PTY reads from publication so small writes (zsh redraws,
	// imgcat's 200-byte chunks) are coalesced into larger WebSocket frames.
	out := make(chan []byte, 64)
	go func() {
		buf := make([]byte, 64*1024)
		for {
			n, err := s.ptmx.Read(buf)
			if n > 0 {
				data := make([]byte, n)
				copy(data, buf[:n])
				out <- data
			}
			if err != nil {
				close(out)
				return
			}
		}
	}()

	const (
		flushEvery = 8 * time.Millisecond
		maxBatch   = 256 * 1024
	)
	pending := make([]byte, 0, maxBatch)
	timer := time.NewTimer(flushEvery)
	if !timer.Stop() {
		<-timer.C
	}
	flush := func() {
		if len(pending) == 0 {
			return
		}
		data := pending
		pending = make([]byte, 0, maxBatch)
		s.publish(data)
	}
	reset := func() {
		if !timer.Stop() {
			select {
			case <-timer.C:
			default:
			}
		}
		timer.Reset(flushEvery)
	}

	for {
		select {
		case data, ok := <-out:
			if !ok {
				flush()
				return
			}
			pending = append(pending, data...)
			if len(pending) >= maxBatch {
				flush()
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
			} else {
				reset()
			}
		case <-timer.C:
			flush()
		}
	}
}

func (s *Session) waitLoop() {
	err := s.cmd.Wait()
	code, signal := exitInfo(err)

	s.mu.Lock()
	if s.exited {
		s.mu.Unlock()
		return
	}
	s.exited = true
	s.exitCode = code
	s.exitSignal = signal
	sub := s.sub
	s.sub = nil
	s.mu.Unlock()

	if sub != nil {
		sub.SendControl(OpExit, ExitPayload(code, signal, "process exited"))
		sub.Close()
	}
	_ = s.ptmx.Close()
	s.parent.remove(s.ID)
	close(s.done)
}

func (s *Session) publish(data []byte) {
	s.mu.Lock()
	s.seq++
	f := Frame{Seq: s.seq, Data: data}
	s.buffer = append(s.buffer, f)
	s.bufferBytes += len(data)
	for s.bufferBytes > maxBufferBytes && len(s.buffer) > 1 {
		dropped := s.buffer[0]
		s.buffer = s.buffer[1:]
		s.bufferBytes -= len(dropped.Data)
		s.baseSeq = dropped.Seq + 1
	}
	if s.baseSeq == 0 {
		s.baseSeq = 1
	}
	sub := s.sub
	s.mu.Unlock()

	if sub != nil {
		s.BlockingSend(sub, f)
	}
}

// Attach binds a new subscriber. lastSeq is the last sequence the client has
// already rendered; 0 means "send the retained buffer" (new attach).
func (s *Session) Attach(lastSeq uint64) (*Subscriber, []Frame, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.exited || s.closing {
		return nil, nil, ErrSessionClosed
	}
	if s.killTimer != nil {
		s.killTimer.Stop()
		s.killTimer = nil
	}
	if s.sub != nil {
		s.sub.Close()
	}
	if lastSeq > 0 && lastSeq+1 < s.baseSeq {
		return nil, nil, ErrBufferExpired
	}
	var replay []Frame
	for _, f := range s.buffer {
		if lastSeq == 0 || f.Seq > lastSeq {
			replay = append(replay, f)
		}
	}
	sub := newSubscriber()
	s.sub = sub
	return sub, replay, nil
}

// Detach unbinds a subscriber. intentional means the user closed the tab or
// sent a normal WebSocket close: kill immediately. Otherwise wait for grace.
func (s *Session) Detach(sub *Subscriber, intentional bool) {
	s.mu.Lock()
	if s.sub == sub {
		s.sub = nil
	} else {
		s.mu.Unlock()
		sub.Close()
		return
	}
	grace := s.Grace
	s.mu.Unlock()

	sub.Close()
	if intentional || grace <= 0 {
		s.Kill("closed")
		return
	}
	s.mu.Lock()
	if !s.exited && !s.closing && s.killTimer == nil {
		s.killTimer = time.AfterFunc(grace, func() { s.Kill("grace expired") })
	}
	s.mu.Unlock()
}

func (s *Session) Write(data []byte) (int, error) {
	return s.ptmx.Write(data)
}

func (s *Session) Resize(cols, rows int) error {
	if cols <= 0 || rows <= 0 || cols > 1000 || rows > 1000 {
		return fmt.Errorf("invalid terminal size %dx%d", cols, rows)
	}
	s.mu.Lock()
	s.Cols, s.Rows = cols, rows
	s.mu.Unlock()
	return setSize(s.ptmx, cols, rows)
}

func (s *Session) Kill(reason string) {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closing = true
		if s.killTimer != nil {
			s.killTimer.Stop()
			s.killTimer = nil
		}
		sub := s.sub
		s.sub = nil
		s.mu.Unlock()

		if sub != nil {
			sub.SendControl(OpExit, ExitPayload(-1, "", reason))
			sub.Close()
		}
		_ = s.ptmx.Close()
		if s.cmd != nil {
			pid := s.cmd.ProcessID()
			if pid > 0 {
				_ = syscall.Kill(-pid, syscall.SIGHUP)
				time.AfterFunc(2*time.Second, func() {
					_ = syscall.Kill(-pid, syscall.SIGKILL)
				})
			}
		}
	})
}

func (s *Session) Done() <-chan struct{} { return s.done }

func (s *Session) Exited() (bool, int, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.exited, s.exitCode, s.exitSignal
}

func exitInfo(err error) (int, string) {
	if err == nil {
		return 0, ""
	}
	if ee, ok := err.(*exec.ExitError); ok {
		if status, ok := ee.Sys().(syscall.WaitStatus); ok {
			if status.Signaled() {
				return -1, status.Signal().String()
			}
			return status.ExitStatus(), ""
		}
		return ee.ExitCode(), ""
	}
	return -1, err.Error()
}
