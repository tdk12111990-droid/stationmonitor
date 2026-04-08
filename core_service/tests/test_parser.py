from src.ocr.parser import parse_text


def test_parse_text_basic():
    raw = "Frequency Band: 10.00KHz - 12.00KHz Max. Frequency: 1250.5 Hz Max. Decibel: 78.2 dB"
    result = parse_text(raw, "raw")

    assert result["frequency_band"] == "10.00KHz-12.00KHz"
    assert result["max_frequency_hz"] == 1250.5
    assert result["max_decibel_db"] == 78.2