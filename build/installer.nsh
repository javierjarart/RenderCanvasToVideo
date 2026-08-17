!macro customUnInit
  DetailPrint "Cerrando RenderCanvasToVideo..."
  nsExec::ExecToLog `taskkill /f /im "${APP_EXECUTABLE_FILENAME}"`
  Sleep 1500
  DetailPrint "Cerrando procesos de Chromium empaquetado..."
  nsExec::ExecToLog `powershell -NoProfile -Command "Get-Process chrome -ErrorAction SilentlyContinue | Where-Object Path -Like '$INSTDIR*' | Stop-Process -Force"`
  Sleep 1000
!macroend
