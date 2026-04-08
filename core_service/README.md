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


## Chạy bằng CPU hoặc GPU

Project hỗ trợ chạy linh hoạt trên cả CPU và GPU.

### Cấu hình thiết bị OCR

Trong `config/settings.py`:

```python
OCR_DEVICE = os.getenv("OCR_DEVICE", "auto")



2. Cách chạy mô hình
Cách 1: dùng venv trên Windows
Bước 1: tạo môi trường ảo
cd core_service
python -m venv .venv
Bước 2: kích hoạt môi trường ảo

PowerShell:

.\.venv\Scripts\Activate.ps1

CMD:

.\.venv\Scripts\activate.bat
Bước 3: cài thư viện
pip install -r requirements.txt
Bước 4: chạy project
python main.py
Cách 2: dùng Conda
Bước 1: tạo môi trường
conda create -n realtime_ocr python=3.10 -y
Bước 2: kích hoạt môi trường
conda activate realtime_ocr
Bước 3: cài thư viện
pip install -r requirements.txt
Bước 4: chạy project
python main.py
Chạy bằng CPU hoặc GPU

Trong config/settings.py:

OCR_DEVICE = os.getenv("OCR_DEVICE", "auto")

Ý nghĩa:

auto: thử GPU trước, nếu không khả dụng thì tự động chuyển sang CPU
cpu: luôn chạy bằng CPU
gpu:0: chạy bằng GPU số 0
Chạy trên Windows không có GPU
OCR_DEVICE = "cpu"

hoặc PowerShell:

$env:OCR_DEVICE="cpu"
python main.py
Chạy trên máy có GPU
OCR_DEVICE = "gpu:0"

hoặc PowerShell:

$env:OCR_DEVICE="gpu:0"
python main.py
Chạy tự động fallback CPU/GPU
$env:OCR_DEVICE="auto"
python main.py

Nếu bạn muốn tiện hơn nữa, mình có thể tạo luôn file `README.md` để bạn tải xuố