import cv2

from config.settings import PREPROCESS_PARAMS


def preprocess_for_ocr(roi):
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

    scale = PREPROCESS_PARAMS.get("scale", 1.0)
    if scale and scale != 1.0:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    if PREPROCESS_PARAMS.get("clahe", False):
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)

    blur_method = PREPROCESS_PARAMS.get("blur_method", "none")
    blur_ksize = PREPROCESS_PARAMS.get("blur_ksize", 3)

    if blur_ksize % 2 == 0:
        blur_ksize += 1

    if blur_method == "gaussian":
        gray = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)
    elif blur_method == "bilateral":
        gray = cv2.bilateralFilter(gray, blur_ksize, 40, 40)
    elif blur_method == "median":
        gray = cv2.medianBlur(gray, blur_ksize)

    thresh_method = PREPROCESS_PARAMS.get("thresh_method", "none")

    if thresh_method == "fixed":
        thresh_val = PREPROCESS_PARAMS.get("thresh_val", 180)
        _, th = cv2.threshold(gray, thresh_val, 255, cv2.THRESH_BINARY)
    elif thresh_method == "otsu":
        _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    elif thresh_method == "adaptive":
        adaptive_block = PREPROCESS_PARAMS.get("adaptive_block", 31)
        adaptive_c = PREPROCESS_PARAMS.get("adaptive_c", 7)

        if adaptive_block % 2 == 0:
            adaptive_block += 1

        th = cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            adaptive_block,
            adaptive_c,
        )
    else:
        th = gray

    morph_op = PREPROCESS_PARAMS.get("morph_op", "none")
    morph_ksize = PREPROCESS_PARAMS.get("morph_ksize", 2)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (morph_ksize, morph_ksize))

    if morph_op == "dilate":
        th = cv2.dilate(th, kernel, iterations=1)
    elif morph_op == "erode":
        th = cv2.erode(th, kernel, iterations=1)
    elif morph_op == "close":
        th = cv2.morphologyEx(th, cv2.MORPH_CLOSE, kernel, iterations=1)
    elif morph_op == "open":
        th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)

    return cv2.cvtColor(th, cv2.COLOR_GRAY2BGR)