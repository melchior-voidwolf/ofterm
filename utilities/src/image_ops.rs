// Image decoding, downscaling and re-encoding.
//
// The goal is to keep what the browser eventually shows close to the original:
// EXIF orientation is applied, animated images are never flattened (they are
// sent untouched), and a downscaled copy is only used when it is actually
// smaller than the original.

use std::io::Cursor;
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageEncoder, ImageFormat, ImageReader};

/// A decoded image plus the format it should be re-encoded to.
pub struct Prepared {
    pub image: DynamicImage,
    pub format: ImageFormat,
}

/// Cheap header-only size probe; returns `None` for non-images or unreadable
/// headers. Used by imgls so a directory listing never decodes full images.
pub fn dimensions(data: &[u8]) -> Option<(u32, u32)> {
    let format = image::guess_format(data).ok()?;
    if !is_image_format(format) {
        return None;
    }
    let reader = ImageReader::with_format(Cursor::new(data), format);
    reader.into_dimensions().ok()
}

/// The same header-only probe without reading the whole file into memory.
pub fn dimensions_file(path: &Path) -> Option<(u32, u32)> {
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

/// Downscale so the longest side is at most `max_px`, then encode. Returns
/// `None` when the result is not smaller than the input.
pub fn shrink(data: &[u8], max_px: u32) -> Option<Vec<u8>> {
    if max_px == 0 || is_animated(data) {
        return None;
    }
    let mut prepared = decode(data)?;
    let (w, h) = (prepared.image.width(), prepared.image.height());
    let longest = w.max(h);
    if longest <= max_px {
        return None;
    }
    let scale = max_px as f32 / longest as f32;
    let nw = ((w as f32 * scale).round() as u32).max(1);
    let nh = ((h as f32 * scale).round() as u32).max(1);
    prepared.image = prepared.image.resize_exact(nw, nh, FilterType::CatmullRom);

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

    if encoded.len() >= data.len() {
        None
    } else {
        Some(encoded)
    }
}
