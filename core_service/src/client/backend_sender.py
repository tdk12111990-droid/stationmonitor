import requests

from config.settings import API_TIMEOUT, BACKEND_URL


def send_to_backend(payload: dict):
    try:
        response = requests.post(BACKEND_URL, json=payload, timeout=API_TIMEOUT)
        response.raise_for_status()

        try:
            return {
                "success": True,
                "status_code": response.status_code,
                "response": response.json(),
            }
        except Exception:
            return {
                "success": True,
                "status_code": response.status_code,
                "response": response.text,
            }

    except requests.RequestException as e:
        return {
            "success": False,
            "error": str(e),
        }