import requests
import json

BASE_URL = "http://localhost:8000"


def test_fixed_login():
    print("🔍 Проверка исправленного ответа логина...")

    # Сначала зарегистрируем тестового пользователя
    register_data = {
        "email": "fixed_test1@example.com",
        "password": "testpassword123",
        "name": "Fixed Test User"
    }

    response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
    if response.status_code != 200:
        print("❌ Не удалось зарегистрировать тестового пользователя")
        return False

    print("✅ Тестовый пользователь зарегистрирован")

    # Тестируем логин
    login_data = {
        "email": "fixed_test@example.com",
        "password": "testpassword123"
    }

    response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print("\n📋 Структура ответа после исправления:")
        print(f"  - access_token: {'present' if 'access_token' in data else 'missing'}")
        print(f"  - refresh_token: {'present' if 'refresh_token' in data else 'missing'}")
        print(f"  - token_type: {'present' if 'token_type' in data else 'missing'}")
        print(f"  - user: {'present' if 'user' in data else 'missing'}")

        if 'user' in data:
            user = data['user']
            print(f"  - user.id: {user.get('id', 'missing')}")
            print(f"  - user.email: {user.get('email', 'missing')}")
            print(f"  - user.name: {user.get('name', 'missing')}")
            print(f"  - user.role: {user.get('role', 'missing')}")

        return 'user' in data
    else:
        print(f"❌ Логин не удался: {response.text}")
        return False


if __name__ == "__main__":
    success = test_fixed_login()
    print(f"\n{'🎉 Ответ логина исправлен!' if success else '💥 Еще есть проблемы'}")