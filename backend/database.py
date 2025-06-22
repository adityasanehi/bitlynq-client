import sqlite3
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import asyncio
from contextlib import asynccontextmanager

from models import TorrentInfo, TorrentStatus

logger = logging.getLogger(__name__)

class Database:
    def __init__(self, db_path: str = "hybrid_torrent.db"):
        self.db_path = db_path
        self.connection = None
        self._lock = asyncio.Lock()
    
    async def init(self):
        """Initialize database and create tables"""
        self.connection = sqlite3.connect(self.db_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        
        await self._create_tables()
        logger.info(f"Database initialized: {self.db_path}")
    
    async def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            self.connection = None
    
    @asynccontextmanager
    async def get_cursor(self):
        """Get database cursor with lock"""
        async with self._lock:
            cursor = self.connection.cursor()
            try:
                yield cursor
                self.connection.commit()
            except Exception as e:
                self.connection.rollback()
                raise e
            finally:
                cursor.close()
    
    async def _create_tables(self):
        """Create database tables"""
        async with self.get_cursor() as cursor:
            # Torrents table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS torrents (
                    hash TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    progress REAL DEFAULT 0,
                    save_path TEXT NOT NULL,
                    magnet_link TEXT,
                    added_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_time TIMESTAMP,
                    metadata TEXT,
                    priority INTEGER DEFAULT 0
                )
            """)
            
            # Upload records table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS upload_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    torrent_hash TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    upload_url TEXT NOT NULL,
                    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    file_size INTEGER,
                    FOREIGN KEY (torrent_hash) REFERENCES torrents (hash)
                )
            """)
            
            # Peers table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS peers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    ip_address TEXT NOT NULL,
                    port INTEGER NOT NULL,
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    available_torrents TEXT DEFAULT '[]'
                )
            """)
            
            # Settings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Session state table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS session_state (
                    torrent_hash TEXT PRIMARY KEY,
                    resume_data BLOB,
                    updated_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (torrent_hash) REFERENCES torrents (hash)
                )
            """)
            
            # Statistics table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS statistics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_downloaded INTEGER DEFAULT 0,
                    total_uploaded INTEGER DEFAULT 0,
                    active_torrents INTEGER DEFAULT 0,
                    session_data TEXT
                )
            """)
    
    async def add_torrent(self, torrent: TorrentInfo):
        """Add a new torrent to database"""
        async with self.get_cursor() as cursor:
            metadata = {
                "files": torrent.files,
                "download_rate": torrent.download_rate,
                "upload_rate": torrent.upload_rate,
                "downloaded": torrent.downloaded,
                "uploaded": torrent.uploaded,
                "peers": torrent.peers,
                "seeds": torrent.seeds,
                "eta": torrent.eta
            }
            
            cursor.execute("""
                INSERT OR REPLACE INTO torrents 
                (hash, name, size, status, progress, save_path, magnet_link, 
                 added_time, completed_time, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                torrent.hash,
                torrent.name,
                torrent.size,
                torrent.status.value,
                torrent.progress,
                torrent.save_path,
                torrent.magnet_link,
                torrent.added_time,
                torrent.completed_time,
                json.dumps(metadata)
            ))
    
    async def update_torrent_status(self, torrent_hash: str, status: TorrentStatus, 
                                  progress: Optional[float] = None):
        """Update torrent status and progress"""
        async with self.get_cursor() as cursor:
            if progress is not None:
                cursor.execute("""
                    UPDATE torrents 
                    SET status = ?, progress = ?, 
                        completed_time = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_time END
                    WHERE hash = ?
                """, (status.value, progress, status.value, torrent_hash))
            else:
                cursor.execute("""
                    UPDATE torrents 
                    SET status = ?,
                        completed_time = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_time END
                    WHERE hash = ?
                """, (status.value, status.value, torrent_hash))
    
    async def update_torrent_metadata(self, torrent_hash: str, metadata: Dict[str, Any]):
        """Update torrent metadata"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                UPDATE torrents SET metadata = ? WHERE hash = ?
            """, (json.dumps(metadata), torrent_hash))
    
    async def get_torrent(self, torrent_hash: str) -> Optional[Dict[str, Any]]:
        """Get torrent by hash"""
        async with self.get_cursor() as cursor:
            cursor.execute("SELECT * FROM torrents WHERE hash = ?", (torrent_hash,))
            row = cursor.fetchone()
            
            if row:
                data = dict(row)
                if data.get('metadata'):
                    data['metadata'] = json.loads(data['metadata'])
                return data
            return None
    
    async def get_all_torrents(self) -> List[Dict[str, Any]]:
        """Get all torrents"""
        async with self.get_cursor() as cursor:
            cursor.execute("SELECT * FROM torrents ORDER BY added_time DESC")
            rows = cursor.fetchall()
            
            torrents = []
            for row in rows:
                data = dict(row)
                if data.get('metadata'):
                    data['metadata'] = json.loads(data['metadata'])
                torrents.append(data)
            
            return torrents
    
    async def remove_torrent(self, torrent_hash: str):
        """Remove torrent from database"""
        async with self.get_cursor() as cursor:
            # Remove related records first
            cursor.execute("DELETE FROM upload_records WHERE torrent_hash = ?", (torrent_hash,))
            cursor.execute("DELETE FROM session_state WHERE torrent_hash = ?", (torrent_hash,))
            cursor.execute("DELETE FROM torrents WHERE hash = ?", (torrent_hash,))
    
    async def add_upload_record(self, torrent_hash: str, provider: str, upload_url: str, 
                              file_size: Optional[int] = None):
        """Add upload record"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO upload_records 
                (torrent_hash, provider, upload_url, file_size)
                VALUES (?, ?, ?, ?)
            """, (torrent_hash, provider, upload_url, file_size))
    
    async def get_upload_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get upload history"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                SELECT ur.*, t.name as torrent_name
                FROM upload_records ur
                LEFT JOIN torrents t ON ur.torrent_hash = t.hash
                ORDER BY ur.upload_time DESC
                LIMIT ?
            """, (limit,))
            
            return [dict(row) for row in cursor.fetchall()]
    
    async def add_peer(self, peer_id: str, name: str, ip_address: str, port: int,
                      available_torrents: List[str] = None):
        """Add or update peer"""
        if available_torrents is None:
            available_torrents = []
        
        async with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT OR REPLACE INTO peers 
                (id, name, ip_address, port, available_torrents, last_seen)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (peer_id, name, ip_address, port, json.dumps(available_torrents)))
    
    async def get_peers(self, active_since_minutes: int = 60) -> List[Dict[str, Any]]:
        """Get active peers"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM peers 
                WHERE datetime(last_seen) > datetime('now', '-{} minutes')
                ORDER BY last_seen DESC
            """.format(active_since_minutes))
            
            peers = []
            for row in cursor.fetchall():
                data = dict(row)
                if data.get('available_torrents'):
                    data['available_torrents'] = json.loads(data['available_torrents'])
                peers.append(data)
            
            return peers
    
    async def update_peer_last_seen(self, peer_id: str):
        """Update peer last seen timestamp"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                UPDATE peers SET last_seen = CURRENT_TIMESTAMP WHERE id = ?
            """, (peer_id,))
    
    async def remove_peer(self, peer_id: str):
        """Remove peer"""
        async with self.get_cursor() as cursor:
            cursor.execute("DELETE FROM peers WHERE id = ?", (peer_id,))
    
    async def set_setting(self, key: str, value: str):
        """Set a setting value"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT OR REPLACE INTO settings (key, value, updated_time)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            """, (key, value))
    
    async def get_setting(self, key: str, default: str = None) -> Optional[str]:
        """Get a setting value"""
        async with self.get_cursor() as cursor:
            cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
            row = cursor.fetchone()
            return row[0] if row else default
    
    async def get_all_settings(self) -> Dict[str, str]:
        """Get all settings"""
        async with self.get_cursor() as cursor:
            cursor.execute("SELECT key, value FROM settings")
            return {row[0]: row[1] for row in cursor.fetchall()}
    
    async def save_session_state(self, torrent_hash: str, resume_data: bytes):
        """Save torrent resume data"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT OR REPLACE INTO session_state 
                (torrent_hash, resume_data, updated_time)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            """, (torrent_hash, resume_data))
    
    async def get_session_state(self, torrent_hash: str) -> Optional[bytes]:
        """Get torrent resume data"""
        async with self.get_cursor() as cursor:
            cursor.execute("SELECT resume_data FROM session_state WHERE torrent_hash = ?", 
                         (torrent_hash,))
            row = cursor.fetchone()
            return row[0] if row else None
    
    async def add_statistics_entry(self, total_downloaded: int, total_uploaded: int, 
                                 active_torrents: int, session_data: Dict[str, Any] = None):
        """Add statistics entry"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                INSERT INTO statistics 
                (total_downloaded, total_uploaded, active_torrents, session_data)
                VALUES (?, ?, ?, ?)
            """, (total_downloaded, total_uploaded, active_torrents, 
                  json.dumps(session_data) if session_data else None))
    
    async def get_statistics(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Get statistics for the last N hours"""
        async with self.get_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM statistics 
                WHERE datetime(timestamp) > datetime('now', '-{} hours')
                ORDER BY timestamp DESC
            """.format(hours))
            
            stats = []
            for row in cursor.fetchall():
                data = dict(row)
                if data.get('session_data'):
                    data['session_data'] = json.loads(data['session_data'])
                stats.append(data)
            
            return stats
    
    async def cleanup_old_data(self, days: int = 30):
        """Clean up old data"""
        async with self.get_cursor() as cursor:
            # Clean old statistics
            cursor.execute("""
                DELETE FROM statistics 
                WHERE datetime(timestamp) < datetime('now', '-{} days')
            """.format(days))
            
            # Clean old peers
            cursor.execute("""
                DELETE FROM peers 
                WHERE datetime(last_seen) < datetime('now', '-{} days')
            """.format(days))
            
            # Clean orphaned session state
            cursor.execute("""
                DELETE FROM session_state 
                WHERE torrent_hash NOT IN (SELECT hash FROM torrents)
            """)
            
            logger.info(f"Cleaned up data older than {days} days")