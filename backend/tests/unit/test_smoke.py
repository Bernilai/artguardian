from app.main import app


def test_app_importable():
    assert app is not None
    assert app.title is not None
    route_paths = {route.path for route in app.routes}
    assert len(route_paths) > 0, "App has no routes registered"


async def test_openapi_endpoint(async_client):
    response = await async_client.get("/openapi.json")
    assert response.status_code == 200
    assert "openapi" in response.json()
