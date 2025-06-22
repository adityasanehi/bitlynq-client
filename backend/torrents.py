import asyncio
import logging
import os
import time
from datetime import datetime
from typing import List, Optional, Dict, Any
import hashlib
import base64
import threading
import libtorrent as lt
from models import TorrentInfo, TorrentStatus, SettingsModel
from database import Database

logger = logging.getLogger(__name__)

class TorrentManager:
    def __init__(self, database: Database):
        self.session = None
        self.database = database
        self.torrents: Dict[str, Any] = {}  # Can be lt.torrent_handle or mock
        self.settings = None
        self.running = False
        self.use_real_libtorrent = False
        self.lt = None
        self.monitor_task = None
        self.alert_task = None
        
    async def start(self):
        """Initialize the torrent session"""
        try:
            # Try to import and use real libtorrent
            
            self.lt = lt
            
            # Test if we can create a session
            self.session = lt.session()
            
            # Try different ways to create settings based on libtorrent version
            settings = None
            try:
                # New API (libtorrent 1.2+ / 2.0+)
                settings = lt.settings_pack()
                logger.info("Using libtorrent new API (settings_pack)")
                
                # Configure settings with new API
                settings.set_str(lt.settings_pack.user_agent, "HybridTorrentClient/1.0")
                settings.set_bool(lt.settings_pack.enable_dht, True)
                settings.set_bool(lt.settings_pack.enable_lsd, True)
                settings.set_bool(lt.settings_pack.enable_upnp, True)
                settings.set_bool(lt.settings_pack.enable_natpmp, True)
                
                # Set alert mask to receive all important alerts
                settings.set_int(lt.settings_pack.alert_mask, 
                            lt.alert_category_t.all_categories)
                
                # DHT settings for better peer discovery
                settings.set_bool(lt.settings_pack.broadcast_lsd, True)
                settings.set_int(lt.settings_pack.download_rate_limit, 0)
                settings.set_int(lt.settings_pack.upload_rate_limit, 0)
                
                # Connection settings
                settings.set_int(lt.settings_pack.connections_limit, 200)
                settings.set_int(lt.settings_pack.unchoke_slots_limit, 8)
                
                # Apply settings
                self.session.apply_settings(settings)
                
            except AttributeError:
                try:
                    # Older API (libtorrent 0.16.x / 1.0.x / 1.1.x)
                    logger.info("Using libtorrent legacy API (session_settings)")
                    
                    # For older versions, use direct session configuration
                    settings = lt.session_settings()
                    settings.user_agent = "HybridTorrentClient/1.0"
                    settings.enable_dht = True
                    settings.enable_lsd = True
                    settings.enable_upnp = True
                    settings.enable_natpmp = True
                    
                    # Apply settings with old API
                    self.session.set_settings(settings)
                    
                    # Set alert mask (different way for old API)
                    try:
                        self.session.set_alert_mask(lt.alert.all_categories)
                    except:
                        # Even older API
                        self.session.set_alert_mask(0xffffffff)
                    
                except AttributeError:
                    # Very old API or custom build
                    logger.warning("Using basic libtorrent configuration")
                    # Just use basic session without advanced settings
            
            # Set listen port range
            try:
                self.session.listen_on(6881, 6889)
            except:
                # Older API
                try:
                    self.session.listen_on((6881, 6889))
                except:
                    logger.warning("Could not set listen ports")
            
            # Add DHT routers for better peer discovery
            try:
                self.session.add_dht_router("router.bittorrent.com", 6881)
                self.session.add_dht_router("router.utorrent.com", 6881)
                self.session.add_dht_router("dht.transmissionbt.com", 6881)
                self.session.add_dht_router("dht.aelitis.com", 6881)
            except:
                logger.warning("Could not add DHT routers")
            
            # Start DHT
            try:
                if hasattr(self.session, 'start_dht'):
                    self.session.start_dht()
                elif hasattr(self.session, 'add_dht_router'):
                    # DHT should start automatically
                    pass
            except:
                logger.warning("Could not start DHT")
            
            self.use_real_libtorrent = True
            logger.info(f"Real libtorrent initialized successfully - Version: {getattr(lt, 'version', 'unknown')}")
            
        except (ImportError, AttributeError, Exception) as e:
            logger.warning(f"Failed to initialize real libtorrent: {e}")
            logger.info("Falling back to mock implementation")
            self.use_real_libtorrent = False
            self.session = MockTorrentSession()
        
        self.running = True
        
        # Start background monitoring tasks
        if self.use_real_libtorrent:
            self.alert_task = asyncio.create_task(self.process_alerts())
            self.monitor_task = asyncio.create_task(self.monitor_torrents())
        else:
            self.monitor_task = asyncio.create_task(self.monitor_mock_torrents())
        
        # Resume existing torrents from database
        await self.resume_saved_torrents()
        
        logger.info("Torrent manager started")

    
    async def stop(self):
        """Stop the torrent session"""
        self.running = False
        
        # Cancel background tasks
        if self.alert_task:
            self.alert_task.cancel()
        if self.monitor_task:
            self.monitor_task.cancel()
        
        if self.session:
            if self.use_real_libtorrent:
                # Save session state
                await self.save_session_state()
                
                # Pause all torrents gracefully
                for handle in self.torrents.values():
                    if hasattr(handle, 'pause'):
                        handle.pause()
                
                # Wait a bit for torrents to pause
                await asyncio.sleep(1)
            
            self.session = None
        
        logger.info("Torrent manager stopped")
    
    async def process_alerts(self):
        """Process libtorrent alerts in background"""
        while self.running:
            try:
                if self.session and self.use_real_libtorrent:
                    alerts = self.session.pop_alerts()
                    
                    for alert in alerts:
                        await self.handle_alert(alert)
                
                await asyncio.sleep(0.1)  # Process alerts frequently
                
            except Exception as e:
                logger.error(f"Error processing alerts: {e}")
                await asyncio.sleep(1)
    
    async def handle_alert(self, alert):
        """Handle specific libtorrent alerts"""
        try:
            alert_type = type(alert).__name__
            
            if alert_type == 'torrent_added_alert':
                logger.info(f"Torrent added: {alert.handle.info_hash()}")
                
            elif alert_type == 'metadata_received_alert':
                logger.info(f"Metadata received for: {alert.handle.info_hash()}")
                await self.update_torrent_info(alert.handle)
                
            elif alert_type == 'torrent_finished_alert':
                logger.info(f"Torrent finished: {alert.handle.info_hash()}")
                torrent_hash = str(alert.handle.info_hash())
                await self.database.update_torrent_status(torrent_hash, TorrentStatus.COMPLETED, 100.0)
                
            elif alert_type == 'torrent_paused_alert':
                logger.info(f"Torrent paused: {alert.handle.info_hash()}")
                torrent_hash = str(alert.handle.info_hash())
                await self.database.update_torrent_status(torrent_hash, TorrentStatus.PAUSED)
                
            elif alert_type == 'torrent_resumed_alert':
                logger.info(f"Torrent resumed: {alert.handle.info_hash()}")
                torrent_hash = str(alert.handle.info_hash())
                await self.database.update_torrent_status(torrent_hash, TorrentStatus.DOWNLOADING)
                
            elif alert_type == 'torrent_error_alert':
                logger.error(f"Torrent error: {alert.error} for {alert.handle.info_hash()}")
                torrent_hash = str(alert.handle.info_hash())
                await self.database.update_torrent_status(torrent_hash, TorrentStatus.ERROR)
                
            elif alert_type == 'peer_connect_alert':
                logger.debug(f"Peer connected: {alert.endpoint} for {alert.handle.info_hash()}")
                
            elif alert_type == 'tracker_announce_alert':
                logger.debug(f"Tracker announce: {alert.url} for {alert.handle.info_hash()}")
                
        except Exception as e:
            logger.error(f"Error handling alert {alert}: {e}")
    
    async def monitor_torrents(self):
        """Monitor torrent status and update database"""
        while self.running:
            try:
                for torrent_hash, handle in list(self.torrents.items()):
                    if not handle.is_valid():
                        continue
                    
                    status = handle.status()
                    
                    # Update progress
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
    
    async def monitor_mock_torrents(self):
        """Monitor mock torrent progress"""
        while self.running:
            try:
                for torrent_hash, handle in list(self.torrents.items()):
                    if hasattr(handle, 'update_progress'):
                        handle.update_progress()
                        
                        # Get updated info and save to database
                        torrent_info = handle.get_info()
                        await self.database.update_torrent_status(
                            torrent_hash, 
                            torrent_info.status, 
                            torrent_info.progress
                        )
                        
                        metadata = {
                            "download_rate": torrent_info.download_rate,
                            "upload_rate": torrent_info.upload_rate,
                            "downloaded": torrent_info.downloaded,
                            "uploaded": torrent_info.uploaded,
                            "peers": torrent_info.peers,
                            "seeds": torrent_info.seeds,
                            "last_updated": datetime.now().isoformat()
                        }
                        await self.database.update_torrent_metadata(torrent_hash, metadata)
                
                await asyncio.sleep(1)  # Update mock torrents every second
                
            except Exception as e:
                logger.error(f"Error monitoring mock torrents: {e}")
                await asyncio.sleep(5)
    
    async def update_torrent_info(self, handle):
        """Update torrent info when metadata is received"""
        try:
            torrent_info = await self.get_torrent_info(handle)
            await self.database.add_torrent(torrent_info)
            logger.info(f"Updated torrent info: {torrent_info.name}")
        except Exception as e:
            logger.error(f"Error updating torrent info: {e}")
    
    async def update_settings(self, settings: SettingsModel):
        """Update torrent session settings"""
        self.settings = settings
        
        if not self.session or not self.use_real_libtorrent:
            return
        
        try:
            # Create new settings pack
            session_settings = self.lt.settings_pack()
            
            # Download/upload limits
            if settings.max_download_rate > 0:
                session_settings.set_int(self.lt.settings_pack.download_rate_limit, settings.max_download_rate)
            if settings.max_upload_rate > 0:
                session_settings.set_int(self.lt.settings_pack.upload_rate_limit, settings.max_upload_rate)
            
            # Connection limits
            session_settings.set_int(self.lt.settings_pack.connections_limit, settings.max_connections)
            session_settings.set_int(self.lt.settings_pack.unchoke_slots_limit, settings.max_uploads)
            
            # Proxy settings
            if settings.use_proxy:
                if settings.proxy_type.lower() == "socks5":
                    proxy_type = self.lt.settings_pack.socks5
                else:
                    proxy_type = self.lt.settings_pack.http
                
                session_settings.set_int(self.lt.settings_pack.proxy_type, proxy_type)
                session_settings.set_str(self.lt.settings_pack.proxy_hostname, settings.proxy_host)
                session_settings.set_int(self.lt.settings_pack.proxy_port, settings.proxy_port)
                
                if settings.proxy_username:
                    session_settings.set_str(self.lt.settings_pack.proxy_username, settings.proxy_username)
                if settings.proxy_password:
                    session_settings.set_str(self.lt.settings_pack.proxy_password, settings.proxy_password)
            
            # Encryption
            if settings.enable_encryption:
                session_settings.set_int(self.lt.settings_pack.out_enc_policy, self.lt.settings_pack.pe_forced)
                session_settings.set_int(self.lt.settings_pack.in_enc_policy, self.lt.settings_pack.pe_forced)
            
            self.session.apply_settings(session_settings)
            logger.info("Session settings updated")
            
        except Exception as e:
            logger.error(f"Failed to update settings: {e}")
    
    async def add_magnet(self, magnet_link: str, save_path: Optional[str] = None) -> TorrentInfo:
        """Add a torrent from magnet link"""
        if not self.session:
            raise RuntimeError("Torrent session not initialized")
        
        if not self.use_real_libtorrent:
            return await self._add_magnet_mock(magnet_link, save_path)
        
        try:
            # Parse magnet link with version compatibility
            try:
                # New API
                params = self.lt.parse_magnet_uri(magnet_link)
            except AttributeError:
                # Older API - create add_torrent_params manually
                params = self.lt.add_torrent_params()
                
                # Extract info hash from magnet link
                import re
                hash_match = re.search(r'xt=urn:btih:([a-fA-F0-9]{40})', magnet_link)
                if hash_match:
                    info_hash = hash_match.group(1)
                    try:
                        # Try to set info_hash
                        params.info_hash = self.lt.sha1_hash(bytes.fromhex(info_hash))
                    except:
                        # Alternative way
                        params.url = magnet_link
                else:
                    # Fallback to URL
                    params.url = magnet_link
            
            if save_path:
                params.save_path = save_path
            elif self.settings:
                params.save_path = self.settings.download_path
            else:
                params.save_path = "./downloads"
            
            # Ensure save path exists
            os.makedirs(params.save_path, exist_ok=True)
            
            # Set additional parameters for better downloading
            try:
                params.auto_managed = True
                params.duplicate_is_error = False
            except:
                # Older versions might not have these
                pass
            
            # Add torrent with version compatibility
            try:
                handle = self.session.add_torrent(params)
            except Exception as e:
                logger.error(f"Failed to add torrent with params: {e}")
                # Try alternative method for older versions
                if hasattr(self.lt, 'add_magnet_uri'):
                    handle = self.lt.add_magnet_uri(self.session, magnet_link, {
                        'save_path': params.save_path,
                        'auto_managed': True
                    })
                else:
                    raise e
            
            torrent_hash = str(handle.info_hash())
            self.torrents[torrent_hash] = handle
            
            logger.info(f"Added magnet torrent with hash: {torrent_hash}")
            
            # Create initial torrent info (will be updated when metadata arrives)
            torrent_info = TorrentInfo(
                hash=torrent_hash,
                name=f"Loading... {torrent_hash[:8]}",
                size=0,
                status=TorrentStatus.DOWNLOADING,
                progress=0.0,
                download_rate=0,
                upload_rate=0,
                downloaded=0,
                uploaded=0,
                peers=0,
                seeds=0,
                eta=None,
                save_path=params.save_path,
                magnet_link=magnet_link,
                added_time=datetime.now(),
                completed_time=None,
                files=[]
            )
            
            # Save to database
            await self.database.add_torrent(torrent_info)
            
            # Wait briefly for metadata in background
            asyncio.create_task(self.wait_for_metadata_and_update(handle, torrent_hash))
            
            return torrent_info
            
        except Exception as e:
            logger.error(f"Error adding magnet: {e}")
            raise
    
    async def wait_for_metadata_and_update(self, handle, torrent_hash: str, timeout: int = 60):
        """Wait for metadata and update torrent info"""
        try:
            start_time = time.time()
            
            while not handle.torrent_file() and time.time() - start_time < timeout and self.running:
                await asyncio.sleep(0.5)
            
            if handle.torrent_file():
                # Update with real torrent info
                torrent_info = await self.get_torrent_info(handle)
                await self.database.add_torrent(torrent_info)
                logger.info(f"Metadata received for: {torrent_info.name}")
            else:
                logger.warning(f"Metadata not received for torrent {torrent_hash} within {timeout} seconds")
                
        except Exception as e:
            logger.error(f"Error waiting for metadata: {e}")
    
    # ... [Keep all existing methods: _add_magnet_mock, add_torrent_file, etc.] ...
    
    async def _add_magnet_mock(self, magnet_link: str, save_path: Optional[str] = None) -> TorrentInfo:
        """Mock implementation for adding magnet links"""
        # Extract hash from magnet link
        import re
        hash_match = re.search(r'xt=urn:btih:([a-fA-F0-9]{40})', magnet_link)
        torrent_hash = hash_match.group(1).lower() if hash_match else hashlib.sha1(magnet_link.encode()).hexdigest()
        
        # Extract name from magnet link
        name_match = re.search(r'dn=([^&]+)', magnet_link)
        name = name_match.group(1).replace('+', ' ') if name_match else f"Torrent_{torrent_hash[:8]}"
        
        # Create mock torrent info
        torrent_info = TorrentInfo(
            hash=torrent_hash,
            name=name,
            size=1024 * 1024 * 100,  # 100MB mock size
            status=TorrentStatus.DOWNLOADING,
            progress=0.0,
            download_rate=0,
            upload_rate=0,
            downloaded=0,
            uploaded=0,
            peers=0,
            seeds=0,
            eta=None,
            save_path=save_path or (self.settings.download_path if self.settings else "./downloads"),
            magnet_link=magnet_link,
            added_time=datetime.now(),
            completed_time=None,
            files=[]
        )
        
        # Store mock handle that will simulate progress
        self.torrents[torrent_hash] = MockTorrentHandle(torrent_info)
        
        # Save to database
        await self.database.add_torrent(torrent_info)
        
        logger.info(f"Added mock magnet torrent: {torrent_info.name}")
        return torrent_info
    
    async def add_torrent_file(self, torrent_data: bytes, filename: str, save_path: Optional[str] = None) -> TorrentInfo:
        """Add a torrent from .torrent file"""
        if not self.session:
            raise RuntimeError("Torrent session not initialized")
        
        if not self.use_real_libtorrent:
            return await self._add_torrent_file_mock(torrent_data, filename, save_path)
        
        try:
            # Parse torrent file
            info = self.lt.torrent_info(torrent_data)
            
            params = self.lt.add_torrent_params()
            params.ti = info
            
            if save_path:
                params.save_path = save_path
            elif self.settings:
                params.save_path = self.settings.download_path
            else:
                params.save_path = "./downloads"
            
            # Ensure save path exists
            os.makedirs(params.save_path, exist_ok=True)
            
            params.auto_managed = True
            params.duplicate_is_error = False
            
            # Add torrent
            handle = self.session.add_torrent(params)
            torrent_hash = str(handle.info_hash())
            
            self.torrents[torrent_hash] = handle
            
            # Create torrent info
            torrent_info = await self.get_torrent_info(handle)
            
            # Save to database
            await self.database.add_torrent(torrent_info)
            
            logger.info(f"Added file torrent: {torrent_info.name}")
            return torrent_info
            
        except Exception as e:
            logger.error(f"Error adding torrent file: {e}")
            raise
    
    async def _add_torrent_file_mock(self, torrent_data: bytes, filename: str, save_path: Optional[str] = None) -> TorrentInfo:
        """Mock implementation for adding torrent files"""
        torrent_hash = hashlib.sha1(torrent_data).hexdigest()
        name = os.path.splitext(filename)[0]
        
        torrent_info = TorrentInfo(
            hash=torrent_hash,
            name=name,
            size=1024 * 1024 * 200,  # 200MB mock size
            status=TorrentStatus.DOWNLOADING,
            progress=0.0,
            download_rate=0,
            upload_rate=0,
            downloaded=0,
            uploaded=0,
            peers=0,
            seeds=0,
            eta=None,
            save_path=save_path or (self.settings.download_path if self.settings else "./downloads"),
            magnet_link=f"magnet:?xt=urn:btih:{torrent_hash}",
            added_time=datetime.now(),
            completed_time=None,
            files=[]
        )
        
        self.torrents[torrent_hash] = MockTorrentHandle(torrent_info)
        await self.database.add_torrent(torrent_info)
        
        logger.info(f"Added mock file torrent: {torrent_info.name}")
        return torrent_info
    
    # ... [Keep all other existing methods unchanged] ...
    
    async def get_torrent(self, torrent_hash: str) -> Optional[TorrentInfo]:
        """Get torrent info by hash"""
        handle = self.torrents.get(torrent_hash)
        if not handle:
            return None
        
        if self.use_real_libtorrent and not handle.is_valid():
            return None
        
        return await self.get_torrent_info(handle)
    
    async def get_all_torrents(self) -> List[TorrentInfo]:
        """Get info for all torrents"""
        torrents = []
        for torrent_hash, handle in self.torrents.items():
            try:
                if self.use_real_libtorrent and not handle.is_valid():
                    continue
                
                torrent_info = await self.get_torrent_info(handle)
                torrents.append(torrent_info)
            except Exception as e:
                logger.error(f"Error getting torrent info for {torrent_hash}: {e}")
        
        return torrents
    
    async def pause_torrent(self, torrent_hash: str) -> bool:
        """Pause a torrent"""
        handle = self.torrents.get(torrent_hash)
        if not handle:
            return False
        
        if self.use_real_libtorrent and not handle.is_valid():
            return False
        
        if hasattr(handle, 'pause'):
            handle.pause()
        
        await self.database.update_torrent_status(torrent_hash, TorrentStatus.PAUSED)
        return True
    
    async def resume_torrent(self, torrent_hash: str) -> bool:
        """Resume a torrent"""
        handle = self.torrents.get(torrent_hash)
        if not handle:
            return False
        
        if self.use_real_libtorrent and not handle.is_valid():
            return False
        
        if hasattr(handle, 'resume'):
            handle.resume()
        
        return True
    
    async def remove_torrent(self, torrent_hash: str, delete_files: bool = False) -> bool:
        """Remove a torrent"""
        handle = self.torrents.get(torrent_hash)
        if not handle:
            return False
        
        if self.use_real_libtorrent and not handle.is_valid():
            return False
        
        # Remove from session
        if self.use_real_libtorrent:
            if delete_files:
                self.session.remove_torrent(handle, self.lt.session.delete_files)
            else:
                self.session.remove_torrent(handle)
        
        # Remove from memory
        del self.torrents[torrent_hash]
        
        # Remove from database
        await self.database.remove_torrent(torrent_hash)
        
        return True
    
    async def get_torrent_info(self, handle) -> TorrentInfo:
        """Convert handle to TorrentInfo"""
        if not self.use_real_libtorrent:
            # Mock implementation
            return handle.get_info()
        
        # Real libtorrent implementation
        status = handle.status()
        torrent_hash = str(handle.info_hash())
        
        # Determine status
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
        
        # Calculate ETA
        eta = None
        if hasattr(status, 'download_rate') and status.download_rate > 0 and torrent_status == TorrentStatus.DOWNLOADING:
            remaining_bytes = status.total_wanted - status.total_wanted_done
            eta = int(remaining_bytes / status.download_rate)
        
        # Get file list
        files = []
        if handle.torrent_file():
            ti = handle.torrent_file()
            for i in range(ti.num_files()):
                file_info = ti.file_at(i)
                files.append({
                    "index": i,
                    "path": file_info.path,
                    "size": file_info.size,
                    "progress": status.file_progress[i] if hasattr(status, 'file_progress') and i < len(status.file_progress) else 0
                })
        
        # Get torrent name
        name = handle.torrent_file().name() if handle.torrent_file() else f"Torrent_{torrent_hash[:8]}"
        
        return TorrentInfo(
            hash=torrent_hash,
            name=name,
            size=getattr(status, 'total_wanted', 0),
            status=torrent_status,
            progress=getattr(status, 'progress', 0) * 100,
            download_rate=getattr(status, 'download_rate', 0),
            upload_rate=getattr(status, 'upload_rate', 0),
            downloaded=getattr(status, 'total_wanted_done', 0),
            uploaded=getattr(status, 'total_upload', 0),
            peers=getattr(status, 'num_peers', 0),
            seeds=getattr(status, 'num_seeds', 0),
            eta=eta,
            save_path=getattr(status, 'save_path', './downloads'),
            magnet_link=self.lt.make_magnet_uri(handle) if hasattr(self.lt, 'make_magnet_uri') else "",
            added_time=datetime.now(),
            completed_time=datetime.now() if torrent_status == TorrentStatus.COMPLETED else None,
            files=files
        )
    
    async def save_session_state(self):
        """Save session state to database"""
        if not self.session or not self.use_real_libtorrent:
            return
        
        # Save resume data for all torrents
        for torrent_hash, handle in self.torrents.items():
            if handle.is_valid():
                try:
                    handle.save_resume_data()
                except Exception as e:
                    logger.error(f"Error saving resume data for {torrent_hash}: {e}")

    async def resume_saved_torrents(self):
        """Resume torrents from database"""
        try:
            saved_torrents = await self.database.get_all_torrents()
            
            for torrent_data in saved_torrents:
                try:
                    if torrent_data.get("magnet_link"):
                        await self.add_magnet(torrent_data["magnet_link"])
                    logger.info(f"Resumed torrent: {torrent_data.get('name', 'Unknown')}")
                except Exception as e:
                    logger.error(f"Error resuming torrent: {e}")
        
        except Exception as e:
            logger.error(f"Error resuming saved torrents: {e}")
    
    async def get_bandwidth_stats(self) -> Dict[str, int]:
        """Get current bandwidth statistics"""
        if not self.session:
            return {
                "download_rate": 0,
                "upload_rate": 0,
                "total_downloaded": 0,
                "total_uploaded": 0
            }
        
        if not self.use_real_libtorrent:
            # Mock stats
            total_down = sum(h.get_info().download_rate for h in self.torrents.values() if hasattr(h, 'get_info'))
            total_up = sum(h.get_info().upload_rate for h in self.torrents.values() if hasattr(h, 'get_info'))
            return {
                "download_rate": total_down,
                "upload_rate": total_up,
                "total_downloaded": 1024 * 1024 * 500,
                "total_uploaded": 1024 * 1024 * 200
            }
        
        status = self.session.status()
        
        return {
            "download_rate": getattr(status, 'download_rate', 0),
            "upload_rate": getattr(status, 'upload_rate', 0),
            "total_downloaded": getattr(status, 'total_download', 0),
            "total_uploaded": getattr(status, 'total_upload', 0)
        }
    
    async def set_torrent_priority(self, torrent_hash: str, priority: int) -> bool:
        """Set torrent priority"""
        handle = self.torrents.get(torrent_hash)
        if not handle:
            return False
        
        if self.use_real_libtorrent and not handle.is_valid():
            return False
        
        if hasattr(handle, 'set_priority'):
            handle.set_priority(priority)
        
        return True


# Enhanced Mock classes for when libtorrent is not available
class MockTorrentSession:
    def __init__(self):
        self.torrents = {}
    
    def add_torrent(self, params):
        return MockTorrentHandle()
    
    def remove_torrent(self, handle, flags=None):
        pass
    
    def apply_settings(self, settings):
        pass
    
    def set_settings(self, settings):
        pass
    
    def add_dht_router(self, host, port):
        pass
    
    def status(self):
        return MockSessionStatus()
    
    def listen_port(self):
        return 6881
    
    def listen_on(self, start_port, end_port):
        pass


class MockTorrentHandle:
    def __init__(self, torrent_info=None):
        self.info = torrent_info or self._create_default_info()
        self._paused = False
        self._start_time = time.time()
        self._progress_rate = 0.5  # Progress per second as percentage
        
    def _create_default_info(self):
        """Create default mock torrent info"""
        return TorrentInfo(
            hash="mock_" + hashlib.sha1(str(time.time()).encode()).hexdigest()[:16],
            name="Mock Torrent",
            size=1024*1024*100,  # 100MB
            status=TorrentStatus.DOWNLOADING,
            progress=0.0,
            download_rate=1024*100,  # 100KB/s
            upload_rate=1024*25,    # 25KB/s
            downloaded=0,
            uploaded=0,
            peers=5,
            seeds=2,
            eta=600,
            save_path="./downloads",
            magnet_link="",
            added_time=datetime.now(),
            files=[]
        )
    
    def is_valid(self):
        return True
    
    def info_hash(self):
        return self.info.hash if self.info else "mock_hash"
    
    def status(self):
        return MockTorrentStatus(self.info)
    
    def torrent_file(self):
        return MockTorrentFile(self.info.name if self.info else "Mock Torrent")
    
    def pause(self):
        self._paused = True
        if self.info:
            self.info.status = TorrentStatus.PAUSED
    
    def resume(self):
        self._paused = False
        if self.info:
            self.info.status = TorrentStatus.DOWNLOADING
    
    def get_info(self):
        return self.info
    
    def update_progress(self):
        """Update mock progress over time"""
        if self._paused or not self.info:
            return
        
        elapsed = time.time() - self._start_time
        
        # Simulate download progress
        if self.info.status == TorrentStatus.DOWNLOADING:
            # Increase progress over time
            self.info.progress = min(100.0, self.info.progress + self._progress_rate)
            
            # Update downloaded bytes based on progress
            self.info.downloaded = int((self.info.progress / 100.0) * self.info.size)
            
            # Simulate varying download speeds
            base_speed = 1024 * 100  # 100KB/s base
            speed_variation = int(base_speed * 0.5 * (1 + 0.3 * (elapsed % 10) / 10))
            self.info.download_rate = base_speed + speed_variation
            
            # Simulate peer/seed counts
            self.info.peers = max(1, int(5 + 3 * (elapsed % 20) / 20))
            self.info.seeds = max(1, int(2 + 2 * (elapsed % 15) / 15))
            
            # Calculate ETA
            if self.info.download_rate > 0:
                remaining = self.info.size - self.info.downloaded
                self.info.eta = int(remaining / self.info.download_rate)
            
            # Check if completed
            if self.info.progress >= 100.0:
                self.info.status = TorrentStatus.COMPLETED
                self.info.completed_time = datetime.now()
                self.info.download_rate = 0
                self.info.upload_rate = 1024 * 50  # Start uploading
        
        elif self.info.status == TorrentStatus.COMPLETED:
            # Simulate seeding
            self.info.status = TorrentStatus.SEEDING
            self.info.upload_rate = 1024 * 30  # 30KB/s upload
            self.info.uploaded += self.info.upload_rate  # Accumulate upload
    
    def save_resume_data(self):
        pass
    
    def set_priority(self, priority):
        pass


class MockTorrentStatus:
    def __init__(self, torrent_info=None):
        self.info = torrent_info or TorrentInfo(
            hash="mock", name="Mock Torrent", size=1024*1024,
            status=TorrentStatus.DOWNLOADING, progress=50.0,
            download_rate=1024*100, upload_rate=1024*25,
            downloaded=1024*512, uploaded=1024*128,
            peers=5, seeds=2, eta=600, save_path="./downloads",
            magnet_link="", added_time=datetime.now()
        )
    
    @property
    def paused(self):
        return self.info.status == TorrentStatus.PAUSED if self.info else False
    
    @property
    def progress(self):
        return self.info.progress / 100.0 if self.info else 0.5
    
    @property
    def total_wanted(self):
        return self.info.size if self.info else 1024*1024
    
    @property
    def total_wanted_done(self):
        return int(self.total_wanted * self.progress)
    
    @property
    def download_rate(self):
        return self.info.download_rate if self.info else 1024*100
    
    @property
    def upload_rate(self):
        return self.info.upload_rate if self.info else 1024*25
    
    @property
    def total_upload(self):
        return self.info.uploaded if self.info else 1024*128
    
    @property
    def num_peers(self):
        return self.info.peers if self.info else 5
    
    @property
    def num_seeds(self):
        return self.info.seeds if self.info else 2
    
    @property
    def save_path(self):
        return self.info.save_path if self.info else "./downloads"
    
    @property
    def error(self):
        return self.info.status == TorrentStatus.ERROR if self.info else False
    
    @property
    def state(self):
        # Mock state enum values
        class MockState:
            checking_files = 0
            downloading_metadata = 1
            downloading = 2
            finished = 3
            seeding = 4
            allocating = 5
            checking_resume_data = 6
        
        if not self.info:
            return MockState.downloading
        
        if self.info.status == TorrentStatus.CHECKING:
            return MockState.checking_files
        elif self.info.status == TorrentStatus.DOWNLOADING:
            return MockState.downloading
        elif self.info.status == TorrentStatus.COMPLETED:
            return MockState.finished
        elif self.info.status == TorrentStatus.SEEDING:
            return MockState.seeding
        else:
            return MockState.downloading


class MockTorrentFile:
    def __init__(self, name):
        self._name = name
        self._files = [
            {"path": f"{name}.mkv", "size": 1024*1024*80},
            {"path": f"{name}.srt", "size": 1024*50},
            {"path": "README.txt", "size": 1024*2}
        ]
    
    def name(self):
        return self._name
    
    def num_files(self):
        return len(self._files)
    
    def file_at(self, index):
        if 0 <= index < len(self._files):
            return MockFileEntry(self._files[index])
        return MockFileEntry({"path": "unknown", "size": 0})


class MockFileEntry:
    def __init__(self, file_data):
        self.path = file_data["path"]
        self.size = file_data["size"]


class MockSessionStatus:
    @property
    def download_rate(self):
        return 1024 * 150
    
    @property
    def upload_rate(self):
        return 1024 * 50
    
    @property
    def total_download(self):
        return 1024 * 1024 * 500
    
    @property
    def total_upload(self):
        return 1024 * 1024 * 200
    
    @property
    def dht_nodes(self):
        return 127
    
    @property
    def has_incoming_connections(self):
        return True