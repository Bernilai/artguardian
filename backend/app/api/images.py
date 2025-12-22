"""
Image upload and serving endpoints
"""
import logging
from typing import List
from datetime import timedelta
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_active_user
from app.models import User
from app.services.minio_service import minio_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = "artifacts",
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Upload an image file to MinIO
    
    Args:
        file: Image file to upload
        folder: Folder in bucket (artifacts, defects, etc.)
        current_user: Current authenticated user
    
    Returns:
        Object path and URL
    """
    # Validate file type
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    # Validate file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    file_data = await file.read()
    if len(file_data) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 10MB limit"
        )
    
    try:
        # Upload to MinIO
        object_path = minio_service.upload_image(
            file_data=file_data,
            filename=file.filename or "image.jpg",
            content_type=file.content_type or "image/jpeg",
            folder=folder
        )
        
        # Generate presigned URL (valid for 7 days)
        presigned_url = minio_service.get_presigned_url(object_path)
        
        # Also return public URL if available
        public_url = minio_service.get_public_url(object_path)
        
        return {
            "object_path": object_path,
            "url": presigned_url,
            "public_url": public_url,
            "filename": file.filename
        }
        
    except Exception as e:
        logger.error(f"Error uploading image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload image: {str(e)}"
        )


@router.post("/upload-multiple")
async def upload_multiple_images(
    files: List[UploadFile] = File(...),
    folder: str = "artifacts",
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Upload multiple image files to MinIO
    
    Args:
        files: List of image files to upload
        folder: Folder in bucket
        current_user: Current authenticated user
    
    Returns:
        List of uploaded image info
    """
    allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    max_size = 10 * 1024 * 1024  # 10MB
    
    results = []
    
    for file in files:
        # Validate file type
        if file.content_type not in allowed_types:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": f"Invalid file type: {file.content_type}"
            })
            continue
        
        # Validate file size
        file_data = await file.read()
        if len(file_data) > max_size:
            results.append({
                "filename": file.filename,
                "success": False,
                "error": "File size exceeds 10MB limit"
            })
            continue
        
        try:
            # Upload to MinIO
            object_path = minio_service.upload_image(
                file_data=file_data,
                filename=file.filename or "image.jpg",
                content_type=file.content_type or "image/jpeg",
                folder=folder
            )
            
            presigned_url = minio_service.get_presigned_url(object_path)
            public_url = minio_service.get_public_url(object_path)
            
            results.append({
                "filename": file.filename,
                "success": True,
                "object_path": object_path,
                "url": presigned_url,
                "public_url": public_url
            })
            
        except Exception as e:
            logger.error(f"Error uploading image {file.filename}: {e}")
            results.append({
                "filename": file.filename,
                "success": False,
                "error": str(e)
            })
    
    return {"results": results}


@router.get("/{object_path:path}")
async def get_image(
    object_path: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Get image from MinIO (proxy through API)
    
    Args:
        object_path: Path to object in MinIO
        current_user: Current authenticated user
    
    Returns:
        Image file
    """
    try:
        # Check if object exists
        if not minio_service.object_exists(object_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found"
            )
        
        # Get presigned URL and redirect
        url = minio_service.get_presigned_url(object_path, expires=timedelta(hours=1))
        return RedirectResponse(url=url)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get image: {str(e)}"
        )


@router.delete("/{object_path:path}")
async def delete_image(
    object_path: str,
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete an image from MinIO
    
    Args:
        object_path: Path to object in MinIO
        current_user: Current authenticated user
    
    Returns:
        Success status
    """
    try:
        success = minio_service.delete_object(object_path)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Image not found"
            )
        
        return {"success": True, "message": "Image deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting image: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete image: {str(e)}"
        )

