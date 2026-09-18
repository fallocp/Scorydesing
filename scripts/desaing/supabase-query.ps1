param(
  [Parameter(Mandatory = $true)][string]$SqlFile,
  [switch]$Write
)
$ErrorActionPreference = 'Stop'
$projectRef = 'gdfhytvjnzdovjfovqfv'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if ((Get-Content -LiteralPath (Join-Path $workspace 'supabase/.temp/project-ref') -Raw).Trim() -ne $projectRef) {
  throw 'The linked project differs from the explicitly authorized Xending development project.'
}
# Read only the existing Supabase CLI login credential; never print or persist it.
# CLI v2.58.5 uses the namespace Supabase CLI and profile supabase.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DesaingSupabaseLogin {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct Credential {
    public uint Flags, Type;
    public string TargetName, Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist, AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern bool Read(string name, uint type, uint flags, out IntPtr pointer);
  [DllImport("advapi32.dll")] private static extern void CredFree(IntPtr pointer);
  public static string Load() {
    IntPtr pointer;
    if (!Read("Supabase CLI:supabase", 1, 0, out pointer)) throw new Exception("Supabase CLI login unavailable.");
    try {
      var credential = Marshal.PtrToStructure<Credential>(pointer);
      var bytes = new byte[credential.CredentialBlobSize];
      Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
      try { return Encoding.UTF8.GetString(bytes); } finally { Array.Clear(bytes, 0, bytes.Length); }
    } finally { CredFree(pointer); }
  }
}
'@
$login = [DesaingSupabaseLogin]::Load()
$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(60)
try {
  $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $login)
  $sql = Get-Content -LiteralPath $SqlFile -Raw
  $body = @{ query = $sql; read_only = -not $Write.IsPresent } | ConvertTo-Json -Compress
  $content = [System.Net.Http.StringContent]::new($body, [Text.Encoding]::UTF8, 'application/json')
  $response = $client.PostAsync("https://api.supabase.com/v1/projects/$projectRef/database/query", $content).GetAwaiter().GetResult()
  $result = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) { throw "Supabase query HTTP $([int]$response.StatusCode): $result" }
  Write-Output $result
} finally { $client.Dispose(); $login = $null }
