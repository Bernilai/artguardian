# /test_password_length.py
import requests
import string
import random

BASE_URL = "http://localhost:8000"


def generate_long_password(length=100):
    """Генерирует длинный пароль для тестирования"""
    characters = string.ascii_letters + string.digits + string.punctuation
    return ''.join(random.choice(characters) for i in range(length))


def test_password_length():
    print("🔐 Тестирование паролей разной длины...")

    test_cases = [
        ("short", "pass123"),
        ("normal", "my_secure_password_2024"),
        ("long", generate_long_password(80)),  # 80 символов
        ("very_long", generate_long_password(150)),  # 150 символов
    ]

    for test_name, password in test_cases:
        print(f"\n📝 Тест: {test_name} пароль ({len(password)} символов)")

        email = f"test_{test_name}@example.com"

        register_data = {
            "email": email,
            "password": password,
            "name": f"Test User {test_name}",
            "role": "admin"
        }

        try:
            # Регистрация
            response = requests.post(f"{BASE_URL}/api/auth/register", json=register_data)
            if response.status_code == 200:
                print(f"   ✅ Регистрация успешна")

                # Логин
                login_data = {"email": email, "password": password}
                response = requests.post(f"{BASE_URL}/api/auth/login", json=login_data)
                if response.status_code == 200:
                    print(f"   ✅ Логин успешен")
                else:
                    print(f"   ❌ Логин не удался: {response.text}")
            else:
                print(f"   ❌ Регистрация не удалась: {response.text}")

        except Exception as e:
            print(f"   💥 Исключение: {str(e)}")


if __name__ == "__main__":
    test_password_length()