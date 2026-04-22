import os
from datetime import datetime, timedelta, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Ensure required settings exist before importing app modules.
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("USE_POSTGRES", "false")

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+aiosqlite:///./artguardian_test.db")

from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.security import create_access_token, create_refresh_token, get_password_hash  # noqa: E402
from app.config import settings  # noqa: E402


test_engine = create_async_engine(TEST_DATABASE_URL, future=True)
TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database() -> AsyncGenerator[None, None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
        finally:
            await session.rollback()
            await session.close()


@pytest_asyncio.fixture(scope="function")
async def async_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
    app.dependency_overrides.clear()


async def _create_user(session: AsyncSession, role: str, suffix: str) -> User:
    user = User(
        email=f"{role}_{suffix}@example.com",
        hashed_password=get_password_hash("testpassword123"),
        name=f"{role.title()} User",
        role=role,
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture(scope="function")
async def viewer_user(db_session: AsyncSession) -> User:
    return await _create_user(db_session, "viewer", "fixture")


@pytest_asyncio.fixture(scope="function")
async def restorer_user(db_session: AsyncSession) -> User:
    return await _create_user(db_session, "restorer", "fixture")


@pytest_asyncio.fixture(scope="function")
async def curator_user(db_session: AsyncSession) -> User:
    return await _create_user(db_session, "curator", "fixture")


@pytest_asyncio.fixture(scope="function")
async def admin_user(db_session: AsyncSession) -> User:
    return await _create_user(db_session, "admin", "fixture")


@pytest_asyncio.fixture(scope="function")
async def valid_access_token(admin_user: User) -> str:
    return create_access_token({"sub": admin_user.id, "role": admin_user.role})


@pytest_asyncio.fixture(scope="function")
async def expired_access_token(admin_user: User) -> str:
    expired_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    payload = {"sub": admin_user.id, "role": admin_user.role, "exp": expired_at}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@pytest.fixture(scope="function")
def valid_refresh_token() -> str:
    return create_refresh_token()
