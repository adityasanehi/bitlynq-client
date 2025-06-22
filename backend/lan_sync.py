import asyncio
import json
import logging
import socket
import uuid
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    import aiofiles
    import aiohttp
    from aiohttp import web
    AIOHTTP_AVAILABLE = True
except ImportError:
    AIOHTTP_AVAILABLE = False

try:
    from zeroconf import ServiceInfo, Zeroconf, ServiceStateChange
    from zeroconf.asyncio import AsyncZeroconf, AsyncServiceBrowser, AsyncServiceInfo
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False

from models import PeerInfo, TorrentStatus
from config import Settings

logger = logging.getLogger(__name__)

def async_service_state_change_handler(lan_sync_instance):
    """Create a proper async service state change handler"""
    
    async def handle_service_state_change(zeroconf: AsyncZeroconf, service_type: str, name: str, state_change: ServiceStateChange) -> None:
        """Handle all service state changes in one method"""
        try:
            if state_change == ServiceStateChange.Added:
                await _handle_service_added(lan_sync_instance, zeroconf, service_type, name)
            elif state_change == ServiceStateChange.Removed:
                await _handle_service_removed(lan_sync_instance, service_type, name)
            elif state_change == ServiceStateChange.Updated:
                await _handle_service_updated(lan_sync_instance, zeroconf, service_type, name)
        except Exception as e:
            logger.debug(f"Error handling service state change ({state_change}): {e}")
    
    return handle_service_state_change

async def _handle_service_added(lan_sync, zeroconf: AsyncZeroconf, service_type: str, name: str):
    """Handle service addition"""
    try:
        # Use AsyncServiceInfo for proper async handling
        info = AsyncServiceInfo(service_type, name)
        if await info.async_request(zeroconf.zeroconf, 3000):  # 3 second timeout
            if info and info.parsed_addresses():
                peer_info = await _parse_service_info(info)
                if peer_info and peer_info.id != lan_sync.device_id:
                    await lan_sync.add_peer(peer_info)
                    logger.info(f"Discovered LAN peer: {peer_info.name} ({peer_info.ip_address})")
    except Exception as e:
        logger.debug(f"Error handling service added: {e}")

async def _handle_service_removed(lan_sync, service_type: str, name: str):
    """Handle service removal"""
    try:
        # Extract peer ID from service name
        peer_id = name.split('.')[0] if '.' in name else name
        await lan_sync.remove_peer(peer_id)
        logger.info(f"LAN peer disconnected: {peer_id}")
    except Exception as e:
        logger.debug(f"Error handling service removed: {e}")

async def _handle_service_updated(lan_sync, zeroconf: AsyncZeroconf, service_type: str, name: str):
    """Handle service update"""
    try:
        # Use AsyncServiceInfo for proper async handling
        info = AsyncServiceInfo(service_type, name)
        if await info.async_request(zeroconf.zeroconf, 3000):
            if info and info.parsed_addresses():
                peer_info = await _parse_service_info(info)
                if peer_info and peer_info.id != lan_sync.device_id:
                    await lan_sync.update_peer(peer_info)
    except Exception as e:
        logger.debug(f"Error handling service updated: {e}")

async def _parse_service_info(info: AsyncServiceInfo) -> Optional[PeerInfo]:
    """Parse Zeroconf service info into PeerInfo"""
    try:
        properties = {}
        if info.properties:
            for key, value in info.properties.items():
                try:
                    if isinstance(key, bytes):
                        key = key.decode('utf-8')
                    if isinstance(value, bytes):
                        value = value.decode('utf-8')
                    properties[key] = value
                except UnicodeDecodeError:
                    continue
        
        peer_id = properties.get('id')
        name = properties.get('name', 'Unknown Device')
        torrents_str = properties.get('torrents', '[]')
        
        try:
            torrents = json.loads(torrents_str)
        except (json.JSONDecodeError, TypeError):
            torrents = []
        
        if peer_id and info.parsed_addresses():
            # Get the first available address
            ip_address = str(info.parsed_addresses()[0])
            
            return PeerInfo(
                id=peer_id,
                name=name,
                ip_address=ip_address,
                port=info.port or 8001,
                available_torrents=torrents,
                last_seen=datetime.now()
            )
    except Exception as e:
        logger.debug(f"Error parsing service info: {e}")
    
    return None

class LANSync:
    """LAN synchronization for peer discovery and torrent sharing"""
    
    def __init__(self, database=None):
        self.device_id = str(uuid.uuid4())
        self.settings = Settings()
        self.zeroconf = None
        self.service_browser = None
        self.service_info = None
        self.peers: Dict[str, PeerInfo] = {}
        self.database = database
        self.http_server = None
        self.http_site = None
        self.torrent_manager = None
        self._running = False
        
        # Check dependencies
        missing_deps = []
        if not ZEROCONF_AVAILABLE:
            missing_deps.append("zeroconf")
        if not AIOHTTP_AVAILABLE:
            missing_deps.append("aiohttp")
        
        if missing_deps:
            logger.warning(f"LAN sync dependencies not available: {missing_deps}. Install with: pip install {' '.join(missing_deps)}")
    
    def set_torrent_manager(self, torrent_manager):
        """Set the torrent manager reference"""
        self.torrent_manager = torrent_manager
    
    async def start(self):
        """Start LAN sync service"""
        if self._running:
            logger.debug("LAN sync already running")
            return
            
        if not getattr(self.settings, 'lan_sync_enabled', True):
            logger.info("LAN sync disabled in settings")
            return
            
        if not ZEROCONF_AVAILABLE or not AIOHTTP_AVAILABLE:
            logger.info("LAN sync disabled - missing dependencies")
            return
        
        try:
            self._running = True
            
            # Start HTTP server for peer communication
            await self._start_http_server()
            
            # Start Zeroconf service discovery
            await self._start_zeroconf()
            
            logger.info(f"LAN sync started - Device ID: {self.device_id}")
        
        except Exception as e:
            logger.error(f"Failed to start LAN sync: {e}")
            self._running = False
    
    async def stop(self):
        """Stop LAN sync service"""
        if not self._running:
            return
            
        try:
            self._running = False
            
            # Stop HTTP server
            if self.http_site:
                await self.http_site.stop()
                self.http_site = None
            
            # Stop Zeroconf
            if self.service_browser:
                self.service_browser.cancel()
                self.service_browser = None
            
            if self.zeroconf:
                if self.service_info:
                    try:
                        await self.zeroconf.async_unregister_service(self.service_info)
                    except Exception as e:
                        logger.debug(f"Error unregistering service: {e}")
                    self.service_info = None
                
                await self.zeroconf.async_close()
                self.zeroconf = None
            
            logger.info("LAN sync stopped")
        
        except Exception as e:
            logger.error(f"Error stopping LAN sync: {e}")
    
    async def _start_http_server(self):
        """Start HTTP server for peer communication"""
        if not AIOHTTP_AVAILABLE:
            logger.warning("Cannot start HTTP server - aiohttp not available")
            return
            
        app = web.Application()
        
        # Routes for peer communication
        app.router.add_get('/peer/info', self._handle_peer_info)
        app.router.add_get('/peer/torrents', self._handle_peer_torrents)
        app.router.add_get('/peer/torrent/{torrent_hash}', self._handle_torrent_info)
        app.router.add_post('/peer/pull/{torrent_hash}', self._handle_torrent_pull)
        app.router.add_get('/peer/file/{torrent_hash}/{file_path:.*}', self._handle_file_download)
        
        # Start server
        runner = web.AppRunner(app)
        await runner.setup()
        
        port = getattr(self.settings, 'lan_sync_port', 8001)
        self.http_site = web.TCPSite(runner, '0.0.0.0', port)
        await self.http_site.start()
        
        logger.info(f"LAN sync HTTP server started on port {port}")
    
    async def _start_zeroconf(self):
        """Start Zeroconf service discovery"""
        if not ZEROCONF_AVAILABLE:
            return
            
        try:
            self.zeroconf = AsyncZeroconf()
            
            # Register our service
            await self._register_service()
            
            # Start browsing for peers using the proper handler
            service_name = getattr(self.settings, 'mdns_service_name', '_bitlynq._tcp.local.')
            
            # Create the async handler
            handler = async_service_state_change_handler(self)
            
            # Use the correct AsyncServiceBrowser syntax with single handler
            self.service_browser = AsyncServiceBrowser(
                self.zeroconf.zeroconf,
                service_name,
                handlers=[handler]
            )
            
            logger.info(f"Started browsing for services: {service_name}")
            
        except Exception as e:
            logger.error(f"Failed to start Zeroconf: {e}")
            if self.zeroconf:
                try:
                    await self.zeroconf.async_close()
                except:
                    pass
                self.zeroconf = None
    
    async def _register_service(self):
        """Register our service with Zeroconf"""
        try:
            # Get available torrents
            available_torrents = await self._get_available_torrents()
            
            # Prepare service properties - must be bytes
            properties = {
                b'id': self.device_id.encode('utf-8'),
                b'name': getattr(self.settings, 'device_name', 'BitLynq Client').encode('utf-8'),
                b'version': b'1.0.0',
                b'torrents': json.dumps(available_torrents).encode('utf-8')
            }
            
            # Get local IP address
            try:
                # Connect to a remote server to get local IP
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                    s.connect(("8.8.8.8", 80))
                    local_ip = s.getsockname()[0]
            except Exception:
                try:
                    hostname = socket.gethostname()
                    local_ip = socket.gethostbyname(hostname)
                except Exception:
                    local_ip = '127.0.0.1'
            
            # Create service info
            service_name = getattr(self.settings, 'mdns_service_name', '_bitlynq._tcp.local.')
            port = getattr(self.settings, 'lan_sync_port', 8001)
            hostname = socket.gethostname()
            
            self.service_info = ServiceInfo(
                service_name,
                f"{self.device_id}.{service_name}",
                addresses=[socket.inet_aton(local_ip)],
                port=port,
                properties=properties,
                server=f"{hostname}.local."
            )
            
            # Register service
            await self.zeroconf.async_register_service(self.service_info)
            
            logger.info(f"Registered LAN sync service: {self.device_id} at {local_ip}:{port}")
        
        except Exception as e:
            logger.error(f"Failed to register Zeroconf service: {e}")
    
    async def _get_available_torrents(self) -> List[str]:
        """Get list of completed torrent hashes"""
        try:
            if self.torrent_manager:
                torrents = await self.torrent_manager.get_all_torrents()
                return [
                    t.hash for t in torrents 
                    if t.status in [TorrentStatus.COMPLETED, TorrentStatus.SEEDING]
                ]
            return []
        except Exception as e:
            logger.debug(f"Error getting available torrents: {e}")
            return []
    
    async def add_peer(self, peer_info: PeerInfo):
        """Add a discovered peer"""
        self.peers[peer_info.id] = peer_info
        logger.debug(f"Added peer: {peer_info.name} ({peer_info.ip_address})")
    
    async def remove_peer(self, peer_id: str):
        """Remove a peer"""
        if peer_id in self.peers:
            peer_name = self.peers[peer_id].name
            del self.peers[peer_id]
            logger.debug(f"Removed peer: {peer_name} ({peer_id})")
    
    async def update_peer(self, peer_info: PeerInfo):
        """Update peer information"""
        self.peers[peer_info.id] = peer_info
        logger.debug(f"Updated peer: {peer_info.name} ({peer_info.ip_address})")
    
    async def get_peers(self) -> List[PeerInfo]:
        """Get list of discovered peers"""
        # Return in-memory peers to avoid database dependency issues
        return list(self.peers.values())
    
    async def pull_torrent(self, peer_id: str, torrent_hash: str) -> Dict[str, Any]:
        """Pull a torrent from a peer"""
        if not AIOHTTP_AVAILABLE:
            raise Exception("Cannot pull torrent - aiohttp not available")
            
        peer = self.peers.get(peer_id)
        if not peer:
            raise Exception(f"Peer not found: {peer_id}")
        
        if torrent_hash not in peer.available_torrents:
            raise Exception(f"Torrent not available on peer: {torrent_hash}")
        
        try:
            # Implementation for pulling torrents
            # This is a simplified version - you might want to expand this
            return {
                'torrent_hash': torrent_hash,
                'peer_id': peer_id,
                'status': 'initiated',
                'message': 'Torrent pull initiated'
            }
        
        except Exception as e:
            logger.error(f"Failed to pull torrent from peer: {e}")
            raise
    
    # HTTP handlers for peer communication
    
    async def _handle_peer_info(self, request):
        """Handle peer info request"""
        info = {
            'id': self.device_id,
            'name': getattr(self.settings, 'device_name', 'BitLynq Client'),
            'version': '1.0.0',
            'available_torrents': await self._get_available_torrents()
        }
        return web.json_response(info)
    
    async def _handle_peer_torrents(self, request):
        """Handle peer torrents list request"""
        torrents = await self._get_available_torrents()
        return web.json_response(torrents)
    
    async def _handle_torrent_info(self, request):
        """Handle torrent info request"""
        torrent_hash = request.match_info['torrent_hash']
        
        try:
            if self.torrent_manager:
                torrent = await self.torrent_manager.get_torrent(torrent_hash)
                if torrent:
                    torrent_data = {
                        'hash': torrent.hash,
                        'name': torrent.name,
                        'size': torrent.size,
                        'status': torrent.status.value,
                        'save_path': torrent.save_path,
                        'files': []  # Would need to implement file listing
                    }
                    return web.json_response(torrent_data)
            
            return web.json_response({'error': 'Torrent not found'}, status=404)
        
        except Exception as e:
            logger.error(f"Error getting torrent info: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def _handle_torrent_pull(self, request):
        """Handle torrent pull request"""
        torrent_hash = request.match_info['torrent_hash']
        
        try:
            if self.torrent_manager:
                torrent = await self.torrent_manager.get_torrent(torrent_hash)
                if not torrent or torrent.status not in [TorrentStatus.COMPLETED, TorrentStatus.SEEDING]:
                    return web.json_response({'error': 'Torrent not available'}, status=404)
            
            return web.json_response({'status': 'ready', 'torrent_hash': torrent_hash})
        
        except Exception as e:
            logger.error(f"Error handling torrent pull: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def _handle_file_download(self, request):
        """Handle file download request"""
        torrent_hash = request.match_info['torrent_hash']
        file_path = request.match_info['file_path']
        
        try:
            if not self.torrent_manager:
                return web.json_response({'error': 'Torrent manager not available'}, status=500)
            
            torrent = await self.torrent_manager.get_torrent(torrent_hash)
            if not torrent or torrent.status not in [TorrentStatus.COMPLETED, TorrentStatus.SEEDING]:
                return web.json_response({'error': 'Torrent not available'}, status=404)
            
            # Security check and file serving implementation
            # This is a simplified version
            return web.json_response({'error': 'File download not implemented'}, status=501)
        
        except Exception as e:
            logger.error(f"Error handling file download: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def update_available_torrents(self):
        """Update the list of available torrents and re-register service"""
        if self.zeroconf and self.service_info and ZEROCONF_AVAILABLE and self._running:
            try:
                # Unregister old service
                await self.zeroconf.async_unregister_service(self.service_info)
                
                # Register updated service
                await self._register_service()
            
            except Exception as e:
                logger.debug(f"Error updating available torrents: {e}")
    
    async def broadcast_torrent_completed(self, torrent_hash: str):
        """Broadcast that a torrent has been completed"""
        await self.update_available_torrents()
        logger.info(f"Broadcasted completed torrent: {torrent_hash}")
    
    async def get_peer_torrents(self, peer_id: str) -> List[str]:
        """Get list of torrents available on a specific peer"""
        peer = self.peers.get(peer_id)
        if peer:
            return peer.available_torrents
        return []
    
    async def ping_peer(self, peer_id: str) -> bool:
        """Ping a peer to check if it's still available"""
        if not AIOHTTP_AVAILABLE:
            return False
            
        peer = self.peers.get(peer_id)
        if not peer:
            return False
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"http://{peer.ip_address}:{peer.port}/peer/info"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        peer.last_seen = datetime.now()
                        return True
            return False
        
        except Exception as e:
            logger.debug(f"Peer ping failed for {peer_id}: {e}")
            return False