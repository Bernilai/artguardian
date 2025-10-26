import requests
import json

BASE_URL = "http://localhost:8000"


def test_different_formats():
    print("🧪 Тестирование разных форматов данных для регистрации...")

    # 1. Правильный JSON формат (должен работать)
    print("\n1. Правильный JSON формат:")
    data_correct = {
        "email": "frontend_test1@example.com",
        "password": "frontend123",
        "name": "Frontend Test User",
        "role": "admin"
    }

    response = requests.post(
        f"{BASE_URL}/api/auth/register",
        json=data_correct,
        headers={"Content-Type": "application/json"}
    )
    print(f"   JSON - Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Успех")
    else:
        print(f"   ❌ Ошибка: {response.text}")

    # 2. FormData формат (может использоваться фронтендом)
    print("\n2. FormData формат:")
    response = requests.post(
        f"{BASE_URL}/api/auth/register",
        data=data_correct,
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    print(f"   FormData - Status: {response.status_code}")
    if response.status_code == 200:
        print("   ✅ Успех")
    else:
        print(f"   ❌ Ошибка: {response.text}")

    # 3. Неполные данные
    print("\n3. Неполные данные (без email):")
    data_incomplete = {
        "password": "frontend123",
        "name": "Frontend Test User",
        "role": "admin"
    }
    response = requests.post(f"{BASE_URL}/api/auth/register", json=data_incomplete)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text}")


if __name__ == "__main__":
    test_different_formats()