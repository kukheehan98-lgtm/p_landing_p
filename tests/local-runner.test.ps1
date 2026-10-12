$ErrorActionPreference = 'Stop'
$cpRoot = Split-Path -Parent $PSScriptRoot
$cpRunnerPath = Join-Path $cpRoot 'pohang-ontime/crawler/run-local.ps1'
$cpTokens = $null
$cpErrors = $null
$cpAst = [System.Management.Automation.Language.Parser]::ParseFile($cpRunnerPath, [ref]$cpTokens, [ref]$cpErrors)
if ($cpErrors.Count) { throw ($cpErrors | Out-String) }
$cpFunction = $cpAst.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-LoggedNative'}, $true)
if (-not $cpFunction) { throw 'Native runner helper not found' }
. ([scriptblock]::Create($cpFunction.Extent.Text))
$script:cpMessages = @()
function Say([string]$message) { $script:cpMessages += $message }
$cpNode = (Get-Command node).Source
Invoke-LoggedNative $cpNode @('-e', 'console.error(1234); console.log(5678);')
if (($script:cpMessages -join '|') -notmatch '1234.*5678') { throw 'Warning stopped output processing' }
if ($ErrorActionPreference -ne 'Stop') { throw 'Caller error preference changed' }
$cpFailed = $false
try { Invoke-LoggedNative $cpNode @('-e', 'console.error(4321); process.exit(7);') }
catch { $cpFailed = $true; if ($_.Exception.Message -notmatch '7') { throw } }
if (-not $cpFailed) { throw 'Nonzero exit was ignored' }
if ($ErrorActionPreference -ne 'Stop') { throw 'Failure changed caller error preference' }
Write-Output 'PASS: Windows PowerShell warnings continue; actual failures stop; preference restored.'
exit 0
