from fastapi import APIRouter
from app.database import get_connection

router = APIRouter()


@router.get("/health")
def health():
    """Ping Oracle pour vérifier l'état du pool."""
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1 FROM DUAL")
            cur.fetchone()
            cur.close()
        return {"status": "ok", "oracle": "up"}
    except Exception as e:
        return {"status": "degraded", "oracle": "down", "error": str(e)}
