// Terminal geometry and small tty helpers.

use std::os::unix::io::RawFd;

fn winsize(fd: RawFd) -> Option<libc::winsize> {
    let mut ws: libc::winsize = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::ioctl(fd, libc::TIOCGWINSZ, &mut ws) };
    if rc == 0 {
        Some(ws)
    } else {
        None
    }
}

pub fn is_tty(fd: RawFd) -> bool {
    unsafe { libc::isatty(fd) == 1 }
}

/// Pixel budget for downscaling before transfer.
///
/// `OFN_IMG_MAX_PX` wins when set (0 disables downscaling). Otherwise use the
/// real pixel geometry when the terminal reports it, and fall back to the
/// usual ~10x20 px cell estimate, clamped to a sane range.
pub fn max_px() -> u32 {
    if let Ok(v) = std::env::var("OFN_IMG_MAX_PX") {
        if let Ok(n) = v.trim().parse::<u32>() {
            // An explicit setting is honoured as-is; 0 means "no downscaling".
            return n;
        }
    }
    let ws = winsize(libc::STDOUT_FILENO).or_else(|| winsize(libc::STDIN_FILENO));
    let mut px = 0u32;
    if let Some(ws) = ws {
        let (w, h) = (ws.ws_xpixel as u32, ws.ws_ypixel as u32);
        if w > 0 && h > 0 {
            px = w.max(h);
        } else {
            let cols = ws.ws_col as u32;
            let rows = ws.ws_row as u32;
            if cols > 0 && rows > 0 {
                px = (cols * 10).max(rows * 20);
            }
        }
    }
    if px == 0 {
        // No tty: same assumption the shell version makes (80x24 cells).
        px = 80 * 10;
    }
    px.clamp(320, 1600)
}
