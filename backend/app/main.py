import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

if sys.platform == "win32":
    if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from app.api import (  # noqa: E402
    ai_preferences,
    analytics,
    artifacts,
    auth,
    auto_detection,
    dashboard,
    defect_detection,
    images,
    museum_reference,
    notifications,
    system,
    tickets,
)
from app.api import seo as seo_routes  # noqa: E402
from app.database import Base, engine  # noqa: E402

logger = logging.getLogger(__name__)


async def test_database_connection(max_retries: int = 5, initial_delay: float = 3.0):
    """Test database connection with retry logic and exponential backoff"""
    retry_delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return True
        except OperationalError as e:
            if attempt < max_retries:
                error_msg = str(e).lower()
                if "password authentication failed" in error_msg:
                    logger.error(f"Password authentication failed on attempt {attempt}")
                    raise
                logger.warning(
                    f"Database connection attempt {attempt}/{max_retries} failed, "
                    f"retrying in {retry_delay:.1f}s..."
                )
                await asyncio.sleep(retry_delay)
                retry_delay *= 1.5
            else:
                raise
        except Exception:
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ArtGuardian API Server")
    try:
        await test_database_connection()
        logger.info("Database tables created/verified successfully")
    except Exception as e:
        logger.error(
            f"Failed to create database tables: {type(e).__name__}: {str(e)[:200]}"
        )
        raise

    yield
    logger.info("Stopping ArtGuardian API Server")
    await engine.dispose()


app = FastAPI(
    title="ArtGuardian API",
    description="API для платформы медиаконтента музеев",
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors and convert to JSON-serializable format"""
    errors = exc.errors()
    logger.error(f"Validation error for {request.url}: {errors}")

    serializable_errors = []
    for error in errors:
        serializable_error = {
            "type": error.get("type"),
            "loc": error.get("loc"),
            "msg": error.get("msg"),
        }
        if "ctx" in error and "error" in error["ctx"]:
            error_obj = error["ctx"]["error"]
            if isinstance(error_obj, Exception):
                serializable_error["msg"] = str(error_obj)
        serializable_errors.append(serializable_error)

    return JSONResponse(
        status_code=422,
        content={"detail": serializable_errors},
    )


cors_origins = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Type"],
)

app.include_router(artifacts.router, prefix="/api/artifacts", tags=["artifacts"])
app.include_router(tickets.router, prefix="/api/tickets", tags=["tickets"])
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(
    defect_detection.router, prefix="/api/defects", tags=["defect_detection"]
)
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(
    notifications.router, prefix="/api/notifications", tags=["notifications"]
)
app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(
    auto_detection.router, prefix="/api/auto-detection", tags=["auto_detection"]
)
app.include_router(ai_preferences.router, prefix="/api/ai", tags=["ai_preferences"])
app.include_router(
    museum_reference.router, prefix="/api/museum", tags=["museum_reference"]
)
app.include_router(seo_routes.router)


@app.get("/")
async def root():
    return {"message": "ArtGuardian API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
