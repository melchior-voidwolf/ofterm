package term

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"sync"
	"time"
)

const (
	OpData   byte = 0x01
	OpResize byte = 0x02
	OpExit   byte = 0x03
	OpError  byte = 0x04
	OpPing   byte = 0x05
	OpPong   byte = 0x06
	OpReady  byte = 0x07
	OpAck    byte = 0x08
	OpResume byte = 0x09
	OpClose  byte = 0x0A
	OpTitle  byte = 0x0B
)

const (
	maxBufferBytes = 2 << 20
	maxFrameBytes  = 1 << 20
)

var (
	ErrNotAttached   = errors.New("session is not attached")
	ErrBufferExpired = errors.New("resume buffer expired")
	ErrSessionClosed = errors.New("session closed")
)

type Frame struct {
	Seq  uint64
	Data []byte
}

type Control struct {
	Opcode  byte
	Payload []byte
}

type Subscriber struct {
	Frames  chan Frame
	Control chan Control
	Done    chan struct{}

	closeOnce sync.Once
}

func newSubscriber() *Subscriber {
	return &Subscriber{
		Frames:  make(chan Frame, 64),
		Control: make(chan Control, 8),
		Done:    make(chan struct{}),
	}
}

func (s *Subscriber) Close() {
	s.closeOnce.Do(func() { close(s.Done) })
}

func (s *Subscriber) SendControl(op byte, payload any) {
	var raw []byte
	switch v := payload.(type) {
	case nil:
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		raw, _ = json.Marshal(v)
	}
	select {
	case s.Control <- Control{Opcode: op, Payload: raw}:
	case <-s.Done:
	}
}

func EncodeData(seq uint64, data []byte) []byte {
	out := make([]byte, 9+len(data))
	out[0] = OpData
	binary.BigEndian.PutUint64(out[1:9], seq)
	copy(out[9:], data)
	return out
}

func EncodeControl(op byte, payload any) []byte {
	var raw []byte
	switch v := payload.(type) {
	case nil:
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		raw, _ = json.Marshal(v)
	}
	out := make([]byte, 1+len(raw))
	out[0] = op
	copy(out[1:], raw)
	return out
}

func DecodeResize(payload []byte) (cols, rows int, ok bool) {
	c, n := binary.Uvarint(payload)
	if n <= 0 {
		return 0, 0, false
	}
	r, n2 := binary.Uvarint(payload[n:])
	if n2 <= 0 {
		return 0, 0, false
	}
	return int(c), int(r), true
}

func EncodeResize(cols, rows int) []byte {
	buf := make([]byte, 2*binary.MaxVarintLen64+1)
	buf[0] = OpResize
	n := 1 + binary.PutUvarint(buf[1:], uint64(cols))
	n += binary.PutUvarint(buf[n:], uint64(rows))
	return buf[:n]
}

func EncodeAck(n uint64) []byte {
	out := make([]byte, 9)
	out[0] = OpAck
	binary.BigEndian.PutUint64(out[1:], n)
	return out
}

func EncodePing() []byte  { return []byte{OpPing} }
func EncodePong() []byte  { return []byte{OpPong} }
func EncodeClose() []byte { return []byte{OpClose} }

func ExitPayload(code int, signal, reason string) []byte {
	raw, _ := json.Marshal(struct {
		Code   int    `json:"code"`
		Signal string `json:"signal,omitempty"`
		Reason string `json:"reason,omitempty"`
	}{Code: code, Signal: signal, Reason: reason})
	return raw
}

func ReadyPayload(sessionID, resumeToken, mode string, cols, rows int, startSeq uint64, resumed bool) []byte {
	raw, _ := json.Marshal(struct {
		SessionID   string `json:"sessionId"`
		ResumeToken string `json:"resumeToken"`
		Mode        string `json:"mode"`
		Cols        int    `json:"cols"`
		Rows        int    `json:"rows"`
		StartSeq    uint64 `json:"startSeq"`
		Resumed     bool   `json:"resumed"`
	}{sessionID, resumeToken, mode, cols, rows, startSeq, resumed})
	return raw
}

func ErrorPayload(code, message string) []byte {
	raw, _ := json.Marshal(struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{code, message})
	return raw
}

// BlockingSend delivers a frame, applying backpressure only when the queue is
// full. A wedged client is detached (not killed) so the grace/resume window can
// still restore the session.
func (s *Session) BlockingSend(sub *Subscriber, f Frame) bool {
	select {
	case sub.Frames <- f:
		return true
	case <-sub.Done:
		return false
	default:
	}
	timer := time.NewTimer(15 * time.Second)
	defer timer.Stop()
	select {
	case sub.Frames <- f:
		return true
	case <-sub.Done:
		return false
	case <-timer.C:
		s.Detach(sub, false)
		return false
	}
}
