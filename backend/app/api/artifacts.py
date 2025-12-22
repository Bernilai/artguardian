from typing import List, Optional
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.models import Artifact
from app.schemas import ArtifactCreate, ArtifactResponse
from app.dependencies import get_current_active_user, get_optional_current_user
from app.models import User
from app.services.minio_service import minio_service
from app.utils.notifications import (
    notify_artifact_created,
    notify_artifact_status_changed
)

logger = logging.getLogger(__name__)

router = APIRouter()


def transform_artifact_response(artifact: Artifact, current_user: Optional[User] = None) -> dict:
    """Transform database artifact to frontend format"""
    dimensions = None
    if artifact.dimensions:
        try:
            dimensions = json.loads(artifact.dimensions)
        except (json.JSONDecodeError, TypeError):
            dimensions = {"width": 0, "height": 0, "unit": "cm"}
    
    materials = []
    if artifact.materials:
        try:
            materials = json.loads(artifact.materials)
            if not isinstance(materials, list):
                materials = [materials] if materials else []
        except (json.JSONDecodeError, TypeError):
            materials = []
    
    images = []
    if artifact.image_path:
        if artifact.image_path.startswith('http://') or artifact.image_path.startswith('https://'):
            images = [artifact.image_path]
        else:
            try:
                from datetime import timedelta
                presigned_url = minio_service.get_presigned_url(
                    artifact.image_path,
                    expires=timedelta(days=7)
                )
                images = [presigned_url]
            except Exception as e:
                logger.warning(f"Could not generate presigned URL for {artifact.image_path}: {e}")
                try:
                    images = [minio_service.get_public_url(artifact.image_path)]
                except Exception:
                    images = [artifact.image_path]
    
    show_inspection_info = current_user and current_user.role in ["restorer", "curator", "admin"]
    
    result = {
        "id": artifact.id,
        "title": artifact.title,
        "description": artifact.description or "",
        "inventoryNumber": artifact.inventory_number,
        "collection": artifact.collection,
        "status": artifact.status,
        "currentLocation": artifact.current_location or "",
        "images": images,
        "defects": [],  # Will be populated from detections if needed
        "dimensions": dimensions or {"width": 0, "height": 0, "unit": "cm"},
        "materials": materials,
        "tags": [],
        "createdBy": "",
        "createdAt": artifact.created_at.isoformat() if artifact.created_at else "",
        "updatedAt": artifact.updated_at.isoformat() if artifact.updated_at else "",
        "creationDate": artifact.creation_date or "",
        "restorationHistory": []
    }
    
    if show_inspection_info:
        result["lastInspection"] = artifact.last_inspection.isoformat() if artifact.last_inspection else ""
        if artifact.last_inspector:
            result["lastInspector"] = artifact.last_inspector.name
        else:
            result["lastInspector"] = None
    
    return result


@router.get("/")
async def get_all_artifacts(
    q: Optional[str] = Query(None, description="Search query for artifact name"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
) -> List[dict]:
    """Get all artifacts, optionally filtered by name"""
    from sqlalchemy.orm import selectinload
    
    query = select(Artifact).options(selectinload(Artifact.last_inspector))
    
    if q:
        query = query.where(Artifact.title.ilike(f"%{q}%"))
    
    result = await db.execute(query)
    artifacts = result.scalars().all()
    return [transform_artifact_response(artifact, current_user) for artifact in artifacts]

@router.get("/{artifact_id}")
async def get_artifact(
    artifact_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Get artifact by ID"""
    from sqlalchemy.orm import selectinload
    
    result = await db.execute(
        select(Artifact)
        .options(selectinload(Artifact.last_inspector))
        .where(Artifact.id == artifact_id)
    )
    artifact = result.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return transform_artifact_response(artifact, current_user)

@router.post("/", response_model=dict)
async def create_artifact(
    artifact_data: ArtifactCreate,
    current_user: User = Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db)
) -> dict:
    """Create a new artifact"""
    try:
        result = await db.execute(
            select(Artifact).where(
                Artifact.inventory_number == artifact_data.inventory_number
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Artifact with inventory number {artifact_data.inventory_number} already exists"
            )
        
        def map_status_to_backend(frontend_status: Optional[str]) -> str:
            if not frontend_status:
                return "no_defects"
            
            status_mapping = {
                'good': 'no_defects',
                'requires_attention': 'requires_attention',
                'critical': 'has_defects',
                'under_restoration': 'under_restoration',
                'exhibited': 'exhibited'
            }
            
            return status_mapping.get(frontend_status, 'no_defects')
        
        artifact = Artifact(
            title=artifact_data.title,
            description=artifact_data.description,
            inventory_number=artifact_data.inventory_number,
            collection=artifact_data.collection,
            current_location=artifact_data.current_location,
            dimensions=artifact_data.dimensions,
            materials=artifact_data.materials,
            image_path=artifact_data.image_path,
            status=map_status_to_backend(artifact_data.status),
            creation_date=artifact_data.creation_date
        )
        
        db.add(artifact)
        await db.commit()
        await db.refresh(artifact)
        
        logger.info(f"Created artifact: {artifact.id} - {artifact.title}")
        
        await notify_artifact_created(
            db=db,
            artifact_id=artifact.id,
            artifact_title=artifact.title
        )
        await db.commit()
        
        return transform_artifact_response(artifact, current_user)
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating artifact: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create artifact: {str(e)}"
        )


@router.put("/{artifact_id}", response_model=dict)
async def update_artifact(
    artifact_id: str,
    artifact_data: ArtifactCreate,
    current_user: User = Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db)
) -> dict:
    """Update an existing artifact"""
    try:
        result = await db.execute(select(Artifact).where(Artifact.id == artifact_id))
        artifact = result.scalar_one_or_none()
        if not artifact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Artifact not found"
            )
        
        if artifact_data.inventory_number != artifact.inventory_number:
            result = await db.execute(
                select(Artifact).where(
                    Artifact.inventory_number == artifact_data.inventory_number,
                    Artifact.id != artifact_id
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Artifact with inventory number {artifact_data.inventory_number} already exists"
                )
        
        def map_status_to_backend(frontend_status: Optional[str], current_status: str) -> str:
            if not frontend_status:
                return current_status
            
            status_mapping = {
                'good': 'no_defects',
                'requires_attention': 'requires_attention',
                'critical': 'has_defects',
                'under_restoration': 'under_restoration',
                'exhibited': 'exhibited'
            }
            
            return status_mapping.get(frontend_status, current_status)
        
        old_status = artifact.status
        
        artifact.title = artifact_data.title
        artifact.description = artifact_data.description
        artifact.inventory_number = artifact_data.inventory_number
        artifact.collection = artifact_data.collection
        artifact.current_location = artifact_data.current_location
        artifact.dimensions = artifact_data.dimensions
        artifact.materials = artifact_data.materials
        new_status = map_status_to_backend(artifact_data.status, artifact.status)
        artifact.status = new_status
        if artifact_data.creation_date is not None:
            artifact.creation_date = artifact_data.creation_date
        
        if artifact_data.image_path:
            if artifact.image_path and artifact.image_path != artifact_data.image_path:
                try:
                    minio_service.delete_object(artifact.image_path)
                except Exception as e:
                    logger.warning(f"Could not delete old image: {e}")
            artifact.image_path = artifact_data.image_path
        
        artifact.updated_at = datetime.now(timezone.utc)
        
        await db.commit()
        await db.refresh(artifact)
        
        if old_status != new_status:
            await notify_artifact_status_changed(
                db=db,
                artifact_id=artifact.id,
                artifact_title=artifact.title,
                old_status=old_status,
                new_status=new_status
            )
            await db.commit()
        
        logger.info(f"Updated artifact: {artifact.id} - {artifact.title}")
        return transform_artifact_response(artifact, current_user)
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating artifact: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update artifact: {str(e)}"
        )


@router.delete("/{artifact_id}")
async def delete_artifact(
    artifact_id: str,
    current_user: User = Depends(get_current_active_user),
        db: AsyncSession = Depends(get_db)
):
    """Delete an artifact"""
    try:
        result = await db.execute(select(Artifact).where(Artifact.id == artifact_id))
        artifact = result.scalar_one_or_none()
        if not artifact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Artifact not found"
            )
        
        if artifact.image_path:
            try:
                minio_service.delete_object(artifact.image_path)
            except Exception as e:
                logger.warning(f"Could not delete image from MinIO: {e}")
        
        db.delete(artifact)
        await db.commit()
        
        logger.info(f"Deleted artifact: {artifact_id}")
        return {"success": True, "message": "Artifact deleted successfully"}
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting artifact: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete artifact: {str(e)}"
        )


@router.post("/{artifact_id}/inspect")
async def inspect_artifact(
    artifact_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """Record artifact inspection (restorers and curators only)"""
    if current_user.role not in ["restorer", "curator", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only restorers and curators can inspect artifacts"
        )
    
    result = await db.execute(select(Artifact).where(Artifact.id == artifact_id))
    artifact = result.scalar_one_or_none()
    
    if not artifact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found"
        )
    
    artifact.last_inspection = datetime.now(timezone.utc)
    artifact.last_inspector_id = current_user.id
    artifact.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    await db.refresh(artifact)
    
    logger.info(f"Artifact {artifact_id} inspected by {current_user.id}")
    return transform_artifact_response(artifact, current_user)