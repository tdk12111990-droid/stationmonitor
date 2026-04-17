"""
Entry point: Chạy ứng dụng Web Dashboard từ thư mục gốc.
    python run_web.py
"""
import os, sys

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT_DIR)

# Import và chạy Flask server từ apps/web_app
from apps.web_app import server
