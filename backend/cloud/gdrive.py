import os
import logging
from typing import Dict, Any, Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor
import mimetypes

try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False

from config import settings

logger = logging.getLogger(__name__)

class GoogleDriveUploader:
    """Google Drive uploader for completed torrents"""
    
    # Scopes required for Google Drive API
    SCOPES = ['https://www.googleapis.com/auth/drive.file']
    
    def __init__(self):
        self.service = None
        self.credentials = None
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        if not GOOGLE_AVAILABLE:
            logger.warning("Google Drive dependencies not available. Install with: pip install google-auth google-auth-oauthlib google-api-python-client")
    
    async def initialize(self) -> bool:
        """Initialize Google Drive service"""
        if not GOOGLE_AVAILABLE:
            return False
        
        if not settings.gdrive_credentials_path:
            logger.warning("Google Drive credentials path not configured")
            return False
        
        try:
            # Load credentials
            creds = None
            token_file = settings.gdrive_credentials_path.replace('.json', '_token.json')
            
            # Load existing token
            if os.path.exists(token_file):
                creds = Credentials.from_authorized_user_file(token_file, self.SCOPES)
            
            # If no valid credentials, start OAuth flow
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    if not os.path.exists(settings.gdrive_credentials_path):
                        logger.error(f"Google Drive credentials file not found: {settings.gdrive_credentials_path}")
                        return False
                    
                    flow = InstalledAppFlow.from_client_secrets_file(
                        settings.gdrive_credentials_path, self.SCOPES)
                    creds = flow.run_local_server(port=0)
                
                # Save credentials for next run
                with open(token_file, 'w') as token:
                    token.write(creds.to_json())
            
            self.credentials = creds
            self.service = build('drive', 'v3', credentials=creds)
            
            logger.info("Google Drive service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize Google Drive service: {e}")
            return False
    
    async def upload(self, file_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload file or folder to Google Drive"""
        if not GOOGLE_AVAILABLE:
            raise Exception("Google Drive dependencies not available")
        
        if not self.service:
            if not await self.initialize():
                raise Exception("Failed to initialize Google Drive service")
        
        try:
            if os.path.isfile(file_path):
                return await self._upload_file(file_path, name)
            elif os.path.isdir(file_path):
                return await self._upload_folder(file_path, name)
            else:
                raise Exception(f"Path does not exist: {file_path}")
        
        except Exception as e:
            logger.error(f"Failed to upload to Google Drive: {e}")
            raise
    
    async def _upload_file(self, file_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload a single file to Google Drive"""
        filename = name or os.path.basename(file_path)
        
        # Determine MIME type
        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = 'application/octet-stream'
        
        # Prepare file metadata
        file_metadata = {
            'name': filename,
            'parents': [settings.gdrive_folder_id] if settings.gdrive_folder_id else []
        }
        
        # Create media upload
        media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)
        
        # Upload file
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            self.executor,
            self._execute_upload,
            file_metadata,
            media
        )
        
        file_size = os.path.getsize(file_path)
        
        return {
            'file_id': result['id'],
            'name': result['name'],
            'url': f"https://drive.google.com/file/d/{result['id']}/view",
            'size': file_size,
            'mime_type': mime_type
        }
    
    async def _upload_folder(self, folder_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Upload a folder and its contents to Google Drive"""
        folder_name = name or os.path.basename(folder_path)
        
        # Create folder on Google Drive
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [settings.gdrive_folder_id] if settings.gdrive_folder_id else []
        }
        
        loop = asyncio.get_event_loop()
        folder = await loop.run_in_executor(
            self.executor,
            self._create_folder,
            folder_metadata
        )
        
        folder_id = folder['id']
        uploaded_files = []
        total_size = 0
        
        # Upload all files in the folder
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, folder_path)
                
                try:
                    # Create subdirectories if needed
                    current_folder_id = folder_id
                    if os.path.dirname(relative_path):
                        current_folder_id = await self._create_folder_structure(
                            folder_id, os.path.dirname(relative_path)
                        )
                    
                    # Upload file
                    file_metadata = {
                        'name': os.path.basename(file),
                        'parents': [current_folder_id]
                    }
                    
                    mime_type, _ = mimetypes.guess_type(file_path)
                    if not mime_type:
                        mime_type = 'application/octet-stream'
                    
                    media = MediaFileUpload(file_path, mimetype=mime_type, resumable=True)
                    
                    result = await loop.run_in_executor(
                        self.executor,
                        self._execute_upload,
                        file_metadata,
                        media
                    )
                    
                    file_size = os.path.getsize(file_path)
                    total_size += file_size
                    
                    uploaded_files.append({
                        'file_id': result['id'],
                        'name': result['name'],
                        'path': relative_path,
                        'size': file_size
                    })
                    
                    logger.info(f"Uploaded file: {relative_path}")
                
                except Exception as e:
                    logger.error(f"Failed to upload file {relative_path}: {e}")
        
        return {
            'folder_id': folder_id,
            'name': folder_name,
            'url': f"https://drive.google.com/drive/folders/{folder_id}",
            'files': uploaded_files,
            'total_files': len(uploaded_files),
            'total_size': total_size
        }
    
    async def _create_folder_structure(self, parent_id: str, path: str) -> str:
        """Create nested folder structure and return the deepest folder ID"""
        parts = path.split(os.sep)
        current_parent = parent_id
        
        for part in parts:
            if not part:
                continue
            
            # Check if folder already exists
            existing_folder = await self._find_folder(current_parent, part)
            if existing_folder:
                current_parent = existing_folder['id']
            else:
                # Create new folder
                folder_metadata = {
                    'name': part,
                    'mimeType': 'application/vnd.google-apps.folder',
                    'parents': [current_parent]
                }
                
                loop = asyncio.get_event_loop()
                folder = await loop.run_in_executor(
                    self.executor,
                    self._create_folder,
                    folder_metadata
                )
                current_parent = folder['id']
        
        return current_parent
    
    async def _find_folder(self, parent_id: str, name: str) -> Optional[Dict[str, Any]]:
        """Find a folder by name in the specified parent"""
        try:
            loop = asyncio.get_event_loop()
            query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and '{parent_id}' in parents"
            
            results = await loop.run_in_executor(
                self.executor,
                lambda: self.service.files().list(q=query, spaces='drive').execute()
            )
            
            files = results.get('files', [])
            return files[0] if files else None
        
        except Exception as e:
            logger.error(f"Error finding folder {name}: {e}")
            return None
    
    def _execute_upload(self, file_metadata: Dict, media: MediaFileUpload) -> Dict[str, Any]:
        """Execute file upload (blocking operation)"""
        try:
            request = self.service.files().create(body=file_metadata, media_body=media, fields='id,name')
            response = None
            
            while response is None:
                status, response = request.next_chunk()
                if status:
                    logger.debug(f"Upload progress: {int(status.progress() * 100)}%")
            
            return response
        
        except HttpError as e:
            logger.error(f"HTTP error during upload: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error during upload: {e}")
            raise
    
    def _create_folder(self, folder_metadata: Dict) -> Dict[str, Any]:
        """Create folder (blocking operation)"""
        try:
            return self.service.files().create(body=folder_metadata, fields='id,name').execute()
        except HttpError as e:
            logger.error(f"HTTP error creating folder: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error creating folder: {e}")
            raise
    
    async def delete_file(self, file_id: str) -> bool:
        """Delete a file from Google Drive"""
        if not self.service:
            return False
        
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.service.files().delete(fileId=file_id).execute()
            )
            logger.info(f"Deleted file from Google Drive: {file_id}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to delete file {file_id}: {e}")
            return False
    
    async def get_file_info(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file information from Google Drive"""
        if not self.service:
            return None
        
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                lambda: self.service.files().get(fileId=file_id, fields='id,name,size,mimeType,createdTime,modifiedTime').execute()
            )
            return result
        
        except Exception as e:
            logger.error(f"Failed to get file info {file_id}: {e}")
            return None
    
    async def list_files(self, folder_id: Optional[str] = None, max_results: int = 100) -> list:
        """List files in Google Drive folder"""
        if not self.service:
            return []
        
        try:
            parent_id = folder_id or settings.gdrive_folder_id or 'root'
            query = f"'{parent_id}' in parents and trashed=false"
            
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self.executor,
                lambda: self.service.files().list(
                    q=query,
                    pageSize=max_results,
                    fields="files(id,name,size,mimeType,createdTime,modifiedTime)"
                ).execute()
            )
            
            return results.get('files', [])
        
        except Exception as e:
            logger.error(f"Failed to list files: {e}")
            return []
    
    async def test_connection(self) -> bool:
        """Test Google Drive connection"""
        try:
            if not await self.initialize():
                return False
            
            # Try to get user info
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                lambda: self.service.about().get(fields='user').execute()
            )
            
            logger.info("Google Drive connection test successful")
            return True
        
        except Exception as e:
            logger.error(f"Google Drive connection test failed: {e}")
            return False