# /test_complete_fixed.py
import requests
import json

BASE_URL = "http://localhost:8000"


def test_complete_fixed_flow():
    print("🔄 Тестирование полного цикла после исправления...")

    # 1. Регистрация
    print("\n1. Регистрация...")
    register_data = {
        "email": "complete_test1@example.com",
        "password": "complete123",
        "name": "Complete Test User"
    }

    response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
    if response.status_code == 200:
        print("✅ Регистрация успешна")
    else:
        print(f"❌ Регистрация failed: {response.text}")
        return False

    # 2. Логин
    print("\n2. Вход в систему...")
    login_data = {
        "email": "complete_test@example.com",
        "password": "complete123"
    }

    response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
    if response.status_code == 200:
        data = response.json()
        print("✅ Логин успешен")
        print(f"   Получен пользователь: {data['user']['name']} ({data['user']['email']})")
        print(f"   Роль: {data['user']['role']}")
        print(f"   Access Token: {data['access_token'][:50]}...")
    else:
        print(f"❌ Логин failed: {response.text}")
        return False

    print("\n🎉 Фронтенд теперь получит все необходимые данные для автоматического перенаправления!")
    return True


if __name__ == "__main__":
    test_complete_fixed_flow()