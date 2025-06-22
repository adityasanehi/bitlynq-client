from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime

class TorrentStatus(str, Enum):
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    PAUSED = "paused"
    ERROR = "error"
    SEEDING = "seeding"
    CHECKING = "checking"
    QUEUED = "queued"

class CloudProvider(str, Enum):
    GDRIVE = "gdrive"
    S3 = "s3"
    WEBDAV = "webdav"

class TorrentInfo(BaseModel):
    hash: str
    name: str
    size: int
    status: TorrentStatus
    progress: float = Field(ge=0, le=100)
    download_rate: int = 0  # bytes per second
    upload_rate: int = 0
    downloaded: int = 0
    uploaded: int = 0
    peers: int = 0
    seeds: int = 0
    eta: Optional[int] = None  # seconds remaining
    save_path: str
    magnet_link: Optional[str] = None
    added_time: datetime
    completed_time: Optional[datetime] = None
    files: List[Dict[str, Any]] = []

class TorrentAddRequest(BaseModel):
    magnet_link: Optional[str] = None
    save_path: Optional[str] = None
    priority: int = Field(default=0, ge=0, le=255)

class CloudUploadRequest(BaseModel):
    torrent_hash: str
    provider: CloudProvider
    destination_path: Optional[str] = None

class CloudUploadRecord(BaseModel):
    id: int
    torrent_hash: str
    provider: str
    upload_url: str
    upload_time: datetime
    file_size: int

class PeerInfo(BaseModel):
    id: str
    name: str
    ip_address: str
    port: int
    available_torrents: List[str] = []
    last_seen: datetime

class LANSyncRequest(BaseModel):
    peer_id: str
    torrent_hash: str
    verify_integrity: bool = True

class SettingsModel(BaseModel):
    # Download settings
    download_path: str = "./downloads"
    max_download_rate: int = 0  # 0 = unlimited (bytes/s)
    max_upload_rate: int = 0
    max_connections: int = 200
    max_uploads: int = 4
    
    # Privacy settings
    use_proxy: bool = False
    proxy_type: str = "socks5"  # socks5, http
    proxy_host: str = "127.0.0.1"
    proxy_port: int = 9050
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None
    
    # Encryption
    enable_encryption: bool = False
    encryption_key: Optional[str] = None
    
    # LAN sync
    lan_sync_enabled: bool = True
    lan_sync_port: int = 8001
    device_name: str = "Hybrid Torrent Client"
    
    # Cloud providers
    gdrive_credentials_path: Optional[str] = None
    s3_access_key: Optional[str] = None
    s3_secret_key: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_region: str = "us-east-1"
    webdav_url: Optional[str] = None
    webdav_username: Optional[str] = None
    webdav_password: Optional[str] = None
    
    # Security
    api_key: str = "your-secret-api-key-change-this"
    enable_tls: bool = False
    tls_cert_path: Optional[str] = None
    tls_key_path: Optional[str] = None

class StatusResponse(BaseModel):
    status: str
    message: Optional[str] = None

class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None

class WebSocketMessage(BaseModel):
    type: str
    data: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class TorrentSearchResult(BaseModel):
    name: str
    magnet: str
    size: int
    seeds: int
    leeches: int
    source: str

class BandwidthStats(BaseModel):
    download_rate: int
    upload_rate: int
    total_downloaded: int
    total_uploaded: int
    session_downloaded: int
    session_uploaded: int

class SystemStats(BaseModel):
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    network_stats: BandwidthStats
    active_torrents: int
    total_peers: int