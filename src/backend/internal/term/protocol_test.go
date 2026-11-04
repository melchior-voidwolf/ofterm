package term

import (
	"encoding/binary"
	"testing"
)

func TestDataFrameRoundTrip(t *testing.T) {
	frame := EncodeData(42, []byte("hello"))
	if frame[0] != OpData {
		t.Fatalf("opcode = %x", frame[0])
	}
	if seq := binary.BigEndian.Uint64(frame[1:9]); seq != 42 {
		t.Fatalf("seq = %d", seq)
	}
	if string(frame[9:]) != "hello" {
		t.Fatalf("payload = %q", frame[9:])
	}
}

func TestResizeRoundTrip(t *testing.T) {
	frame := EncodeResize(132, 43)
	cols, rows, ok := DecodeResize(frame[1:])
	if !ok || cols != 132 || rows != 43 {
		t.Fatalf("resize = %d,%d ok=%v", cols, rows, ok)
	}
}

func TestDecodeResizeRejectsGarbage(t *testing.T) {
	if _, _, ok := DecodeResize([]byte{0xff}); ok {
		t.Fatal("expected invalid resize to be rejected")
	}
}
