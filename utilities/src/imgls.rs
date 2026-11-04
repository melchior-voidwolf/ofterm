// imgls: a directory listing with inline thumbnails.

use std::io::{self, Write};
use std::path::{Path, PathBuf};

use crate::image_ops;
use crate::osc::{Framing, Params};

const HELP: &str = "\
Usage: imgls [--width N|--height N] [--preserve_ratio|--stretch]
             [--dimensions|--no-dimensions] [file|dir ...]

List files with inline image thumbnails. Defaults: 20x10 cell thumbnails,
aspect ratio preserved, pixel dimensions shown. With no arguments, lists the
current directory. Thumbnails are downscaled before transfer.
";

struct Options {
    width: u32,
    height: u32,
    preserve_aspect_ratio: bool,
    dimensions: bool,
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

pub fn run(args: &[String]) -> i32 {
    let mut opts = Options {
        width: 20,
        height: 10,
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
            "--width" | "-W" | "--height" | "-H" => {
                let Some(value) = args.get(i + 1).and_then(|v| v.parse::<u32>().ok()) else {
                    eprintln!("ERROR: {arg} needs a number");
                    return 1;
                };
                i += 1;
                if arg == "--width" || arg == "-W" {
                    opts.width = value.max(1);
                } else {
                    opts.height = value.max(1);
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

    // Thumbnail pixel budget: about 14 px per cell, clamped so tiny and huge
    // widths both stay sensible.
    let max_px = (opts.width * 14).clamp(240, 960);

    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());
    let framing = Framing::detect();

    for target in &targets {
        for path in entries(target) {
            if !path.exists() {
                continue;
            }
            let data = if path.is_file() {
                std::fs::read(&path).ok()
            } else {
                None
            };
            let dims = data.as_deref().and_then(image_ops::dimensions);
            let shown = path.display().to_string();
            let line = if opts.dimensions {
                match dims {
                    Some((w, h)) => format!("{shown} [{w}x{h}]"),
                    None => shown,
                }
            } else {
                shown
            };
            if writeln!(out, "{line}").is_err() {
                return 0;
            }
            let Some(data) = data else { continue };
            if dims.is_none() {
                continue;
            }
            let thumb = image_ops::shrink(&data, max_px);
            let payload: &[u8] = thumb.as_deref().unwrap_or(&data);
            if payload.len() as u64 > crate::osc::MAX_RAW_BYTES {
                eprintln!(
                    "skipping {}: {} bytes exceeds the inline-image limit",
                    path.display(),
                    payload.len()
                );
                continue;
            }
            let width_cells = opts.width.to_string();
            let height_cells = opts.height.to_string();
            let transfer = Params {
                name: None,
                width: Some(&width_cells),
                height: Some(&height_cells),
                preserve_aspect_ratio: Some(opts.preserve_aspect_ratio),
                type_hint: None,
                legacy: false,
                size: payload.len() as u64,
            };
            if let Err(e) = transfer.write_slice(&mut out, framing, payload) {
                if e.kind() == io::ErrorKind::BrokenPipe {
                    return 0;
                }
                eprintln!("ERROR: {e}");
                return 1;
            }
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
