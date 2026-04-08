import re


def postprocess_text(text: str) -> str:
    text = re.sub(r"\?\?", "77", text)
    text = re.sub(r"(?<=\d)\?|(?<=\d)\?(?=\d)|\?(?=\d)", "7", text)
    text = re.sub(r"(\d)\?", r"\g<1>7", text)
    text = re.sub(r"\?(\d)", r"7\1", text)
    text = re.sub(r"(?<=\d)O(?=\d)", "0", text)
    text = re.sub(r"(?<=\d)[lI](?=\d)", "1", text)
    text = re.sub(r"(?<=\d)S(?=\d)", "5", text)
    return text