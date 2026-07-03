"""
Backup diario de parkingdb.

Flujo:
  1. Ejecuta pg_dump dentro del contenedor Docker (no requiere PostgreSQL local).
  2. Guarda el .sql en backups/ con nombre backup_YYYY-MM-DD_HH-mm.sql
  3. Elimina archivos con más de 7 días.
  4. Registra cada operación en backups/backup.log

Uso manual:   python backup.py
Programado:   ver programar_backup.bat
"""

import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ── Configuración ──────────────────────────────────────────────────────────
CONTAINER      = "parking-ia-db"
DB_USER        = "parkinguser"
DB_PASS        = "parkingpass"
DB_NAME        = "parkingdb"
BACKUPS_DIR    = Path(r"C:\Users\kevin\Documents\parking-ia\backups")
LOG_FILE       = BACKUPS_DIR / "backup.log"
RETENTION_DAYS = 7


def log(msg: str) -> None:
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def run_backup() -> bool:
    filename = datetime.now().strftime("backup_%Y-%m-%d_%H-%M.sql")
    dest = BACKUPS_DIR / filename

    # pg_dump corre dentro del contenedor; stdout es el volcado SQL
    cmd = [
        "docker", "exec",
        "-e", f"PGPASSWORD={DB_PASS}",
        CONTAINER,
        "pg_dump",
        "-U", DB_USER,
        "-d", DB_NAME,
        "--no-password",
    ]

    log(f"Iniciando backup -> {filename}")
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError:
        log("ERROR: comando 'docker' no encontrado. ¿Docker Desktop está instalado y corriendo?")
        return False
    except Exception as exc:
        log(f"ERROR inesperado al lanzar docker: {exc}")
        return False

    if result.returncode != 0:
        error = result.stderr.decode("utf-8", errors="replace").strip()
        log(f"ERROR: pg_dump terminó con código {result.returncode}: {error}")
        return False

    if not result.stdout:
        log("ERROR: pg_dump no devolvió contenido. Verifica que el contenedor esté corriendo.")
        return False

    dest.write_bytes(result.stdout)
    size_kb = dest.stat().st_size // 1024
    log(f"OK: {filename} guardado ({size_kb} KB)")
    return True


def purge_old_backups() -> None:
    cutoff = datetime.now() - timedelta(days=RETENTION_DAYS)
    deleted = []
    for f in BACKUPS_DIR.glob("backup_*.sql"):
        if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
            f.unlink()
            deleted.append(f.name)

    if deleted:
        log(f"Limpieza: {len(deleted)} archivo(s) eliminado(s): {', '.join(deleted)}")
    else:
        log(f"Limpieza: sin archivos de más de {RETENTION_DAYS} días")


def main() -> int:
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    log("=" * 60)

    ok = run_backup()
    purge_old_backups()

    log("Proceso terminado" + (" exitosamente" if ok else " CON ERRORES"))
    log("=" * 60)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
