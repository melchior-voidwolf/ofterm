// ofterm-utils: terminal helpers for OFTerm, dispatched by argv[0] so one
// binary can stand in for several commands (busybox style).

mod base64;
mod image_ops;
mod imgls;
mod imgcat;
mod osc;
mod term;

use std::path::Path;

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let argv0 = args
        .first()
        .map(|a| a.rsplit('/').next().unwrap_or(a).to_string())
        .unwrap_or_default();

    let code = match argv0.as_str() {
        "imgcat" => imgcat::run(&args[1..]),
        "imgls" => imgls::run(&args[1..]),
        _ => {
            // Direct invocation: the first argument selects the command.
            let sub = args.get(1).cloned().unwrap_or_default();
            let rest: Vec<String> = args.iter().skip(2).cloned().collect();
            match sub.as_str() {
                "imgcat" => imgcat::run(&rest),
                "imgls" => imgls::run(&rest),
                "--version" | "-V" => {
                    println!("ofterm-utils {VERSION}");
                    0
                }
                "--selftest" => selftest(),
                "--help" | "-h" | "help" => {
                    println!(
                        "ofterm-utils {VERSION}\n\
                         \n\
                         Commands (or install as a symlink named after them):\n\
                         \x20 imgcat   display images inline (OSC 1337)\n\
                         \x20 imgls    directory listing with thumbnails\n"
                    );
                    0
                }
                _ => {
                    eprintln!(
                        "usage: {} [imgcat|imgls|--version|--selftest]\n\
                         (or invoke through a symlink named imgcat or imgls)",
                        Path::new(&argv0).display()
                    );
                    2
                }
            }
        }
    };
    std::process::exit(code);
}

/// Proves the binary can execute on this machine and its image stack works:
/// used by the installer to decide between this and the shell fallback.
fn selftest() -> i32 {
    // A 1x1 PNG.
    const PIXEL: &[u8] = &[
        0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, b'I', b'H', b'D',
        b'R', 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, b'I', b'D', b'A', b'T', 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, b'I',
        b'E', b'N', b'D', 0xae, 0x42, 0x60, 0x82,
    ];
    if image_ops::dimensions(PIXEL) != Some((1, 1)) {
        return 1;
    }
    if base64::encode(b"ofterm") != b"b2Z0ZXJt" {
        return 1;
    }
    println!("ok");
    0
}
