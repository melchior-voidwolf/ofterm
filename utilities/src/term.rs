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

fn output_winsize() -> Option<libc::winsize> {
    winsize(libc::STDOUT_FILENO).or_else(|| winsize(libc::STDIN_FILENO))
}

/// Terminal width in character cells. Piped output uses the conventional
/// 80-column layout; callers can still override their thumbnail width.
pub fn columns() -> u32 {
    output_winsize()
        .map(|ws| ws.ws_col as u32)
        .filter(|&cols| cols > 0)
        .unwrap_or(80)
}

/// Pixel dimensions of one terminal cell, used only to estimate how many rows
/// an aspect-preserved thumbnail will occupy. OFTerm's PTY normally reports
/// cells only, so the same 10x20 estimate as imgcat is the fallback.
pub fn cell_pixels() -> (u32, u32) {
    if let Some(ws) = output_winsize() {
        let (cols, rows) = (ws.ws_col as u32, ws.ws_row as u32);
        let (w, h) = (ws.ws_xpixel as u32, ws.ws_ypixel as u32);
        if cols > 0 && rows > 0 && w >= cols && h >= rows {
            return ((w / cols).max(1), (h / rows).max(1));
        }
    }
    (10, 20)
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
