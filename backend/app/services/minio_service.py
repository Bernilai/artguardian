"""
MinIO service for object storage operations
"""
import logging
from io import BytesIO
from typing import Optional, BinaryIO
from uuid import uuid4
from datetime import timedelta

from minio import Minio
from minio.error import S3Error
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)


class MinIOService:
    """Service for interacting with MinIO object storage"""
    
    def __init__(self):
        try:
            self.client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE
            )
            self.bucket_name = settings.MINIO_BUCKET_NAME
            self._ensure_bucket_exists()
        except Exception as e:
            logger.error(f"Failed to initialize MinIO client: {e}")
            logger.warning("MinIO is not available. Image upload features will not work.")
            raise
    
    def _ensure_bucket_exists(self):
        """Create bucket if it doesn't exist"""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(
                    self.bucket_name,
                    location=settings.MINIO_REGION
                )
                logger.info(f"Created bucket: {self.bucket_name}")
            else:
                logger.info(f"Bucket {self.bucket_name} already exists")
        except S3Error as e:
            logger.error(f"Error ensuring bucket exists: {e}")
            raise
    
    def upload_image(
        self,
        file_data: bytes,
        filename: str,
        content_type: str = "image/jpeg",
        folder: str = "artifacts"
    ) -> str:
        """
        Upload an image file to MinIO
        
        Args:
            file_data: Image file bytes
            filename: Original filename
            content_type: MIME type of the image
            folder: Folder path in bucket (e.g., "artifacts", "defects")
        
        Returns:
            Object path in MinIO (e.g., "artifacts/uuid-filename.jpg")
        """
        try:
            file_ext = filename.split('.')[-1] if '.' in filename else 'jpg'
            unique_filename = f"{uuid4()}.{file_ext}"
            object_path = f"{folder}/{unique_filename}"
            
            image = Image.open(BytesIO(file_data))
            
            if image.mode in ('RGBA', 'LA', 'P'):
                if image.mode == 'P':
                    image = image.convert('RGB')
                elif image.mode == 'RGBA':
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    background.paste(image, mask=image.split()[3])
                    image = background
                elif image.mode == 'LA':
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    background.paste(image.convert('RGBA'), mask=image.split()[1] if len(image.split()) > 1 else None)
                    image = background
            elif image.mode not in ('RGB', 'L'):
                image = image.convert('RGB')
            
            output = BytesIO()
            image.save(output, format='JPEG', quality=85, optimize=True)
            output.seek(0)
            
            self.client.put_object(
                self.bucket_name,
                object_path,
                output,
                length=output.getbuffer().nbytes,
                content_type=content_type
            )
            
            logger.info(f"Uploaded image to {object_path}")
            return object_path
            
        except Exception as e:
            logger.error(f"Error uploading image: {e}")
            raise
    
    def get_presigned_url(
        self,
        object_path: str,
        expires: timedelta = timedelta(days=7)
    ) -> str:
        """
        Get a presigned URL for accessing an object
        
        Args:
            object_path: Path to object in MinIO
            expires: How long the URL should be valid
        
        Returns:
            Presigned URL
        """
        try:
            url = self.client.presigned_get_object(
                self.bucket_name,
                object_path,
                expires=expires
            )
            return url
        except S3Error as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise
    
    def get_public_url(self, object_path: str) -> str:
        """
        Get public URL for an object (if bucket is public)
        
        Args:
            object_path: Path to object in MinIO
        
        Returns:
            Public URL
        """
        return f"{settings.MINIO_PUBLIC_URL}/{object_path}"
    
    def get_object(self, bucket_name: str, object_name: str) -> BytesIO:
        """
        Get an object from MinIO as BytesIO
        
        Args:
            bucket_name: Name of the bucket
            object_name: Path to object in MinIO
        
        Returns:
            BytesIO object containing the file data
        """
        try:
            response = self.client.get_object(bucket_name, object_name)
            # Read all data into BytesIO
            data = BytesIO(response.read())
            response.close()
            response.release_conn()
            return data
        except S3Error as e:
            logger.error(f"Error getting object {object_name} from bucket {bucket_name}: {e}")
            raise
    
    def delete_object(self, object_path: str) -> bool:
        """
        Delete an object from MinIO
        
        Args:
            object_path: Path to object in MinIO
        
        Returns:
            True if successful
        """
        try:
            self.client.remove_object(self.bucket_name, object_path)
            logger.info(f"Deleted object: {object_path}")
            return True
        except S3Error as e:
            logger.error(f"Error deleting object: {e}")
            return False
    
    def object_exists(self, object_path: str) -> bool:
        """
        Check if an object exists in MinIO
        
        Args:
            object_path: Path to object in MinIO
        
        Returns:
            True if object exists
        """
        try:
            self.client.stat_object(self.bucket_name, object_path)
            return True
        except S3Error:
            return False


_minio_service_instance: Optional[MinIOService] = None
_minio_initialization_error: Optional[Exception] = None


def get_minio_service() -> MinIOService:
    """Get or create MinIO service instance (lazy initialization)"""
    global _minio_service_instance, _minio_initialization_error
    
    if _minio_initialization_error is not None:
        raise _minio_initialization_error
    
    if _minio_service_instance is None:
        try:
            _minio_service_instance = MinIOService()
            logger.info("MinIO service initialized successfully")
        except Exception as e:
            _minio_initialization_error = e
            logger.error(f"Failed to initialize MinIO service: {e}")
            logger.warning("MinIO features will not be available. Make sure MinIO is running.")
            raise
    return _minio_service_instance


class MinIOServiceProxy:
    """Proxy for MinIO service that initializes on first use"""
    
    def __getattr__(self, name):
        try:
            service = get_minio_service()
            return getattr(service, name)
        except Exception as init_error:
            error_msg = str(init_error)
            def raise_minio_error(*args, **kwargs):
                raise RuntimeError(
                    f"MinIO is not available. Cannot call {name}. "
                    f"Make sure MinIO is running and configured correctly. "
                    f"Original error: {error_msg}"
                )
            return raise_minio_error
    
    def __dir__(self):
        return ['upload_image', 'get_presigned_url', 'get_public_url', 
                'get_object', 'delete_object', 'object_exists', 'bucket_name', 'client']


minio_service = MinIOServiceProxy()

