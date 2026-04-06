param(
    [string]$RemoteHost = "root@truenas",
    [string]$RemoteDir = "/mnt/tank/docker-containers/reverse-proxy/plugin-dist",
    [string]$SourceDir = "f:\Development\ObsidianSinc\brat-repo\apps\plugin"
)

$ErrorActionPreference = "Stop"

$files = @(
    @{ Local = "main.js"; Remote = "main.js" },
    @{ Local = "main.js"; Remote = "evc-relay-main.js" },
    @{ Local = "manifest.json"; Remote = "manifest.json" },
    @{ Local = "manifest-beta.json"; Remote = "manifest-beta.json" },
    @{ Local = "styles.css"; Remote = "styles.css" },
    @{ Local = "versions.json"; Remote = "versions.json" }
)

function Get-RemoteSha256 {
    param(
        [string]$RemoteHostName,
        [string]$Path
    )

    $escapedPath = $Path.Replace('"', '\"')
    $hash = ssh $RemoteHostName "sha256sum `"$escapedPath`" | cut -d' ' -f1"
    return $hash.Trim().ToLower()
}

function Get-LocalSha256 {
    param(
        [string]$Path
    )

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hashBytes = $sha.ComputeHash($stream)
        }
        finally {
            $sha.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }

    return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLower()
}

foreach ($file in $files) {
    $localPath = Join-Path $SourceDir $file.Local
    if (-not (Test-Path -LiteralPath $localPath)) {
        throw "Missing local plugin asset: $localPath"
    }
}

foreach ($file in $files) {
    $localPath = Join-Path $SourceDir $file.Local
    $remotePath = "$RemoteDir/$($file.Remote)"

    Write-Host "Uploading $($file.Local) -> $remotePath"
    scp $localPath "${RemoteHost}:$remotePath" | Out-Null

    $localHash = Get-LocalSha256 -Path $localPath
    $remoteHash = Get-RemoteSha256 -RemoteHostName $RemoteHost -Path $remotePath

    if ($localHash -ne $remoteHash) {
        throw "Hash mismatch for $remotePath. local=$localHash remote=$remoteHash"
    }
}

Write-Host "plugin-dist sync complete and verified"
