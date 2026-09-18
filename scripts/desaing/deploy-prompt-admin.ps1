param()
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$projectRef = 'gdfhytvjnzdovjfovqfv'
$cli = 'C:\Users\fallo\scoop\shims\supabase.exe'
if ((Get-Content -LiteralPath (Join-Path $taskRoot 'supabase/.temp/project-ref') -Raw).Trim() -ne $projectRef) { throw 'Unexpected linked development project.' }
$baseline = Get-Content -LiteralPath (Join-Path $taskRoot 'artifacts/desaing-lab/prompt-admin-deployment-before.json') -Raw | ConvertFrom-Json
$functions = @('desaing-server','generate-design-image','generate-strategy','generate-design-html','generate-ideas','generate-variants','adapt-channel','hydrate-templates','suggest-image-ideas','refine-branch','analyze-image-reference','suggest-copy','generate-carousel-script','generate-carousel-plan')
foreach ($slug in $functions) {
  $existing = @($baseline | Where-Object { $_.slug -eq $slug })
  if ($existing.Count -ne 1 -or $existing[0].status -ne 'ACTIVE') { throw "Missing active baseline: $slug" }
}
foreach ($slug in $functions) {
  $existing = $baseline | Where-Object { $_.slug -eq $slug }
  $arguments = @('functions','deploy',$slug,'--project-ref',$projectRef,'--use-api')
  if (-not $existing.verify_jwt) { $arguments += '--no-verify-jwt' }
  & $cli @arguments 2>&1 | Tee-Object -FilePath (Join-Path $taskRoot "artifacts/desaing-lab/prompt-admin-deploy-$slug.log")
  if ($LASTEXITCODE -ne 0) { throw "Deployment failed: $slug" }
}
& $cli functions list --project-ref $projectRef --output json | Set-Content -LiteralPath (Join-Path $taskRoot 'artifacts/desaing-lab/prompt-admin-deployment-after.json') -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify deployed functions.' }
$current = Get-Content -LiteralPath (Join-Path $taskRoot 'artifacts/desaing-lab/prompt-admin-deployment-after.json') -Raw | ConvertFrom-Json
foreach ($slug in $functions) {
  $old = $baseline | Where-Object { $_.slug -eq $slug }
  $new = @($current | Where-Object { $_.slug -eq $slug })
  if ($new.Count -ne 1 -or $new[0].status -ne 'ACTIVE' -or $new[0].version -le $old.version -or $new[0].verify_jwt -ne $old.verify_jwt) { throw "Deployment verification failed: $slug" }
}
Write-Output 'Administrative service and 13 existing prompt readers deployed with their JWT settings preserved.'
