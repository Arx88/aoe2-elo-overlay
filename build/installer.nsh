; Relic · Personalización visual del instalador NSIS (alineado al Launcher)
!macro customHeader
  !system "echo Relic NSIS branding loaded"
!macroend

!macro preInit
  SetRegView 64
!macroend

BrandingText "Relic · Age of Empires II: DE"
