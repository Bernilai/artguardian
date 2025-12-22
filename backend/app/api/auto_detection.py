"""
Automatic damage detection API using ArtDet model.
This is an optional feature - manual detection remains the primary method.
"""
import logging
import os
import json
import tempfile
from typing import Dict, List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import User, Artifact, Detection, Ticket
from app.schemas import DetectionResponse
from app.services.artdet_service import get_artdet_service, is_artdet_available
from app.services.minio_service import minio_service
from app.api.tickets import create_ticket
from app.utils.notifications import create_notification

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/artifact/{artifact_id}/auto-detect", response_model=Dict)
async def auto_detect_damage(
    artifact_id: str,
    create_tickets: bool = False,
    min_confidence: float = 0.9,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> Dict:
    """
    Automatically detect damage in an artifact image using ArtDet model.
    
    This is an OPTIONAL feature. Manual detection remains the primary method.
    
    Args:
        artifact_id: ID of the artifact to analyze
        create_tickets: If True, automatically create tickets for detected damage
        min_confidence: Minimum confidence threshold (0.0-1.0)
        current_user: Current authenticated user
    
    Returns:
        Detection results with damage information
    """
    # Check if ArtDet is available
    if not is_artdet_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Automatic detection service is not available. Please use manual detection."
        )
    
    # Get artifact
    result = await db.execute(
        select(Artifact).where(Artifact.id == artifact_id)
    )
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found"
        )
    
    if not artifact.image_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Artifact has no image to analyze"
        )
    
    try:
        # Get ArtDet service
        artdet_service = get_artdet_service()
        if not artdet_service:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="ArtDet service not initialized"
            )
        
        # Download image from MinIO to temporary file
        image_path = artifact.image_path
        if image_path.startswith("artifacts/"):
            # Image is in MinIO
            tmp_path = None
            try:
                # Create temporary file
                with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp_file:
                    tmp_path = tmp_file.name
                    # Download from MinIO
                    object_data = minio_service.get_object(
                        bucket_name=minio_service.bucket_name,
                        object_name=image_path
                    )
                    # Read all data and write to file
                    image_data = object_data.read()
                    tmp_file.write(image_data)
                    tmp_file.flush()
                    # File is automatically closed when exiting the 'with' block
                
                # Run detection (file is now closed, safe to use)
                detection_results = artdet_service.detect_damage(
                    image_path=tmp_path,
                    min_confidence=min_confidence
                )
            finally:
                # Clean up temp file (ensure it's closed first)
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.unlink(tmp_path)
                    except (PermissionError, OSError) as cleanup_error:
                        # On Windows, file might still be in use - log but don't fail
                        logger.warning(f"Could not delete temporary file {tmp_path}: {cleanup_error}")
        else:
            # Image is a local file path
            if not os.path.exists(image_path):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Image file not found"
                )
            detection_results = artdet_service.detect_damage(
                image_path=image_path,
                min_confidence=min_confidence
            )
        
        # Create Detection records for each damage area
        created_detections = []
        if detection_results["detected"]:
            for i, damage_area in enumerate(detection_results["damage_areas"]):
                detection = Detection(
                    artifact_id=artifact_id,
                    detection_type="auto_detected_damage",  # Special type for auto-detection
                    description=f"Автоматически обнаруженное повреждение #{i+1}",
                    severity=_calculate_severity(
                        detection_results["damage_percentage"],
                        damage_area["confidence"]
                    ),
                    confidence=damage_area["confidence"],
                    location_bbox=json.dumps(damage_area["bbox"]),
                    area_pixels=0,  # Will be calculated if needed
                    area_percent=detection_results["damage_percentage"] / detection_results["damage_count"],
                    is_critical=detection_results["damage_percentage"] > 10.0,  # >10% is critical
                    detected_by_user_id=current_user.id,
                    image_path=artifact.image_path
                )
                db.add(detection)
                created_detections.append(detection)
            
            await db.commit()
            
            # Refresh detections to get IDs
            for detection in created_detections:
                await db.refresh(detection)
            
            # Optionally create tickets
            if create_tickets and detection_results["damage_percentage"] > 5.0:
                # Create ticket for significant damage
                ticket_title = f"Автоматически обнаружено повреждение: {detection_results['damage_percentage']:.1f}%"
                ticket_description = (
                    f"Автоматический анализ выявил {detection_results['damage_count']} "
                    f"областей повреждения общей площадью {detection_results['damage_percentage']:.1f}% изображения."
                )
                
                # Create ticket via tickets API
                from app.schemas import TicketCreate
                ticket_data = TicketCreate(
                    artifact_id=artifact_id,
                    title=ticket_title,
                    description=ticket_description,
                    priority="high" if detection_results["damage_percentage"] > 10.0 else "medium"
                )
                
                # Note: We can't directly call create_ticket here due to circular imports
                # Instead, we'll create the ticket manually
                from datetime import datetime, timezone
                ticket = Ticket(
                    artifact_id=artifact_id,
                    title=ticket_title,
                    description=ticket_description,
                    priority="high" if detection_results["damage_percentage"] > 10.0 else "medium",
                    created_by_id=current_user.id,
                    status="open"
                )
                db.add(ticket)
                await db.commit()
                await db.refresh(ticket)
                
                # Update artifact status if needed
                if artifact.status == "no_defects":
                    artifact.status = "requires_attention"
                    db.add(artifact)
                    await db.commit()
                
                # Notify restorers
                await create_notification(
                    db=db,
                    user_id=None,  # All restorers
                    notification_type="ticket_created_unassigned",
                    title="Автоматически создан тикет",
                    message=f"Тикет '{ticket.title}' создан на основе автоматического анализа артефакта '{artifact.title}'.",
                    related_entity_type="ticket",
                    related_entity_id=ticket.id,
                    priority=ticket.priority
                )
        
        return {
            "success": True,
            "detected": detection_results["detected"],
            "damage_count": detection_results["damage_count"],
            "damage_percentage": detection_results["damage_percentage"],
            "detections_created": len(created_detections),
            "ticket_created": create_tickets and detection_results["damage_percentage"] > 5.0,
            "detection_ids": [d.id for d in created_detections]
        }
        
    except Exception as e:
        logger.error(f"Error in automatic detection: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось выполнить автоматический анализ изображения. Пожалуйста, используйте ручное обнаружение повреждений."
        )


def _calculate_severity(damage_percentage: float, confidence: float) -> str:
    """Calculate severity based on damage percentage and confidence."""
    if damage_percentage > 10.0:
        return "high"
    elif damage_percentage > 5.0:
        return "medium"
    else:
        return "low"


@router.get("/status")
async def get_auto_detection_status(
    current_user: User = Depends(get_current_active_user)
) -> Dict:
    """Check if automatic detection service is available."""
    return {
        "available": is_artdet_available(),
        "message": "Automatic detection is available" if is_artdet_available() 
                  else "Automatic detection is not available. Please use manual detection."
    }

