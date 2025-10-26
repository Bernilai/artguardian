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

    # Сначала попробуем получить ошибку без данных
    print("\n1. Тестирование регистрации с неполными данными:")
    response = requests.post(f"{BASE_URL}/api/auth/register", json={})
    print(f"   POST /api/auth/register (empty) - {response.status_code}: {response.text}")

    # Регистрация с полными данными
    print("\n2. Тестирование регистрации:")
    register_data = {
        "email": "test@example.com",
        "password": "testpassword123",
        "name": "Test User",
        "role": "admin"
    }

    response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
    print(f"   POST /api/auth/register - {response.status_code}")
    if response.status_code == 200:
        user_data = response.json()
        print(f"   ✅ Успешная регистрация: ID={user_data['id']}, Email={user_data['email']}")

        # Попробуем зарегистрировать того же пользователя снова
        print("\n3. Тестирование дублирования регистрации:")
        response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
        print(f"   POST /api/auth/register (duplicate) - {response.status_code}: {response.text}")

    elif response.status_code == 500:
        print(f"   ❌ Internal Server Error: {response.text}")
        return

    # Логин
    print("\n4. Тестирование логина:")
    login_data = {
        "email": "test@example.com",
        "password": "testpassword123"
    }

    response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
    print(f"   POST /api/auth/login - {response.status_code}")
    if response.status_code == 200:
        tokens = response.json()
        print(f"   ✅ Успешный логин:")
        print(f"      Access Token: {tokens['access_token'][:50]}...")
        print(f"      Refresh Token: {tokens['refresh_token'][:50]}...")

        # Проверка защищенного эндпоинта
        print("\n5. Тестирование защищенного эндпоинта:")
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        print(f"   GET /api/auth/me - {response.status_code}")
        if response.status_code == 200:
            user_profile = response.json()
            print(f"   ✅ Профиль пользователя: {user_profile['name']} ({user_profile['email']})")

        # Обновление токена
        print("\n6. Тестирование обновления токена:")
        refresh_data = {"refresh_token": tokens["refresh_token"]}
        response = requests.post(f"{BASE_URL}/api/auth/refresh", json=refresh_data)
        print(f"   POST /api/auth/refresh - {response.status_code}")
        if response.status_code == 200:
            new_tokens = response.json()
            print(f"   ✅ Токен успешно обновлен")
            print(f"      New Access Token: {new_tokens['access_token'][:50]}...")

        # Выход
        print("\n7. Тестирование выхода:")
        response = requests.post(f"{BASE_URL}/api/auth/logout", json=refresh_data)
        print(f"   POST /api/auth/logout - {response.status_code}")
        if response.status_code == 200:
            print("   ✅ Успешный выход")

    else:
        print(f"   ❌ Ошибка логина: {response.text}")


if __name__ == "__main__":
    test_endpoints()