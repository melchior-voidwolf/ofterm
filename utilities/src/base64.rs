// Streaming base64 encoder. Kept local so the binary does not pull in a
// dependency that would have to buffer the whole payload.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Encode `data` into `out`, appending to whatever is already there.
pub fn encode_into(data: &[u8], out: &mut Vec<u8>) {
    let mut i = 0;
    while i + 3 <= data.len() {
        let n = (data[i] as u32) << 16 | (data[i + 1] as u32) << 8 | data[i + 2] as u32;
        out.push(ALPHABET[(n >> 18) as usize & 63]);
        out.push(ALPHABET[(n >> 12) as usize & 63]);
        out.push(ALPHABET[(n >> 6) as usize & 63]);
        out.push(ALPHABET[n as usize & 63]);
        i += 3;
    }
    match data.len() - i {
        1 => {
            let n = (data[i] as u32) << 16;
            out.push(ALPHABET[(n >> 18) as usize & 63]);
            out.push(ALPHABET[(n >> 12) as usize & 63]);
            out.push(b'=');
            out.push(b'=');
        }
        2 => {
            let n = (data[i] as u32) << 16 | (data[i + 1] as u32) << 8;
            out.push(ALPHABET[(n >> 18) as usize & 63]);
            out.push(ALPHABET[(n >> 12) as usize & 63]);
            out.push(ALPHABET[(n >> 6) as usize & 63]);
            out.push(b'=');
        }
        _ => {}
    }
}

pub fn encode(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len().div_ceil(3) * 4);
    encode_into(data, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_reference_vectors() {
        for (input, want) in [
            ("", ""),
            ("f", "Zg=="),
            ("fo", "Zm8="),
            ("foo", "Zm9v"),
            ("foob", "Zm9vYg=="),
            ("fooba", "Zm9vYmE="),
            ("foobar", "Zm9vYmFy"),
        ] {
            assert_eq!(String::from_utf8(encode(input.as_bytes())).unwrap(), want);
        }
    }
}
