import sqlite3
import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
import asyncio
from contextlib import asynccontextmanager
import aiosqlite

from models import TorrentInfo, TorrentStatus

logger = logging.getLogger(__name__)

class Database:
    def __init__(self, db_path: str = "./data/hybrid_torrent.db"):
        self.db_path = db_path
        self.connection = None
        self._lock = asyncio.Lock()

    # Add this method to your database.py file to fix the missing column issue
    
    async def init(self):
        """Initialize database and create tables"""
        # Create data directory if it doesn't exist
        import os
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        # Use aiosqlite for better async support
        self.connection = await aiosqlite.connect(self.db_path)
        self.connection.row_factory = aiosqlite.Row
        
        await self._create_tables()
        logger.info(f"Database initialized: {self.db_path}")
    
    async def close(self):
        """Close database connection"""
        if self.connection:
            await self.connection.close()
            self.connection = None
    
    @asynccontextmanager
    async def get_cursor(self):
        """Get database cursor with lock"""
        async with self._lock:
            cursor = await self.connection.cursor()
            try:
                yield cursor
                await self.connection.commit()
            except Exception as e:
                await self.connection.rollback()
                logger.error(f"Database error: {e}")
                raise e
            finally:
                await cursor.close()
    
    async def _create_tables(self):
        """Create database tables"""
        async with self.get_cursor() as cursor:
            # Torrents table
            await cursor.execute("""
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
            
            # ✅ FIXED: Upload records table with proper column handling
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS uploads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    torrent_hash TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    upload_url TEXT NOT NULL,
                    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    file_size INTEGER,
                    torrent_name TEXT,
                    FOREIGN KEY (torrent_hash) REFERENCES torrents (hash)
                )
            """)
            
            # ✅ MIGRATION: Add missing torrent_name column if it doesn't exist
            try:
                # Check if torrent_name column exists
                await cursor.execute("PRAGMA table_info(uploads)")
                columns = await cursor.fetchall()
                column_names = [col[1] for col in columns]
                
                if 'torrent_name' not in column_names:
                    await cursor.execute("ALTER TABLE uploads ADD COLUMN torrent_name TEXT")
                    logger.info("Added missing torrent_name column to uploads table")
            except Exception as e:
                logger.debug(f"Column migration check: {e}")
            
            # ✅ MIGRATION: Migrate data from old table name if it exists
            try:
                await cursor.execute("""
                    INSERT OR IGNORE INTO uploads (torrent_hash, provider, upload_url, upload_time, file_size)
                    SELECT torrent_hash, provider, upload_url, upload_time, file_size
                    FROM upload_records
                """)
                # Drop old table after migration
                await cursor.execute("DROP TABLE IF EXISTS upload_records")
            except:
                # Table doesn't exist, no migration needed
                pass
            
            # Peers table
            await cursor.execute("""
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
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Session state table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS session_state (
                    torrent_hash TEXT PRIMARY KEY,
                    resume_data BLOB,
                    updated_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (torrent_hash) REFERENCES torrents (hash)
                )
            """)
            
            # Statistics table
            await cursor.execute("""
                CREATE TABLE IF NOT EXISTS statistics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    total_downloaded INTEGER DEFAULT 0,
                    total_uploaded INTEGER DEFAULT 0,
                    active_torrents INTEGER DEFAULT 0,
                    session_data TEXT
                )
            """)
            
            # Create indexes for better performance
            await cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_torrents_status ON torrents(status)
            """)
            await cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_peers_last_seen ON peers(last_seen)
            """)
            await cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_uploads_torrent ON uploads(torrent_hash)
            """)
            await cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_uploads_time ON uploads(upload_time)
            """)
            await cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_uploads_provider ON uploads(provider)
            """)
            
    async def add_torrent(self, torrent: TorrentInfo):
        """Add a new torrent to database"""
        try:
            async with self.get_cursor() as cursor:
                metadata = {
                    "files": torrent.files if hasattr(torrent, 'files') else [],
                    "download_rate": torrent.download_rate,
                    "upload_rate": torrent.upload_rate,
                    "downloaded": torrent.downloaded,
                    "uploaded": torrent.uploaded,
                    "peers": torrent.peers,
                    "seeds": torrent.seeds,
                    "eta": torrent.eta
                }
                
                await cursor.execute("""
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
                    getattr(torrent, 'magnet_link', None),
                    torrent.added_time.isoformat() if torrent.added_time else datetime.now().isoformat(),
                    torrent.completed_time.isoformat() if torrent.completed_time else None,
                    json.dumps(metadata)
                ))
        except Exception as e:
            logger.error(f"Error adding torrent to database: {e}")
            raise
    
    async def update_torrent_status(self, torrent_hash: str, status: TorrentStatus, 
                                  progress: Optional[float] = None):
        """Update torrent status and progress"""
        try:
            async with self.get_cursor() as cursor:
                if progress is not None:
                    await cursor.execute("""
                        UPDATE torrents 
                        SET status = ?, progress = ?, 
                            completed_time = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_time END
                        WHERE hash = ?
                    """, (status.value, progress, status.value, torrent_hash))
                else:
                    await cursor.execute("""
                        UPDATE torrents 
                        SET status = ?,
                            completed_time = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_time END
                        WHERE hash = ?
                    """, (status.value, status.value, torrent_hash))
        except Exception as e:
            logger.error(f"Error updating torrent status: {e}")
            raise
    
    async def update_torrent_metadata(self, torrent_hash: str, metadata: Dict[str, Any]):
        """Update torrent metadata"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    UPDATE torrents SET metadata = ? WHERE hash = ?
                """, (json.dumps(metadata), torrent_hash))
        except Exception as e:
            logger.error(f"Error updating torrent metadata: {e}")
            raise
    
    async def get_torrent(self, torrent_hash: str) -> Optional[Dict[str, Any]]:
        """Get torrent by hash"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("SELECT * FROM torrents WHERE hash = ?", (torrent_hash,))
                row = await cursor.fetchone()
                
                if row:
                    data = dict(row)
                    if data.get('metadata'):
                        try:
                            data['metadata'] = json.loads(data['metadata'])
                        except (json.JSONDecodeError, TypeError):
                            data['metadata'] = {}
                    return data
                return None
        except Exception as e:
            logger.error(f"Error getting torrent: {e}")
            return None
    
    async def get_all_torrents(self) -> List[Dict[str, Any]]:
        """Get all torrents"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("SELECT * FROM torrents ORDER BY added_time DESC")
                rows = await cursor.fetchall()
                
                torrents = []
                for row in rows:
                    data = dict(row)
                    if data.get('metadata'):
                        try:
                            data['metadata'] = json.loads(data['metadata'])
                        except (json.JSONDecodeError, TypeError):
                            data['metadata'] = {}
                    torrents.append(data)
                
                return torrents
        except Exception as e:
            logger.error(f"Error getting all torrents: {e}")
            return []
    
    async def remove_torrent(self, torrent_hash: str):
        """Remove torrent from database"""
        try:
            async with self.get_cursor() as cursor:
                # Remove related records first
                await cursor.execute("DELETE FROM uploads WHERE torrent_hash = ?", (torrent_hash,))
                await cursor.execute("DELETE FROM session_state WHERE torrent_hash = ?", (torrent_hash,))
                await cursor.execute("DELETE FROM torrents WHERE hash = ?", (torrent_hash,))
        except Exception as e:
            logger.error(f"Error removing torrent: {e}")
            raise
    
    # ✅ UPDATED: Upload record methods to match main.py expectations
    async def add_upload_record(self, torrent_hash: str, provider: str, upload_url: str, 
                              file_size: Optional[int] = None):
        """Add upload record - matches main.py method signature"""
        try:
            async with self.get_cursor() as cursor:
                # Get torrent name for better history display
                await cursor.execute("SELECT name FROM torrents WHERE hash = ?", (torrent_hash,))
                torrent_row = await cursor.fetchone()
                torrent_name = torrent_row[0] if torrent_row else None
                
                await cursor.execute("""
                    INSERT INTO uploads 
                    (torrent_hash, provider, upload_url, file_size, torrent_name, upload_time)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (torrent_hash, provider, upload_url, file_size, torrent_name))
                
                logger.info(f"Added upload record for {torrent_hash} to {provider}")
        except Exception as e:
            logger.error(f"Error adding upload record: {e}")
            raise
    
    async def get_upload_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get upload history - matches main.py expectations"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    SELECT 
                        u.id,
                        u.torrent_hash,
                        u.provider,
                        u.upload_url,
                        u.file_size,
                        u.upload_time,
                        COALESCE(u.torrent_name, t.name) as torrent_name
                    FROM uploads u
                    LEFT JOIN torrents t ON u.torrent_hash = t.hash
                    ORDER BY u.upload_time DESC
                    LIMIT ?
                """, (limit,))
                
                uploads = []
                for row in await cursor.fetchall():
                    upload_data = {
                        "id": row[0],
                        "torrent_hash": row[1],
                        "hash": row[1],  # Also provide as 'hash' for compatibility
                        "provider": row[2],
                        "upload_url": row[3],
                        "file_size": row[4],
                        "upload_time": row[5],
                        "timestamp": row[5],  # Also provide as 'timestamp' for compatibility
                        "torrent_name": row[6],
                        "name": row[6]  # Also provide as 'name' for compatibility
                    }
                    uploads.append(upload_data)
                
                return uploads
        except Exception as e:
            logger.error(f"Error getting upload history: {e}")
            return []
    
    # ✅ NEW: Get upload statistics
    async def get_upload_statistics(self) -> Dict[str, Any]:
        """Get upload statistics by provider"""
        try:
            async with self.get_cursor() as cursor:
                # Get counts by provider
                await cursor.execute("""
                    SELECT provider, COUNT(*) as count, 
                           COALESCE(SUM(file_size), 0) as total_size
                    FROM uploads 
                    GROUP BY provider
                """)
                
                provider_stats = {}
                for row in await cursor.fetchall():
                    provider_stats[row[0]] = {
                        "count": row[1],
                        "total_size": row[2]
                    }
                
                # Get total statistics
                await cursor.execute("""
                    SELECT COUNT(*) as total_uploads,
                           COALESCE(SUM(file_size), 0) as total_size,
                           MIN(upload_time) as first_upload,
                           MAX(upload_time) as latest_upload
                    FROM uploads
                """)
                
                total_row = await cursor.fetchone()
                total_stats = {
                    "total_uploads": total_row[0] if total_row else 0,
                    "total_size": total_row[1] if total_row else 0,
                    "first_upload": total_row[2] if total_row else None,
                    "latest_upload": total_row[3] if total_row else None
                }
                
                return {
                    "by_provider": provider_stats,
                    "total": total_stats
                }
        except Exception as e:
            logger.error(f"Error getting upload statistics: {e}")
            return {"by_provider": {}, "total": {}}
    
    # ✅ NEW: Check if torrent has been uploaded
    async def has_been_uploaded(self, torrent_hash: str, provider: Optional[str] = None) -> bool:
        """Check if torrent has been uploaded to a provider"""
        try:
            async with self.get_cursor() as cursor:
                if provider:
                    await cursor.execute("""
                        SELECT COUNT(*) FROM uploads 
                        WHERE torrent_hash = ? AND provider = ?
                    """, (torrent_hash, provider))
                else:
                    await cursor.execute("""
                        SELECT COUNT(*) FROM uploads 
                        WHERE torrent_hash = ?
                    """, (torrent_hash,))
                
                result = await cursor.fetchone()
                return result[0] > 0 if result else False
        except Exception as e:
            logger.error(f"Error checking upload status: {e}")
            return False
    
    # ✅ NEW: Get uploads for specific torrent
    async def get_torrent_uploads(self, torrent_hash: str) -> List[Dict[str, Any]]:
        """Get all uploads for a specific torrent"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    SELECT * FROM uploads 
                    WHERE torrent_hash = ?
                    ORDER BY upload_time DESC
                """, (torrent_hash,))
                
                return [dict(row) for row in await cursor.fetchall()]
        except Exception as e:
            logger.error(f"Error getting torrent uploads: {e}")
            return []
    
    # ✅ NEW: Remove upload record
    async def remove_upload_record(self, upload_id: int):
        """Remove an upload record"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("DELETE FROM uploads WHERE id = ?", (upload_id,))
        except Exception as e:
            logger.error(f"Error removing upload record: {e}")
            raise

    async def add_peer(self, peer_id: str, name: str, ip_address: str, port: int,
                      available_torrents: List[str] = None):
        """Add or update peer"""
        if available_torrents is None:
            available_torrents = []
        
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    INSERT OR REPLACE INTO peers 
                    (id, name, ip_address, port, available_torrents, last_seen)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (peer_id, name, ip_address, port, json.dumps(available_torrents)))
        except Exception as e:
            logger.error(f"Error adding peer: {e}")
            raise
    
    async def get_peers(self, active_since_minutes: int = 60) -> List[Dict[str, Any]]:
        """Get active peers"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    SELECT * FROM peers 
                    WHERE datetime(last_seen) > datetime('now', '-{} minutes')
                    ORDER BY last_seen DESC
                """.format(active_since_minutes))
                
                peers = []
                for row in await cursor.fetchall():
                    data = dict(row)
                    if data.get('available_torrents'):
                        try:
                            data['available_torrents'] = json.loads(data['available_torrents'])
                        except (json.JSONDecodeError, TypeError):
                            data['available_torrents'] = []
                    else:
                        data['available_torrents'] = []
                    peers.append(data)
                
                return peers
        except Exception as e:
            logger.error(f"Error getting peers: {e}")
            return []
    
    async def update_peer_last_seen(self, peer_id: str):
        """Update peer last seen timestamp"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    UPDATE peers SET last_seen = CURRENT_TIMESTAMP WHERE id = ?
                """, (peer_id,))
        except Exception as e:
            logger.error(f"Error updating peer last seen: {e}")
            raise
    
    async def remove_peer(self, peer_id: str):
        """Remove peer"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("DELETE FROM peers WHERE id = ?", (peer_id,))
        except Exception as e:
            logger.error(f"Error removing peer: {e}")
            raise
    
    async def set_setting(self, key: str, value: str):
        """Set a setting value"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    INSERT OR REPLACE INTO settings (key, value, updated_time)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                """, (key, value))
        except Exception as e:
            logger.error(f"Error setting value: {e}")
            raise
    
    async def get_setting(self, key: str, default: str = None) -> Optional[str]:
        """Get a setting value"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
                row = await cursor.fetchone()
                return row[0] if row else default
        except Exception as e:
            logger.error(f"Error getting setting: {e}")
            return default
    
    async def get_all_settings(self) -> Dict[str, str]:
        """Get all settings"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("SELECT key, value FROM settings")
                rows = await cursor.fetchall()
                return {row[0]: row[1] for row in rows}
        except Exception as e:
            logger.error(f"Error getting all settings: {e}")
            return {}
    
    async def save_session_state(self, torrent_hash: str, resume_data: bytes):
        """Save torrent resume data"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    INSERT OR REPLACE INTO session_state 
                    (torrent_hash, resume_data, updated_time)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                """, (torrent_hash, resume_data))
        except Exception as e:
            logger.error(f"Error saving session state: {e}")
            raise
    
    async def get_session_state(self, torrent_hash: str) -> Optional[bytes]:
        """Get torrent resume data"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("SELECT resume_data FROM session_state WHERE torrent_hash = ?", 
                             (torrent_hash,))
                row = await cursor.fetchone()
                return row[0] if row else None
        except Exception as e:
            logger.error(f"Error getting session state: {e}")
            return None
    
    async def add_statistics_entry(self, total_downloaded: int, total_uploaded: int, 
                                 active_torrents: int, session_data: Dict[str, Any] = None):
        """Add statistics entry"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    INSERT INTO statistics 
                    (total_downloaded, total_uploaded, active_torrents, session_data)
                    VALUES (?, ?, ?, ?)
                """, (total_downloaded, total_uploaded, active_torrents, 
                      json.dumps(session_data) if session_data else None))
        except Exception as e:
            logger.error(f"Error adding statistics entry: {e}")
            raise
    
    async def get_statistics(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Get statistics for the last N hours"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    SELECT * FROM statistics 
                    WHERE datetime(timestamp) > datetime('now', '-{} hours')
                    ORDER BY timestamp DESC
                """.format(hours))
                
                stats = []
                for row in await cursor.fetchall():
                    data = dict(row)
                    if data.get('session_data'):
                        try:
                            data['session_data'] = json.loads(data['session_data'])
                        except (json.JSONDecodeError, TypeError):
                            data['session_data'] = {}
                    stats.append(data)
                
                return stats
        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            return []
    
    # ✅ NEW: Get torrents ready for upload
    async def get_completed_torrents(self) -> List[Dict[str, Any]]:
        """Get torrents that are ready for upload (100% progress)"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    SELECT * FROM torrents 
                    WHERE progress >= 100.0 
                    AND (status = 'completed' OR status = 'seeding')
                    ORDER BY completed_time DESC
                """)
                
                torrents = []
                for row in await cursor.fetchall():
                    data = dict(row)
                    if data.get('metadata'):
                        try:
                            data['metadata'] = json.loads(data['metadata'])
                        except (json.JSONDecodeError, TypeError):
                            data['metadata'] = {}
                    torrents.append(data)
                
                return torrents
        except Exception as e:
            logger.error(f"Error getting completed torrents: {e}")
            return []
    
    # ✅ NEW: Get torrents by status
    async def get_torrents_by_status(self, status: str) -> List[Dict[str, Any]]:
        """Get torrents by status"""
        try:
            async with self.get_cursor() as cursor:
                await cursor.execute("""
                    SELECT * FROM torrents 
                    WHERE status = ?
                    ORDER BY added_time DESC
                """, (status,))
                
                torrents = []
                for row in await cursor.fetchall():
                    data = dict(row)
                    if data.get('metadata'):
                        try:
                            data['metadata'] = json.loads(data['metadata'])
                        except (json.JSONDecodeError, TypeError):
                            data['metadata'] = {}
                    torrents.append(data)
                
                return torrents
        except Exception as e:
            logger.error(f"Error getting torrents by status: {e}")
            return []

    async def cleanup_old_data(self, days: int = 30):
        """Clean up old data"""
        try:
            async with self.get_cursor() as cursor:
                # Clean old statistics
                await cursor.execute("""
                    DELETE FROM statistics 
                    WHERE datetime(timestamp) < datetime('now', '-{} days')
                """.format(days))
                
                # Clean old peers
                await cursor.execute("""
                    DELETE FROM peers 
                    WHERE datetime(last_seen) < datetime('now', '-{} days')
                """.format(days))
                
                # Clean orphaned session state
                await cursor.execute("""
                    DELETE FROM session_state 
                    WHERE torrent_hash NOT IN (SELECT hash FROM torrents)
                """)
                
                # ✅ NEW: Clean old upload records (keep for longer - 90 days)
                await cursor.execute("""
                    DELETE FROM uploads 
                    WHERE datetime(upload_time) < datetime('now', '-{} days')
                """.format(days * 3))  # Keep upload history 3x longer
                
                logger.info(f"Cleaned up data older than {days} days")
        except Exception as e:
            logger.error(f"Error cleaning up old data: {e}")
            raise

    async def vacuum_database(self):
        """Vacuum database to reclaim space and optimize performance"""
        try:
            async with self._lock:
                await self.connection.execute("VACUUM")
                await self.connection.commit()
                logger.info("Database vacuumed successfully")
        except Exception as e:
            logger.error(f"Error vacuuming database: {e}")
            raise

    async def get_database_info(self) -> Dict[str, Any]:
        """Get database information and statistics"""
        try:
            async with self.get_cursor() as cursor:
                # Get table counts
                info = {}
                
                tables = ['torrents', 'uploads', 'peers', 'settings', 'session_state', 'statistics']
                for table in tables:
                    await cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    count = await cursor.fetchone()
                    info[f"{table}_count"] = count[0] if count else 0
                
                # Get database size
                import os
                if os.path.exists(self.db_path):
                    info['database_size_bytes'] = os.path.getsize(self.db_path)
                else:
                    info['database_size_bytes'] = 0
                
                # ✅ NEW: Get upload statistics
                upload_stats = await self.get_upload_statistics()
                info['upload_statistics'] = upload_stats
                
                return info
        except Exception as e:
            logger.error(f"Error getting database info: {e}")
            return {}
    
    # ✅ NEW: Database health check
    async def health_check(self) -> Dict[str, Any]:
        """Perform database health check"""
        try:
            async with self.get_cursor() as cursor:
                # Test basic connectivity
                await cursor.execute("SELECT 1")
                
                # Check for corruption
                await cursor.execute("PRAGMA integrity_check")
                integrity_result = await cursor.fetchone()
                
                # Get database stats
                info = await self.get_database_info()
                
                return {
                    "status": "healthy",
                    "connection": "ok",
                    "integrity": integrity_result[0] if integrity_result else "unknown",
                    "info": info
                }
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return {
                "status": "unhealthy",
                "connection": "failed",
                "error": str(e)
            }