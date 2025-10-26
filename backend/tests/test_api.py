import requests
import json

BASE_URL = "http://localhost:8000"


def test_endpoints():
    print("🧪 Тестирование API эндпоинтов...")

    # 1. Проверка корневого эндпоинта
    response = requests.get(f"{BASE_URL}/")
    print(f"GET / - {response.status_code}: {response.json()}")

    # 2. Проверка health check
    response = requests.get(f"{BASE_URL}/health")
    print(f"GET /health - {response.status_code}: {response.json()}")

    # 3. Проверка артефактов
    response = requests.get(f"{BASE_URL}/api/artifacts/")
    print(f"GET /api/artifacts/ - {response.status_code}: {len(response.json())} артефактов")

    # 4. Тестирование аутентификации
    test_auth()


def test_auth():
    print("\n🔐 Тестирование аутентификации...")

    # Регистрация
    register_data = {
        "email": "test@example.com",
        "password": "testpassword123",
        "name": "Test User",
        "role": "admin"
    }

    response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
    print(f"POST /api/auth/register - {response.status_code}")
    if response.status_code == 200:
        print(f"✅ Успешная регистрация: {response.json()}")
    else:
        print(f"❌ Ошибка регистрации: {response.text}")

    # Логин
    login_data = {
        "email": "test@example.com",
        "password": "testpassword123"
    }

    response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
    print(f"POST /api/auth/login - {response.status_code}")
    if response.status_code == 200:
        tokens = response.json()
        print(f"✅ Успешный логин. Access token получен")

        # Проверка защищенного эндпоинта
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        print(f"GET /api/auth/me - {response.status_code}")
        if response.status_code == 200:
            print(f"✅ Профиль пользователя: {response.json()}")

        # Обновление токена
        refresh_data = {"refresh_token": tokens["refresh_token"]}
        response = requests.post(f"{BASE_URL}/api/auth/refresh", json=refresh_data)
        print(f"POST /api/auth/refresh - {response.status_code}")
        if response.status_code == 200:
            print("✅ Токен успешно обновлен")

        # Выход
        response = requests.post(f"{BASE_URL}/api/auth/logout", json=refresh_data)
        print(f"POST /api/auth/logout - {response.status_code}")
        if response.status_code == 200:
            print("✅ Успешный выход")

    else:
        print(f"❌ Ошибка логина: {response.text}")


if __name__ == "__main__":
    test_endpoints()