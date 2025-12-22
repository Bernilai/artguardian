from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import logging
import os
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func

from app.database import get_db, engine
from app.dependencies import get_current_active_user
from app.models import User, Artifact, Ticket, Detection, Notification
from app.config import settings
from app.utils.notifications import create_notification

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/info", response_model=Dict[str, Any])
async def get_system_info(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get system information (only for admins)"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access system information"
        )
    
    # Get database type
    database_url = str(engine.url)
    is_postgres = "postgresql" in database_url.lower()
    is_sqlite = "sqlite" in database_url.lower()
    
    # Get database stats
    try:
        if is_postgres:
            # PostgreSQL stats
            result = await db.execute(text("SELECT version()"))
            db_version = result.scalar()
            
            # Get database size
            size_result = await db.execute(text("""
                SELECT pg_size_pretty(pg_database_size(current_database()))
            """))
            db_size = size_result.scalar()
            
            # Get connection count
            conn_result = await db.execute(text("""
                SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
            """))
            active_connections = conn_result.scalar()
        else:
            db_version = "SQLite"
            db_size = "N/A"
            active_connections = 1
    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        db_version = "Unknown"
        db_size = "Unknown"
        active_connections = 0
    
    # Get counts
    artifact_count = await db.execute(select(func.count(Artifact.id)))
    ticket_count = await db.execute(select(func.count(Ticket.id)))
    detection_count = await db.execute(select(func.count(Detection.id)))
    user_count = await db.execute(select(func.count(User.id)))
    
    # MinIO info
    minio_info = {
        "endpoint": settings.MINIO_ENDPOINT,
        "bucket": settings.MINIO_BUCKET_NAME,
        "secure": settings.MINIO_SECURE
    }
    
    return {
        "database": {
            "type": "PostgreSQL" if is_postgres else "SQLite" if is_sqlite else "Unknown",
            "version": db_version,
            "size": db_size,
            "active_connections": active_connections
        },
        "minio": minio_info,
        "counts": {
            "artifacts": artifact_count.scalar() or 0,
            "tickets": ticket_count.scalar() or 0,
            "detections": detection_count.scalar() or 0,
            "users": user_count.scalar() or 0
        },
        "app_name": settings.APP_NAME,
        "environment": os.getenv("ENVIRONMENT", "development")
    }


@router.get("/performance", response_model=Dict[str, Any])
async def get_performance_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get performance statistics (only for admins)"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can access performance statistics"
        )
    
    # Get database connection pool stats
    pool = engine.pool
    pool_stats = {
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow()
    }
    
    # Get recent activity (last 24 hours)
    from datetime import timedelta
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    
    recent_artifacts = await db.execute(
        select(func.count(Artifact.id)).where(Artifact.created_at >= yesterday)
    )
    recent_tickets = await db.execute(
        select(func.count(Ticket.id)).where(Ticket.created_at >= yesterday)
    )
    
    return {
        "connection_pool": pool_stats,
        "recent_activity": {
            "artifacts_created_24h": recent_artifacts.scalar() or 0,
            "tickets_created_24h": recent_tickets.scalar() or 0
        }
    }


@router.post("/backup/create")
async def create_backup(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a database backup (only for admins)"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can create backups"
        )
    
    database_url = str(engine.url)
    is_postgres = "postgresql" in database_url.lower()
    
    if not is_postgres:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Backup is only available for PostgreSQL databases"
        )
    
    # Create backup directory if it doesn't exist
    backend_dir = Path(__file__).parent.parent.parent
    backups_dir = backend_dir / "backups"
    backups_dir.mkdir(exist_ok=True)
    
    # Generate backup filename with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_filename = f"artguardian_backup_{timestamp}.sql"
    backup_path = backups_dir / backup_filename
    
    try:
        # Use environment variables (more reliable than parsing URL)
        db_user = os.getenv("POSTGRES_USER", "artguardian")
        db_password = os.getenv("POSTGRES_PASSWORD", "artguardian123")
        db_host = os.getenv("POSTGRES_HOST", "localhost")
        # Use direct PostgreSQL port, not PgBouncer port for backup
        db_port = os.getenv("POSTGRES_PORT", "5432")
        db_name = os.getenv("POSTGRES_DB", "artguardian")
        
        # Check if pg_dump is available
        # On Windows, pg_dump might not be in PATH, so try Docker exec as fallback
        pg_dump_available = False
        use_docker = False
        
        try:
            subprocess.run(["pg_dump", "--version"], capture_output=True, check=True, timeout=5)
            pg_dump_available = True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            # Try using Docker exec to run pg_dump inside the PostgreSQL container
            try:
                result = subprocess.run(
                    ["docker", "exec", "artguardian-postgres", "pg_dump", "--version"],
                    capture_output=True,
                    check=True,
                    timeout=5
                )
                pg_dump_available = True
                use_docker = True
                logger.info("Using pg_dump via Docker container")
            except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="pg_dump не найден. Установите PostgreSQL client tools или убедитесь, что Docker контейнер 'artguardian-postgres' запущен."
                )
        
        # Create backup using pg_dump
        if use_docker:
            # Use Docker exec to run pg_dump inside the PostgreSQL container
            container_backup_path = f"/tmp/{backup_filename}"
            
            backup_command = [
                "docker", "exec",
                "-e", f"PGPASSWORD={db_password}",
                "artguardian-postgres",
                "pg_dump",
                "-h", "localhost",  # Inside container, use localhost
                "-U", db_user,
                "-d", db_name,
                "-F", "c",  # Custom format (compressed)
                "-f", container_backup_path
            ]
            
            logger.info(f"Creating backup via Docker: {backup_filename}")
            
            result = subprocess.run(
                backup_command,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode == 0:
                # Copy the backup file from container to host
                copy_command = [
                    "docker", "cp",
                    f"artguardian-postgres:{container_backup_path}",
                    str(backup_path)
                ]
                copy_result = subprocess.run(
                    copy_command,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if copy_result.returncode != 0:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to copy backup from container: {copy_result.stderr}"
                    )
                # Clean up file in container
                subprocess.run(
                    ["docker", "exec", "artguardian-postgres", "rm", container_backup_path],
                    capture_output=True
                )
            else:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"Backup failed: {error_msg}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Backup failed: {error_msg[:200]}"
                )
        else:
            # Use pg_dump directly (Linux/Mac or Windows with PostgreSQL installed)
            env = os.environ.copy()
            env["PGPASSWORD"] = db_password
            
            backup_command = [
                "pg_dump",
                "-h", db_host,
                "-p", db_port,
                "-U", db_user,
                "-d", db_name,
                "-F", "c",  # Custom format (compressed)
                "-f", str(backup_path)
            ]
            
            logger.info(f"Creating backup: {backup_filename} from {db_host}:{db_port}/{db_name}")
            
            result = subprocess.run(
                backup_command,
                env=env,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                logger.error(f"Backup failed: {error_msg}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Backup failed: {error_msg[:200]}"  # Limit error message length
                )
        
        # Get backup file size
        backup_size = backup_path.stat().st_size
        
        # Notify admins about backup completion
        background_tasks.add_task(
            notify_backup_completed,
            db,
            backup_filename,
            backup_size
        )
        
        return {
            "success": True,
            "filename": backup_filename,
            "path": str(backup_path),
            "size": backup_size,
            "size_formatted": format_size(backup_size),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Backup operation timed out"
        )
    except Exception as e:
        logger.error(f"Error creating backup: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create backup: {str(e)}"
        )


@router.get("/backup/list", response_model=List[Dict[str, Any]])
async def list_backups(
    current_user: User = Depends(get_current_active_user)
):
    """List available backups (only for admins)"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can list backups"
        )
    
    backend_dir = Path(__file__).parent.parent.parent
    backups_dir = backend_dir / "backups"
    
    if not backups_dir.exists():
        return []
    
    backups = []
    for backup_file in sorted(backups_dir.glob("artguardian_backup_*.sql"), reverse=True):
        stat = backup_file.stat()
        backups.append({
            "filename": backup_file.name,
            "size": stat.st_size,
            "size_formatted": format_size(stat.st_size),
            "created_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
        })
    
    return backups


def format_size(size_bytes: int) -> str:
    """Format bytes to human-readable size"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} PB"


async def notify_backup_completed(
    db: AsyncSession,
    backup_filename: str,
    backup_size: int
):
    """Notify admins about backup completion"""
    try:
        # Get all active admins
        result = await db.execute(
            select(User).where(
                User.role == "admin",
                User.is_active == True
            )
        )
        admins = result.scalars().all()
        
        size_formatted = format_size(backup_size)
        
        for admin in admins:
            await create_notification(
                db=db,
                user_id=admin.id,
                notification_type="backup_completed",
                title="Резервное копирование завершено",
                message=f"Создан резервный файл: {backup_filename} ({size_formatted})",
                priority="low",
                metadata={"filename": backup_filename, "size": backup_size}
            )
        
        await db.commit()
    except Exception as e:
        logger.error(f"Error notifying admins about backup: {e}", exc_info=True)

