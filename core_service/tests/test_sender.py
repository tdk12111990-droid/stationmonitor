from src.client.backend_sender import send_to_backend


def test_sender_returns_dict():
    payload = {
        "device_id": "test-device",
        "time": "2026-04-06 10:00:00",
        "source": "raw",
        "frequency_band": "10.00KHz-12.00KHz",
        "max_frequency_hz": 1250.5,
        "max_decibel_db": 78.2,
        "raw": "abc",
        "corrected": "abc",
    }

    result = send_to_backend(payload)
    assert isinstance(result, dict)