from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
import uvicorn
import asyncio
import json
import logging
from typing import List, Optional
from contextlib import asynccontextmanager
import time 
import platform 

from torrents import TorrentManager
from models import TorrentInfo, TorrentStatus, CloudProvider, PeerInfo
from database import Database
from cloud.gdrive import GoogleDriveUploader
from cloud.s3 import S3Uploader
from cloud.webdav import WebDAVUploader
from lan_sync import LANSync
from config import Settings


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize components
settings = Settings()
database = Database()
torrent_manager = TorrentManager(database)

# Initialize LAN sync with database reference
lan_sync = LANSync(database)

# Cloud uploaders
uploaders = {
    CloudProvider.GDRIVE: GoogleDriveUploader(),
    CloudProvider.S3: S3Uploader(),
    CloudProvider.WEBDAV: WebDAVUploader(settings)
}

# WebSocket connections
active_connections: List[WebSocket] = []

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    await database.init()
    await torrent_manager.start()
    
    # Set torrent manager reference in LAN sync
    lan_sync.set_torrent_manager(torrent_manager)
    
    # Start LAN sync
    await lan_sync.start()
    
    # Start background tasks
    asyncio.create_task(status_broadcaster())
    
    yield
    
    # Shutdown
    await torrent_manager.stop()
    await lan_sync.stop()
    await database.close()


app = FastAPI(
    title="BitLynq Client API",
    description="Privacy-respecting torrent client with cloud sync and LAN sharing.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer(auto_error=False)

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Simple token verification (enhance with JWT in production)"""
    if not credentials or credentials.credentials != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials

# WebSocket connection manager
async def broadcast_message(message: dict):
    """Broadcast message to all connected clients"""
    if active_connections:
        disconnected = []
        message_str = json.dumps(message, default=str)  # Handle datetime serialization
        
        for connection in active_connections:
            try:
                await connection.send_text(message_str)
            except Exception as e:
                logger.debug(f"Failed to send to WebSocket client: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            if conn in active_connections:
                active_connections.remove(conn)
                logger.debug(f"Removed disconnected WebSocket client. Active: {len(active_connections)}")

async def status_broadcaster():
    """Background task to broadcast torrent status updates"""
    last_broadcast = {}
    
    while True:
        try:
            torrents = await torrent_manager.get_all_torrents()
            current_data = {}
            
            # Check if any torrent data has changed
            changed_torrents = []
            for torrent in torrents:
                torrent_dict = {
                    "hash": torrent.hash,
                    "name": torrent.name,
                    "size": torrent.size,
                    "status": torrent.status.value,
                    "progress": torrent.progress,
                    "download_rate": torrent.download_rate,
                    "upload_rate": torrent.upload_rate,
                    "downloaded": torrent.downloaded,
                    "uploaded": torrent.uploaded,
                    "peers": torrent.peers,
                    "seeds": torrent.seeds,
                    "eta": torrent.eta,
                    "save_path": torrent.save_path,
                    "added_time": torrent.added_time.isoformat() if torrent.added_time else None,
                    "completed_time": torrent.completed_time.isoformat() if torrent.completed_time else None
                }
                
                current_data[torrent.hash] = torrent_dict
                
                # Check if this torrent's data has changed
                if (torrent.hash not in last_broadcast or 
                    last_broadcast[torrent.hash] != torrent_dict):
                    changed_torrents.append(torrent_dict)
            
            # Only broadcast if there are changes or new connections
            if changed_torrents or len(active_connections) > len(last_broadcast.get('_connections', [])):
                # Get bandwidth stats
                bandwidth_stats = await torrent_manager.get_bandwidth_stats()
                
                message = {
                    "type": "torrent_status_update",
                    "data": {
                        "torrents": list(current_data.values()),
                        "stats": bandwidth_stats,
                        "timestamp": asyncio.get_event_loop().time()
                    }
                }
                
                await broadcast_message(message)
                
                # Update last broadcast data
                last_broadcast = current_data.copy()
                last_broadcast['_connections'] = list(range(len(active_connections)))
            
            await asyncio.sleep(2)  # Update every 2 seconds
            
        except Exception as e:
            logger.error(f"Error in status broadcaster: {e}")
            await asyncio.sleep(5)

# Routes

@app.get("/")
async def root():
    return {"message": "Hybrid Torrent Client API", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    torrent_count = len(await torrent_manager.get_all_torrents())
    bandwidth_stats = await torrent_manager.get_bandwidth_stats()
    
    return {
        "status": "healthy", 
        "torrents_active": torrent_count,
        "download_rate": bandwidth_stats.get("download_rate", 0),
        "upload_rate": bandwidth_stats.get("upload_rate", 0),
        "websocket_connections": len(active_connections)
    }

# Torrent endpoints

@app.post("/torrent/add", response_model=TorrentInfo)
async def add_torrent(
    magnet: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    token: str = Depends(verify_token)
):
    """Add a torrent via magnet link or file upload"""
    if not magnet and not file:
        raise HTTPException(status_code=400, detail="Either magnet link or torrent file is required")
    
    try:
        if magnet:
            torrent = await torrent_manager.add_magnet(magnet)
        else:
            content = await file.read()
            torrent = await torrent_manager.add_torrent_file(content, file.filename)
        
        # Broadcast immediately that a new torrent was added
        await broadcast_message({
            "type": "torrent_added",
            "data": {
                "hash": torrent.hash,
                "name": torrent.name,
                "status": torrent.status.value,
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return torrent
    except Exception as e:
        logger.error(f"Error adding torrent: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/torrent/list", response_model=List[TorrentInfo])
async def list_torrents(token: str = Depends(verify_token)):
    """Get list of all torrents"""
    return await torrent_manager.get_all_torrents()

@app.get("/torrent/{torrent_hash}", response_model=TorrentInfo)
async def get_torrent(torrent_hash: str, token: str = Depends(verify_token)):
    """Get specific torrent info"""
    torrent = await torrent_manager.get_torrent(torrent_hash)
    if not torrent:
        raise HTTPException(status_code=404, detail="Torrent not found")
    return torrent

@app.post("/torrent/{torrent_hash}/pause")
async def pause_torrent(torrent_hash: str, token: str = Depends(verify_token)):
    """Pause a torrent"""
    success = await torrent_manager.pause_torrent(torrent_hash)
    if not success:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    await broadcast_message({
        "type": "torrent_paused",
        "data": {
            "hash": torrent_hash,
            "timestamp": asyncio.get_event_loop().time()
        }
    })
    
    return {"status": "paused"}

@app.post("/torrent/{torrent_hash}/resume")
async def resume_torrent(torrent_hash: str, token: str = Depends(verify_token)):
    """Resume a torrent"""
    success = await torrent_manager.resume_torrent(torrent_hash)
    if not success:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    await broadcast_message({
        "type": "torrent_resumed",
        "data": {
            "hash": torrent_hash,
            "timestamp": asyncio.get_event_loop().time()
        }
    })
    
    return {"status": "resumed"}

@app.delete("/torrent/{torrent_hash}")
async def remove_torrent(torrent_hash: str, delete_files: bool = False, token: str = Depends(verify_token)):
    """Remove a torrent"""
    success = await torrent_manager.remove_torrent(torrent_hash, delete_files)
    if not success:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    await broadcast_message({
        "type": "torrent_removed",
        "data": {
            "hash": torrent_hash,
            "deleted_files": delete_files,
            "timestamp": asyncio.get_event_loop().time()
        }
    })
    
    return {"status": "removed"}

# Cloud upload with real-time progress

@app.post("/cloud/upload/{torrent_hash}")
async def upload_to_cloud(
    torrent_hash: str,
    provider: str = Form(...),
    token: str = Depends(verify_token)
):
    """Upload completed torrent to cloud storage with real-time progress"""
    torrent = await torrent_manager.get_torrent(torrent_hash)
    if not torrent:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    # ✅ Accept completed, seeding torrents, AND 100% progress regardless of status
    if torrent.progress < 100.0:
        raise HTTPException(
            status_code=400, 
            detail=f"Torrent not fully downloaded. Progress: {torrent.progress:.1f}%. Must be 100% complete."
        )
    
    # Verify files actually exist
    import os
    if not os.path.exists(torrent.save_path):
        raise HTTPException(
            status_code=404, 
            detail=f"Torrent files not found at: {torrent.save_path}"
        )
    
    # Map string provider to CloudProvider enum
    provider_mapping = {
        'gdrive': CloudProvider.GDRIVE,
        'google_drive': CloudProvider.GDRIVE,
        's3': CloudProvider.S3,
        'amazon_s3': CloudProvider.S3,
        'webdav': CloudProvider.WEBDAV
    }
    
    cloud_provider = provider_mapping.get(provider.lower())
    if not cloud_provider:
        raise HTTPException(
            status_code=400, 
            detail=f"Unsupported cloud provider: {provider}. Supported: {list(provider_mapping.keys())}"
        )
    
    uploader = uploaders.get(cloud_provider)
    if not uploader:
        raise HTTPException(status_code=400, detail="Cloud provider not configured")
    
    # ✅ CRITICAL FIX: Update uploader settings before upload
    uploader.settings = settings
    
    upload_id = f"{torrent_hash}_{provider}_{int(time.time())}"
    
    try:
        await uploader.initialize()
        
        await broadcast_message({
            "type": "cloud_upload_started",
            "data": {
                "upload_id": upload_id,
                "hash": torrent_hash,
                "provider": provider,
                "torrent_name": torrent.name,
                "total_size": torrent.size,
                "file_path": torrent.save_path,
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        result = await upload_with_progress(
            uploader, 
            torrent.save_path, 
            torrent.name,
            upload_id
        )
        
        await database.add_upload_record(torrent_hash, provider, result["url"], result.get("size", torrent.size))
        
        await broadcast_message({
            "type": "cloud_upload_completed",
            "data": {
                "upload_id": upload_id,
                "hash": torrent_hash,
                "provider": provider,
                "url": result["url"],
                "upload_size": result.get("size", 0),
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return result
        
    except Exception as e:
        logger.error(f"Error uploading to cloud: {e}")
        
        await broadcast_message({
            "type": "cloud_upload_failed",
            "data": {
                "upload_id": upload_id,
                "hash": torrent_hash,
                "provider": provider,
                "error": str(e),
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/cloud/uploads/history")
async def get_upload_history(token: str = Depends(verify_token)):
    """Get cloud upload history"""
    try:
        uploads = await database.get_upload_history()
        return uploads
    except Exception as e:
        logger.error(f"Error getting upload history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def upload_with_progress(uploader, file_path: str, name: str, upload_id: str):
    """Upload with real-time progress updates"""
    
    def progress_callback(bytes_transferred: int, total_bytes: int = None):
        """Progress callback for cloud uploads"""
        try:
            progress_percent = (bytes_transferred / total_bytes * 100) if total_bytes else 0
            
            # Broadcast progress update
            asyncio.create_task(broadcast_message({
                "type": "cloud_upload_progress",
                "data": {
                    "upload_id": upload_id,
                    "bytes_transferred": bytes_transferred,
                    "total_bytes": total_bytes,
                    "progress_percent": progress_percent,
                    "timestamp": asyncio.get_event_loop().time()
                }
            }))
        except Exception as e:
            logger.debug(f"Progress callback error: {e}")
    
    # Enhance uploader with progress callback
    if hasattr(uploader, 'set_progress_callback'):
        uploader.set_progress_callback(progress_callback)
    
    # Upload file/folder
    return await uploader.upload(file_path, name)


# Enhanced cloud management endpoints

@app.get("/cloud/uploads/active")
async def get_active_uploads(token: str = Depends(verify_token)):
    """Get currently active cloud uploads"""
    # This would track active uploads in memory or database
    # For now, return empty list
    return []

@app.delete("/cloud/upload/{upload_id}")
async def cancel_upload(upload_id: str, token: str = Depends(verify_token)):
    """Cancel an active cloud upload"""
    # Implementation would depend on tracking active uploads
    return {"status": "cancelled", "upload_id": upload_id}

@app.get("/cloud/providers/status")
async def get_cloud_providers_status(token: str = Depends(verify_token)):
    """Get status of all configured cloud providers"""
    providers_status = {}
    
    for provider_name, uploader in uploaders.items():
        try:
            is_available = await uploader.test_connection()
            providers_status[provider_name.value] = {
                "available": is_available,
                "configured": True,
                "last_test": asyncio.get_event_loop().time()
            }
        except Exception as e:
            providers_status[provider_name.value] = {
                "available": False,
                "configured": False,
                "error": str(e),
                "last_test": asyncio.get_event_loop().time()
            }
    
    return providers_status

@app.post("/cloud/test/{provider}")
async def test_cloud_provider(provider: CloudProvider, token: str = Depends(verify_token)):
    """Test connection to specific cloud provider"""
    uploader = uploaders.get(provider)
    if not uploader:
        raise HTTPException(status_code=400, detail="Unsupported cloud provider")
    
    try:
        result = await uploader.test_connection()
        return {
            "provider": provider.value,
            "connected": result,
            "timestamp": asyncio.get_event_loop().time()
        }
    except Exception as e:
        return {
            "provider": provider.value,
            "connected": False,
            "error": str(e),
            "timestamp": asyncio.get_event_loop().time()
        }

# Cloud file management endpoints

@app.get("/cloud/{provider}/files")
async def list_cloud_files(
    provider: CloudProvider, 
    path: str = "",
    token: str = Depends(verify_token)
):
    """List files in cloud storage"""
    uploader = uploaders.get(provider)
    if not uploader:
        raise HTTPException(status_code=400, detail="Unsupported cloud provider")
    
    try:
        files = await uploader.list_files(path)
        return {
            "provider": provider.value,
            "path": path,
            "files": files,
            "count": len(files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/cloud/{provider}/file")
async def delete_cloud_file(
    provider: CloudProvider,
    file_id: str,
    token: str = Depends(verify_token)
):
    """Delete a file from cloud storage"""
    uploader = uploaders.get(provider)
    if not uploader:
        raise HTTPException(status_code=400, detail="Unsupported cloud provider")
    
    try:
        success = await uploader.delete_file(file_id)
        if success:
            await broadcast_message({
                "type": "cloud_file_deleted",
                "data": {
                    "provider": provider.value,
                    "file_id": file_id,
                    "timestamp": asyncio.get_event_loop().time()
                }
            })
        
        return {"status": "deleted" if success else "failed", "file_id": file_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/cloud/{provider}/info/{file_id}")
async def get_cloud_file_info(
    provider: CloudProvider,
    file_id: str,
    token: str = Depends(verify_token)
):
    """Get file information from cloud storage"""
    uploader = uploaders.get(provider)
    if not uploader:
        raise HTTPException(status_code=400, detail="Unsupported cloud provider")
    
    try:
        info = await uploader.get_file_info(file_id)
        if not info:
            raise HTTPException(status_code=404, detail="File not found")
        
        return {
            "provider": provider.value,
            "file_info": info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Enhanced S3-specific endpoints (taking advantage of your advanced S3 implementation)

@app.get("/cloud/s3/bucket/info")
async def get_s3_bucket_info(token: str = Depends(verify_token)):
    """Get S3 bucket information"""
    s3_uploader = uploaders.get(CloudProvider.S3)
    if not s3_uploader:
        raise HTTPException(status_code=400, detail="S3 not configured")
    
    try:
        info = await s3_uploader.get_bucket_info()
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/cloud/s3/presigned")
async def generate_s3_presigned_url(
    s3_key: str,
    expiration: int = 3600,
    token: str = Depends(verify_token)
):
    """Generate presigned URL for S3 file"""
    s3_uploader = uploaders.get(CloudProvider.S3)
    if not s3_uploader:
        raise HTTPException(status_code=400, detail="S3 not configured")
    
    try:
        url = await s3_uploader.generate_presigned_url(s3_key, expiration)
        return {
            "presigned_url": url,
            "expiration": expiration,
            "s3_key": s3_key
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Enhanced Google Drive specific endpoints

@app.get("/cloud/gdrive/quota")
async def get_gdrive_quota(token: str = Depends(verify_token)):
    """Get Google Drive quota information"""
    gdrive_uploader = uploaders.get(CloudProvider.GDRIVE)
    if not gdrive_uploader:
        raise HTTPException(status_code=400, detail="Google Drive not configured")
    
    try:
        # This would require extending your GoogleDriveUploader
        # with a get_quota() method
        return {"message": "Quota endpoint - extend GoogleDriveUploader with get_quota()"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# LAN sync endpoints

@app.get("/peer/list", response_model=List[PeerInfo])
async def list_peers(token: str = Depends(verify_token)):
    """Get list of discovered LAN peers"""
    return await lan_sync.get_peers()

@app.post("/peer/{peer_id}/pull/{torrent_hash}")
async def pull_from_peer(peer_id: str, torrent_hash: str, token: str = Depends(verify_token)):
    """Pull a torrent from a LAN peer"""
    try:
        result = await lan_sync.pull_torrent(peer_id, torrent_hash)
        
        await broadcast_message({
            "type": "peer_pull_completed",
            "data": {
                "peer_id": peer_id,
                "torrent_hash": torrent_hash,
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return result
    except Exception as e:
        logger.error(f"Error pulling from peer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Settings endpoints

@app.get("/settings")
async def get_settings(token: str = Depends(verify_token)):
    """Get current settings"""
    try:
        # Convert to dict properly, excluding internal fields
        settings_dict = {}
        
        # Get all the actual settings values, not the FieldInfo objects
        for field_name, field_info in settings.__fields__.items():
            value = getattr(settings, field_name, None)
            settings_dict[field_name] = value
            
        return settings_dict
        
    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        # Return a basic settings dict as fallback
        return {
            "api_key": "***hidden***",
            "download_path": "./downloads",
            "max_download_rate": 0,
            "max_upload_rate": 0,
            "max_connections": 200,
            "max_uploads": 4,
            "use_proxy": False,
            "proxy_type": "socks5",
            "proxy_host": "127.0.0.1",
            "proxy_port": 9050,
            "enable_encryption": False,
            "lan_sync_enabled": True,
            "device_name": "Hybrid Torrent Client",
            "theme": "dark"
        }

@app.post("/settings")
async def update_settings(new_settings: dict, token: str = Depends(verify_token)):
    """Update settings"""
    try:
        # Update individual fields instead of calling settings.update()
        for key, value in new_settings.items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        
        # ✅ CRITICAL: Update uploader settings when settings change
        for uploader in uploaders.values():
            uploader.settings = settings
        
        # Update torrent manager if it exists and is running
        if hasattr(torrent_manager, 'update_settings'):
            await torrent_manager.update_settings(settings)
        
        await broadcast_message({
            "type": "settings_updated",
            "data": {
                "updated_keys": list(new_settings.keys()),
                "timestamp": asyncio.get_event_loop().time()
            }
        })
            
        return {"status": "updated", "message": "Settings updated successfully"}
        
    except Exception as e:
        logger.error(f"Error updating settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update settings: {str(e)}")

@app.post("/settings/reload")
async def reload_settings(token: str = Depends(verify_token)):
    """Reload settings for all components"""
    try:
        # Refresh uploader settings
        for uploader in uploaders.values():
            uploader.settings = settings
        
        # Test connections
        connection_status = {}
        for provider_name, uploader in uploaders.items():
            try:
                is_connected = await uploader.test_connection()
                connection_status[provider_name.value] = {
                    "connected": is_connected,
                    "configured": True
                }
            except Exception as e:
                connection_status[provider_name.value] = {
                    "connected": False,
                    "configured": False,
                    "error": str(e)
                }
        
        return {
            "status": "reloaded",
            "providers": connection_status,
            "settings_summary": {
                "webdav_configured": bool(settings.webdav_url and settings.webdav_username and settings.webdav_password),
                "gdrive_configured": bool(settings.gdrive_credentials_path),
                "s3_configured": bool(settings.s3_access_key and settings.s3_secret_key and settings.s3_bucket)
            }
        }
        
    except Exception as e:
        logger.error(f"Error reloading settings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Statistics endpoint
@app.get("/stats/bandwidth")
async def get_bandwidth_stats(token: str = Depends(verify_token)):
    """Get current bandwidth statistics"""
    return await torrent_manager.get_bandwidth_stats()

# WebSocket endpoint

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, api_key: Optional[str] = None):
    """WebSocket for real-time updates"""
    # Simple auth check for WebSocket
    if api_key != settings.api_key:
        await websocket.close(code=4001, reason="Unauthorized")
        return
    
    await websocket.accept()
    active_connections.append(websocket)
    logger.info(f"WebSocket client connected. Total: {len(active_connections)}")
    
    try:
        # Send initial data immediately
        torrents = await torrent_manager.get_all_torrents()
        bandwidth_stats = await torrent_manager.get_bandwidth_stats()
        
        initial_message = {
            "type": "initial_data",
            "data": {
                "torrents": [
                    {
                        "hash": t.hash,
                        "name": t.name,
                        "size": t.size,
                        "status": t.status.value,
                        "progress": t.progress,
                        "download_rate": t.download_rate,
                        "upload_rate": t.upload_rate,
                        "downloaded": t.downloaded,
                        "uploaded": t.uploaded,
                        "peers": t.peers,
                        "seeds": t.seeds,
                        "eta": t.eta,
                        "save_path": t.save_path,
                        "added_time": t.added_time.isoformat() if t.added_time else None,
                        "completed_time": t.completed_time.isoformat() if t.completed_time else None
                    } for t in torrents
                ],
                "stats": bandwidth_stats,
                "timestamp": asyncio.get_event_loop().time()
            }
        }
        
        await websocket.send_text(json.dumps(initial_message, default=str))
        
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "timestamp": asyncio.get_event_loop().time()
                }))
                
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total: {len(active_connections)}")

# Additional API endpoints for better functionality

@app.post("/torrent/{torrent_hash}/stop_seeding")
async def stop_seeding(torrent_hash: str, token: str = Depends(verify_token)):
    """Stop seeding and mark torrent as completed"""
    try:
        handle = torrent_manager.torrents.get(torrent_hash)
        if not handle:
            raise HTTPException(status_code=404, detail="Torrent not found")
        
        # Pause the torrent to stop seeding
        if torrent_manager.use_real_libtorrent and hasattr(handle, 'pause'):
            handle.pause()
        
        # Update status to completed instead of seeding
        await database.update_torrent_status(torrent_hash, TorrentStatus.COMPLETED, 100.0)
        
        await broadcast_message({
            "type": "torrent_completed",
            "data": {
                "hash": torrent_hash,
                "status": "completed",
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return {"status": "stopped_seeding", "message": "Torrent stopped seeding and marked as completed"}
        
    except Exception as e:
        logger.error(f"Error stopping seeding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Add this improved endpoint to your main.py to replace the existing mark_completed endpoint

@app.post("/torrent/{torrent_hash}/mark_completed")
async def mark_completed(torrent_hash: str, token: str = Depends(verify_token)):
    """Mark a seeding torrent as completed and stop seeding permanently"""
    try:
        # Get current torrent
        torrent = await torrent_manager.get_torrent(torrent_hash)
        if not torrent:
            raise HTTPException(status_code=404, detail="Torrent not found")
        
        # Must be 100% downloaded
        if torrent.progress < 100.0:
            raise HTTPException(
                status_code=400, 
                detail=f"Torrent not fully downloaded. Progress: {torrent.progress:.1f}%"
            )
        
        # Verify files exist
        import os
        if not os.path.exists(torrent.save_path):
            raise HTTPException(status_code=400, detail="Torrent files not found")
        
        # ✅ CRITICAL FIX: Properly stop seeding in libtorrent
        handle = torrent_manager.torrents.get(torrent_hash)
        if handle and torrent_manager.use_real_libtorrent:
            try:
                # Method 1: Remove torrent from session but keep files
                logger.info(f"Removing torrent from session to stop seeding: {torrent_hash}")
                torrent_manager.session.remove_torrent(handle)
                
                # Remove from active torrents dict
                if torrent_hash in torrent_manager.torrents:
                    del torrent_manager.torrents[torrent_hash]
                    
                logger.info(f"Successfully removed torrent from libtorrent session: {torrent_hash}")
                
            except Exception as lt_error:
                logger.warning(f"Could not remove from libtorrent session: {lt_error}")
                
                # Fallback method: Just pause it
                try:
                    handle.pause()
                    logger.info(f"Paused torrent as fallback: {torrent_hash}")
                except Exception as pause_error:
                    logger.warning(f"Could not pause torrent: {pause_error}")
        
        # Update database status to completed
        await database.update_torrent_status(torrent_hash, TorrentStatus.COMPLETED, 100.0)
        
        # ✅ ALSO ADD: Mark in database that this torrent should not be resumed
        metadata = {
            "stopped_seeding": True,
            "stopped_time": datetime.now().isoformat(),
            "manual_stop": True
        }
        await database.update_torrent_metadata(torrent_hash, metadata)
        
        await broadcast_message({
            "type": "torrent_marked_completed",
            "data": {
                "hash": torrent_hash,
                "name": torrent.name,
                "status": "completed",
                "message": "Stopped seeding permanently",
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return {
            "status": "completed",
            "message": "Torrent stopped seeding and marked as completed permanently",
            "ready_for_upload": True,
            "stopped_seeding": True
        }
        
    except Exception as e:
        logger.error(f"Error marking completed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ✅ ALSO ADD: A separate endpoint for permanent stop seeding
@app.post("/torrent/{torrent_hash}/stop_seeding")
async def stop_seeding_permanently(torrent_hash: str, token: str = Depends(verify_token)):
    """Permanently stop seeding a torrent"""
    try:
        # Get current torrent
        torrent = await torrent_manager.get_torrent(torrent_hash)
        if not torrent:
            raise HTTPException(status_code=404, detail="Torrent not found")
        
        # Must be seeding or completed
        if torrent.status not in [TorrentStatus.SEEDING, TorrentStatus.COMPLETED]:
            raise HTTPException(
                status_code=400, 
                detail=f"Torrent must be seeding or completed to stop seeding. Current status: {torrent.status.value}"
            )
        
        # ✅ PERMANENTLY remove from libtorrent session
        handle = torrent_manager.torrents.get(torrent_hash)
        if handle and torrent_manager.use_real_libtorrent:
            try:
                # Remove from session completely
                torrent_manager.session.remove_torrent(handle)
                logger.info(f"Removed torrent from libtorrent session: {torrent_hash}")
            except Exception as e:
                logger.warning(f"Could not remove from session: {e}")
                # Try to pause as fallback
                try:
                    handle.pause()
                except:
                    pass
        
        # Remove from torrents dict so it won't be monitored
        if torrent_hash in torrent_manager.torrents:
            del torrent_manager.torrents[torrent_hash]
            logger.info(f"Removed torrent from active monitoring: {torrent_hash}")
        
        # Update database
        await database.update_torrent_status(torrent_hash, TorrentStatus.COMPLETED, torrent.progress)
        
        # Mark as permanently stopped
        metadata = {
            "stopped_seeding": True,
            "stopped_time": datetime.now().isoformat(),
            "manual_stop": True,
            "final_status": "completed"
        }
        await database.update_torrent_metadata(torrent_hash, metadata)
        
        await broadcast_message({
            "type": "torrent_seeding_stopped",
            "data": {
                "hash": torrent_hash,
                "name": torrent.name,
                "status": "completed",
                "message": "Permanently stopped seeding",
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return {
            "status": "stopped",
            "message": "Torrent seeding stopped permanently",
            "new_status": "completed"
        }
        
    except Exception as e:
        logger.error(f"Error stopping seeding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ✅ ENHANCED: Update the torrent manager to not resume stopped torrents
# Add this method to your TorrentManager class in torrents.py

async def resume_saved_torrents(self):
    """Resume torrents from database - but skip manually stopped ones"""
    try:
        saved_torrents = await self.database.get_all_torrents()
        
        for torrent_data in saved_torrents:
            try:
                # ✅ SKIP torrents that were manually stopped from seeding
                metadata = torrent_data.get("metadata", {})
                if isinstance(metadata, str):
                    try:
                        metadata = json.loads(metadata)
                    except:
                        metadata = {}
                
                if metadata.get("stopped_seeding") or metadata.get("manual_stop"):
                    logger.info(f"Skipping resume for manually stopped torrent: {torrent_data.get('name', 'Unknown')}")
                    continue
                
                # Only resume if it was actively downloading or seeding
                status = torrent_data.get("status", "")
                if status in ["downloading", "seeding"] and torrent_data.get("magnet_link"):
                    await self.add_magnet(torrent_data["magnet_link"])
                    logger.info(f"Resumed torrent: {torrent_data.get('name', 'Unknown')}")
                    
            except Exception as e:
                logger.error(f"Error resuming torrent: {e}")
        
    except Exception as e:
        logger.error(f"Error resuming saved torrents: {e}")


# ✅ ALSO UPDATE: The monitoring loop to respect stopped torrents
async def monitor_torrents(self):
    """Monitor torrent status and update database - skip stopped ones"""
    while self.running:
        try:
            for torrent_hash, handle in list(self.torrents.items()):
                # ✅ CHECK: Skip monitoring if torrent was manually stopped
                try:
                    torrent_data = await self.database.get_torrent(torrent_hash)
                    if torrent_data:
                        metadata = torrent_data.get("metadata", {})
                        if isinstance(metadata, str):
                            try:
                                metadata = json.loads(metadata)
                            except:
                                metadata = {}
                        
                        if metadata.get("stopped_seeding") or metadata.get("manual_stop"):
                            # Remove from monitoring
                            logger.debug(f"Removing stopped torrent from monitoring: {torrent_hash}")
                            continue
                except Exception as db_error:
                    logger.debug(f"Could not check torrent metadata: {db_error}")
                
                # Continue with normal monitoring for active torrents...
                if not handle.is_valid():
                    continue
                
                # [Rest of your existing monitoring code...]
                status = handle.status()
                progress = status.progress * 100
                
                # Determine current status
                if status.paused:
                    torrent_status = TorrentStatus.PAUSED
                elif hasattr(status, 'error') and status.error:
                    torrent_status = TorrentStatus.ERROR
                elif hasattr(status, 'state'):
                    if status.state == self.lt.torrent_status.checking_files:
                        torrent_status = TorrentStatus.CHECKING
                    elif status.state == self.lt.torrent_status.downloading_metadata:
                        torrent_status = TorrentStatus.DOWNLOADING
                    elif status.state == self.lt.torrent_status.downloading:
                        torrent_status = TorrentStatus.DOWNLOADING
                    elif status.state == self.lt.torrent_status.seeding:
                        torrent_status = TorrentStatus.SEEDING
                    elif status.state == self.lt.torrent_status.finished:
                        torrent_status = TorrentStatus.COMPLETED
                    else:
                        torrent_status = TorrentStatus.QUEUED
                else:
                    torrent_status = TorrentStatus.DOWNLOADING
                
                # Update database with current status
                await self.database.update_torrent_status(torrent_hash, torrent_status, progress)
                
                # Update metadata with current transfer stats
                metadata = {
                    "download_rate": getattr(status, 'download_rate', 0),
                    "upload_rate": getattr(status, 'upload_rate', 0),
                    "downloaded": getattr(status, 'total_wanted_done', 0),
                    "uploaded": getattr(status, 'total_upload', 0),
                    "peers": getattr(status, 'num_peers', 0),
                    "seeds": getattr(status, 'num_seeds', 0),
                    "last_updated": datetime.now().isoformat()
                }
                await self.database.update_torrent_metadata(torrent_hash, metadata)
            
            await asyncio.sleep(2)  # Update every 2 seconds
            
        except Exception as e:
            logger.error(f"Error monitoring torrents: {e}")
            await asyncio.sleep(5)

@app.get("/torrent/{torrent_hash}/peers")
async def get_torrent_peers(torrent_hash: str, token: str = Depends(verify_token)):
    """Get peers for a specific torrent"""
    # Mock peer data - replace with real implementation
    return [
        {
            "ip": "192.168.1.100",
            "port": 51234,
            "client": "qBittorrent 4.5.0",
            "progress": 0.85,
            "download_rate": 1024 * 150,
            "upload_rate": 1024 * 50,
            "flags": "uE"
        },
        {
            "ip": "10.0.0.25",
            "port": 6881,
            "client": "Transmission 3.0",
            "progress": 0.92,
            "download_rate": 1024 * 80,
            "upload_rate": 1024 * 120,
            "flags": "uD"
        }
    ]

@app.get("/torrent/{torrent_hash}/trackers")
async def get_torrent_trackers(torrent_hash: str, token: str = Depends(verify_token)):
    """Get trackers for a specific torrent"""
    # Mock tracker data - replace with real implementation
    return [
        {
            "url": "http://tracker.example.com:8080/announce",
            "tier": 0,
            "source": "torrent",
            "status": "working",
            "last_announce": "2024-01-15T10:30:00Z",
            "next_announce": "2024-01-15T11:00:00Z",
            "seeders": 45,
            "leechers": 12,
            "downloaded": 1532
        }
    ]

@app.get("/torrent/{torrent_hash}/pieces")
async def get_torrent_pieces(torrent_hash: str, token: str = Depends(verify_token)):
    """Get piece information for a specific torrent"""
    # Mock piece data - replace with real implementation
    return {
        "piece_count": 1024,
        "piece_size": 262144,  # 256KB
        "completed_pieces": 512,
        "partial_pieces": [
            {"index": 513, "blocks_downloaded": 12, "total_blocks": 16},
            {"index": 514, "blocks_downloaded": 8, "total_blocks": 16}
        ]
    }

@app.post("/torrent/{torrent_hash}/reannounce")
async def force_reannounce(torrent_hash: str, token: str = Depends(verify_token)):
    """Force reannounce to trackers"""
    handle = torrent_manager.torrents.get(torrent_hash)
    if not handle:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    try:
        if torrent_manager.use_real_libtorrent and hasattr(handle, 'force_reannounce'):
            handle.force_reannounce()
        
        await broadcast_message({
            "type": "torrent_reannounced",
            "data": {
                "hash": torrent_hash,
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return {"status": "reannounced"}
    except Exception as e:
        logger.error(f"Error forcing reannounce: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/torrent/{torrent_hash}/recheck")
async def force_recheck(torrent_hash: str, token: str = Depends(verify_token)):
    """Force recheck of torrent files"""
    handle = torrent_manager.torrents.get(torrent_hash)
    if not handle:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    try:
        if torrent_manager.use_real_libtorrent and hasattr(handle, 'force_recheck'):
            handle.force_recheck()
        
        await broadcast_message({
            "type": "torrent_rechecking",
            "data": {
                "hash": torrent_hash,
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return {"status": "rechecking"}
    except Exception as e:
        logger.error(f"Error forcing recheck: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/torrent/{torrent_hash}/priority")
async def set_torrent_priority(
    torrent_hash: str, 
    priority: int, 
    token: str = Depends(verify_token)
):
    """Set torrent priority (0-255)"""
    if not 0 <= priority <= 255:
        raise HTTPException(status_code=400, detail="Priority must be between 0 and 255")
    
    success = await torrent_manager.set_torrent_priority(torrent_hash, priority)
    if not success:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    return {"status": "priority_set", "priority": priority}

@app.post("/torrent/{torrent_hash}/move")
async def move_torrent_storage(
    torrent_hash: str,
    new_path: str,
    token: str = Depends(verify_token)
):
    """Move torrent storage location"""
    handle = torrent_manager.torrents.get(torrent_hash)
    if not handle:
        raise HTTPException(status_code=404, detail="Torrent not found")
    
    try:
        # Ensure new path exists
        os.makedirs(new_path, exist_ok=True)
        
        if torrent_manager.use_real_libtorrent and hasattr(handle, 'move_storage'):
            handle.move_storage(new_path)
        
        await broadcast_message({
            "type": "torrent_moved",
            "data": {
                "hash": torrent_hash,
                "new_path": new_path,
                "timestamp": asyncio.get_event_loop().time()
            }
        })
        
        return {"status": "moved", "new_path": new_path}
    except Exception as e:
        logger.error(f"Error moving torrent storage: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# System information endpoints

@app.get("/system/info")
async def get_system_info(token: str = Depends(verify_token)):
    """Get system information"""
    import platform
    import psutil
    
    try:
        return {
            "platform": platform.system(),
            "platform_version": platform.version(),
            "python_version": platform.python_version(),
            "cpu_count": psutil.cpu_count(),
            "memory_total": psutil.virtual_memory().total,
            "memory_available": psutil.virtual_memory().available,
            "disk_usage": {
                "total": psutil.disk_usage(settings.download_path).total,
                "free": psutil.disk_usage(settings.download_path).free,
                "used": psutil.disk_usage(settings.download_path).used
            },
            "libtorrent_version": getattr(torrent_manager.lt, 'version', 'Mock') if torrent_manager.lt else 'Mock',
            "using_real_libtorrent": torrent_manager.use_real_libtorrent
        }
    except ImportError:
        # If psutil is not available, return basic info
        return {
            "platform": platform.system(),
            "python_version": platform.python_version(),
            "libtorrent_version": getattr(torrent_manager.lt, 'version', 'Mock') if torrent_manager.lt else 'Mock',
            "using_real_libtorrent": torrent_manager.use_real_libtorrent
        }

@app.get("/logs/recent")
async def get_recent_logs(lines: int = 100, token: str = Depends(verify_token)):
    """Get recent log entries"""
    # This would need to be implemented based on your logging setup
    # For now, return a simple message
    return {
        "message": "Log retrieval not implemented yet",
        "lines_requested": lines
    }

# Import os at the top if not already imported
import os

if __name__ == "__main__":
    # Ensure required directories exist
    os.makedirs(settings.download_path, exist_ok=True)
    os.makedirs("./data", exist_ok=True)
    os.makedirs("./logs", exist_ok=True)
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info"
    )