; Tauri's own fileAssociations config only writes the classic .ext -> ProgID
; -> shell\open\command chain. That's enough for Explorer to double-click-open
; a .cyte file, but Windows' "Open with" picker and Settings > Default apps
; both read from a separate set of keys (OpenWithProgids + RegisteredApplications)
; that Tauri doesn't populate - without them Cynote is invisible in those UIs
; even though the association technically exists. These are plain registry
; writes (no external processes), unlike the earlier taskbar-pin attempt that
; hung the installer by shelling out to PowerShell.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegNone HKCU "Software\Classes\.cyte\OpenWithProgids" "Nota Cynote"
  WriteRegStr HKCU "Software\Classes\Applications\desktop.exe\SupportedTypes" ".cyte" ""
  WriteRegStr HKCU "Software\Classes\Applications\desktop.exe\shell\open\command" "" '"$INSTDIR\desktop.exe" "%1"'
  WriteRegStr HKCU "Software\RegisteredApplications" "Cynote" "Software\Cynote\Capabilities"
  WriteRegStr HKCU "Software\Cynote\Capabilities" "ApplicationName" "Cynote"
  WriteRegStr HKCU "Software\Cynote\Capabilities" "ApplicationDescription" "Bloco de notas Cynote"
  WriteRegStr HKCU "Software\Cynote\Capabilities\FileAssociations" ".cyte" "Nota Cynote"
  System::Call 'shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Classes\.cyte\OpenWithProgids" "Nota Cynote"
  DeleteRegKey HKCU "Software\Classes\Applications\desktop.exe"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Cynote"
  DeleteRegKey HKCU "Software\Cynote"
!macroend
