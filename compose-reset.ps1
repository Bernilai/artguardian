param(
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

Write-Host "Stopping Compose services (if running)..."
docker compose down --remove-orphans

$staleContainers = @(
    "artguardian-postgres",
    "artguardian-pgbouncer",
    "artguardian-pgadmin",
    "minio"
)

foreach ($container in $staleContainers) {
    $exists = docker ps -a --format "{{.Names}}" | Where-Object { $_ -eq $container }
    if ($exists) {
        Write-Host "Removing stale container: $container"
        docker rm -f $container | Out-Null
    }
}

if ($NoBuild) {
    Write-Host "Starting services without rebuild..."
    docker compose up -d
}
else {
    Write-Host "Building and starting services..."
    docker compose up -d --build
}

Write-Host "Current Compose status:"
docker compose ps
