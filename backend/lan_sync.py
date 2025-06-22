import asyncio
import json
import logging
import socket
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
import aiofiles
import aiohttp
from aiohttp import web

try:
    from zeroconf import ServiceInfo, Zeroconf, ServiceBrowser, ServiceListener
    from zeroconf.asyncio import AsyncZeroconf, AsyncServiceBrowser
    ZEROCONF_AVAILABLE = True
except ImportError:
    ZEROCONF_AVAILABLE = False

from models import PeerInfo
from database import Database
from config import settings

logger = logging.getLogger(__name__)

class LANPeerListener(ServiceListener):
    """Zeroconf service listener for discovering LAN peers"""
    
    def __init__(self, lan_sync):
        self.lan_sync = lan_sync
    
    def add_service(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        """Called when a new service is discovered"""
        asyncio.create_task(self._handle_service_added(zeroconf, service_type, name))
    
    def remove_service(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        """Called when a service is removed"""
        asyncio.create_task(self._handle_service_removed(name))
    
    def update_service(self, zeroconf: Zeroconf, service_type: str, name: str) -> None:
        """Called when a service is updated"""
        asyncio.create_task(self._handle_service_updated(zeroconf, service_type, name))
    
    async def _handle_service_added(self, zeroconf: Zeroconf, service_type: str, name: str):
        """Handle new service discovery"""
        try:
            info = zeroconf.get_service_info(service_type, name)
            if info and info.properties:
                peer_info = self._parse_service_info(info)
                if peer_info and peer_info.id != self.lan_sync.device_id:
                    await self.lan_sync.add_peer(peer_info)
                    logger.info(f"Discovered LAN peer: {peer_info.name} ({peer_info.ip_address})")
        except Exception as e:
            logger.error(f"Error handling service added: {e}")
    
    async def _handle_service_removed(self, name: str):
        """Handle service removal"""
        try:
            # Extract peer ID from service name
            peer_id = name.split('.')[0] if '.' in name else name
            await self.lan_sync.remove_peer(peer_id)
            logger.info(f"LAN peer disconnected: {peer_id}")
        except Exception as e:
            logger.error(f"Error handling service removed: {e}")
    
    async def _handle_service_updated(self, zeroconf: Zeroconf, service_type: str, name: str):
        """Handle service update"""
        try:
            info = zeroconf.get_service_info(service_type, name)
            if info and info.properties:
                peer_info = self._parse_service_info(info)
                if peer_info and peer_info.id != self.lan_sync.device_id:
                    await self.lan_sync.update_peer(peer_info)
        except Exception as e:
            logger.error(f"Error handling service updated: {e}")
    
    def _parse_service_info(self, info: ServiceInfo) -> Optional[PeerInfo]:
        """Parse Zeroconf service info into PeerInfo"""
        try:
            properties = {}
            for key, value in info.properties.items():
                properties[key.decode('utf-8')] = value.decode('utf-8')
            
            peer_id = properties.get('id')
            name = properties.get('name', 'Unknown Device')
            torrents = json.loads(properties.get('torrents', '[]'))
            
            if peer_id and info.addresses:
                return PeerInfo(
                    id=peer_id,
                    name=name,
                    ip_address=socket.inet_ntoa(info.addresses[0]),
                    port=info.port,
                    available_torrents=torrents,
                    last_seen=datetime.now()
                )
        except Exception as e:
            logger.error(f"Error parsing service info: {e}")
        
        return None

class LANSync:
    """LAN synchronization for peer discovery and torrent sharing"""
    
    def __init__(self):
        self.device_id = str(uuid.uuid4())
        self.zeroconf = None
        self.service_browser = None
        self.service_info = None
        self.peers: Dict[str, PeerInfo] = {}
        self.database = None
        self.http_server = None
        self.http_site = None
        
        if not ZEROCONF_AVAILABLE:
            logger.warning("Zeroconf dependencies not available. Install with: pip install zeroconf")
    
    async def start(self):
        """Start LAN sync service"""
        if not settings.lan_sync_enabled or not ZEROCONF_AVAILABLE:
            logger.info("LAN sync disabled or dependencies unavailable")
            return
        
        try:
            self.database = Database()
            
            # Start HTTP server for peer communication
            await self._start_http_server()
            
            # Start Zeroconf service discovery
            await self._start_zeroconf()
            
            logger.info(f"LAN sync started - Device ID: {self.device_id}")
        
        except Exception as e:
            logger.error(f"Failed to start LAN sync: {e}")
    
    async def stop(self):
        """Stop LAN sync service"""
        try:
            # Stop HTTP server
            if self.http_site:
                await self.http_site.stop()
            
            # Stop Zeroconf
            if self.zeroconf:
                if self.service_info:
                    self.zeroconf.unregister_service(self.service_info)
                if self.service_browser:
                    self.service_browser.cancel()
                await self.zeroconf.async_close()
            
            logger.info("LAN sync stopped")
        
        except Exception as e:
            logger.error(f"Error stopping LAN sync: {e}")
    
    async def _start_http_server(self):
        """Start HTTP server for peer communication"""
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
        
        self.http_site = web.TCPSite(runner, '0.0.0.0', settings.lan_sync_port)
        await self.http_site.start()
        
        logger.info(f"LAN sync HTTP server started on port {settings.lan_sync_port}")
    
    async def _start_zeroconf(self):
        """Start Zeroconf service discovery"""
        self.zeroconf = AsyncZeroconf()
        
        # Register our service
        await self._register_service()
        
        # Start browsing for peers
        listener = LANPeerListener(self)
        self.service_browser = AsyncServiceBrowser(
            self.zeroconf.zeroconf,
            settings.mdns_service_name,
            listener
        )
    
    async def _register_service(self):
        """Register our service with Zeroconf"""
        try:
            # Get available torrents
            available_torrents = await self._get_available_torrents()
            
            # Prepare service properties
            properties = {
                'id': self.device_id,
                'name': settings.device_name,
                'version': '1.0.0',
                'torrents': json.dumps(available_torrents)
            }
            
            # Get local IP address
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            
            # Create service info
            self.service_info = ServiceInfo(
                settings.mdns_service_name,
                f"{self.device_id}.{settings.mdns_service_name}",
                addresses=[socket.inet_aton(local_ip)],
                port=settings.lan_sync_port,
                properties=properties,
                server=f"{hostname}.local."
            )
            
            # Register service
            await self.zeroconf.async_register_service(self.service_info)
            
            logger.info(f"Registered LAN sync service: {self.device_id}")
        
        except Exception as e:
            logger.error(f"Failed to register Zeroconf service: {e}")
    
    async def _get_available_torrents(self) -> List[str]:
        """Get list of completed torrent hashes"""
        try:
            if self.database:
                torrents = await self.database.get_all_torrents()
                return [t['hash'] for t in torrents if t.get('status') == 'completed']
            return []
        except Exception as e:
            logger.error(f"Error getting available torrents: {e}")
            return []
    
    async def add_peer(self, peer_info: PeerInfo):
        """Add a discovered peer"""
        self.peers[peer_info.id] = peer_info
        
        if self.database:
            await self.database.add_peer(
                peer_info.id,
                peer_info.name,
                peer_info.ip_address,
                peer_info.port,
                peer_info.available_torrents
            )
    
    async def remove_peer(self, peer_id: str):
        """Remove a peer"""
        if peer_id in self.peers:
            del self.peers[peer_id]
        
        if self.database:
            await self.database.remove_peer(peer_id)
    
    async def update_peer(self, peer_info: PeerInfo):
        """Update peer information"""
        self.peers[peer_info.id] = peer_info
        
        if self.database:
            await self.database.add_peer(
                peer_info.id,
                peer_info.name,
                peer_info.ip_address,
                peer_info.port,
                peer_info.available_torrents
            )
    
    async def get_peers(self) -> List[PeerInfo]:
        """Get list of discovered peers"""
        if self.database:
            peer_data = await self.database.get_peers()
            return [
                PeerInfo(
                    id=p['id'],
                    name=p['name'],
                    ip_address=p['ip_address'],
                    port=p['port'],
                    available_torrents=p.get('available_torrents', []),
                    last_seen=datetime.fromisoformat(p['last_seen'])
                )
                for p in peer_data
            ]
        return list(self.peers.values())
    
    async def pull_torrent(self, peer_id: str, torrent_hash: str) -> Dict[str, Any]:
        """Pull a torrent from a peer"""
        peer = self.peers.get(peer_id)
        if not peer:
            raise Exception(f"Peer not found: {peer_id}")
        
        if torrent_hash not in peer.available_torrents:
            raise Exception(f"Torrent not available on peer: {torrent_hash}")
        
        try:
            # Get torrent info from peer
            async with aiohttp.ClientSession() as session:
                url = f"http://{peer.ip_address}:{peer.port}/peer/torrent/{torrent_hash}"
                async with session.get(url) as response:
                    if response.status != 200:
                        raise Exception(f"Failed to get torrent info: {response.status}")
                    
                    torrent_info = await response.json()
                
                # Download torrent files
                download_path = os.path.join(settings.download_path, f"lan_sync_{torrent_hash}")
                os.makedirs(download_path, exist_ok=True)
                
                downloaded_files = []
                total_size = 0
                
                for file_info in torrent_info.get('files', []):
                    file_path = file_info['path']
                    file_url = f"http://{peer.ip_address}:{peer.port}/peer/file/{torrent_hash}/{file_path}"
                    local_file_path = os.path.join(download_path, file_path)
                    
                    # Ensure directory exists
                    os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                    
                    # Download file
                    async with session.get(file_url) as file_response:
                        if file_response.status == 200:
                            async with aiofiles.open(local_file_path, 'wb') as f:
                                async for chunk in file_response.content.iter_chunked(8192):
                                    await f.write(chunk)
                            
                            file_size = os.path.getsize(local_file_path)
                            total_size += file_size
                            
                            downloaded_files.append({
                                'path': file_path,
                                'local_path': local_file_path,
                                'size': file_size
                            })
                            
                            logger.info(f"Downloaded file from peer: {file_path}")
                
                return {
                    'torrent_hash': torrent_hash,
                    'peer_id': peer_id,
                    'download_path': download_path,
                    'files': downloaded_files,
                    'total_files': len(downloaded_files),
                    'total_size': total_size
                }
        
        except Exception as e:
            logger.error(f"Failed to pull torrent from peer: {e}")
            raise
    
    # HTTP handlers for peer communication
    
    async def _handle_peer_info(self, request):
        """Handle peer info request"""
        info = {
            'id': self.device_id,
            'name': settings.device_name,
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
            # Get torrent info from database
            if self.database:
                torrent_data = await self.database.get_torrent(torrent_hash)
                if torrent_data:
                    return web.json_response(torrent_data)
            
            return web.json_response({'error': 'Torrent not found'}, status=404)
        
        except Exception as e:
            logger.error(f"Error getting torrent info: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def _handle_torrent_pull(self, request):
        """Handle torrent pull request"""
        torrent_hash = request.match_info['torrent_hash']
        
        try:
            # Verify torrent exists and is completed
            if self.database:
                torrent_data = await self.database.get_torrent(torrent_hash)
                if not torrent_data or torrent_data.get('status') != 'completed':
                    return web.json_response({'error': 'Torrent not available'}, status=404)
            
            # Return success - actual pull will be handled via file downloads
            return web.json_response({'status': 'ready', 'torrent_hash': torrent_hash})
        
        except Exception as e:
            logger.error(f"Error handling torrent pull: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def _handle_file_download(self, request):
        """Handle file download request"""
        torrent_hash = request.match_info['torrent_hash']
        file_path = request.match_info['file_path']
        
        try:
            # Get torrent info
            if not self.database:
                return web.json_response({'error': 'Database not available'}, status=500)
            
            torrent_data = await self.database.get_torrent(torrent_hash)
            if not torrent_data or torrent_data.get('status') != 'completed':
                return web.json_response({'error': 'Torrent not available'}, status=404)
            
            # Construct file path
            save_path = torrent_data.get('save_path', '')
            full_file_path = os.path.join(save_path, file_path)
            
            # Security check - ensure file is within save path
            if not os.path.abspath(full_file_path).startswith(os.path.abspath(save_path)):
                return web.json_response({'error': 'Invalid file path'}, status=400)
            
            # Check if file exists
            if not os.path.exists(full_file_path):
                return web.json_response({'error': 'File not found'}, status=404)
            
            # Stream file
            response = web.StreamResponse()
            response.headers['Content-Type'] = 'application/octet-stream'
            response.headers['Content-Disposition'] = f'attachment; filename="{os.path.basename(file_path)}"'
            response.headers['Content-Length'] = str(os.path.getsize(full_file_path))
            
            await response.prepare(request)
            
            async with aiofiles.open(full_file_path, 'rb') as f:
                while True:
                    chunk = await f.read(8192)
                    if not chunk:
                        break
                    await response.write(chunk)
            
            await response.write_eof()
            return response
        
        except Exception as e:
            logger.error(f"Error handling file download: {e}")
            return web.json_response({'error': str(e)}, status=500)
    
    async def update_available_torrents(self):
        """Update the list of available torrents and re-register service"""
        if self.zeroconf and self.service_info:
            try:
                # Unregister old service
                await self.zeroconf.async_unregister_service(self.service_info)
                
                # Register updated service
                await self._register_service()
            
            except Exception as e:
                logger.error(f"Error updating available torrents: {e}")
    
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
        peer = self.peers.get(peer_id)
        if not peer:
            return False
        
        try:
            async with aiohttp.ClientSession() as session:
                url = f"http://{peer.ip_address}:{peer.port}/peer/info"
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                    if response.status == 200:
                        # Update last seen
                        peer.last_seen = datetime.now()
                        if self.database:
                            await self.database.update_peer_last_seen(peer_id)
                        return True
            return False
        
        except Exception as e:
            logger.debug(f"Peer ping failed for {peer_id}: {e}")
            return False