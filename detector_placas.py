"""
detector_placas.py — Detección de vehículos + placas colombianas para Parking IA
Pipeline: YOLOv8n (vehículos) → bbox +20% → contornos → EasyOCR → validación placa

Dependencias: pip install -r requirements.txt
"""

import cv2
import numpy as np
import easyocr
import re
import os
import json
import time
import argparse
import requests
from datetime import datetime
from ultralytics import YOLO

try:
    import torch
    GPU_AVAILABLE = torch.cuda.is_available()
except ImportError:
    GPU_AVAILABLE = False

print(f"[info] Dispositivo: {'GPU (CUDA)' if GPU_AVAILABLE else 'CPU'}")

DEFAULT_VIDEO = os.environ.get("DETECTOR_DEFAULT_VIDEO", "carro1.mp4")

# Clases YOLO COCO → etiqueta interna
VEHICLE_MAP = {
    "car":        "carro",
    "truck":      "carro",
    "motorcycle": "moto",
    "bus":        "taxi",
}

# Formatos de placa colombiana:
#   Carro/camión/taxi:  ABC123  (3 letras + 3 dígitos)
#   Moto:               ABC12D  (3 letras + 2 dígitos + 1 letra)
_PLATE_RE = {
    "carro": re.compile(r"^[A-Z]{3}\d{3}$"),
    "moto":  re.compile(r"^[A-Z]{3}\d{2}[A-Z]$"),
}


def _plate_type(cleaned: str) -> str | None:
    """Retorna 'carro' o 'moto' si el texto es placa colombiana válida, else None."""
    for ptype, pattern in _PLATE_RE.items():
        if pattern.match(cleaned):
            return ptype
    return None

PARKING_API = os.environ.get("PARKING_API_URL", "http://localhost:3000/parking/entry")
PARKING_TENANT_ID = int(os.environ.get("PARKING_TENANT_ID", "1"))

# Colores de bbox según resultado del POST (BGR)
POST_COLORS = {
    "ok":        (0, 220, 0),    # verde  — registrado con éxito
    "duplicate": (255, 100, 0),  # azul   — ya está adentro (409)
    "error":     (0, 0, 220),    # rojo   — fallo de red / 5xx
}

# Colores neutros mientras no hay POST (por tipo de vehículo)
VEHICLE_COLORS = {
    "carro": (180, 180, 180),
    "moto":  (180, 180, 180),
    "taxi":  (180, 180, 180),
}


def _validate_plate(text: str) -> tuple[bool, str]:
    cleaned = re.sub(r"[^A-Z0-9]", "", text.upper())
    return _plate_type(cleaned) is not None, cleaned


def _expand_bbox(x1: int, y1: int, x2: int, y2: int,
                 frame_h: int, frame_w: int, pct: float = 0.20) -> tuple[int, int, int, int]:
    """Amplía el bbox un % hacia cada lado sin salirse del frame."""
    dw = int((x2 - x1) * pct)
    dh = int((y2 - y1) * pct)
    return (
        max(0, x1 - dw),
        max(0, y1 - dh),
        min(frame_w, x2 + dw),
        min(frame_h, y2 + dh),
    )


def _sharpness(gray: np.ndarray) -> float:
    """Varianza del Laplaciano — a menor valor, más borrosa la imagen (motion blur)."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _preprocess_roi(roi: np.ndarray) -> np.ndarray:
    # 1. Escala de grises
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    # 2. Resize 3x — resolución suficiente para caracteres de placa pequeños
    h, w = gray.shape
    gray = cv2.resize(gray, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
    # 3. CLAHE — normaliza contraste sin saturar zonas brillantes
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    enhanced = clahe.apply(gray)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    return cv2.filter2D(enhanced, -1, kernel)


def _find_plate_candidates(roi: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Detecta regiones candidatas a placa dentro de un ROI de vehículo."""
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    candidates: list[tuple[int, int, int, int]] = []

    for lo in (80, 120, 180):
        edges = cv2.Canny(blurred, lo, lo * 2)
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, k)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if h == 0:
                continue
            aspect = w / h
            area = w * h
            if 1.5 < aspect < 5.5 and 800 < area < 60000:
                if not any(abs(cx - x) < 20 and abs(cy - y) < 20 for cx, cy, *_ in candidates):
                    candidates.append((x, y, w, h))

    return candidates


class PlateDetector:
    def __init__(self, output_dir: str = "detecciones", save: bool = True,
                 vehicle_conf: float = 0.5, min_sharpness: float = 60.0):
        print("[init] Cargando YOLOv8n (primera vez descarga ~6 MB)...")
        self.yolo = YOLO("yolov8n.pt")
        self.vehicle_conf = vehicle_conf
        self.min_sharpness = min_sharpness

        print("[init] Cargando modelo OCR (primera vez descarga ~200 MB)...")
        self.reader = easyocr.Reader(["es", "en"], gpu=GPU_AVAILABLE, verbose=False)

        self.output_dir = output_dir
        self.save = save
        self.session_log: list[dict] = []
        self._last_seen: dict[str, datetime] = {}   # placa → última vez registrada
        self._plate_status: dict[str, str] = {}     # placa → "ok" | "duplicate" | "error"

        if save:
            os.makedirs(output_dir, exist_ok=True)

        print("[init] Listo.\n")

    # ------------------------------------------------------------------ #
    # HTTP: registrar entrada en el backend
    # ------------------------------------------------------------------ #

    def _post_entry(self, plate: str) -> str:
        """POST /parking/entry. Retorna 'ok', 'duplicate' o 'error'."""
        try:
            r = requests.post(
                PARKING_API,
                json={"plate": plate, "tenantId": PARKING_TENANT_ID},
                timeout=3,
            )
            if r.status_code in (200, 201):
                return "ok"
            if r.status_code == 409:
                return "duplicate"
            return "error"
        except requests.RequestException:
            return "error"

    # ------------------------------------------------------------------ #
    # YOLO: detectar vehículos
    # ------------------------------------------------------------------ #

    def _detect_vehicles(self, frame: np.ndarray) -> list[dict]:
        """Retorna lista de vehículos detectados con bbox expandido 20%."""
        h, w = frame.shape[:2]
        vehicles = []

        yolo_results = self.yolo(frame, conf=self.vehicle_conf, verbose=False)
        for r in yolo_results:
            for box in r.boxes:
                cls_name = self.yolo.names[int(box.cls)]
                if cls_name not in VEHICLE_MAP:
                    continue
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                ex1, ey1, ex2, ey2 = _expand_bbox(x1, y1, x2, y2, h, w, pct=0.20)
                vehicles.append({
                    "type":       VEHICLE_MAP[cls_name],
                    "yolo_class": cls_name,
                    "yolo_conf":  round(float(box.conf), 3),
                    "bbox_orig":  [x1, y1, x2, y2],
                    "bbox_exp":   [ex1, ey1, ex2, ey2],
                })

        return vehicles

    # ------------------------------------------------------------------ #
    # OCR dentro del ROI de cada vehículo
    # ------------------------------------------------------------------ #

    def _read_plate_from_roi(self, roi: np.ndarray) -> tuple[str, float] | None:
        """Extrae la primera placa colombiana válida del ROI. Retorna (placa, conf) o None."""
        # La placa está en la mitad inferior del vehículo; descartar la mitad superior
        roi = roi[roi.shape[0] // 2 :, :]

        for (x, y, w, h) in _find_plate_candidates(roi):
            pad = 4
            x1, y1 = max(0, x - pad), max(0, y - pad)
            x2, y2 = min(roi.shape[1], x + w + pad), min(roi.shape[0], y + h + pad)
            crop = roi[y1:y2, x1:x2]
            if crop.size == 0:
                continue

            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            if _sharpness(gray) < self.min_sharpness:
                continue  # candidato borroso (motion blur) — no vale la pena leerlo

            processed = _preprocess_roi(crop)
            ocr_out = self.reader.readtext(
                processed,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                detail=1,
                paragraph=False,
            )
            for (_, text, conf) in ocr_out:
                if conf < 0.4:
                    continue
                valid, plate = _validate_plate(text)
                if valid:
                    return plate, round(float(conf), 3)

        return None

    # ------------------------------------------------------------------ #
    # Detección completa de un frame
    # ------------------------------------------------------------------ #

    def detect(self, frame: np.ndarray) -> list[dict]:
        """Pipeline completo: YOLO → ROI +20% → OCR placa. Retorna lista de dicts."""
        results = []
        for vehicle in self._detect_vehicles(frame):
            ex1, ey1, ex2, ey2 = vehicle["bbox_exp"]
            roi = frame[ey1:ey2, ex1:ex2]
            if roi.size == 0:
                continue

            plate_result = self._read_plate_from_roi(roi)
            entry = {
                "vehicle_type": vehicle["type"],
                "yolo_class":   vehicle["yolo_class"],
                "yolo_conf":    vehicle["yolo_conf"],
                "bbox":         vehicle["bbox_orig"],
                "bbox_expanded": vehicle["bbox_exp"],
                "plate":        None,
                "plate_conf":   None,
                "timestamp":    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            if plate_result:
                entry["plate"], entry["plate_conf"] = plate_result
            results.append(entry)

        return results

    # ------------------------------------------------------------------ #
    # Dibujo
    # ------------------------------------------------------------------ #

    def _draw(self, frame: np.ndarray, results: list[dict]) -> np.ndarray:
        for r in results:
            x1, y1, x2, y2 = r["bbox"]
            ex1, ey1, ex2, ey2 = r["bbox_expanded"]

            # Color según último POST; gris neutro si aún no se ha enviado
            plate = r.get("plate")
            status = self._plate_status.get(plate) if plate else None
            color = POST_COLORS.get(status, VEHICLE_COLORS.get(r["vehicle_type"], (180, 180, 180)))

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.rectangle(frame, (ex1, ey1), (ex2, ey2), color, 1)

            vtype = r["vehicle_type"].upper()
            if plate:
                status_tag = {"ok": "OK", "duplicate": "YA DENTRO", "error": "ERR"}.get(status, "")
                label = f"{vtype}  {plate}  {status_tag}"
            else:
                label = f"{vtype}  {r['yolo_conf']:.0%}  [sin placa]"

            # Fondo oscuro para legibilidad
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.62, 2)
            cv2.rectangle(frame, (x1, y1 - th - 12), (x1 + tw + 4, y1 - 2), (0, 0, 0), -1)
            cv2.putText(frame, label, (x1 + 2, y1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.62, color, 2)

        return frame

    def _log(self, results: list[dict]) -> list[dict]:
        """Registra cada placa nueva del frame (uno por uno) y retorna las que sí se procesaron."""
        now = datetime.now()
        logged: list[dict] = []
        for r in results:
            if not r["plate"]:
                continue
            plate = r["plate"]
            last = self._last_seen.get(plate)
            if last and (now - last).total_seconds() < 30:
                continue  # cooldown: misma placa ignorada por 30 s
            self._last_seen[plate] = now

            # El patrón de placa es más confiable que la clase YOLO para determinar el tipo.
            # ABC123 → carro, ABC12D → moto (mismo criterio que el backend)
            ptype = _plate_type(plate)
            if ptype:
                r["vehicle_type"] = ptype

            status = self._post_entry(plate)
            self._plate_status[plate] = status
            r["post_status"] = status
            self.session_log.append(r)
            logged.append(r)

            status_label = {"ok": "REGISTRADO", "duplicate": "YA ADENTRO", "error": "ERROR API"}
            print(f"  {r['vehicle_type'].upper():5}  {plate}  "
                  f"conf={r['plate_conf']:.0%}  [{status_label[status]}]  {r['timestamp']}")
        return logged

    # ------------------------------------------------------------------ #
    # Modos de entrada
    # ------------------------------------------------------------------ #

    def process_image(self, path: str) -> list[dict]:
        frame = cv2.imread(path)
        if frame is None:
            print(f"[error] No se pudo leer: {path}")
            return []

        print(f"[imagen] Procesando {path}")
        results = self.detect(frame)
        annotated = self._draw(frame.copy(), results)

        if results:
            self._log(results)
        else:
            print("  No se detectaron vehículos.")

        if self.save and results:
            out = os.path.join(self.output_dir, f"det_{os.path.basename(path)}")
            cv2.imwrite(out, annotated)
            print(f"[guardado] {out}")

        cv2.imshow("Parking IA — Detector", annotated)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
        return results

    def process_video(self, source=DEFAULT_VIDEO) -> None:
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"[error] No se pudo abrir: {source}")
            return

        label = "cámara" if isinstance(source, int) else os.path.basename(str(source))
        fps_src = cap.get(cv2.CAP_PROP_FPS) or 30
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        print(f"[video] {label}  {fps_src:.0f} fps  {total} frames — presiona Q para salir")

        frame_n = 0
        process_every = max(1, int(fps_src / 6))  # ~6 inferencias/seg
        last_results: list[dict] = []
        device_label = "GPU" if GPU_AVAILABLE else "CPU"

        # FPS en pantalla
        fps_display = 0.0
        fps_t0 = time.perf_counter()
        fps_count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_n += 1
            fps_count += 1

            logged: list[dict] = []
            if frame_n % process_every == 0:
                last_results = self.detect(frame)
                if last_results:
                    logged = self._log(last_results)

            # Actualizar FPS cada 0.5 s
            elapsed = time.perf_counter() - fps_t0
            if elapsed >= 0.5:
                fps_display = fps_count / elapsed
                fps_count = 0
                fps_t0 = time.perf_counter()

            display = self._draw(frame.copy(), last_results)

            # HUD: FPS + dispositivo + leyenda de colores
            hud = (f"FPS {fps_display:5.1f}  [{device_label}]  "
                   f"frame {frame_n}/{total}  |  Q salir")
            cv2.rectangle(display, (0, 0), (len(hud) * 9 + 8, 36), (0, 0, 0), -1)
            cv2.putText(display, hud, (6, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 1)

            # Leyenda de colores
            leyenda = [("REGISTRADO", POST_COLORS["ok"]),
                       ("YA ADENTRO", POST_COLORS["duplicate"]),
                       ("ERROR",      POST_COLORS["error"])]
            for i, (txt, col) in enumerate(leyenda):
                y = 60 + i * 22
                cv2.rectangle(display, (6, y - 13), (18, y + 3), col, -1)
                cv2.putText(display, txt, (24, y), cv2.FONT_HERSHEY_SIMPLEX, 0.52, col, 1)

            cv2.imshow("Parking IA — Detector", display)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

            # Ya se registraron todos los carros presentes en este frame (uno por uno);
            # cerrar de una vez para no seguir procesando frames de más.
            if logged:
                plates = ", ".join(r["plate"] for r in logged)
                print(f"[cierre] {len(logged)} placa(s) registrada(s) en este frame ({plates}) — cerrando video.")
                break

        cap.release()
        cv2.destroyAllWindows()
        self._save_log()

    def _save_log(self) -> None:
        count = len(self.session_log)
        print(f"\n[resumen] {count} detección(es) con placa en esta sesión.")
        if not self.save or not self.session_log:
            return
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = os.path.join(self.output_dir, f"log_{ts}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.session_log, f, ensure_ascii=False, indent=2)
        print(f"[guardado] Log → {path}")


# ------------------------------------------------------------------ #
# CLI
# ------------------------------------------------------------------ #

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Detector de vehículos + placas colombianas — Parking IA",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Ejemplos:
  python detector_placas.py                        # usa {DEFAULT_VIDEO}
  python detector_placas.py --video otra.mp4
  python detector_placas.py --imagen foto.jpg
  python detector_placas.py --camara --camara-id 0
        """,
    )
    src = parser.add_mutually_exclusive_group()
    src.add_argument("--imagen",    metavar="RUTA", help="Procesar imagen estática")
    src.add_argument("--video",     metavar="RUTA", help="Procesar archivo de video")
    src.add_argument("--camara",    action="store_true", help="Usar webcam")
    parser.add_argument("--camara-id",  type=int, default=0, metavar="N")
    parser.add_argument("--conf",       type=float, default=0.5,
                        help="Confianza mínima YOLO (default: 0.5)")
    parser.add_argument("--nitidez",    type=float, default=60.0, metavar="N",
                        help="Umbral mínimo de nitidez (varianza Laplaciano) para intentar OCR "
                             "en un candidato a placa; súbelo si aceptas lecturas borrosas, "
                             "bájalo si descarta placas válidas (default: 60.0)")
    parser.add_argument("--salida",     default="detecciones", metavar="DIR")
    parser.add_argument("--no-guardar", action="store_true")
    args = parser.parse_args()

    detector = PlateDetector(
        output_dir=args.salida,
        save=not args.no_guardar,
        vehicle_conf=args.conf,
        min_sharpness=args.nitidez,
    )

    if args.imagen:
        detector.process_image(args.imagen)
    elif args.video:
        detector.process_video(source=args.video)
    elif args.camara:
        detector.process_video(source=args.camara_id)
    else:
        detector.process_video(source=DEFAULT_VIDEO)


if __name__ == "__main__":
    main()