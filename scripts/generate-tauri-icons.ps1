# Draws the app's own mark — the one in the sidebar — as a square PNG, and hands
# it to the Tauri CLI to fan out into every size Windows and Android ask for.
#
# The icon used to be a green square with a white document on it, which is not
# what the app looks like anywhere else: the sidebar, the splash and the phone
# launcher all showed different things. This draws the sidebar logo: the blurple
# gradient tile with a circled currency mark on it.
#
#   powershell -ExecutionPolicy Bypass -File scripts/generate-tauri-icons.ps1
#
# Then, from the repo root:
#   npx tauri icon src-tauri/icons/icon-source.png
# which writes src-tauri/icons/* and the Android mipmaps.

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "src-tauri\icons"
New-Item -ItemType Directory -Force -Path $target | Out-Null

# The two ends of the sidebar tile's gradient (--primary → the lighter accent).
$from = [System.Drawing.ColorTranslator]::FromHtml("#5C4FCC")
$to = [System.Drawing.ColorTranslator]::FromHtml("#9184D9")

function New-AppIcon {
  param(
    [int]$Size,
    [string]$Path
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  # The tile: a rounded square, corner radius a fifth of the side, filled with
  # the gradient running top-left → bottom-right like the one on screen.
  $radius = [int]($Size * 0.22)
  $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $shape.AddArc(0, 0, $d, $d, 180, 90)
  $shape.AddArc(($Size - $d), 0, $d, $d, 270, 90)
  $shape.AddArc(($Size - $d), ($Size - $d), $d, $d, 0, 90)
  $shape.AddArc(0, ($Size - $d), $d, $d, 90, 90)
  $shape.CloseFigure()

  $rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $from, $to, 45.0
  $graphics.FillPath($brush, $shape)

  # The mark: a ring with a currency sign inside it, in white, centred.
  $white = [System.Drawing.Color]::White
  $ringPen = New-Object System.Drawing.Pen $white, ([Math]::Max(1.5, $Size * 0.052))
  $ringSize = [int]($Size * 0.56)
  $ringOffset = [int](($Size - $ringSize) / 2)
  $graphics.DrawEllipse($ringPen, $ringOffset, $ringOffset, $ringSize, $ringSize)

  $font = New-Object System.Drawing.Font "Segoe UI", ([float]($Size * 0.36)), ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  # Nudged up by a hair: the glyph's own metrics sit it low inside the box.
  $textRect = New-Object System.Drawing.RectangleF 0, ([float](-$Size * 0.015)), ([float]$Size), ([float]$Size)
  $graphics.DrawString("$", $font, (New-Object System.Drawing.SolidBrush $white), $textRect, $format)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

  $font.Dispose()
  $ringPen.Dispose()
  $brush.Dispose()
  $shape.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

# One square source at the size the Tauri CLI wants; it derives the rest.
$source = Join-Path $target "icon-source.png"
New-AppIcon -Size 1024 -Path $source
Write-Host "Wrote $source"
Write-Host "Now run: npx tauri icon src-tauri/icons/icon-source.png"
