import os
from pathlib import Path
from urllib.parse import quote_plus
from dotenv import load_dotenv

# Get the backend directory (parent of app directory)
BACKEND_DIR = Path(__file__).parent.parent

# Load .env file from backend directory explicitly
env_path = BACKEND_DIR / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    APP_NAME = os.getenv("REACT_APP_APP_NAME", "ArtGuardian")
    _secret_key = os.getenv("SECRET_KEY")
    if not _secret_key:
        raise ValueError("SECRET_KEY environment variable is required. Set it in your .env file or environment.")
    SECRET_KEY: str = _secret_key
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    _db_url = os.getenv("DATABASE_URL")
    
    if _db_url:
        DATABASE_URL: str = _db_url
    else:
        use_postgres = os.getenv("USE_POSTGRES", "true").lower() == "true"
        
        if use_postgres:
            DATABASE_URL: str = "postgresql://placeholder"
        else:
            db_file = str(BACKEND_DIR / "artguardian.db")
            DATABASE_URL: str = f"sqlite:///{db_file}"
    MINIO_ENDPOINT: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    MINIO_ACCESS_KEY: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    MINIO_SECRET_KEY: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    MINIO_SECURE: bool = os.getenv("MINIO_SECURE", "false").lower() == "true"
    MINIO_BUCKET_NAME: str = os.getenv("MINIO_BUCKET_NAME", "artguardian")
    MINIO_REGION: str = os.getenv("MINIO_REGION", "us-east-1")
    MINIO_PUBLIC_URL: str = os.getenv("MINIO_PUBLIC_URL", f"http://{MINIO_ENDPOINT}/{MINIO_BUCKET_NAME}")

settings = Settings()