import os
import logging
from typing import Dict, Any, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor
import mimetypes
from datetime import datetime

try:
    from webdav3.client import Client
    from webdav3.exceptions import WebDavException
    WEBDAV_AVAILABLE = True
except ImportError:
    WEBDAV_AVAILABLE = False

logger = logging.getLogger(__name__)

class WebDAVUploader:
    """WebDAV uploader for completed torrents"""
    
    def __init__(self, settings=None):
        self.client = None
        self.executor = ThreadPoolExecutor(max_workers=2)
        self.settings = settings  # ✅ FIXED: Accept settings parameter
        self.progress_callback = None
        
        if not WEBDAV_AVAILABLE:
            logger.warning("WebDAV dependencies not available. Install with: pip install webdavclient3")
    
    def set_progress_callback(self, callback):
        """Set progress callback function"""
        self.progress_callback = callback
    
    async def initialize(self) -> bool:
        """Initialize WebDAV client"""
        if not WEBDAV_AVAILABLE:
            logger.error("WebDAV dependencies not available")
            return False
        
        # ✅ FIXED: Use settings from parameter or try to import
        if not self.settings:
            try:
                from config import settings
                self.settings = settings
                logger.debug("Loaded settings from config module")
            except ImportError:
                logger.error("No settings provided and cannot import config")
                return False
        
        # Debug logging for settings
        logger.debug(f"WebDAV settings check: url={bool(self.settings.webdav_url)}, username={bool(self.settings.webdav_username)}, password={bool(self.settings.webdav_password)}")
        logger.debug(f"WebDAV URL: {self.settings.webdav_url}")
        logger.debug(f"WebDAV Username: {self.settings.webdav_username}")
        logger.debug(f"WebDAV Root Path: {self.settings.webdav_root_path}")
        
        if not all([self.settings.webdav_url, self.settings.webdav_username, self.settings.webdav_password]):
            logger.warning(f"WebDAV credentials not configured: url={bool(self.settings.webdav_url)}, username={bool(self.settings.webdav_username)}, password={bool(self.settings.webdav_password)}")
            return False
        
        try:
            # Configure WebDAV client
            options = {
                'webdav_hostname': self.settings.webdav_url,
                'webdav_login': self.settings.webdav_username,
                'webdav_password': self.settings.webdav_password,
                'webdav_timeout': 30,
                'webdav_chunk_size': 1024 * 1024,  # 1MB chunks
            }
            
            logger.debug(f"Creating WebDAV client with options: {dict(options, webdav_password='***')}")
            self.client = Client(options)
            
            # Test connection by checking if root path exists
            await self._ensure_root_path()
            
            logger.info("WebDAV service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize WebDAV service: {e}")
            return False
    
    async def _ensure_root_path(self):
        """Ensure the root path exists on WebDAV server"""
        if not self.settings.webdav_root_path or self.settings.webdav_root_path == '/':
            logger.debug("Using root path '/', no need to create")
            return
        
        loop = asyncio.get_event_loop()
        
        try:
            # Check if root path exists
            logger.debug(f"Checking if WebDAV root path exists: {self.settings.webdav_root_path}")
            exists = await loop.run_in_executor(
                self.executor,
                lambda: self.client.check(self.settings.webdav_root_path)
            )
            
            if not exists:
                # Create root path
                logger.info(f"Creating WebDAV root path: {self.settings.webdav_root_path}")
                await loop.run_in_executor(
                    self.executor,
                    lambda: self.client.mkdir(self.settings.webdav_root_path)
                )
                logger.info(f"Created WebDAV root path: {self.settings.webdav_root_path}")
            else:
                logger.debug(f"WebDAV root path already exists: {self.settings.webdav_root_path}")
        
        except Exception as e:
            logger.error(f"Error ensuring WebDAV root path: {e}")
            raise
    
    async def upload(self, file_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload file or folder to WebDAV"""
        if not WEBDAV_AVAILABLE:
            raise Exception("WebDAV dependencies not available")
        
        if not self.client:
            logger.info("WebDAV client not initialized, initializing now...")
            if not await self.initialize():
                raise Exception("Failed to initialize WebDAV service")
        
        logger.info(f"Starting WebDAV upload: {file_path}")
        
        try:
            if os.path.isfile(file_path):
                logger.debug(f"Uploading single file: {file_path}")
                return await self._upload_file(file_path, name)
            elif os.path.isdir(file_path):
                logger.debug(f"Uploading directory: {file_path}")
                return await self._upload_folder(file_path, name)
            else:
                raise Exception(f"Path does not exist: {file_path}")
        
        except Exception as e:
            logger.error(f"Failed to upload to WebDAV: {e}")
            raise
    
    async def _upload_file(self, file_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload a single file to WebDAV"""
        filename = name or os.path.basename(file_path)
        
        # Clean filename for WebDAV path
        webdav_path = self._clean_webdav_path(os.path.join(self.settings.webdav_root_path, filename))
        
        file_size = os.path.getsize(file_path)
        logger.info(f"Uploading file {filename} ({file_size} bytes) to {webdav_path}")
        
        # ✅ ADDED: Progress tracking for single file
        if self.progress_callback:
            self.progress_callback(0, file_size)
        
        # Upload file
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            self.executor,
            self._execute_upload_with_progress,
            file_path,
            webdav_path,
            file_size
        )
        
        # Determine content type
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = 'application/octet-stream'
        
        # Generate URL
        url = self._generate_url(webdav_path)
        
        result = {
            'webdav_path': webdav_path,
            'name': filename,
            'url': url,
            'size': file_size,
            'content_type': content_type
        }
        
        logger.info(f"Successfully uploaded file to WebDAV: {url}")
        return result
    
    async def _upload_folder(self, folder_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload a folder and its contents to WebDAV"""
        folder_name = name or os.path.basename(folder_path)
        base_path = self._clean_webdav_path(os.path.join(self.settings.webdav_root_path, folder_name))
        
        logger.info(f"Uploading folder {folder_name} to {base_path}")
        
        # Calculate total size for progress tracking
        total_size = 0
        file_count = 0
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    total_size += os.path.getsize(file_path)
                    file_count += 1
                except OSError:
                    logger.warning(f"Could not get size of file: {file_path}")
        
        logger.info(f"Folder contains {file_count} files, total size: {total_size} bytes")
        
        # Create base folder
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.mkdir(base_path)
            )
            logger.debug(f"Created base folder: {base_path}")
        except Exception as e:
            logger.debug(f"Base folder might already exist: {base_path} - {e}")
        
        uploaded_files = []
        transferred_bytes = 0
        
        # Upload all files in the folder
        for root, dirs, files in os.walk(folder_path):
            # Create directories first
            for dir_name in dirs:
                local_dir = os.path.join(root, dir_name)
                relative_dir = os.path.relpath(local_dir, folder_path)
                webdav_dir = self._clean_webdav_path(os.path.join(base_path, relative_dir))
                
                try:
                    await loop.run_in_executor(
                        self.executor,
                        lambda path=webdav_dir: self.client.mkdir(path)
                    )
                    logger.debug(f"Created directory: {webdav_dir}")
                except Exception as e:
                    logger.debug(f"Directory might already exist: {webdav_dir} - {e}")
            
            # Upload files
            for file in files:
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, folder_path)
                webdav_file_path = self._clean_webdav_path(os.path.join(base_path, relative_path))
                
                try:
                    file_size = os.path.getsize(file_path)
                    logger.debug(f"Uploading file: {relative_path} ({file_size} bytes)")
                    
                    # Upload file
                    await loop.run_in_executor(
                        self.executor,
                        self._execute_upload_with_progress,
                        file_path,
                        webdav_file_path,
                        file_size,
                        transferred_bytes,
                        total_size
                    )
                    
                    transferred_bytes += file_size
                    
                    uploaded_files.append({
                        'webdav_path': webdav_file_path,
                        'name': os.path.basename(file),
                        'path': relative_path,
                        'size': file_size,
                        'url': self._generate_url(webdav_file_path)
                    })
                    
                    logger.info(f"Uploaded file: {relative_path} ({file_size} bytes)")
                
                except Exception as e:
                    logger.error(f"Failed to upload file {relative_path}: {e}")
        
        result = {
            'folder_path': base_path,
            'name': folder_name,
            'url': self._generate_url(base_path),
            'files': uploaded_files,
            'total_files': len(uploaded_files),
            'total_size': transferred_bytes,
            'size': transferred_bytes  # ✅ ADDED: For compatibility
        }
        
        logger.info(f"Successfully uploaded folder to WebDAV: {len(uploaded_files)} files, {transferred_bytes} bytes")
        return result
    
    def _execute_upload_with_progress(self, file_path: str, webdav_path: str, file_size: int, 
                                    offset: int = 0, total_size: int = None):
        """Execute file upload with progress tracking (blocking operation)"""
        try:
            logger.debug(f"Executing WebDAV upload: {file_path} -> {webdav_path}")
            
            # Simple upload - webdav3 doesn't support progress callbacks directly
            self.client.upload_sync(remote_path=webdav_path, local_path=file_path)
            
            # Report completion
            if self.progress_callback:
                final_transferred = offset + file_size if total_size else file_size
                final_total = total_size if total_size else file_size
                self.progress_callback(final_transferred, final_total)
                logger.debug(f"Progress callback: {final_transferred}/{final_total} bytes")
                
        except WebDavException as e:
            logger.error(f"WebDAV error during upload: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during WebDAV upload: {e}")
            raise
    
    def _execute_upload(self, file_path: str, webdav_path: str):
        """Execute file upload (blocking operation) - legacy method"""
        return self._execute_upload_with_progress(file_path, webdav_path, os.path.getsize(file_path))
    
    def _clean_webdav_path(self, path: str) -> str:
        """Clean and validate WebDAV path"""
        # Normalize path separators
        cleaned = path.replace('\\', '/')
        
        # Remove double slashes
        while '//' in cleaned:
            cleaned = cleaned.replace('//', '/')
        
        # Ensure it starts with /
        if not cleaned.startswith('/'):
            cleaned = '/' + cleaned
        
        return cleaned
    
    def _generate_url(self, webdav_path: str) -> str:
        """Generate public URL for WebDAV resource"""
        base_url = self.settings.webdav_url.rstrip('/')
        clean_path = webdav_path.lstrip('/')
        return f"{base_url}/{clean_path}"
    
    async def delete_file(self, webdav_path: str) -> bool:
        """Delete a file from WebDAV"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.clean(webdav_path)
            )
            logger.info(f"Deleted file from WebDAV: {webdav_path}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to delete WebDAV file {webdav_path}: {e}")
            return False
    
    async def delete_folder(self, webdav_path: str) -> bool:
        """Delete a folder and all its contents from WebDAV"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.clean(webdav_path)
            )
            logger.info(f"Deleted folder from WebDAV: {webdav_path}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to delete WebDAV folder {webdav_path}: {e}")
            return False
    
    async def get_file_info(self, webdav_path: str) -> Optional[Dict[str, Any]]:
        """Get file information from WebDAV"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return None
        
        try:
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(
                self.executor,
                lambda: self.client.info(webdav_path)
            )
            
            return {
                'path': webdav_path,
                'size': info.get('size', 0),
                'content_type': info.get('content_type', ''),
                'created': info.get('created'),
                'modified': info.get('modified'),
                'url': self._generate_url(webdav_path)
            }
        
        except Exception as e:
            logger.error(f"Failed to get WebDAV file info {webdav_path}: {e}")
            return None
    
    async def list_files(self, webdav_path: Optional[str] = None) -> list:
        """List files in WebDAV directory"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return []
        
        try:
            path = webdav_path or self.settings.webdav_root_path
            
            loop = asyncio.get_event_loop()
            files = await loop.run_in_executor(
                self.executor,
                lambda: self.client.list(path, get_info=True)
            )
            
            result = []
            for file_path in files:
                if file_path == path:  # Skip the directory itself
                    continue
                
                try:
                    info = await loop.run_in_executor(
                        self.executor,
                        lambda: self.client.info(file_path)
                    )
                    
                    result.append({
                        'path': file_path,
                        'name': os.path.basename(file_path),
                        'size': info.get('size', 0),
                        'content_type': info.get('content_type', ''),
                        'created': info.get('created'),
                        'modified': info.get('modified'),
                        'is_directory': info.get('isdir', False),
                        'url': self._generate_url(file_path)
                    })
                except Exception as e:
                    logger.debug(f"Could not get info for {file_path}: {e}")
            
            return result
        
        except Exception as e:
            logger.error(f"Failed to list WebDAV files: {e}")
            return []
    
    async def download_file(self, webdav_path: str, local_path: str) -> bool:
        """Download a file from WebDAV to local path"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return False
        
        try:
            # Ensure local directory exists
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.download_sync(remote_path=webdav_path, local_path=local_path)
            )
            
            logger.info(f"Downloaded file from WebDAV: {webdav_path} -> {local_path}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to download WebDAV file {webdav_path}: {e}")
            return False
    
    async def copy_file(self, source_path: str, destination_path: str) -> bool:
        """Copy a file within WebDAV"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.copy(remote_path_from=source_path, remote_path_to=destination_path)
            )
            
            logger.info(f"Copied WebDAV file: {source_path} -> {destination_path}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to copy WebDAV file {source_path}: {e}")
            return False
    
    async def move_file(self, source_path: str, destination_path: str) -> bool:
        """Move a file within WebDAV"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.move(remote_path_from=source_path, remote_path_to=destination_path)
            )
            
            logger.info(f"Moved WebDAV file: {source_path} -> {destination_path}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to move WebDAV file {source_path}: {e}")
            return False
    
    async def create_directory(self, webdav_path: str) -> bool:
        """Create a directory on WebDAV"""
        if not self.client:
            logger.warning("WebDAV client not initialized")
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.mkdir(webdav_path)
            )
            
            logger.info(f"Created WebDAV directory: {webdav_path}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to create WebDAV directory {webdav_path}: {e}")
            return False
    
    async def test_connection(self) -> bool:
        """Test WebDAV connection"""
        try:
            logger.info("Testing WebDAV connection...")
            
            if not await self.initialize():
                logger.error("WebDAV initialization failed during connection test")
                return False
            
            # Try to list the root directory
            loop = asyncio.get_event_loop()
            test_path = self.settings.webdav_root_path or '/'
            await loop.run_in_executor(
                self.executor,
                lambda: self.client.list(test_path)
            )
            
            logger.info("WebDAV connection test successful")
            return True
        
        except Exception as e:
            logger.error(f"WebDAV connection test failed: {e}")
            return False
    
    def __del__(self):
        """Cleanup executor when object is destroyed"""
        try:
            self.executor.shutdown(wait=False)
        except:
            pass