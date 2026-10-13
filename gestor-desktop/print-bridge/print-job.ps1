param([Parameter(Mandatory=$true)][string]$RequestPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$job=Get-Content -LiteralPath $RequestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$printer=Get-Printer | Where-Object { $_.Name -eq $job.printer } | Select-Object -First 1
if(-not $printer -or ($printer.Name+' '+$printer.DriverName) -match 'OneNote|Fax|XPS') { throw 'Impressora indisponível para impressão automática.' }
$doc=[System.Drawing.Printing.PrintDocument]::new()
$font=[System.Drawing.Font]::new('Arial',9)
$doc.PrinterSettings.PrinterName=$printer.Name
$doc.DocumentName=$job.id
$doc.PrintController=[System.Drawing.Printing.StandardPrintController]::new()
$doc.DefaultPageSettings.PaperSize=[System.Drawing.Printing.PaperSize]::new('Distre 80mm',315,1100)
$doc.DefaultPageSettings.Margins=[System.Drawing.Printing.Margins]::new(10,10,10,10)
if ($printer.DriverName -eq 'Microsoft Print To PDF') {
  $doc.PrinterSettings.PrintToFile=$true
  $doc.PrinterSettings.PrintFileName=$job.outputPath
}
$script:lineIndex=0
$lines=@($job.lines)
$doc.add_PrintPage({ param($sender,$eventArgs)
  $y=[single]10
  while($script:lineIndex -lt $lines.Count) {
    $line=[string]$lines[$script:lineIndex]
    $height=$eventArgs.Graphics.MeasureString($line+' ',$font,295).Height+5
    if($y+$height -gt 1080) { break }
    $rect=[System.Drawing.RectangleF]::new(10,$y,295,$height)
    $eventArgs.Graphics.DrawString($line,$font,[System.Drawing.Brushes]::Black,$rect)
    $y+=$height
    $script:lineIndex++
  }
  $eventArgs.HasMorePages=$script:lineIndex -lt $lines.Count
})
try { $doc.Print() } finally { $doc.Dispose(); $font.Dispose() }
@{success=$true} | ConvertTo-Json -Compress
