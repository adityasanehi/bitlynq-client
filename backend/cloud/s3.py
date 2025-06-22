import os
import logging
from typing import Dict, Any, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor
import mimetypes
from datetime import datetime

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
    from botocore.config import Config
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

from config import settings

logger = logging.getLogger(__name__)

class S3Uploader:
    """AWS S3 uploader for completed torrents"""
    
    def __init__(self):
        self.s3_client = None
        self.bucket_name = None
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        if not BOTO3_AVAILABLE:
            logger.warning("S3 dependencies not available. Install with: pip install boto3")
    
    async def initialize(self) -> bool:
        """Initialize S3 client"""
        if not BOTO3_AVAILABLE:
            return False
        
        if not all([settings.s3_access_key, settings.s3_secret_key, settings.s3_bucket]):
            logger.warning("S3 credentials or bucket not configured")
            return False
        
        try:
            # Configure S3 client
            config = Config(
                region_name=settings.s3_region,
                retries={'max_attempts': 3, 'mode': 'adaptive'},
                max_pool_connections=10
            )
            
            self.s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                endpoint_url=settings.s3_endpoint_url,  # For S3-compatible services
                config=config
            )
            
            self.bucket_name = settings.s3_bucket
            
            # Test connection by checking if bucket exists
            await self._check_bucket_exists()
            
            logger.info("S3 service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize S3 service: {e}")
            return False
    
    async def _check_bucket_exists(self):
        """Check if the configured bucket exists"""
        loop = asyncio.get_event_loop()
        
        try:
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.head_bucket(Bucket=self.bucket_name)
            )
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                raise Exception(f"S3 bucket '{self.bucket_name}' does not exist")
            elif error_code == '403':
                raise Exception(f"Access denied to S3 bucket '{self.bucket_name}'")
            else:
                raise Exception(f"Error accessing S3 bucket: {e}")
    
    async def upload(self, file_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload file or folder to S3"""
        if not BOTO3_AVAILABLE:
            raise Exception("S3 dependencies not available")
        
        if not self.s3_client:
            if not await self.initialize():
                raise Exception("Failed to initialize S3 service")
        
        try:
            if os.path.isfile(file_path):
                return await self._upload_file(file_path, name)
            elif os.path.isdir(file_path):
                return await self._upload_folder(file_path, name)
            else:
                raise Exception(f"Path does not exist: {file_path}")
        
        except Exception as e:
            logger.error(f"Failed to upload to S3: {e}")
            raise
    
    async def _upload_file(self, file_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload a single file to S3"""
        filename = name or os.path.basename(file_path)
        
        # Clean filename for S3 key
        s3_key = self._clean_s3_key(filename)
        
        # Determine content type
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = 'application/octet-stream'
        
        # Prepare upload parameters
        extra_args = {
            'ContentType': content_type,
            'Metadata': {
                'original_name': filename,
                'upload_date': datetime.utcnow().isoformat()
            }
        }
        
        # Upload file
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            self.executor,
            self._execute_upload,
            file_path,
            s3_key,
            extra_args
        )
        
        file_size = os.path.getsize(file_path)
        
        # Generate URL
        url = self._generate_url(s3_key)
        
        return {
            's3_key': s3_key,
            'name': filename,
            'url': url,
            'size': file_size,
            'content_type': content_type,
            'bucket': self.bucket_name
        }
    
    async def _upload_folder(self, folder_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload a folder and its contents to S3"""
        folder_name = name or os.path.basename(folder_path)
        base_key = self._clean_s3_key(folder_name) + '/'
        
        uploaded_files = []
        total_size = 0
        
        # Upload all files in the folder
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, folder_path)
                
                # Create S3 key maintaining folder structure
                s3_key = base_key + self._clean_s3_key(relative_path.replace(os.sep, '/'))
                
                try:
                    # Determine content type
                    content_type, _ = mimetypes.guess_type(file_path)
                    if not content_type:
                        content_type = 'application/octet-stream'
                    
                    # Prepare upload parameters
                    extra_args = {
                        'ContentType': content_type,
                        'Metadata': {
                            'original_path': relative_path,
                            'upload_date': datetime.utcnow().isoformat()
                        }
                    }
                    
                    # Upload file
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        self.executor,
                        self._execute_upload,
                        file_path,
                        s3_key,
                        extra_args
                    )
                    
                    file_size = os.path.getsize(file_path)
                    total_size += file_size
                    
                    uploaded_files.append({
                        's3_key': s3_key,
                        'name': os.path.basename(file),
                        'path': relative_path,
                        'size': file_size,
                        'url': self._generate_url(s3_key)
                    })
                    
                    logger.info(f"Uploaded file: {relative_path}")
                
                except Exception as e:
                    logger.error(f"Failed to upload file {relative_path}: {e}")
        
        return {
            'folder_key': base_key,
            'name': folder_name,
            'url': self._generate_url(base_key),
            'files': uploaded_files,
            'total_files': len(uploaded_files),
            'total_size': total_size,
            'bucket': self.bucket_name
        }
    
    def _execute_upload(self, file_path: str, s3_key: str, extra_args: Dict):
        """Execute file upload (blocking operation)"""
        try:
            self.s3_client.upload_file(
                file_path,
                self.bucket_name,
                s3_key,
                ExtraArgs=extra_args,
                Callback=self._upload_progress_callback
            )
        except ClientError as e:
            logger.error(f"S3 client error during upload: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during S3 upload: {e}")
            raise
    
    def _upload_progress_callback(self, bytes_transferred: int):
        """Callback for upload progress (optional logging)"""
        # This could be enhanced to provide real-time progress updates
        pass
    
    def _clean_s3_key(self, key: str) -> str:
        """Clean and validate S3 key"""
        # Remove or replace invalid characters
        cleaned = key.replace('\\', '/').replace('//', '/')
        
        # Remove leading slash
        if cleaned.startswith('/'):
            cleaned = cleaned[1:]
        
        # Ensure it's not empty
        if not cleaned:
            cleaned = 'unnamed'
        
        return cleaned
    
    def _generate_url(self, s3_key: str) -> str:
        """Generate public URL for S3 object"""
        if settings.s3_endpoint_url:
            # For S3-compatible services
            return f"{settings.s3_endpoint_url.rstrip('/')}/{self.bucket_name}/{s3_key}"
        else:
            # Standard AWS S3
            return f"https://{self.bucket_name}.s3.{settings.s3_region}.amazonaws.com/{s3_key}"
    
    async def delete_file(self, s3_key: str) -> bool:
        """Delete a file from S3"""
        if not self.s3_client:
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.delete_object(Bucket=self.bucket_name, Key=s3_key)
            )
            logger.info(f"Deleted file from S3: {s3_key}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to delete S3 file {s3_key}: {e}")
            return False
    
    async def delete_folder(self, folder_key: str) -> bool:
        """Delete a folder and all its contents from S3"""
        if not self.s3_client:
            return False
        
        try:
            # Ensure folder key ends with /
            if not folder_key.endswith('/'):
                folder_key += '/'
            
            # List all objects in the folder
            objects_to_delete = []
            loop = asyncio.get_event_loop()
            
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = await loop.run_in_executor(
                self.executor,
                lambda: paginator.paginate(Bucket=self.bucket_name, Prefix=folder_key)
            )
            
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        objects_to_delete.append({'Key': obj['Key']})
            
            # Delete objects in batches
            if objects_to_delete:
                for i in range(0, len(objects_to_delete), 1000):  # S3 limit is 1000 objects per batch
                    batch = objects_to_delete[i:i+1000]
                    await loop.run_in_executor(
                        self.executor,
                        lambda: self.s3_client.delete_objects(
                            Bucket=self.bucket_name,
                            Delete={'Objects': batch}
                        )
                    )
            
            logger.info(f"Deleted folder from S3: {folder_key}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to delete S3 folder {folder_key}: {e}")
            return False
    
    async def get_file_info(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """Get file information from S3"""
        if not self.s3_client:
            return None
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)
            )
            
            return {
                'key': s3_key,
                'size': result.get('ContentLength', 0),
                'content_type': result.get('ContentType', ''),
                'last_modified': result.get('LastModified'),
                'etag': result.get('ETag', '').strip('"'),
                'metadata': result.get('Metadata', {}),
                'url': self._generate_url(s3_key)
            }
        
        except Exception as e:
            logger.error(f"Failed to get S3 file info {s3_key}: {e}")
            return None
    
    async def list_files(self, prefix: str = "", max_results: int = 1000) -> list:
        """List files in S3 bucket with optional prefix"""
        if not self.s3_client:
            return []
        
        try:
            loop = asyncio.get_event_loop()
            
            kwargs = {
                'Bucket': self.bucket_name,
                'MaxKeys': max_results
            }
            if prefix:
                kwargs['Prefix'] = prefix
            
            result = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.list_objects_v2(**kwargs)
            )
            
            files = []
            for obj in result.get('Contents', []):
                files.append({
                    'key': obj['Key'],
                    'size': obj['Size'],
                    'last_modified': obj['LastModified'],
                    'etag': obj['ETag'].strip('"'),
                    'url': self._generate_url(obj['Key'])
                })
            
            return files
        
        except Exception as e:
            logger.error(f"Failed to list S3 files: {e}")
            return []
    
    async def generate_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """Generate a presigned URL for downloading a file"""
        if not self.s3_client:
            return None
        
        try:
            loop = asyncio.get_event_loop()
            url = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': self.bucket_name, 'Key': s3_key},
                    ExpiresIn=expiration
                )
            )
            return url
        
        except Exception as e:
            logger.error(f"Failed to generate presigned URL for {s3_key}: {e}")
            return None
    
    async def upload_multipart(self, file_path: str, s3_key: str, 
                             chunk_size: int = 100 * 1024 * 1024) -> Dict[str, Any]:
        """Upload large file using multipart upload"""
        if not self.s3_client:
            raise Exception("S3 client not initialized")
        
        file_size = os.path.getsize(file_path)
        
        # Determine content type
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = 'application/octet-stream'
        
        try:
            loop = asyncio.get_event_loop()
            
            # Initialize multipart upload
            multipart_upload = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.create_multipart_upload(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    ContentType=content_type,
                    Metadata={
                        'original_name': os.path.basename(file_path),
                        'upload_date': datetime.utcnow().isoformat()
                    }
                )
            )
            
            upload_id = multipart_upload['UploadId']
            parts = []
            
            # Upload parts
            with open(file_path, 'rb') as f:
                part_number = 1
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    
                    # Upload part
                    part_response = await loop.run_in_executor(
                        self.executor,
                        lambda: self.s3_client.upload_part(
                            Bucket=self.bucket_name,
                            Key=s3_key,
                            PartNumber=part_number,
                            UploadId=upload_id,
                            Body=chunk
                        )
                    )
                    
                    parts.append({
                        'ETag': part_response['ETag'],
                        'PartNumber': part_number
                    })
                    
                    part_number += 1
                    logger.debug(f"Uploaded part {part_number - 1} of {s3_key}")
            
            # Complete multipart upload
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.complete_multipart_upload(
                    Bucket=self.bucket_name,
                    Key=s3_key,
                    UploadId=upload_id,
                    MultipartUpload={'Parts': parts}
                )
            )
            
            logger.info(f"Completed multipart upload: {s3_key}")
            
            return {
                's3_key': s3_key,
                'name': os.path.basename(file_path),
                'url': self._generate_url(s3_key),
                'size': file_size,
                'content_type': content_type,
                'bucket': self.bucket_name,
                'parts_count': len(parts)
            }
        
        except Exception as e:
            # Abort multipart upload on error
            try:
                await loop.run_in_executor(
                    self.executor,
                    lambda: self.s3_client.abort_multipart_upload(
                        Bucket=self.bucket_name,
                        Key=s3_key,
                        UploadId=upload_id
                    )
                )
            except:
                pass
            
            logger.error(f"Multipart upload failed for {s3_key}: {e}")
            raise
    
    async def copy_file(self, source_key: str, destination_key: str) -> bool:
        """Copy a file within the same S3 bucket"""
        if not self.s3_client:
            return False
        
        try:
            copy_source = {'Bucket': self.bucket_name, 'Key': source_key}
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.copy_object(
                    CopySource=copy_source,
                    Bucket=self.bucket_name,
                    Key=destination_key
                )
            )
            
            logger.info(f"Copied S3 file: {source_key} -> {destination_key}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to copy S3 file {source_key}: {e}")
            return False
    
    async def test_connection(self) -> bool:
        """Test S3 connection"""
        try:
            if not await self.initialize():
                return False
            
            # Try to list objects (limited to 1) to test connection
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.list_objects_v2(Bucket=self.bucket_name, MaxKeys=1)
            )
            
            logger.info("S3 connection test successful")
            return True
        
        except Exception as e:
            logger.error(f"S3 connection test failed: {e}")
            return False
    
    async def get_bucket_info(self) -> Optional[Dict[str, Any]]:
        """Get information about the configured bucket"""
        if not self.s3_client:
            return None
        
        try:
            loop = asyncio.get_event_loop()
            
            # Get bucket location
            location = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.get_bucket_location(Bucket=self.bucket_name)
            )
            
            # Get bucket size and object count (this might be slow for large buckets)
            objects = await loop.run_in_executor(
                self.executor,
                lambda: self.s3_client.list_objects_v2(Bucket=self.bucket_name)
            )
            
            total_size = sum(obj.get('Size', 0) for obj in objects.get('Contents', []))
            object_count = len(objects.get('Contents', []))
            
            return {
                'bucket_name': self.bucket_name,
                'region': location.get('LocationConstraint', 'us-east-1'),
                'object_count': object_count,
                'total_size': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2)
            }
        
        except Exception as e:
            logger.error(f"Failed to get bucket info: {e}")
            return None