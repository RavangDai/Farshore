param([Parameter(Mandatory = $true)][string]$Workbook)
# Recalculates every formula in Excel and saves, so cached values exist for readers that do not calculate.
$ErrorActionPreference = 'Stop'
$path = (Resolve-Path -LiteralPath $Workbook).Path
$excel = $null
$book = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $book = $excel.Workbooks.Open($path)
    $excel.CalculateFull()
    $book.Save()
    Write-Output "Recalculated $path"
} finally {
    if ($null -ne $book) { $book.Close($false) }
    if ($null -ne $excel) { $excel.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}
