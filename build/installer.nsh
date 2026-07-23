!macro customUnInit
  DetailPrint "Cerrando RenderCanvasToVideo..."
  nsExec::ExecToLog `taskkill /f /im "${APP_EXECUTABLE_FILENAME}"`
  Sleep 1500
  nsExec::ExecToLog `taskkill /f /im "chrome.exe"`
  Sleep 1000
!macroend
