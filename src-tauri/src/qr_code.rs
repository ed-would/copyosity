use base64::Engine;
use image::{ImageBuffer, Luma};
use qrcode::QrCode;
use std::io::Cursor;

pub fn generate_qr_png_base64(data: &str) -> Result<String, String> {
    let code = QrCode::new(data.as_bytes()).map_err(|e| e.to_string())?;
    let image: ImageBuffer<Luma<u8>, Vec<u8>> = code
        .render::<Luma<u8>>()
        .quiet_zone(true)
        .min_dimensions(200, 200)
        .build();
    let mut png_bytes: Vec<u8> = Vec::new();
    image::DynamicImage::ImageLuma8(image)
        .write_to(&mut Cursor::new(&mut png_bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(png_bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_qr_png_base64_returns_valid_png() {
        let encoded = generate_qr_png_base64("https://example.com").expect("qr");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .expect("base64");
        assert!(bytes.starts_with(b"\x89PNG"));
    }
}
