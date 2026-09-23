!macro NSIS_HOOK_PREINSTALL
  FindWindow $R0 "" "PLAYZ"
  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Close PLAYZ using Quit before installing or upgrading. Your recording must finish safely first."
    Abort
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  FindWindow $R0 "" "PLAYZ"
  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Close PLAYZ using Quit before uninstalling. Recordings and library data are preserved by default."
    Abort
  ${EndIf}
!macroend
