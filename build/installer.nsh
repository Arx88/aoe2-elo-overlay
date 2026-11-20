; AoE2 Helper · Personalización visual del instalador NSIS (alineado al Launcher)
!macro customHeader
  !system "echo AoE2 Helper NSIS branding loaded"
!macroend

!macro preInit
  SetRegView 64
!macroend

BrandingText "AoE2 Helper · Age of Empires II: DE"
