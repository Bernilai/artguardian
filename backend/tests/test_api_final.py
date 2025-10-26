# /test_api_final.py
import requests
import json
import sys

BASE_URL = "http://localhost:8000"


def test_endpoints():
    print("🧪 Тестирование API эндпоинтов...")

    try:
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
        return test_auth()

    except requests.exceptions.ConnectionError:
        print("❌ Не удалось подключиться к серверу. Убедитесь, что сервер запущен на http://localhost:8000")
        return False
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {str(e)}")
        return False


def test_auth():
    print("\n🔐 Тестирование аутентификации...")

    # Регистрация
    print("\n1. Тестирование регистрации:")
    register_data = {
        "email": "test1@example.com",
        "password": "testpassword123",
        "name": "Test User",
        "role": "admin"
    }

    try:
        response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
        print(f"   POST /api/auth/register - {response.status_code}")

        if response.status_code == 200:
            user_data = response.json()
            print(f"   ✅ Успешная регистрация: ID={user_data['id']}, Email={user_data['email']}")
            print("   🎉 Проблема с bcrypt решена!")

            # Тестируем остальные функции
            return test_login(register_data["email"], register_data["password"])
        else:
            print(f"   ❌ Ошибка регистрации: {response.text}")
            return False

    except Exception as e:
        print(f"   ❌ Исключение при регистрации: {str(e)}")
        return False


def test_login(email, password):
    print("\n2. Тестирование логина:")
    login_data = {
        "email": email,
        "password": password
    }

    try:
        response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
        print(f"   POST /api/auth/login - {response.status_code}")

        if response.status_code == 200:
            tokens = response.json()
            print(f"   ✅ Успешный логин!")
            print(f"      Access Token: {tokens['access_token'][:50]}...")
            print(f"      Refresh Token: {tokens['refresh_token'][:50]}...")

            # Тестируем защищенный эндпоинт
            return test_protected_endpoint(tokens['access_token'])
        else:
            print(f"   ❌ Ошибка логина: {response.text}")
            return False

    except Exception as e:
        print(f"   ❌ Исключение при логине: {str(e)}")
        return False


def test_protected_endpoint(access_token):
    print("\n3. Тестирование защищенного эндпоинта:")

    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        print(f"   GET /api/auth/me - {response.status_code}")

        if response.status_code == 200:
            user_profile = response.json()
            print(f"   ✅ Профиль пользователя: {user_profile['name']} ({user_profile['email']})")
            print("\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!")
            return True
        else:
            print(f"   ❌ Ошибка получения профиля: {response.text}")
            return False

    except Exception as e:
        print(f"   ❌ Исключение при запросе профиля: {str(e)}")
        return False


if __name__ == "__main__":
    success = test_endpoints()
    sys.exit(0 if success else 1)