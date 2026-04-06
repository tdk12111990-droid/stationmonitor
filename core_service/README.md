# Realtime OCR Service
## 1. Cấu trúc thư mục

```text
realtime_ocr_service/
│
├── main.py
├── requirements.txt
├── README.md
├── .gitignore
│
├── config/
│   └── settings.py
│
├── src/
│   ├── __init__.py
│   │
│   ├── camera/
│   │   ├── __init__.py
│   │   └── rtsp_capture.py
│   │
│   ├── ocr/
│   │   ├── __init__.py
│   │   ├── preprocess.py
│   │   ├── reader.py
│   │   └── parser.py
│   │
│   ├── client/
│   │   ├── __init__.py
│   │   └── backend_sender.py
│   │
│   └── utils/
│       ├── __init__.py
│       ├── image_utils.py
│       └── text_utils.py
│
├── logs/
│   └── app.log
│
└── tests/
    ├── __init__.py
    ├── test_parser.py
    └── test_sender.py