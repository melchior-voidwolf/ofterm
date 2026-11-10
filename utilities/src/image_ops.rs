// Image decoding, downscaling and re-encoding.
//
// The goal is to keep what the browser eventually shows close to the original:
// EXIF orientation is applied, animated images are never flattened (they are
// sent untouched), and a downscaled copy is only used when it is actually
// smaller than the original.

use std::fs::File;
use std::io::{Cursor, Read};
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{
    DynamicImage, GrayImage, ImageBuffer, ImageEncoder, ImageFormat, ImageReader, Luma, Rgb,
    RgbImage, RgbaImage,
};

/// A decoded image plus the format it should be re-encoded to.
pub struct Prepared {
    pub image: DynamicImage,
    pub format: ImageFormat,
}

/// The `ftyp` box of an ISO base media file (AVIF/HEIF), if present.
fn ftyp(data: &[u8]) -> Option<&[u8]> {
    if data.len() < 12 || &data[4..8] != b"ftyp" {
        return None;
    }
    let size = u32::from_be_bytes(data[0..4].try_into().ok()?) as usize;
    if size < 12 {
        return None;
    }
    Some(&data[..size.min(data.len())])
}

fn has_brand(data: &[u8], brand: &[u8; 4]) -> bool {
    let Some(ftyp) = ftyp(data) else {
        return false;
    };
    if &ftyp[8..12] == brand {
        return true;
    }
    // Major brand (8..12), minor version (12..16), then compatible brands.
    ftyp.get(16..)
        .is_some_and(|tail| tail.chunks_exact(4).any(|b| b == brand))
}

// image's magic table only matches files whose major brand is literally
// "avif". Real encoders also emit "mif1" majors with an "avif" compatible
// brand, so detect the container ourselves and leave decoding to avif-decode
// (pure Rust, no libavif/dav1d C dependency).
fn is_avif(data: &[u8]) -> bool {
    has_brand(data, b"avif") || avif_is_animated(data)
}

fn avif_is_animated(data: &[u8]) -> bool {
    has_brand(data, b"avis")
}

fn avif_dimensions(data: &[u8]) -> Option<(u32, u32)> {
    let avif = avif_parse::read_avif(&mut &data[..]).ok()?;
    let meta = avif.primary_item_metadata().ok()?;
    Some((meta.max_frame_width.get(), meta.max_frame_height.get()))
}

fn decode_avif(data: &[u8]) -> Option<DynamicImage> {
    let decoded = avif_decode::Decoder::from_avif(data)
        .ok()?
        .to_image()
        .ok()?;
    Some(match decoded {
        avif_decode::Image::Rgb8(img) => {
            let (buf, w, h) = img.into_contiguous_buf();
            let mut raw = Vec::with_capacity(buf.len() * 3);
            for p in buf {
                raw.extend_from_slice(&[p.r, p.g, p.b]);
            }
            DynamicImage::ImageRgb8(RgbImage::from_raw(w as u32, h as u32, raw)?)
        }
        avif_decode::Image::Rgba8(img) => {
            let (buf, w, h) = img.into_contiguous_buf();
            let mut raw = Vec::with_capacity(buf.len() * 4);
            for p in buf {
                raw.extend_from_slice(&[p.r, p.g, p.b, p.a]);
            }
            DynamicImage::ImageRgba8(RgbaImage::from_raw(w as u32, h as u32, raw)?)
        }
        avif_decode::Image::Gray8(img) => {
            let (buf, w, h) = img.into_contiguous_buf();
            let raw: Vec<u8> = buf.into_iter().map(|p| p.value()).collect();
            DynamicImage::ImageLuma8(GrayImage::from_raw(w as u32, h as u32, raw)?)
        }
        avif_decode::Image::Rgb16(img) => {
            let (buf, w, h) = img.into_contiguous_buf();
            let mut raw = Vec::with_capacity(buf.len() * 3);
            for p in buf {
                raw.extend_from_slice(&[p.r, p.g, p.b]);
            }
            DynamicImage::ImageRgb16(ImageBuffer::<Rgb<u16>, _>::from_raw(
                w as u32, h as u32, raw,
            )?)
        }
        avif_decode::Image::Rgba16(img) => {
            let (buf, w, h) = img.into_contiguous_buf();
            let mut raw = Vec::with_capacity(buf.len() * 4);
            for p in buf {
                raw.extend_from_slice(&[p.r, p.g, p.b, p.a]);
            }
            DynamicImage::ImageRgba16(ImageBuffer::<image::Rgba<u16>, _>::from_raw(
                w as u32, h as u32, raw,
            )?)
        }
        avif_decode::Image::Gray16(img) => {
            let (buf, w, h) = img.into_contiguous_buf();
            let raw: Vec<u16> = buf.into_iter().map(|p| p.value()).collect();
            DynamicImage::ImageLuma16(ImageBuffer::<Luma<u16>, _>::from_raw(
                w as u32, h as u32, raw,
            )?)
        }
    })
}

/// Cheap header-only size probe; returns `None` for non-images or unreadable
/// headers. Used by imgls so a directory listing never decodes full images.
pub fn dimensions(data: &[u8]) -> Option<(u32, u32)> {
    if is_avif(data) {
        return avif_dimensions(data);
    }
    let format = image::guess_format(data).ok()?;
    if !is_image_format(format) {
        return None;
    }
    let reader = ImageReader::with_format(Cursor::new(data), format);
    reader.into_dimensions().ok()
}

/// The same header-only probe without reading the whole file into memory.
/// AVIF needs its container parsed, which means reading the compressed item.
pub fn dimensions_file(path: &Path) -> Option<(u32, u32)> {
    let mut head = [0u8; 32];
    let mut probe = File::open(path).ok()?;
    let read = probe.read(&mut head).ok()?;
    if is_avif(&head[..read]) {
        let data = std::fs::read(path).ok()?;
        return avif_dimensions(&data);
    }

    let reader = ImageReader::open(path).ok()?.with_guessed_format().ok()?;
    let format = reader.format()?;
    if !is_image_format(format) {
        return None;
    }
    reader.into_dimensions().ok()
}

pub fn is_image_format(format: ImageFormat) -> bool {
    matches!(
        format,
        ImageFormat::Png
            | ImageFormat::Jpeg
            | ImageFormat::Gif
            | ImageFormat::WebP
            | ImageFormat::Avif
            | ImageFormat::Bmp
            | ImageFormat::Tiff
            | ImageFormat::Ico
            | ImageFormat::Pnm
            | ImageFormat::Tga
            | ImageFormat::Dds
            | ImageFormat::Hdr
            | ImageFormat::Qoi
            | ImageFormat::OpenExr
    )
}

/// Decode `data`, applying EXIF orientation. Returns `None` when the bytes are
/// not an image we can decode; callers then send the original untouched.
pub fn decode(data: &[u8]) -> Option<Prepared> {
    if is_avif(data) {
        return Some(Prepared {
            image: decode_avif(data)?,
            format: ImageFormat::Avif,
        });
    }
    let format = image::guess_format(data).ok()?;
    if !is_image_format(format) {
        return None;
    }
    let reader = ImageReader::with_format(Cursor::new(data), format);
    let decoder = reader.into_decoder().ok()?;
    let mut image = DynamicImage::from_decoder(decoder).ok()?;
    apply_exif_orientation(&mut image, data);
    Some(Prepared { image, format })
}

/// Rotate/flip the image according to the EXIF Orientation tag.
///
/// `image`'s own `orientation()` is a no-op for several decoders (notably the
/// JPEG path), and phone photos rely on this tag, so it is read explicitly.
fn apply_exif_orientation(image: &mut DynamicImage, data: &[u8]) {
    use exif::{In, Reader, Tag};
    use image::imageops;

    let Ok(exif) = Reader::new().read_from_container(&mut Cursor::new(data)) else {
        return;
    };
    let Some(field) = exif.get_field(Tag::Orientation, In::PRIMARY) else {
        return;
    };
    let Some(value) = field.value.get_uint(0) else {
        return;
    };
    let original = std::mem::replace(image, DynamicImage::new_rgb8(1, 1));
    *image = match value {
        2 => DynamicImage::ImageRgba8(imageops::flip_horizontal(&original)),
        3 => original.rotate180(),
        4 => DynamicImage::ImageRgba8(imageops::flip_vertical(&original)),
        5 => DynamicImage::ImageRgba8(imageops::flip_horizontal(&original.rotate90())),
        6 => original.rotate90(),
        7 => DynamicImage::ImageRgba8(imageops::flip_vertical(&original.rotate90())),
        8 => original.rotate270(),
        _ => original,
    };
}

/// Whether the image carries more than one frame (animated GIF/WebP). Such
/// images are passed through untouched so animation survives.
pub fn is_animated(data: &[u8]) -> bool {
    if is_avif(data) {
        return avif_is_animated(data);
    }
    match image::guess_format(data) {
        Ok(ImageFormat::Gif) => {
            use image::AnimationDecoder;
            match image::codecs::gif::GifDecoder::new(Cursor::new(data)) {
                Ok(decoder) => decoder.into_frames().take(2).count() > 1,
                Err(_) => false,
            }
        }
        Ok(ImageFormat::WebP) => webp_is_animated(data),
        _ => false,
    }
}

fn webp_is_animated(data: &[u8]) -> bool {
    // RIFF/WEBP container: animation is signalled by an "ANIM" chunk.
    data.windows(4).any(|w| w == b"ANIM")
}

/// Formats @xterm/addon-image can hand to the browser unchanged. Everything
/// else (AVIF, WebP, BMP, ...) is decoded here and re-encoded as PNG, because
/// the addon's image sniffer only recognises PNG/JPEG/GIF.
fn browser_passthrough(format: ImageFormat) -> bool {
    matches!(
        format,
        ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::Gif
    )
}

/// Downscale so the longest side is at most `max_px`, then encode. Formats the
/// browser cannot display are always re-encoded as PNG. Returns `None` when no
/// work is needed, or when a downscaled PNG for a browser-native format would
/// not actually be smaller than the original.
pub fn shrink(data: &[u8], max_px: u32) -> Option<Vec<u8>> {
    if max_px == 0 || is_animated(data) {
        return None;
    }
    let mut prepared = decode(data)?;
    let (w, h) = (prepared.image.width(), prepared.image.height());
    let longest = w.max(h);
    let transcode = !browser_passthrough(prepared.format);
    if longest <= max_px && !transcode {
        return None;
    }
    if longest > max_px {
        let scale = max_px as f32 / longest as f32;
        let nw = ((w as f32 * scale).round() as u32).max(1);
        let nh = ((h as f32 * scale).round() as u32).max(1);
        prepared.image = prepared.image.resize_exact(nw, nh, FilterType::CatmullRom);
    }

    let encoded = match prepared.format {
        ImageFormat::Jpeg => {
            let mut out = Vec::new();
            let rgb = prepared.image.to_rgb8();
            let mut encoder = JpegEncoder::new_with_quality(&mut out, 82);
            encoder
                .encode(
                    rgb.as_raw(),
                    rgb.width(),
                    rgb.height(),
                    image::ExtendedColorType::Rgb8,
                )
                .ok()?;
            out
        }
        ImageFormat::Png => {
            let mut out = Vec::new();
            let rgba = prepared.image.to_rgba8();
            image::codecs::png::PngEncoder::new(&mut out)
                .write_image(
                    rgba.as_raw(),
                    rgba.width(),
                    rgba.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .ok()?;
            out
        }
        _ => {
            let mut out = Vec::new();
            prepared
                .image
                .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
                .ok()?;
            out
        }
    };

    // A transcode exists to make the image displayable, not to save bytes.
    if transcode || encoded.len() < data.len() {
        Some(encoded)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ftyp_file(major: &[u8; 4], brands: &[&[u8; 4]]) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(major);
        body.extend_from_slice(&[0, 0, 0, 0]); // minor version
        for brand in brands {
            body.extend_from_slice(*brand);
        }
        let mut out = Vec::new();
        out.extend_from_slice(&((body.len() + 8) as u32).to_be_bytes());
        out.extend_from_slice(b"ftyp");
        out.extend_from_slice(&body);
        out
    }

    #[test]
    fn detects_avif_containers() {
        assert!(is_avif(&ftyp_file(b"avif", &[])));
        assert!(is_avif(&ftyp_file(b"mif1", &[b"avif"])));
        assert!(!is_avif(&ftyp_file(b"mif1", &[b"heic"])));
        assert!(!is_avif(b"\x89PNG\r\n\x1a\n\0\0\0\0"));
        assert!(!is_avif(b"short"));
    }

    #[test]
    fn detects_animated_avif() {
        assert!(avif_is_animated(&ftyp_file(b"avis", &[])));
        assert!(!avif_is_animated(&ftyp_file(b"avif", &[])));
    }

    #[test]
    fn decodes_real_avif() {
        let data = include_bytes!("../tests/data/sample.avif");
        assert_eq!(dimensions(data), Some((32, 24)));
        assert!(!is_animated(data));
        let prepared = decode(data).expect("decode avif");
        assert_eq!(prepared.format, ImageFormat::Avif);
        assert_eq!((prepared.image.width(), prepared.image.height()), (32, 24));
    }

    #[test]
    fn transcodes_avif_to_png_even_without_downscaling() {
        let data = include_bytes!("../tests/data/sample.avif");
        let out = shrink(data, 10_000).expect("AVIF should be transcoded");
        assert!(out.starts_with(b"\x89PNG\r\n\x1a\n"));
    }

    #[test]
    fn probes_avif_dimensions_from_file() {
        let path = Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/data/sample.avif"
        ));
        assert_eq!(dimensions_file(path), Some((32, 24)));
    }
}
