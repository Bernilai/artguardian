import requests

BASE_URL = "http://localhost:8000"


def test_cors_detailed():
    print("🔍 Детальная проверка CORS...")

    # Тестируем с разными Origin
    origins = [
        "http://localhost:63342",
        "http://127.0.0.1:63342",
        "https://localhost:63342"
    ]

    for origin in origins:
        print(f"\n🎯 Testing with Origin: {origin}")

        # OPTIONS запрос
        response = requests.options(
            f"{BASE_URL}/api/auth/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type"
            }
        )
        print(f"  OPTIONS /api/auth/login - Status: {response.status_code}")

        # Проверяем CORS заголовки
        cors_headers = {}
        for header, value in response.headers.items():
            if "access-control" in header.lower():
                cors_headers[header] = value

        if cors_headers:
            print("  ✅ CORS Headers Found:")
            for header, value in cors_headers.items():
                print(f"    {header}: {value}")
        else:
            print("  ❌ No CORS Headers")

        # GET запрос
        response = requests.get(
            f"{BASE_URL}/",
            headers={"Origin": origin}
        )
        print(f"  GET / - Status: {response.status_code}")

        cors_headers = {}
        for header, value in response.headers.items():
            if "access-control" in header.lower():
                cors_headers[header] = value

        if cors_headers:
            print("  ✅ CORS Headers Found:")
            for header, value in cors_headers.items():
                print(f"    {header}: {value}")
        else:
            print("  ❌ No CORS Headers")


if __name__ == "__main__":
    test_cors_detailed()