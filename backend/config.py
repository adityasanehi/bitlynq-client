import os
from typing import Optional
from pydantic_settings import BaseSettings

import json

class Settings(BaseSettings):
    # API Settings
    api_key: str = "your-secret-api-key-change-this"
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # Database
    database_path: str = "bitlynq.db"
    
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
    proxy_port: int = 9050  # Tor default
    proxy_username: Optional[str] = None
    proxy_password: Optional[str] = None
    
    # Encryption
    enable_encryption: bool = False
    encryption_key: Optional[str] = None
    
    # LAN sync
    lan_sync_enabled: bool = True
    lan_sync_port: int = 8001
    device_name: str = "BitLynq Client"
    mdns_service_name: str = "_bitlynq._tcp.local."
    
    # Cloud providers - Google Drive
    gdrive_credentials_path: Optional[str] = None
    gdrive_folder_id: Optional[str] = None  # Root folder if None
    
    # Cloud providers - AWS S3
    s3_access_key: Optional[str] = None
    s3_secret_key: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_region: str = "us-east-1"
    s3_endpoint_url: Optional[str] = None  # For S3-compatible services
    
    # Cloud providers - WebDAV
    webdav_url: Optional[str] = None
    webdav_username: Optional[str] = None
    webdav_password: Optional[str] = None
    webdav_root_path: str = "/torrents"
    
    # Security
    enable_tls: bool = False
    tls_cert_path: Optional[str] = None
    tls_key_path: Optional[str] = None
    cors_origins: list = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Torrent settings
    listen_port_min: int = 6881
    listen_port_max: int = 6889
    enable_dht: bool = True
    enable_lsd: bool = True  # Local Service Discovery
    enable_upnp: bool = True
    enable_natpmp: bool = True
    
    # Advanced torrent settings
    announce_timeout: int = 30
    max_peerlist_size: int = 3000
    max_paused_peerlist_size: int = 1000
    min_reconnect_time: int = 60
    peer_connect_timeout: int = 15
    
    # Scheduling
    enable_scheduling: bool = False
    schedule_start_time: str = "22:00"  # Start downloads at 10 PM
    schedule_stop_time: str = "06:00"   # Stop downloads at 6 AM
    schedule_days: list = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    
    # Watch folders
    enable_watch_folders: bool = False
    watch_folders: list = []
    watch_folder_scan_interval: int = 30  # seconds
    
    # UI Settings
    theme: str = "dark"
    language: str = "en"
    enable_notifications: bool = True
    auto_refresh_interval: int = 1000  # milliseconds
    
    # Logging
    log_level: str = "INFO"
    log_file: Optional[str] = None
    max_log_size: int = 10 * 1024 * 1024  # 10MB
    log_backup_count: int = 5
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._ensure_directories()
    
    def _ensure_directories(self):
        """Ensure required directories exist"""
        os.makedirs(self.download_path, exist_ok=True)
        
        # Create logs directory if log file is specified
        if self.log_file:
            log_dir = os.path.dirname(self.log_file)
            if log_dir:
                os.makedirs(log_dir, exist_ok=True)
    
    def update(self, new_settings: dict):
        """Update settings with new values"""
        for key, value in new_settings.items():
            if hasattr(self, key):
                setattr(self, key, value)
        
        self._ensure_directories()
    
    def to_dict(self) -> dict:
        """Convert settings to dictionary"""
        return {
            key: getattr(self, key)
            for key in dir(self)
            if not key.startswith('_') and not callable(getattr(self, key))
        }
    
    def dict(self) -> dict:
        """Alias for to_dict() for compatibility"""
        return self.to_dict()
    
    def save_to_file(self, file_path: str):
        """Save settings to JSON file"""
        with open(file_path, 'w') as f:
            json.dump(self.to_dict(), f, indent=2, default=str)
    
    @classmethod
    def load_from_file(cls, file_path: str):
        """Load settings from JSON file"""
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                data = json.load(f)
                return cls(**data)
        return cls()
    
    def is_cloud_provider_configured(self, provider: str) -> bool:
        """Check if a cloud provider is properly configured"""
        if provider.lower() == "gdrive":
            return bool(self.gdrive_credentials_path and os.path.exists(self.gdrive_credentials_path))
        elif provider.lower() == "s3":
            return bool(self.s3_access_key and self.s3_secret_key and self.s3_bucket)
        elif provider.lower() == "webdav":
            return bool(self.webdav_url and self.webdav_username and self.webdav_password)
        return False
    
    def get_configured_cloud_providers(self) -> list:
        """Get list of configured cloud providers"""
        providers = []
        if self.is_cloud_provider_configured("gdrive"):
            providers.append("gdrive")
        if self.is_cloud_provider_configured("s3"):
            providers.append("s3")
        if self.is_cloud_provider_configured("webdav"):
            providers.append("webdav")
        return providers

# Global settings instance
settings = Settings()