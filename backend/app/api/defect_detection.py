import logging
import os
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import Detection, User
from app.schemas import DetectionResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/artifact/{artifact_id}")
async def get_artifact_detections(
    artifact_id: str,
    skip: int = 0,
    limit: int = 10,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> List[DetectionResponse]:
    """Получение всех детектирований для произведения"""

    result = await db.execute(
        select(Detection)
        .where(Detection.artifact_id == artifact_id)
        .offset(skip)
        .limit(limit)
    )
    detections = result.scalars().all()

    return [DetectionResponse.model_validate(d) for d in detections]


@router.get("/results/{detection_id}")
async def get_detection_result(
    detection_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> DetectionResponse:
    """Получение результата детектирования"""

    result = await db.execute(select(Detection).where(Detection.id == detection_id))
    detection = result.scalar_one_or_none()

    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    return DetectionResponse.model_validate(detection)


@router.delete("/{detection_id}")
async def delete_detection(
    detection_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Dict:
    """Удаление результата детектирования"""

    result = await db.execute(select(Detection).where(Detection.id == detection_id))
    detection = result.scalar_one_or_none()

    if not detection:
        raise HTTPException(status_code=404, detail="Detection not found")

    image_path = detection.image_path
    if image_path is not None and os.path.exists(str(image_path)):
        os.remove(str(image_path))

    await db.delete(detection)
    await db.commit()

    logger.info(f"Detection {detection_id} deleted")

    return {"status": "success", "message": "Detection deleted"}
