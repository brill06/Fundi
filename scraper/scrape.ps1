# Fundi live data scraper
# Pulls current scholarships, grants and jobs (from public RSS feeds and job-board APIs)
# and writes data/scholarships-data.js + data/grants-data.js + data/jobs-data.js for the site to load.
# Listings with a deadline that has already passed are dropped (see Test-DeadlinePassed / Merge-WithSeed).
#
# Run it with:  powershell -NoProfile -ExecutionPolicy Bypass -File scraper\scrape.ps1
# or just double-click run-scraper.bat in the project root.

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root 'data'
$ua = 'Mozilla/5.0 (compatible; FundiScraper/1.0; +https://example.com)'

function Strip-Html([string]$html) {
  if (-not $html) { return '' }
  $t = $html -replace '<[^>]+>', ' '
  $t = $t -replace '&nbsp;', ' ' -replace '&amp;', '&' -replace '&#8217;', "'" -replace '&#8216;', "'" `
           -replace '&#8220;', '"' -replace '&#8221;', '"' -replace '&#8211;', '-' -replace '&#8230;', '...' `
           -replace '&quot;', '"' -replace '&#39;', "'"
  $t = $t -replace '\s+', ' '
  return $t.Trim()
}

function Normalize-Key([string]$s) {
  if (-not $s) { return '' }
  return ($s.ToLower() -replace '[^a-z0-9]', '')
}

function Get-Level([string]$text) {
  $t = $text.ToLower()
  if ($t -match '\bphd\b|doctoral|doctorate') { return 'PhD' }
  if ($t -match 'fellowship') { return 'Fellowship' }
  if ($t -match "master'?s|\bmsc\b|\bm\.a\.\b|\bmba\b") { return 'Masters' }
  if ($t -match 'undergraduate|bachelor|\bbsc\b|high school') { return 'Degree' }
  if ($t -match 'short course|training programme|training program|certificate course|online course|workshop') { return 'Short course' }
  return 'Masters'
}

function Get-LocationTag([string]$text) {
  if ($text -match '(?i)kenya|nairobi') { return 'Kenya' }
  return 'Global'
}

function Get-DateInfo([string]$text) {
  # Extracts a deadline if the text states one; expiry itself is decided later by
  # Test-DeadlinePassed (kept separate so the real date always survives into the
  # deadline field for the centralized filter to check).
  if ($text -match '(?i)deadline[:\s-]+([A-Za-z0-9,\.\s]{4,40}\d{4})') {
    $raw = $matches[1].Trim()
    try {
      $d = [datetime]::Parse($raw)
      return @{ status = 'open'; deadline = $d.ToString('MMMM yyyy') }
    } catch {}
  }
  return @{ status = 'rolling'; deadline = 'Rolling / see posting' }
}

function Test-DeadlinePassed([string]$deadlineText) {
  if (-not $deadlineText) { return $false }
  if ($deadlineText -match '(?i)^(varies|rolling|see official|check university|no fixed|open enrolment)') { return $false }
  if ($deadlineText -match '([A-Za-z]+\s+\d{1,2},?\s+\d{4}|[A-Za-z]+\s+\d{4})') {
    $raw = $matches[1]
    try {
      $d = [datetime]::Parse($raw)
      if ($raw -notmatch '\d{1,2},?\s+\d{4}') {
        # Month + year only ("January 2027") -> treat the whole month as still valid.
        $d = (Get-Date -Year $d.Year -Month $d.Month -Day 1).AddMonths(1).AddDays(-1)
      }
      return ($d -lt (Get-Date).Date)
    } catch { return $false }
  }
  return $false
}

function Is-RelevantScholarship([string]$text) {
  return ($text -match '(?i)scholarship|fellowship|bursary|fully funded|funded (masters|phd|degree|program)')
}

function Is-RelevantGrant([string]$text) {
  return ($text -match '(?i)\bgrants?\b|funding (for|opportunity|call)|call for proposals|request for proposals|\brfp\b|seed fund|innovation fund|challenge fund|small grants?|micro-?grants?|\bcbo\b|community[- ]based organi|\bngo\b|non-?profit|civil society')
}

function Is-NonOpportunityContent([string]$title) {
  # Some grant blogs (fundsforngos.org especially) publish sample/template proposal
  # write-ups as regular posts - these aren't funding calls you can actually apply to.
  return ($title -match '(?i)sample.{0,20}(grant )?proposal|how to write|proposal template|proposal writing|webinar|free (course|training)\b')
}

function Get-GrantAudience([string]$text) {
  $t = $text.ToLower()
  if ($t -match '\bcbo\b|community[- ]based organi|\bngo\b|non-?profit|civil society') { return 'CBOs & NGOs' }
  if ($t -match 'research(er)?s?\b|\bphd\b|academic|\buniversity\b') { return 'Researchers' }
  if ($t -match '\bindividual|freelance|independent') { return 'Individuals' }
  if ($t -match '\bgroup|\bcommunity|collective|network') { return 'Community groups' }
  return 'Organisations & individuals'
}

function Read-JsonArray([string]$path) {
  $parsed = Get-Content $path -Raw | ConvertFrom-Json
  if ($parsed -isnot [System.Array]) { $parsed = @($parsed) }
  return $parsed
}

function Get-RssItems([string]$url, [int]$max = 30) {
  try {
    # Invoke-RestMethod auto-flattens RSS/Atom responses to the <item> elements directly.
    $resp = Invoke-RestMethod -Uri $url -TimeoutSec 20 -Headers @{ 'User-Agent' = $ua }
    $items = $resp
    if ($items -isnot [System.Array]) { $items = @($items) }
    # Fallback in case a feed comes back as the raw document instead of pre-flattened items.
    if ($items.Count -gt 0 -and ($items[0].PSObject.Properties.Name -contains 'channel')) {
      $items = $items[0].channel.item
      if ($items -isnot [System.Array]) { $items = @($items) }
    }
    if (-not $items) { return @() }
    return $items | Select-Object -First $max
  } catch {
    Write-Warning "RSS fetch failed: $url -> $($_.Exception.Message)"
    return @()
  }
}

# ---------------------------------------------------------------------------
# Scholarships: live RSS sources (public feeds meant for syndication)
# ---------------------------------------------------------------------------
Write-Host "Fetching scholarship feeds..."
$scholarshipFeeds = @(
  @{ name = 'Opportunities For Africans'; url = 'https://opportunitiesforafricans.com/feed/' },
  @{ name = 'After School Africa'; url = 'https://www.afterschoolafrica.com/feed/' },
  @{ name = 'Opportunity Desk'; url = 'https://opportunitydesk.org/feed/' },
  @{ name = 'Youth Opportunities Hub'; url = 'https://youthopportunitieshub.com/feed/' }
)

$liveScholarships = @()
foreach ($feed in $scholarshipFeeds) {
  $items = Get-RssItems -url $feed.url -max 30
  Write-Host ("  {0}: {1} items" -f $feed.name, $items.Count)
  foreach ($it in $items) {
    $title = Strip-Html ([string]$it.title)
    $desc = Strip-Html ([string]$it.description)
    $combined = "$title $desc"
    if (-not (Is-RelevantScholarship $combined)) { continue }
    if (Is-NonOpportunityContent $title) { continue }
    if (-not $title -or -not $it.link) { continue }
    $di = Get-DateInfo $combined
    $locTag = Get-LocationTag $combined
    $liveScholarships += [PSCustomObject]@{
      key        = Normalize-Key $title
      title      = $title
      provider   = $feed.name
      level      = Get-Level $combined
      location   = $locTag
      place      = if ($locTag -eq 'Kenya') { 'Kenya' } else { 'Open internationally' }
      opening    = 'See official post'
      deadline   = $di.deadline
      dateStatus = $di.status
      url        = [string]$it.link
    }
  }
}

# ---------------------------------------------------------------------------
# Grants & funding: for CBOs, NGOs, researchers, community groups and individuals
# ---------------------------------------------------------------------------
Write-Host "Fetching grant feeds..."
$grantFeeds = @(
  @{ name = 'Opportunity Desk'; url = 'https://opportunitydesk.org/category/grants/feed/' },
  @{ name = 'Funds for NGOs'; url = 'https://www.fundsforngos.org/feed/' },
  @{ name = 'Opportunities For Africans'; url = 'https://opportunitiesforafricans.com/category/grants/feed/' }
)

$liveGrants = @()
foreach ($feed in $grantFeeds) {
  $items = Get-RssItems -url $feed.url -max 30
  Write-Host ("  {0}: {1} items" -f $feed.name, $items.Count)
  foreach ($it in $items) {
    $title = Strip-Html ([string]$it.title)
    $desc = Strip-Html ([string]$it.description)
    $combined = "$title $desc"
    if (-not (Is-RelevantGrant $combined)) { continue }
    if (Is-NonOpportunityContent $title) { continue }
    if (-not $title -or -not $it.link) { continue }
    $di = Get-DateInfo $combined
    $locTag = Get-LocationTag $combined
    $liveGrants += [PSCustomObject]@{
      key        = Normalize-Key $title
      title      = $title
      provider   = $feed.name
      audience   = Get-GrantAudience $combined
      location   = $locTag
      place      = if ($locTag -eq 'Kenya') { 'Kenya' } else { 'Open internationally' }
      opening    = 'See official post'
      deadline   = $di.deadline
      dateStatus = $di.status
      url        = [string]$it.link
    }
  }
}

# ---------------------------------------------------------------------------
# Jobs: live public job-board APIs
# ---------------------------------------------------------------------------
Write-Host "Fetching job sources..."
$liveJobs = @()

try {
  $remotive = Invoke-RestMethod -Uri 'https://remotive.com/api/remote-jobs?limit=60' -TimeoutSec 20 -Headers @{ 'User-Agent' = $ua }
  foreach ($j in $remotive.jobs) {
    $place = if ($j.candidate_required_location) { $j.candidate_required_location } else { 'Remote / worldwide' }
    $liveJobs += [PSCustomObject]@{
      key      = Normalize-Key "$($j.title)$($j.company_name)"
      title    = [string]$j.title
      provider = [string]$j.company_name
      location = Get-LocationTag $place
      place    = $place
      mode     = 'Remote'
      opening  = 'Open now'
      deadline = 'See official posting'
      url      = [string]$j.url
    }
  }
  Write-Host ("  Remotive: {0} jobs" -f $remotive.jobs.Count)
} catch { Write-Warning "Remotive failed: $($_.Exception.Message)" }

try {
  $arbeitnow = Invoke-RestMethod -Uri 'https://www.arbeitnow.com/api/job-board-api' -TimeoutSec 20 -Headers @{ 'User-Agent' = $ua }
  $relevant = $arbeitnow.data | Where-Object { $_.remote -eq $true -or $_.location -match '(?i)kenya|africa' } | Select-Object -First 40
  foreach ($j in $relevant) {
    $place = if ($j.location) { $j.location } else { 'Remote / worldwide' }
    $liveJobs += [PSCustomObject]@{
      key      = Normalize-Key "$($j.title)$($j.company_name)"
      title    = [string]$j.title
      provider = [string]$j.company_name
      location = Get-LocationTag $place
      place    = $place
      mode     = if ($j.remote) { 'Remote' } else { 'Onsite' }
      opening  = 'Open now'
      deadline = 'See official posting'
      url      = [string]$j.url
    }
  }
  Write-Host ("  Arbeitnow: {0} relevant of {1} total" -f $relevant.Count, $arbeitnow.data.Count)
} catch { Write-Warning "Arbeitnow failed: $($_.Exception.Message)" }

try {
  $remoteok = Invoke-RestMethod -Uri 'https://remoteok.com/api' -TimeoutSec 20 -Headers @{ 'User-Agent' = $ua }
  $jobsOnly = $remoteok | Where-Object { $_.id } | Select-Object -First 40
  foreach ($j in $jobsOnly) {
    $place = if ($j.location) { $j.location } else { 'Remote / worldwide' }
    $url = if ($j.url) { $j.url } elseif ($j.slug) { "https://remoteok.com/remote-jobs/$($j.slug)" } else { 'https://remoteok.com/' }
    $liveJobs += [PSCustomObject]@{
      key      = Normalize-Key "$($j.position)$($j.company)"
      title    = [string]$j.position
      provider = [string]$j.company
      location = Get-LocationTag $place
      place    = $place
      mode     = 'Remote'
      opening  = 'Open now'
      deadline = 'See official posting'
      url      = $url
    }
  }
  Write-Host ("  RemoteOK: {0} jobs" -f $jobsOnly.Count)
} catch { Write-Warning "RemoteOK failed: $($_.Exception.Message)" }

$greenhouseBoards = @(
  @{ slug = 'jumia'; name = 'Jumia' },
  @{ slug = 'moniepoint'; name = 'Moniepoint' }
)
foreach ($b in $greenhouseBoards) {
  try {
    $gh = Invoke-RestMethod -Uri "https://boards-api.greenhouse.io/v1/boards/$($b.slug)/jobs" -TimeoutSec 20 -Headers @{ 'User-Agent' = $ua }
    $ordered = $gh.jobs | Sort-Object { if ($_.location.name -match '(?i)kenya|nairobi') { 0 } else { 1 } } | Select-Object -First 15
    foreach ($j in $ordered) {
      $place = if ($j.location.name) { $j.location.name } else { 'See posting' }
      $liveJobs += [PSCustomObject]@{
        key      = Normalize-Key "$($j.title)$($b.name)"
        title    = [string]$j.title
        provider = $b.name
        location = Get-LocationTag $place
        place    = $place
        mode     = if ($place -match '(?i)remote') { 'Remote' } else { 'Onsite' }
        opening  = 'Open now'
        deadline = 'See official posting'
        url      = [string]$j.absolute_url
      }
    }
    Write-Host ("  Greenhouse/{0}: {1} of {2} jobs" -f $b.name, $ordered.Count, $gh.jobs.Count)
  } catch { Write-Warning "Greenhouse ($($b.slug)) failed: $($_.Exception.Message)" }
}

# ---------------------------------------------------------------------------
# Merge with curated seed data, dedupe, cap, and write output
# ---------------------------------------------------------------------------
function Merge-WithSeed($seedPath, $liveItems, $maxLive) {
  # Drop anything - curated or live - whose deadline has already passed.
  $seed = Read-JsonArray $seedPath | Where-Object { -not (Test-DeadlinePassed $_.deadline) }
  $seedKeys = @{}
  foreach ($s in $seed) { $seedKeys[(Normalize-Key $s.title)] = $true }

  $deduped = @()
  $seen = @{}
  foreach ($item in $liveItems) {
    if (-not $item.key) { continue }
    if (Test-DeadlinePassed $item.deadline) { continue }
    if ($seedKeys.ContainsKey($item.key)) { continue }
    if ($seen.ContainsKey($item.key)) { continue }
    $seen[$item.key] = $true
    $deduped += $item
  }
  $deduped = $deduped | Select-Object -First $maxLive

  $combined = @()
  $combined += $seed
  $combined += ($deduped | Select-Object * -ExcludeProperty key)
  return $combined
}

$seedScholarshipCount = (Read-JsonArray (Join-Path $dataDir 'seed-scholarships.json')).Count
$seedJobCount = (Read-JsonArray (Join-Path $dataDir 'seed-jobs.json')).Count
$seedGrantCount = (Read-JsonArray (Join-Path $dataDir 'seed-grants.json')).Count

$finalScholarships = Merge-WithSeed (Join-Path $dataDir 'seed-scholarships.json') $liveScholarships 90
$finalJobs = Merge-WithSeed (Join-Path $dataDir 'seed-jobs.json') $liveJobs 100
$finalGrants = Merge-WithSeed (Join-Path $dataDir 'seed-grants.json') $liveGrants 60

$updatedStamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

$scholarshipsOut = [PSCustomObject]@{ updated = $updatedStamp; items = $finalScholarships }
$jobsOut = [PSCustomObject]@{ updated = $updatedStamp; items = $finalJobs }
$grantsOut = [PSCustomObject]@{ updated = $updatedStamp; items = $finalGrants }

$noBom = New-Object System.Text.UTF8Encoding($false)

$scholarshipsJs = "window.SCHOLARSHIPS_DATA = " + ($scholarshipsOut | ConvertTo-Json -Depth 6) + ";`n"
[System.IO.File]::WriteAllText((Join-Path $dataDir 'scholarships-data.js'), $scholarshipsJs, $noBom)

$jobsJs = "window.JOBS_DATA = " + ($jobsOut | ConvertTo-Json -Depth 6) + ";`n"
[System.IO.File]::WriteAllText((Join-Path $dataDir 'jobs-data.js'), $jobsJs, $noBom)

$grantsJs = "window.GRANTS_DATA = " + ($grantsOut | ConvertTo-Json -Depth 6) + ";`n"
[System.IO.File]::WriteAllText((Join-Path $dataDir 'grants-data.js'), $grantsJs, $noBom)

Write-Host ""
Write-Host ("Done. {0} scholarships ({1} curated + {2} live), {3} jobs ({4} curated + {5} live), {6} grants ({7} curated + {8} live)." -f `
  $finalScholarships.Count, $seedScholarshipCount, ($finalScholarships.Count - $seedScholarshipCount), `
  $finalJobs.Count, $seedJobCount, ($finalJobs.Count - $seedJobCount), `
  $finalGrants.Count, $seedGrantCount, ($finalGrants.Count - $seedGrantCount))
Write-Host "Expired listings are filtered out automatically based on their stated deadline."
Write-Host "Data refreshed at $updatedStamp"
