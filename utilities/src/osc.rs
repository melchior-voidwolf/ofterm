// OSC 1337 inline-image framing (the iTerm2 protocol), including the tmux DCS
// wrapper that upstream imgcat uses.
//
// Payloads are streamed: nothing here ever builds a base64 string for the
// whole image, and file input can be copied straight through a 64 KiB buffer.

use std::io::{self, Read, Write};

/// The browser side reassembles every FilePart into one OSC sequence, and
/// xterm.js drops OSC payloads above 10,000,000 characters. Keep raw payloads
/// below this so an accepted image never turns into a silently dropped one.
pub const MAX_RAW_BYTES: u64 = 6_800_000;

#[derive(Clone, Copy)]
pub struct Framing {
    pub tmux: bool,
}

impl Framing {
    pub fn detect() -> Self {
        let term = std::env::var("TERM").unwrap_or_default();
        Framing {
            tmux: term.starts_with("screen") || term.starts_with("tmux"),
        }
    }

    fn osc_start(&self) -> &'static [u8] {
        if self.tmux {
            b"\x1bPtmux;\x1b\x1b]"
        } else {
            b"\x1b]"
        }
    }

    fn osc_end(&self) -> &'static [u8] {
        if self.tmux {
            b"\x07\x1b\\"
        } else {
            b"\x07"
        }
    }

    pub fn sequence<W: Write>(&self, w: &mut W, payload: &[u8]) -> io::Result<()> {
        w.write_all(self.osc_start())?;
        w.write_all(b"1337;")?;
        w.write_all(payload)?;
        w.write_all(self.osc_end())
    }
}

/// Header fields for one transfer.
pub struct Params<'a> {
    pub name: Option<&'a str>,
    pub width: Option<&'a str>,
    pub height: Option<&'a str>,
    pub preserve_aspect_ratio: Option<bool>,
    pub type_hint: Option<&'a str>,
    pub legacy: bool,
    pub size: u64,
}

impl Params<'_> {
    fn header(&self) -> Vec<u8> {
        let mut h = Vec::with_capacity(128);
        h.extend_from_slice(if self.legacy {
            b"File=inline=1"
        } else {
            b"MultipartFile=inline=1"
        });
        h.extend_from_slice(format!(";size={}", self.size).as_bytes());
        if let Some(name) = self.name {
            h.extend_from_slice(b";name=");
            h.extend_from_slice(&crate::base64::encode(name.as_bytes()));
        }
        if let Some(w) = self.width {
            h.extend_from_slice(format!(";width={w}").as_bytes());
        }
        if let Some(hgt) = self.height {
            h.extend_from_slice(format!(";height={hgt}").as_bytes());
        }
        if let Some(p) = self.preserve_aspect_ratio {
            h.extend_from_slice(format!(";preserveAspectRatio={}", p as u8).as_bytes());
        }
        if let Some(t) = self.type_hint {
            h.extend_from_slice(format!(";type={t}").as_bytes());
        }
        h
    }

    /// Emit an in-memory payload.
    pub fn write_slice<W: Write>(&self, w: &mut W, framing: Framing, data: &[u8]) -> io::Result<()> {
        if self.legacy {
            framing.sequence_start(w)?;
            w.write_all(&self.header())?;
            w.write_all(b":")?;
            w.write_all(&crate::base64::encode(data))?;
            framing.sequence_end(w)?;
        } else {
            framing.sequence(w, &self.header())?;
            for chunk in data.chunks(150) {
                self.part(w, framing, chunk)?;
            }
            framing.sequence(w, b"FileEnd")?;
        }
        w.write_all(b"\n")
    }

    /// Emit a payload read from `reader`, in constant memory.
    pub fn write_reader<W: Write, R: Read>(
        &self,
        w: &mut W,
        framing: Framing,
        reader: &mut R,
    ) -> io::Result<()> {
        const BUF: usize = 64 * 1024 - 1; // divisible by 3, so no per-chunk padding
        let mut buf = vec![0u8; BUF];
        if self.legacy {
            framing.sequence_start(w)?;
            w.write_all(&self.header())?;
            w.write_all(b":")?;
            loop {
                let n = fill(reader, &mut buf)?;
                if n == 0 {
                    break;
                }
                let mut enc = Vec::with_capacity(n.div_ceil(3) * 4);
                crate::base64::encode_into(&buf[..n], &mut enc);
                w.write_all(&enc)?;
                if n < buf.len() {
                    break;
                }
            }
            framing.sequence_end(w)?;
        } else {
            framing.sequence(w, &self.header())?;
            let mut carry: Vec<u8> = Vec::with_capacity(150);
            loop {
                let n = fill(reader, &mut buf)?;
                if n == 0 {
                    break;
                }
                carry.extend_from_slice(&buf[..n]);
                let mut off = 0;
                while carry.len() - off >= 150 {
                    self.part(w, framing, &carry[off..off + 150])?;
                    off += 150;
                }
                carry.drain(..off);
                if n < buf.len() {
                    break;
                }
            }
            if !carry.is_empty() {
                self.part(w, framing, &carry)?;
            }
            framing.sequence(w, b"FileEnd")?;
        }
        w.write_all(b"\n")
    }

    fn part<W: Write>(&self, w: &mut W, framing: Framing, chunk: &[u8]) -> io::Result<()> {
        let mut payload = b"FilePart=".to_vec();
        crate::base64::encode_into(chunk, &mut payload);
        framing.sequence(w, &payload)
    }
}

impl Framing {
    fn sequence_start<W: Write>(&self, w: &mut W) -> io::Result<()> {
        w.write_all(self.osc_start())?;
        w.write_all(b"1337;")
    }
    fn sequence_end<W: Write>(&self, w: &mut W) -> io::Result<()> {
        w.write_all(self.osc_end())
    }
}

/// Read until `buf` is full or EOF; returns the number of bytes read.
fn fill<R: Read>(r: &mut R, buf: &mut [u8]) -> io::Result<usize> {
    let mut total = 0;
    while total < buf.len() {
        match r.read(&mut buf[total..]) {
            Ok(0) => break,
            Ok(n) => total += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(total)
}
