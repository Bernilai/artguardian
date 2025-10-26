import requests

BASE_URL = "http://localhost:8000"


def test_cors_headers():
    print("🔍 Проверка CORS заголовков...")

    # Делаем OPTIONS запрос (preflight)
    response = requests.options(f"{BASE_URL}/api/auth/login")
    print(f"OPTIONS /api/auth/login - Status: {response.status_code}")
    print("CORS Headers:")
    for header, value in response.headers.items():
        if "access-control" in header.lower():
            print(f"  {header}: {value}")

    # Проверяем CORS на обычном запросе
    response = requests.get(f"{BASE_URL}/")
    print(f"\nGET / - Status: {response.status_code}")
    print("CORS Headers:")
    for header, value in response.headers.items():
        if "access-control" in header.lower():
            print(f"  {header}: {value}")


if __name__ == "__main__":
    test_cors_headers()