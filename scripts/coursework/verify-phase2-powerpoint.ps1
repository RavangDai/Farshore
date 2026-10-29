param([string]$Workspace = 'D:\Farshore\Farshore')
$ErrorActionPreference = 'Stop'
$phaseFolder = Join-Path $Workspace 'Farshore Context and Assisment\docs\assignment\phase2'
$previewFolder = Join-Path $Workspace '.tmp\phase2-build\powerpoint'
New-Item -ItemType Directory -Path $previewFolder -Force | Out-Null
$powerPoint = $null
$deck = $null
try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.DisplayAlerts = 1
    $deck = $powerPoint.Presentations.Open((Join-Path $phaseFolder 'Farshore-Phase-2-Presentation.pptx'), -1, 0, 0)
    $shapeChecks = @()
    foreach ($slide in $deck.Slides) {
        $imageFile = Join-Path $previewFolder ('slide-{0:D2}.png' -f $slide.SlideIndex)
        $slide.Export($imageFile, 'PNG', 1600, 900)
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                $shapeChecks += [pscustomobject]@{
                    Slide = $slide.SlideIndex
                    Name = $shape.Name
                    Height = [math]::Round($shape.Height, 2)
                    TextHeight = [math]::Round($shape.TextFrame.TextRange.BoundHeight, 2)
                    Width = [math]::Round($shape.Width, 2)
                    TextWidth = [math]::Round($shape.TextFrame.TextRange.BoundWidth, 2)
                    Overflow = ($shape.TextFrame.TextRange.BoundHeight -gt $shape.Height + 2 -or $shape.TextFrame.TextRange.BoundWidth -gt $shape.Width + 2)
                }
            }
        }
    }
    $deck.SaveAs((Join-Path $phaseFolder 'Farshore-Phase-2-Presentation.pdf'), 32)
    [pscustomobject]@{ Slides = $deck.Slides.Count; ShapeChecks = $shapeChecks } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $previewFolder 'powerpoint-checks.json') -Encoding UTF8
    Write-Output ('PowerPoint opened and rendered {0} slides. Text overflow flags: {1}' -f $deck.Slides.Count, @($shapeChecks | Where-Object Overflow).Count)
} finally {
    if ($null -ne $deck) { $deck.Close() }
    if ($null -ne $powerPoint -and $powerPoint.Presentations.Count -eq 0) { $powerPoint.Quit() }
}
