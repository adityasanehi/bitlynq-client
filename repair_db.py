#!/usr/bin/env python3
"""
Database repair script to add missing torrent_name column
Run this to fix the "no such column: u.torrent_name" error
"""

import sqlite3
import os
import sys

def repair_database(db_path="./data/hybrid_torrent.db"):
    """Add missing torrent_name column to uploads table"""
    
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if uploads table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='uploads'")
        if not cursor.fetchone():
            print("uploads table not found - creating it")
            cursor.execute("""
                CREATE TABLE uploads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    torrent_hash TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    upload_url TEXT NOT NULL,
                    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    file_size INTEGER,
                    torrent_name TEXT
                )
            """)
            conn.commit()
            print("✅ Created uploads table with torrent_name column")
            return True
        
        # Check if torrent_name column exists
        cursor.execute("PRAGMA table_info(uploads)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        if 'torrent_name' not in column_names:
            print("Adding missing torrent_name column...")
            cursor.execute("ALTER TABLE uploads ADD COLUMN torrent_name TEXT")
            conn.commit()
            print("✅ Added torrent_name column to uploads table")
            
            # Try to populate existing records with torrent names
            cursor.execute("""
                UPDATE uploads 
                SET torrent_name = (
                    SELECT name FROM torrents 
                    WHERE torrents.hash = uploads.torrent_hash
                )
                WHERE torrent_name IS NULL
            """)
            conn.commit()
            
            updated_rows = cursor.rowcount
            if updated_rows > 0:
                print(f"✅ Updated {updated_rows} existing upload records with torrent names")
        else:
            print("✅ torrent_name column already exists")
        
        # Check current table structure
        print("\nCurrent uploads table structure:")
        cursor.execute("PRAGMA table_info(uploads)")
        columns = cursor.fetchall()
        for col in columns:
            print(f"  {col[1]} ({col[2]})")
        
        # Show sample data
        cursor.execute("SELECT COUNT(*) FROM uploads")
        count = cursor.fetchone()[0]
        print(f"\nTotal upload records: {count}")
        
        if count > 0:
            cursor.execute("SELECT * FROM uploads ORDER BY upload_time DESC LIMIT 3")
            recent_uploads = cursor.fetchall()
            print("\nRecent uploads:")
            for upload in recent_uploads:
                print(f"  {upload}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error repairing database: {e}")
        return False

def main():
    """Main function"""
    print("BitLynq Database Repair Tool")
    print("=" * 40)
    
    # Check for custom database path
    db_path = "./data/hybrid_torrent.db"
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    
    print(f"Repairing database: {db_path}")
    
    if repair_database(db_path):
        print("\n✅ Database repair completed successfully!")
        print("\nNext steps:")
        print("1. Restart your BitLynq server")
        print("2. The cloud upload history should now work properly")
        print("3. WebDAV uploads should work if credentials are configured")
    else:
        print("\n❌ Database repair failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()