# Rebuilds data\*-data.js from the hand-curated data\seed-*.json files.
# Run this after editing any seed-*.json (e.g. adding a new opportunity) so the site picks it up:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scraper\build-data.ps1
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'data'
$ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

function Build-DataFile($seedName, $outName, $globalName) {
  $seedPath = Join-Path $dataDir $seedName
  $outPath = Join-Path $dataDir $outName
  $json = Get-Content -Raw -Path $seedPath
  $wrapped = "window.$globalName = {`n    `"updated`": `"$ts`",`n    `"items`": $json`n};`n"
  Set-Content -Path $outPath -Value $wrapped -NoNewline
  Write-Host "Wrote $outPath"
}

Build-DataFile 'seed-scholarships.json' 'scholarships-data.js' 'SCHOLARSHIPS_DATA'
Build-DataFile 'seed-jobs.json' 'jobs-data.js' 'JOBS_DATA'
Build-DataFile 'seed-grants.json' 'grants-data.js' 'GRANTS_DATA'
