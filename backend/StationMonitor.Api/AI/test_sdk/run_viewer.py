"""
Entry point: Chạy ứng dụng Video Viewer Desktop từ thư mục gốc.
    python run_viewer.py
"""
import os, sys

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT_DIR)

from apps.desktop_viewer.viewer import SDKVideoViewer
SDKVideoViewer().start()
