Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "src-tauri\icons"
New-Item -ItemType Directory -Force -Path $target | Out-Null

function New-AppIcon {
  param(
    [int]$Size,
    [string]$Path
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $green = [System.Drawing.ColorTranslator]::FromHtml("#149365")
  $gold = [System.Drawing.ColorTranslator]::FromHtml("#f4b941")
  $white = [System.Drawing.Color]::White

  $graphics.Clear($green)

  $cardMargin = [int]($Size * 0.25)
  $cardWidth = [int]($Size * 0.5)
  $cardHeight = [int]($Size * 0.56)
  $cardRect = New-Object System.Drawing.Rectangle -ArgumentList $cardMargin, ([int]($Size * 0.19)), $cardWidth, $cardHeight
  $graphics.FillRectangle((New-Object System.Drawing.SolidBrush $white), $cardRect)

  $linePen = New-Object System.Drawing.Pen $green, ([Math]::Max(2, [int]($Size * 0.055)))
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $x1 = [int]($Size * 0.38)
  $x2 = [int]($Size * 0.62)
  foreach ($y in @(0.40, 0.50, 0.60)) {
    $graphics.DrawLine($linePen, $x1, [int]($Size * $y), $x2, [int]($Size * $y))
  }

  $arcPen = New-Object System.Drawing.Pen $gold, ([Math]::Max(2, [int]($Size * 0.05)))
  $arcPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arcPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $arcRect = New-Object System.Drawing.Rectangle -ArgumentList ([int]($Size * 0.56)), ([int]($Size * 0.32)), ([int]($Size * 0.24)), ([int]($Size * 0.32))
  $graphics.DrawArc($arcPen, $arcRect, -65, 120)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-AppIcon -Size 32 -Path (Join-Path $target "32x32.png")
New-AppIcon -Size 128 -Path (Join-Path $target "128x128.png")
New-AppIcon -Size 256 -Path (Join-Path $target "128x128@2x.png")

$icoPng = Join-Path $target "icon-source.png"
New-AppIcon -Size 256 -Path $icoPng
$icoBitmap = [System.Drawing.Bitmap]::FromFile($icoPng)
$handle = $icoBitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Open((Join-Path $target "icon.ico"), [System.IO.FileMode]::Create)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$icoBitmap.Dispose()

Write-Host "Generated Tauri icons in $target"
