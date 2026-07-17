#[cfg(target_os = "windows")]
mod platform {
    use std::io::Read;
    use std::path::Path;

    const BOOTSTRAPPER_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    pub fn ensure_installed() -> Result<(), String> {
        if is_webview2_installed() {
            return Ok(());
        }

        let exe_path = std::env::temp_dir().join("MicrosoftEdgeWebview2Setup.exe");
        download_bootstrapper(&exe_path)?;
        run_bootstrapper(&exe_path)?;

        Ok(())
    }

    fn is_webview2_installed() -> bool {
        let candidates = [
            std::env::var("LOCALAPPDATA")
                .ok()
                .map(|p| Path::new(&p).join(r"Microsoft\EdgeWebView\Application")),
            std::env::var("PROGRAMFILES")
                .ok()
                .map(|p| Path::new(&p).join(r"Microsoft\EdgeWebView\Application")),
            std::env::var("PROGRAMFILES(X86)")
                .ok()
                .map(|p| Path::new(&p).join(r"Microsoft\EdgeWebView\Application")),
        ];

        for path in candidates.iter().flatten() {
            if !path.exists() {
                continue;
            }
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        let name = entry.file_name();
                        let s = name.to_string_lossy();
                        if s.starts_with(|c: char| c.is_ascii_digit()) {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    fn download_bootstrapper(path: &Path) -> Result<(), String> {
        let resp = ureq::get(BOOTSTRAPPER_URL)
            .call()
            .map_err(|e| format!("Error al descargar WebView2: {}", e))?;

        let mut body = resp.into_body();
        let bytes = body
            .read_to_vec()
            .map_err(|e| format!("Error al leer datos: {}", e))?;

        std::fs::write(path, &bytes)
            .map_err(|e| format!("Error al escribir archivo: {}", e))?;

        Ok(())
    }

    fn run_bootstrapper(path: &Path) -> Result<(), String> {
        let status = std::process::Command::new(path)
            .status()
            .map_err(|e| format!("Error al ejecutar instalador: {}", e))?;

        if !status.success() {
            return Err(format!(
                "Instalación de WebView2 falló (código: {:?})",
                status.code()
            ));
        }

        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub fn ensure_installed() -> Result<(), String> {
        Ok(())
    }
}

pub fn ensure_installed() -> Result<(), String> {
    platform::ensure_installed()
}
