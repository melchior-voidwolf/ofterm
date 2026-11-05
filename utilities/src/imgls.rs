// imgls: an adaptive grid of inline thumbnails with filenames underneath.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use unicode_width::{UnicodeWidthChar, UnicodeWidthStr};

use crate::image_ops;
use crate::osc::{Framing, Params};

const HELP: &str = "\
Usage: imgls [--width N|--height N] [--columns N] [--preserve_ratio|--stretch]
             [--dimensions|--no-dimensions] [file|dir ...]

List images as an adaptive grid of inline thumbnails, with each filename below
its image. The column count follows the terminal width (typically 3-5 columns);
--columns N limits it. Defaults: 20x10 cell thumbnails, aspect ratio preserved,
pixel dimensions shown below filenames. Thumbnails are downscaled before
transfer. With no arguments, lists the current directory.
";

const COLUMN_GAP: u32 = 2;

struct Options {
    width: u32,
    height: u32,
    columns: Option<u32>,
    preserve_aspect_ratio: bool,
    dimensions: bool,
}

struct ImageItem {
    path: PathBuf,
    dims: (u32, u32),
}

impl ImageItem {
    fn filename(&self) -> String {
        self.path
            .file_name()
            .unwrap_or(self.path.as_os_str())
            .to_string_lossy()
            .chars()
            .map(|c| if c.is_control() { '\u{fffd}' } else { c })
            .collect()
    }
}

fn entries(target: &Path) -> Vec<PathBuf> {
    if target.is_dir() {
        let mut list: Vec<PathBuf> = match std::fs::read_dir(target) {
            Ok(rd) => rd.filter_map(|e| e.ok()).map(|e| e.path()).collect(),
            Err(_) => Vec::new(),
        };
        list.sort();
        list
    } else {
        vec![target.to_path_buf()]
    }
}

fn column_count(terminal_columns: u32, cell_width: u32) -> u32 {
    ((terminal_columns + COLUMN_GAP) / (cell_width + COLUMN_GAP)).max(1)
}

/// Match @xterm/addon-image's aspect-preserved sizing: width determines the
/// pixel height, which is then rounded up to whole terminal rows.
fn display_rows(
    dims: (u32, u32),
    cell_width: u32,
    requested_height: u32,
    preserve_aspect_ratio: bool,
    cell_pixels: (u32, u32),
) -> u32 {
    if !preserve_aspect_ratio {
        return requested_height.max(1);
    }
    let (w, h) = (dims.0.max(1) as u64, dims.1.max(1) as u64);
    let (cw, ch) = (cell_pixels.0.max(1) as u64, cell_pixels.1.max(1) as u64);
    let pixel_height = (h * cell_width as u64 * cw / w).max(1);
    pixel_height.div_ceil(ch).clamp(1, u32::MAX as u64) as u32
}

/// Truncate a label to a terminal-cell width and pad it for the next column.
/// UnicodeWidthStr keeps CJK filenames aligned instead of counting bytes.
fn fit_label(text: &str, width: u32) -> String {
    let width = width.max(1) as usize;
    if UnicodeWidthStr::width(text) <= width {
        return format!("{text}{}", " ".repeat(width - UnicodeWidthStr::width(text)));
    }
    if width == 1 {
        return "…".to_string();
    }
    let mut result = String::new();
    let mut used = 0;
    for c in text.chars() {
        let cw = UnicodeWidthChar::width(c).unwrap_or(0);
        if used + cw > width - 1 {
            break;
        }
        result.push(c);
        used += cw;
    }
    result.push('…');
    result
}

fn render_row<W: Write>(
    out: &mut W,
    framing: Framing,
    row: &[ImageItem],
    opts: &Options,
    cell_width: u32,
    max_px: u32,
    cell_pixels: (u32, u32),
) -> io::Result<()> {
    let row_height = row
        .iter()
        .map(|item| {
            display_rows(
                item.dims,
                cell_width,
                opts.height,
                opts.preserve_aspect_ratio,
                cell_pixels,
            )
        })
        .max()
        .unwrap_or(opts.height.max(1))
        // One spare row: fonts whose cells are wider than the 2:1 estimate
        // draw slightly taller thumbnails, and labels must never overlap.
        + 1;
    let label_lines = if opts.dimensions { 2 } else { 1 };

    // Make room first. CUD alone stops at the bottom margin, while real
    // newlines scroll; moving back up leaves the cursor at the grid origin.
    let needed = row_height + label_lines;
    for _ in 0..needed {
        out.write_all(b"\n")?;
    }
    write!(out, "\x1b[{needed}A\r")?;

    for (column, item) in row.iter().enumerate() {
        let x = column as u32 * (cell_width + COLUMN_GAP) + 1;
        write!(out, "\x1b[{x}G")?;
        let Ok(data) = std::fs::read(&item.path) else {
            eprintln!("skipping unreadable {}", item.path.display());
            continue;
        };
        let thumb = image_ops::shrink(&data, max_px);
        let payload: &[u8] = thumb.as_deref().unwrap_or(&data);
        if payload.len() as u64 > crate::osc::MAX_RAW_BYTES {
            eprintln!(
                "skipping {}: {} bytes exceeds the inline-image limit",
                item.path.display(),
                payload.len()
            );
            continue;
        }
        let width_cells = cell_width.to_string();
        let height_cells = opts.height.to_string();
        let filename = item.filename();
        let transfer = Params {
            name: Some(&filename),
            width: Some(&width_cells),
            height: Some(&height_cells),
            preserve_aspect_ratio: Some(opts.preserve_aspect_ratio),
            type_hint: None,
            legacy: false,
            size: payload.len() as u64,
        };
        // Image addons may line-feed while drawing. DECSC/DECRC makes the
        // grid independent of the image's actual height and cursor mode.
        out.write_all(b"\x1b7")?;
        transfer.write_slice_inline(out, framing, payload)?;
        out.write_all(b"\x1b8")?;
    }

    write!(out, "\r\x1b[{row_height}B")?;
    for (column, item) in row.iter().enumerate() {
        let label = fit_label(&item.filename(), cell_width);
        if column + 1 == row.len() {
            write!(out, "{}", label.trim_end())?;
        } else {
            write!(out, "{label}{}", " ".repeat(COLUMN_GAP as usize))?;
        }
    }
    out.write_all(b"\n")?;
    if opts.dimensions {
        for (column, item) in row.iter().enumerate() {
            let dims = format!("[{}x{}]", item.dims.0, item.dims.1);
            let label = fit_label(&dims, cell_width);
            if column + 1 == row.len() {
                write!(out, "{}", label.trim_end())?;
            } else {
                write!(out, "{label}{}", " ".repeat(COLUMN_GAP as usize))?;
            }
        }
        out.write_all(b"\n")?;
    }
    Ok(())
}

pub fn run(args: &[String]) -> i32 {
    let mut opts = Options {
        width: 20,
        height: 10,
        columns: None,
        preserve_aspect_ratio: true,
        dimensions: true,
    };
    let mut targets: Vec<PathBuf> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "-h" | "--help" => {
                print!("{HELP}");
                return 0;
            }
            "--version" | "-V" => {
                println!("imgls (ofterm-utils) {}", env!("CARGO_PKG_VERSION"));
                return 0;
            }
            "--width" | "-W" | "--height" | "-H" | "--columns" | "-C" => {
                let Some(value) = args.get(i + 1).and_then(|v| v.parse::<u32>().ok()) else {
                    eprintln!("ERROR: {arg} needs a number");
                    return 1;
                };
                if value == 0 {
                    eprintln!("ERROR: {arg} must be greater than zero");
                    return 1;
                }
                i += 1;
                if arg == "--width" || arg == "-W" {
                    opts.width = value;
                } else if arg == "--height" || arg == "-H" {
                    opts.height = value;
                } else {
                    opts.columns = Some(value);
                }
            }
            "--preserve_ratio" | "--preserve-ratio" => opts.preserve_aspect_ratio = true,
            "--no-preserve_ratio" | "--no-preserve-ratio" | "--stretch" => {
                opts.preserve_aspect_ratio = false
            }
            "--dimensions" | "-d" => opts.dimensions = true,
            "--no-dimensions" | "--nodimensions" => opts.dimensions = false,
            "--" => {
                targets.extend(args[i + 1..].iter().map(PathBuf::from));
                break;
            }
            other if other.starts_with('-') => {}
            other => targets.push(PathBuf::from(other)),
        }
        i += 1;
    }
    if targets.is_empty() {
        targets.push(PathBuf::from("."));
    }

    let terminal_columns = crate::term::columns();
    let cell_width = opts.width.min(terminal_columns.saturating_sub(1).max(1));
    let automatic_columns = column_count(terminal_columns, cell_width);
    let columns = opts
        .columns
        .map(|requested| requested.clamp(1, automatic_columns))
        .unwrap_or(automatic_columns) as usize;

    // Thumbnail pixel budget: about 14 px per cell, clamped so tiny and huge
    // widths both stay sensible.
    let max_px = (cell_width * 14).clamp(240, 960);
    let cell_pixels = crate::term::cell_pixels();

    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());
    let framing = Framing::detect();
    let mut row: Vec<ImageItem> = Vec::with_capacity(columns);

    for target in &targets {
        if targets.len() > 1 && target.is_dir() {
            if let Err(e) = writeln!(out, "{}:", target.display()) {
                if e.kind() == io::ErrorKind::BrokenPipe {
                    return 0;
                }
                eprintln!("ERROR: {e}");
                return 1;
            }
        }
        for path in entries(target) {
            if !path.exists() {
                continue;
            }
            let dims = path
                .is_file()
                .then(|| image_ops::dimensions_file(&path))
                .flatten();
            let Some(dims) = dims else {
                if !row.is_empty() {
                    if let Err(e) = render_row(
                        &mut out,
                        framing,
                        &row,
                        &opts,
                        cell_width,
                        max_px,
                        cell_pixels,
                    ) {
                        if e.kind() == io::ErrorKind::BrokenPipe {
                            return 0;
                        }
                        eprintln!("ERROR: {e}");
                        return 1;
                    }
                    row.clear();
                }
                if let Err(e) = writeln!(out, "{}", path.display()) {
                    if e.kind() == io::ErrorKind::BrokenPipe {
                        return 0;
                    }
                    eprintln!("ERROR: {e}");
                    return 1;
                }
                continue;
            };
            row.push(ImageItem { path, dims });
            if row.len() == columns {
                if let Err(e) = render_row(
                    &mut out,
                    framing,
                    &row,
                    &opts,
                    cell_width,
                    max_px,
                    cell_pixels,
                ) {
                    if e.kind() == io::ErrorKind::BrokenPipe {
                        return 0;
                    }
                    eprintln!("ERROR: {e}");
                    return 1;
                }
                row.clear();
            }
        }
        if !row.is_empty() {
            if let Err(e) = render_row(
                &mut out,
                framing,
                &row,
                &opts,
                cell_width,
                max_px,
                cell_pixels,
            ) {
                if e.kind() == io::ErrorKind::BrokenPipe {
                    return 0;
                }
                eprintln!("ERROR: {e}");
                return 1;
            }
            row.clear();
        }
    }

    match out.flush() {
        Ok(()) => 0,
        Err(e) if e.kind() == io::ErrorKind::BrokenPipe => 0,
        Err(e) => {
            eprintln!("ERROR: {e}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn columns_follow_terminal_width() {
        assert_eq!(column_count(60, 20), 2);
        assert_eq!(column_count(80, 20), 3);
        assert_eq!(column_count(100, 20), 4);
        assert_eq!(column_count(110, 20), 5);
        assert_eq!(column_count(10, 20), 1);
    }

    #[test]
    fn labels_pad_and_truncate_by_display_width() {
        assert_eq!(fit_label("a.jpg", 8), "a.jpg   ");
        assert_eq!(fit_label("界.jpg", 8), "界.jpg  ");
        assert_eq!(fit_label("abcdef.jpg", 8), "abcdef.…");
        assert_eq!(fit_label("x", 1), "x");
    }

    #[test]
    fn aspect_ratio_determines_grid_row_height() {
        // 2:1 cell aspect; a square image at 20 cells wide is 10 rows high.
        assert_eq!(display_rows((100, 100), 20, 4, true, (10, 20)), 10);
        assert_eq!(display_rows((400, 100), 20, 4, true, (10, 20)), 3);
        assert_eq!(display_rows((100, 100), 20, 4, false, (10, 20)), 4);
    }
}
