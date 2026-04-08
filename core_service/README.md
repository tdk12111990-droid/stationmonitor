# Realtime OCR Service – Dịch vụ OCR thời gian thực

Phần mềm đọc dữ liệu OCR từ luồng camera/RTSP, xử lý văn bản, chuẩn hóa kết quả và gửi JSON về backend thông qua API.

---

## Cấu trúc dự án

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
```

---

## Cài đặt và chạy dự án

> Có thể chạy bằng **venv trên Windows** hoặc **Conda**, tùy môi trường bạn đang dùng.

### Cách 1 — Dùng venv trên Windows

#### Bước 1 — Di chuyển vào thư mục project
```bash
cd core_service
```

#### Bước 2 — Tạo môi trường ảo
```bash
python -m venv .venv
```

#### Bước 3 — Kích hoạt môi trường

**PowerShell**
```bash
.\.venv\Scripts\Activate.ps1
```

**CMD**
```bash
.\.venv\Scripts\activate.bat
```

#### Bước 4 — Cài thư viện
```bash
pip install -r requirements.txt
```

#### Bước 5 — Chạy project
```bash
python main.py
```

---

### Cách 2 — Dùng Conda

#### Bước 1 — Tạo môi trường
```bash
conda create -n realtime_ocr python=3.10 -y
```

#### Bước 2 — Kích hoạt môi trường
```bash
conda activate realtime_ocr
```

#### Bước 3 — Cài thư viện
```bash
pip install -r requirements.txt
```

#### Bước 4 — Chạy project
```bash
python main.py
```

---

## Cấu hình thiết bị chạy OCR

Project hỗ trợ chạy linh hoạt trên cả **CPU** và **GPU**.

Trong file `config/settings.py`:

```python
OCR_DEVICE = os.getenv("OCR_DEVICE", "auto")
```

### Ý nghĩa các giá trị cấu hình

| Giá trị | Ý nghĩa |
|---------|--------|
| `auto` | Thử GPU trước, nếu không khả dụng thì tự động chuyển sang CPU |
| `cpu` | Luôn chạy bằng CPU |
| `gpu:0` | Chạy bằng GPU số 0 |

---

## Chạy trên Windows không có GPU

Trong `config/settings.py`:

```python
OCR_DEVICE = "cpu"
```

Hoặc chạy bằng PowerShell:

```bash
$env:OCR_DEVICE="cpu"
python main.py
```

---

## ⚡ Chạy trên máy có GPU

Trong `config/settings.py`:

```python
OCR_DEVICE = "gpu:0"
```

Hoặc chạy bằng PowerShell:

```bash
$env:OCR_DEVICE="gpu:0"
python main.py
```

---

## Chạy tự động fallback giữa GPU và CPU

```bash
$env:OCR_DEVICE="auto"
python main.py
```

Cách này phù hợp khi bạn muốn hệ thống tự kiểm tra thiết bị khả dụng để chạy OCR.

---

## Luồng xử lý chính của hệ thống

Hệ thống hoạt động theo quy trình:

1. Nhận hình ảnh từ camera hoặc luồng RTSP
2. Tiền xử lý ảnh trước khi OCR
3. Đọc nội dung văn bản từ ảnh
4. Parse và chuẩn hóa dữ liệu
5. Tạo kết quả JSON
6. Gửi dữ liệu về backend qua API

Ví dụ dữ liệu đầu ra:

```json
{
  "device_id": "station-monitor-01",
  "time": "2026-04-08 11:52:28",
  "source": "raw",
  "frequency_band": null,
  "max_frequency_hz": 4025.39,
  "max_decibel_db": 50.73,
  "raw": "Frequency:4025.39Hz Max, Decibe1:50.73dB",
  "corrected": "Frequency:4025.39Hz Max. Decibel:50.73dB"
}
```

> Lưu ý: OCR service chỉ có nhiệm vụ **gửi dữ liệu**. Muốn backend nhận được thì backend API phải đang chạy.

---

##  Chạy test

```bash
pytest tests/
```

Hoặc chạy từng test file:

```bash
pytest tests/test_parser.py
pytest tests/test_sender.py
```

---

## Mô tả các thành phần chính

| Thành phần | Chức năng |
|----------|----------|
| `main.py` | Điểm khởi chạy chính của service |
| `config/settings.py` | Cấu hình hệ thống |
| `src/camera/rtsp_capture.py` | Đọc luồng camera/RTSP |
| `src/ocr/preprocess.py` | Tiền xử lý ảnh trước OCR |
| `src/ocr/reader.py` | Thực hiện OCR |
| `src/ocr/parser.py` | Phân tích và chuẩn hóa nội dung OCR |
| `src/client/backend_sender.py` | Gửi dữ liệu JSON sang backend |
| `src/utils/image_utils.py` | Hàm tiện ích xử lý ảnh |
| `src/utils/text_utils.py` | Hàm tiện ích xử lý văn bản |
| `logs/app.log` | File log hệ thống |
| `tests/` | Các bài kiểm thử |
