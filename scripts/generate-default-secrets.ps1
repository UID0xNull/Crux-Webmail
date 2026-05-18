# ============================================================================
# Crux-Webmail — Generate Default Secrets
# ============================================================================
# Genera archivos de secreto por defecto en la carpeta ./secrets/
# Solo crea archivos que no existen — no sobrescribe secretos existentes.
# ============================================================================

$ErrorActionPreference = "Stop"
$SecretsDir = Join-Path $PSScriptRoot "secrets"

New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null

$secrets = @(
    @{ Name = "postgres_password.txt";        Value = "CruxDB_2024!xK9mPz#qR7wLnY" },
    @{ Name = "minio_password.txt";           Value = "CruxMinIO_2024!sT8vWq#jR3nXpZ" },
    @{ Name = "minio_access_key.txt";         Value = "crux_minio_access_key_default" },
    @{ Name = "minio_secret_key.txt";         Value = "crux_minio_secret_key_default" },
    @{ Name = "grafana_password.txt";         Value = "CruxGrafana_2024!xL8nRq#jT3vYpW" },
    @{ Name = "grafana_admin_password.txt";   Value = "CruxGrafanaAdmin_2024!xL8nRq#jT3vYpW" },
    @{ Name = "redis_password.txt";           Value = "CruxRedis_2024!mK7nPq#sR2xY" },
    @{ Name = "jwt_secret.txt";               Value = (New-Guid).Guid + (New-Guid).Guid },
    @{ Name = "jwt_refresh_secret.txt";       Value = (New-Guid).Guid + (New-Guid).Guid },
    @{ Name = "session_encryption_key.txt";   Value = (New-Guid).Guid + (New-Guid).Guid },
    @{ Name = "ip_hash_salt.txt";             Value = (New-Guid).Guid },
    @{ Name = "dovecot_master_password.txt";  Value = "CruxDovecot_2024!mK7nPq#sR2xY" },
    @{ Name = "postfix_smtp_password.txt";    Value = "CruxSMTP_2024!tU9wVq#kR4oYpZ" },
    @{ Name = "otel_api_key.txt";             Value = "otel-api-key-placeholder-change-me" },
    @{ Name = "loki_admin_password.txt";      Value = "CruxLoki_2024!xK9mPz#qR7wLnY" },
    @{ Name = "alertmanager_webhook_url.txt"; Value = "https://hooks.slack.com/services/CHANGE_ME_PLACEHOLDER_WEBHOOK_URL" }
)

$created = 0
$skipped = 0

foreach ($secret in $secrets) {
    $path = Join-Path $SecretsDir $secret.Name
    if (-not (Test-Path $path)) {
        $secret.Value | Out-File -FilePath $path -Encoding UTF8 -NoNewline
        Write-Host "[CREATE] $($secret.Name)" -ForegroundColor Green
        $created++
    } else {
        Write-Host "[SKIP]   $($secret.Name) (already exists)" -ForegroundColor Yellow
        $skipped++
    }
}

# Generar certificados TLS self-signed si no existen
$tlsKeyPath  = Join-Path $SecretsDir "tls_key.pem"
$tlsCertPath = Join-Path $SecretsDir "tls_cert.pem"

if (-not (Test-Path $tlsKeyPath) -or -not (Test-Path $tlsCertPath)) {
    try {
        $cert = New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My `
            -DnsName "mail.crux.local", "localhost" `
            -KeyExportPolicy Exportable `
            -KeyLength 2048 `
            -NotAfter (Get-Date).AddYears(5) `
            -HashAlgorithm SHA256

        $pwd = ConvertTo-SecureString -String "ChangeMe!" -Force -AsPlainText
        $cert | Export-PfxCertificate -FilePath (Join-Path $SecretsDir "temp.pfx") -Password $pwd | Out-Null

        $pfx = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
        $pfx.Import((Join-Path $SecretsDir "temp.pfx"), $pwd, "Exportable,PersistKeySet")

        $certData = [System.Convert]::ToBase64String($pfx.Export("Cert"))
        [System.Text.Encoding]::UTF8.GetString($pfx.Export("Cert")) | Out-File -FilePath $tlsCertPath -Encoding ASCII -NoNewline

        $keyData = $pfx.Export("PKCS8")
        [System.Text.Encoding]::UTF8.GetString($keyData) | Out-File -FilePath $tlsKeyPath -Encoding ASCII -NoNewline

        Remove-Item (Join-Path $SecretsDir "temp.pfx") -Force -ErrorAction SilentlyContinue
        $pfx.Clear()

        Write-Host "[CREATE] tls_key.pem + tls_cert.pem (self-signed)" -ForegroundColor Green
    } catch {
        Write-Host "[WARN]   Could not generate TLS certs: $_" -ForegroundColor Red
        Write-Host "         Use OpenSSL: openssl req -x509 -nodes -days 1825 -newkey rsa:2048 -keyout secrets/tls_key.pem -out secrets/tls_cert.pem -subj '/CN=mail.crux.local'"
    }
} else {
    Write-Host "[SKIP]   tls_key.pem + tls_cert.pem (already exist)" -ForegroundColor Yellow
    $skipped += 2
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Secrets generation complete:" -ForegroundColor Cyan
Write-Host "   Created: $created" -ForegroundColor Green
Write-Host "   Skipped: $skipped" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan