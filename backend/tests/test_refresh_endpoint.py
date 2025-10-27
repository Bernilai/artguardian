import requests
import json

BASE_URL = "http://localhost:8000"


def test_refresh_endpoint():
    print("🔍 Тестирование эндпоинта refresh...")

    # 1. Сначала попробуем refresh без cookie (должна быть ошибка)
    print("\n1. Refresh без cookie:")
    try:
        response = requests.post(
            f"{BASE_URL}/api/auth/refresh",
            cookies={}  # Пустые cookies
        )
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text}")
    except Exception as e:
        print(f"   Error: {e}")

    # 2. Создадим пользователя и получим cookie
    print("\n2. Создание пользователя и получение cookie...")
    session = requests.Session()

    # Регистрация
    register_data = {
        "email": "refresh_test@example.com",
        "password": "refresh123",
        "name": "Refresh Test User"
    }

    response = session.post(f"{BASE_URL}/api/auth/register", json=register_data)
    print(f"   Register: {response.status_code}")

    # Логин (должен установить cookie)
    login_data = {
        "email": "refresh_test@example.com",
        "password": "refresh123"
    }

    response = session.post(f"{BASE_URL}/api/auth/login", json=login_data)
    print(f"   Login: {response.status_code}")

    # Проверяем cookies
    cookies = session.cookies.get_dict()
    print(f"   Cookies: {cookies}")

    # 3. Тестируем refresh с cookie
    print("\n3. Refresh с cookie:")
    response = session.post(f"{BASE_URL}/api/auth/refresh")
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"   ✅ Success! New access token: {data['access_token'][:50]}...")
    else:
        print(f"   ❌ Failed: {response.text}")


if __name__ == "__main__":
    test_refresh_endpoint()