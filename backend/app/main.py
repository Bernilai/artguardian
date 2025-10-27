from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import Request
from starlette.middleware.cors import CORSMiddleware
import logging

from app.database import engine, Base
from app.api import artifacts, tickets, auth
from app.config import settings

logger = logging.getLogger(__name__)

# Создаем таблицы при старте
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Запуск ArtGuardian API Server")
    Base.metadata.create_all(bind=engine)
    yield
    print("🛑 Остановка ArtGuardian API Server")

app = FastAPI(
    title="ArtGuardian API",
    description="API для платформы медиаконтента музеев",
    version="1.0.0",
    lifespan=lifespan
)

# Обработчик ошибок валидации
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error for {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# CORS для локальной разработки
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:63342",
        "http://127.0.0.1:63342",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Обработчик ошибок валидации
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error for {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# Подключаем роутеры
app.include_router(artifacts.router, prefix="/api/artifacts", tags=["artifacts"])
app.include_router(tickets.router, prefix="/api/tickets", tags=["tickets"])
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])

@app.get("/")
async def root():
    return {"message": "ArtGuardian API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)