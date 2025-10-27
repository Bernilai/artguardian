import requests
import json

BASE_URL = "http://localhost:8000"


def test_security_flow():
    print("🔒 Тестирование безопасного flow...")

    # 1. Регистрация
    print("\n1. Регистрация...")
    register_data = {
        "email": "security_test@example.com",
        "password": "security123",
        "name": "Security Test User"
    }

    response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
    print(f"✅ Регистрация: {response.status_code}")

    # 2. Логин (должен установить httpOnly cookie)
    print("\n2. Логин (проверка cookies)...")
    login_data = {
        "email": "security_test@example.com",
        "password": "security123"
    }

    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json=login_data)
    print(f"✅ Логин: {response.status_code}")

    # Проверяем cookies
    cookies = session.cookies.get_dict()
    print(f"🍪 Cookies: {cookies}")
    print(f"🔐 Refresh token в cookie: {'refresh_token' in cookies}")

    # 3. Доступ к защищенному эндпоинту
    print("\n3. Доступ к защищенным данным...")
    access_token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    response = session.get(f"{BASE_URL}/api/auth/me", headers=headers)
    print(f"✅ Защищенный эндпоинт: {response.status_code}")

    # 4. Обновление токена
    print("\n4. Обновление токена...")
    response = session.post(f"{BASE_URL}/api/auth/refresh")
    print(f"✅ Обновление токена: {response.status_code}")
    print(f"🔄 Новый access token: {len(response.json()['access_token'])} chars")

    # 5. Выход (должен удалить cookie)
    print("\n5. Выход...")
    response = session.post(f"{BASE_URL}/api/auth/logout")
    print(f"✅ Выход: {response.status_code}")

    cookies_after_logout = session.cookies.get_dict()
    print(f"🍪 Cookies после выхода: {cookies_after_logout}")
    print(f"🔐 Refresh token удален: {'refresh_token' not in cookies_after_logout}")


if __name__ == "__main__":
    test_security_flow()