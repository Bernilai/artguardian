import requests
import json

BASE_URL = "http://localhost:8000"


def test_login_response():
    print("🔍 Проверка ответа логина...")

    # Сначала зарегистрируем тестового пользователя
    register_data = {
        "email": "login_test@example.com",
        "password": "testpassword123",
        "name": "Login Test User"
    }

    response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
    if response.status_code != 200:
        print("❌ Не удалось зарегистрировать тестового пользователя")
        return False

    print("✅ Тестовый пользователь зарегистрирован")

    # Тестируем логин
    login_data = {
        "email": "login_test@example.com",
        "password": "testpassword123"
    }

    response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
    print(f"Status Code: {response.status_code}")
    print(f"Response Headers: {dict(response.headers)}")
    print(f"Response Body: {response.text}")

    if response.status_code == 200:
        data = response.json()
        print("\n📋 Структура ответа:")
        print(f"  - access_token: {'present' if 'access_token' in data else 'missing'}")
        print(f"  - refresh_token: {'present' if 'refresh_token' in data else 'missing'}")
        print(f"  - token_type: {'present' if 'token_type' in data else 'missing'}")
        print(f"  - user: {'present' if 'user' in data else 'missing'}")

        if 'access_token' in data:
            print(f"  - access_token length: {len(data['access_token'])}")

        return True
    else:
        print("❌ Логин не удался")
        return False


if __name__ == "__main__":
    test_login_response()