; Force-close a hung Staff Desktop before overwrite — otherwise NSIS stalls with
; "not responding" when the splash is stuck and files are locked.
!macro customInit
  nsExec::ExecToLog 'taskkill /IM "KJA Staff Desktop.exe" /F /T'
!macroend
