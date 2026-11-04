// imgcat: display images inline using the OSC 1337 protocol.

use std::fs::File;
use std::io::{self, BufWriter, Read, Write};
use std::process::Command;

use crate::image_ops;
use crate::osc::{Framing, Params, MAX_RAW_BYTES};
use crate::term;

const HELP: &str = "\
Usage: imgcat [-p] [-n] [-W width] [-H height] [-r] [-s] [-u] [-t file-type] [-f] [-l] [--no-shrink] [--] filename ...
       cat filename | imgcat [-W width] [-H height] [-r] [-s]

Display images inline using the OSC 1337 Inline Images Protocol.

Options:
    -h, --help                      Display help message
    -p, --print                     Print the filename after each image
    -n, --no-print                  Do not print the filename after each image
    -u, --url                       Interpret following arguments as remote URLs
    -f, --file                      Interpret following arguments as regular files
    -t, --type file-type            Provides a type hint
    -r, --preserve-aspect-ratio     Preserve the aspect ratio when scaling
    -s, --stretch                   Stretch to the given width and height
    -W, --width N                   Image width in cells (N), pixels (Npx), percent (N%) or auto
    -H, --height N                  Image height in cells (N), pixels (Npx), percent (N%) or auto
    -l, --legacy                    Send the whole image in a single control sequence
        --no-shrink                 Send the original bytes; no downscaling
        --                          Treat all following arguments as file names

    Large images are downscaled to fit the terminal before transfer; OFN_IMG_MAX_PX
    overrides the pixel budget and OFN_IMG_MAX_PX=0 is the same as --no-shrink.

Examples:
    $ imgcat -W 250px -H 250px -s avatar.png
    $ cat graph.png | imgcat -W 100%
    $ imgcat -p -u http://host.tld/image.jpg
";

struct Options {
    print_filename: bool,
    width: Option<String>,
    height: Option<String>,
    preserve_aspect_ratio: Option<bool>,
    legacy: bool,
    shrink: bool,
    type_hint: Option<String>,
}

fn valid_size_unit(v: &str) -> bool {
    if v == "auto" {
        return true;
    }
    let digits: String = v.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return false;
    }
    let rest = &v[digits.len()..];
    rest.is_empty() || rest == "px" || rest == "%"
}

/// Type hints are embedded in the OSC header; keep them from smuggling in
/// separators or terminal control sequences.
fn sanitize_type(v: &str) -> String {
    v.chars()
        .filter(|c| c.is_ascii_graphic() && !matches!(c, ';' | ':' | '\x1b' | '\x07'))
        .take(120)
        .collect()
}

fn err(msg: &str) {
    eprintln!("ERROR: {msg}");
}

fn params<'a>(opts: &'a Options, name: Option<&'a str>, size: u64) -> Params<'a> {
    Params {
        name,
        width: opts.width.as_deref(),
        height: opts.height.as_deref(),
        preserve_aspect_ratio: opts.preserve_aspect_ratio,
        type_hint: opts.type_hint.as_deref(),
        legacy: opts.legacy,
        size,
    }
}

/// Downscale as hard as needed to stay under the protocol limit. Returns
/// `None` when even the most aggressive attempt is not small enough.
fn fit_payload(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut best: Option<Vec<u8>> = None;
    let mut max_px = term::max_px();
    if max_px == 0 {
        return None;
    }
    loop {
        if let Some(out) = image_ops::shrink(bytes, max_px) {
            if out.len() as u64 <= MAX_RAW_BYTES {
                return Some(out);
            }
            best = Some(out);
        }
        if max_px <= 64 {
            break;
        }
        max_px = (max_px / 2).max(64);
    }
    best.filter(|out| out.len() as u64 <= MAX_RAW_BYTES)
}

fn emit_path<W: Write>(
    out: &mut W,
    framing: Framing,
    path: &str,
    opts: &Options,
) -> io::Result<()> {
    let meta = match File::open(path).and_then(|f| f.metadata()) {
        Ok(m) => m,
        Err(e) => {
            err(&format!("imgcat: {path}: {e}"));
            return Err(io::Error::from_raw_os_error(libc::ENOENT));
        }
    };
    let size = meta.len();

    if opts.shrink {
        // Shrinking needs the decoded pixels, so hold the source in memory.
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                err(&format!("imgcat: {path}: {e}"));
                return Err(io::Error::from_raw_os_error(libc::ENOENT));
            }
        };
        let payload = fit_payload(&bytes);
        let data: &[u8] = payload.as_deref().unwrap_or(&bytes);
        if data.len() as u64 > MAX_RAW_BYTES {
            err(&format!(
                "{path}: image is too large for the terminal protocol even after downscaling \
                 ({} bytes); convert it to a smaller JPEG/PNG first",
                data.len()
            ));
            return Err(io::Error::from_raw_os_error(libc::EFBIG));
        }
        let p = params(opts, Some(path), data.len() as u64);
        p.write_slice(out, framing, data)?;
    } else {
        if size > MAX_RAW_BYTES {
            err(&format!(
                "{path}: {size} bytes exceeds the {MAX_RAW_BYTES}-byte inline-image limit; \
                 drop --no-shrink or resize the image"
            ));
            return Err(io::Error::from_raw_os_error(libc::EFBIG));
        }
        let mut file = File::open(path)?;
        let p = params(opts, Some(path), size);
        p.write_reader(out, framing, &mut file)?;
    }
    if opts.print_filename {
        writeln!(out, "{path}")?;
    }
    Ok(())
}

fn emit_stdin<W: Write>(out: &mut W, framing: Framing, opts: &Options) -> io::Result<()> {
    // Spool stdin so `size=` is known before the header goes out, and so a
    // large paste never has to be held in one shell variable.
    let mut spool = std::env::temp_dir();
    spool.push(format!("ofterm-img-{}.bin", std::process::id()));
    let mut tmp = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(true)
        .open(&spool)?;
    io::copy(&mut io::stdin().lock(), &mut tmp)?;
    let size = tmp.metadata()?.len();
    let _ = std::fs::remove_file(&spool);
    if size == 0 {
        return Ok(());
    }

    if opts.shrink {
        let mut bytes = Vec::with_capacity(size as usize);
        tmp.rewind_file()?;
        (&tmp).read_to_end(&mut bytes)?;
        let payload = fit_payload(&bytes);
        let data: &[u8] = payload.as_deref().unwrap_or(&bytes);
        if data.len() as u64 > MAX_RAW_BYTES {
            err(&format!(
                "stdin: image is too large for the terminal protocol even after downscaling \
                 ({} bytes)",
                data.len()
            ));
            return Err(io::Error::from_raw_os_error(libc::EFBIG));
        }
        let p = params(opts, None, data.len() as u64);
        p.write_slice(out, framing, data)?;
    } else {
        if size > MAX_RAW_BYTES {
            err(&format!(
                "stdin: {size} bytes exceeds the {MAX_RAW_BYTES}-byte inline-image limit"
            ));
            return Err(io::Error::from_raw_os_error(libc::EFBIG));
        }
        tmp.rewind_file()?;
        let p = params(opts, None, size);
        p.write_reader(out, framing, &mut tmp)?;
    }
    Ok(())
}

trait Rewind {
    fn rewind_file(&mut self) -> io::Result<()>;
}

impl Rewind for File {
    fn rewind_file(&mut self) -> io::Result<()> {
        use std::io::Seek;
        self.seek(std::io::SeekFrom::Start(0)).map(|_| ())
    }
}

pub fn run(args: &[String]) -> i32 {
    if term::is_tty(0) && args.is_empty() {
        eprint!("{HELP}");
        return 0;
    }

    let mut opts = Options {
        print_filename: false,
        width: None,
        height: None,
        preserve_aspect_ratio: None,
        legacy: false,
        shrink: true,
        type_hint: None,
    };
    let mut is_url = false;
    let mut only_files = false;
    let mut files: Vec<(String, bool)> = Vec::new();
    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        if only_files {
            files.push((arg.to_string(), false));
            i += 1;
            continue;
        }
        match arg {
            "-h" | "--h" | "--help" => {
                print!("{HELP}");
                return 0;
            }
            "--version" | "-V" => {
                println!("imgcat (ofterm-utils) {}", env!("CARGO_PKG_VERSION"));
                return 0;
            }
            "--" => only_files = true,
            "-p" | "--p" | "--print" => opts.print_filename = true,
            "-n" | "--n" | "--no-print" => opts.print_filename = false,
            "-r" | "--r" | "--preserve-aspect-ratio" => opts.preserve_aspect_ratio = Some(true),
            "-s" | "--s" | "--stretch" => opts.preserve_aspect_ratio = Some(false),
            "-l" | "--l" | "--legacy" => opts.legacy = true,
            "--no-shrink" => opts.shrink = false,
            "-W" | "--W" | "--width" | "-H" | "--H" | "--height" | "-t" | "--t" | "--type" => {
                let Some(value) = args.get(i + 1) else {
                    err(&format!("missing argument for {arg}"));
                    return 1;
                };
                i += 1;
                match arg {
                    "-W" | "--W" | "--width" | "-H" | "--H" | "--height" => {
                        if !valid_size_unit(value) {
                            err(&format!("invalid image sizing unit - '{value}'"));
                            return 1;
                        }
                        if matches!(arg, "-W" | "--W" | "--width") {
                            opts.width = Some(value.clone());
                        } else {
                            opts.height = Some(value.clone());
                        }
                    }
                    _ => opts.type_hint = Some(sanitize_type(value)),
                }
            }
            "-u" | "--u" | "--url" => is_url = true,
            "-f" | "--f" | "--file" => is_url = false,
            _ if arg.starts_with('-') && arg.len() > 1 => {
                err(&format!("unknown option flag: {arg}"));
                return 1;
            }
            _ => files.push((arg.to_string(), is_url)),
        }
        i += 1;
    }

    let stdout = io::stdout();
    let mut out = BufWriter::new(stdout.lock());
    let framing = Framing::detect();
    let mut displayed = false;

    for (target, url) in &files {
        let result = if *url {
            match Command::new("curl").args(["-fsSL", target]).output() {
                Ok(o) if o.status.success() => {
                    let payload = if opts.shrink {
                        fit_payload(&o.stdout)
                    } else {
                        None
                    };
                    let data: &[u8] = payload.as_deref().unwrap_or(&o.stdout);
                    if data.len() as u64 > MAX_RAW_BYTES {
                        err(&format!(
                            "{target}: image exceeds the {MAX_RAW_BYTES}-byte inline-image limit"
                        ));
                        return 3;
                    }
                    let p = params(&opts, Some(target), data.len() as u64);
                    p.write_slice(&mut out, framing, data)
                }
                _ => {
                    err(&format!("could not retrieve image from URL {target}"));
                    return 2;
                }
            }
        } else {
            emit_path(&mut out, framing, target, &opts)
        };
        match result {
            Ok(()) => displayed = true,
            Err(e) if e.kind() == io::ErrorKind::BrokenPipe => return 0,
            Err(e) if e.raw_os_error() == Some(libc::EFBIG) => return 3,
            Err(_) => return 2,
        }
    }

    // Only drain stdin when no file arguments were given, so
    // `imgcat a.png b.png` never blocks in scripts whose stdin is an open
    // pipe. `cat x | imgcat` still works as before.
    if files.is_empty() && !term::is_tty(0) {
        match emit_stdin(&mut out, framing, &opts) {
            Ok(()) => displayed = true,
            Err(e) if e.kind() == io::ErrorKind::BrokenPipe => return 0,
            Err(e) if e.raw_os_error() == Some(libc::EFBIG) => return 3,
            Err(e) => {
                err(&format!("stdin: {e}"));
                return 1;
            }
        }
    }

    if let Err(e) = out.flush() {
        if e.kind() == io::ErrorKind::BrokenPipe {
            return 0;
        }
        err(&format!("{e}"));
        return 1;
    }
    if !displayed {
        err("no image provided. Check command line options.");
        return 1;
    }
    0
}
