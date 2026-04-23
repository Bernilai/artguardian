import locale
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL as SQLAlchemyURL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.declarative import declarative_base

from app.config import settings

# Set encoding environment variables before importing psycopg (critical on Windows)
if sys.platform == "win32":
    os.environ["PGCLIENTENCODING"] = "UTF8"
    os.environ["PYTHONIOENCODING"] = "utf-8"

    try:
        locale.setlocale(locale.LC_ALL, "en_US.UTF-8")
    except (locale.Error, OSError):
        try:
            locale.setlocale(locale.LC_ALL, "C.UTF-8")
        except (locale.Error, OSError):
            pass

backend_dir = Path(__file__).parent.parent
env_path = backend_dir / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path, override=True)

logger = logging.getLogger(__name__)

use_postgres = os.getenv("USE_POSTGRES", "true").lower() == "true"
has_db_url_env = bool(os.getenv("DATABASE_URL"))
is_pgbouncer_connection = False
database_url = None

if use_postgres and not has_db_url_env:
    logger.info("Using PostgreSQL database with psycopg3")

    pg_user = os.getenv("POSTGRES_USER", "artguardian")
    pg_password = os.getenv("POSTGRES_PASSWORD", "artguardian123")
    pg_host = os.getenv("POSTGRES_HOST", "localhost")
    pgbouncer_port = os.getenv("PGBOUNCER_PORT")
    postgres_port = os.getenv("POSTGRES_PORT")
    if pgbouncer_port:
        pg_port = int(pgbouncer_port)
        port_source = "PGBOUNCER_PORT"
        is_pgbouncer_connection = pg_port == 6432
    elif postgres_port:
        pg_port = int(postgres_port)
        port_source = "POSTGRES_PORT"
        is_pgbouncer_connection = pg_port == 6432
    else:
        pg_port = 6432
        port_source = "default (PgBouncer)"
        is_pgbouncer_connection = True
    pg_db = os.getenv("POSTGRES_DB", "artguardian")
    use_password = pg_password

    logger.info(
        f"PostgreSQL connection parameters: user={pg_user}, host={pg_host}, "
        f"port={pg_port} (from {port_source}), db={pg_db}, "
        f"password_set={bool(use_password)}"
    )

    url_params = {
        "drivername": "postgresql+psycopg",
        "username": pg_user,
        "host": pg_host,
        "port": pg_port,
        "database": pg_db,
    }
    if use_password:
        url_params["password"] = use_password

    database_url = SQLAlchemyURL.create(**url_params)
    logger.info(
        f"PostgreSQL async connection configured: {pg_user}@{pg_host}:{pg_port}/{pg_db}"
    )

elif has_db_url_env and "postgresql" in settings.DATABASE_URL:
    logger.info("Using PostgreSQL database from DATABASE_URL with psycopg3")
    is_pgbouncer_connection = ":6432" in settings.DATABASE_URL

    if settings.DATABASE_URL.startswith("postgresql://"):
        database_url = settings.DATABASE_URL.replace(
            "postgresql://", "postgresql+psycopg://", 1
        )
    elif settings.DATABASE_URL.startswith("postgresql+asyncpg://"):
        database_url = settings.DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql+psycopg://", 1
        )
    elif settings.DATABASE_URL.startswith("postgresql+psycopg2://"):
        database_url = settings.DATABASE_URL.replace(
            "postgresql+psycopg2://", "postgresql+psycopg://", 1
        )
    else:
        database_url = settings.DATABASE_URL

    logger.info("Using DATABASE_URL with psycopg3 driver")

else:
    logger.warning(
        "SQLite with async SQLAlchemy requires aiosqlite. Using sync SQLite for now."
    )
    database_url = settings.DATABASE_URL.replace("sqlite:///", "sqlite+aiosqlite:///")
    db_file = settings.DATABASE_URL.replace("sqlite:///", "")
    logger.info(f"SQLite database file: {os.path.abspath(db_file)}")
    logger.info(f"Database file exists: {os.path.exists(db_file)}")

connect_args = {
    "connect_timeout": 15,
}
if not is_pgbouncer_connection:
    connect_args["options"] = "-c client_encoding=UTF8 -c lc_messages=en_US.UTF-8"
    logger.info("Using direct PostgreSQL connection - including encoding options")
else:
    connect_args["prepare_threshold"] = None
    logger.info(
        "Using PgBouncer connection - disabling prepared statements and "
        "unsupported 'options' parameter"
    )

pool_size = 3 if is_pgbouncer_connection else 5
max_overflow = 5 if is_pgbouncer_connection else 10
pool_recycle_time = 3300 if is_pgbouncer_connection else 3600

engine = create_async_engine(
    database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=pool_size,
    max_overflow=max_overflow,
    pool_recycle=pool_recycle_time,
    pool_reset_on_return="commit",
    connect_args=connect_args,
)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db():
    """Async database dependency for FastAPI"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
