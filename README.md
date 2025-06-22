# 🔗 BitLynq Torrent Client

<img src="assets/logo.png" alt="BitLynq Logo" width="240"/>

A modern, privacy-focused torrent client with **cloud storage sync**, **LAN sharing**, and **real-time torrent management**. BitLynq combines the power of libtorrent with a sleek React UI and a robust FastAPI backend — all containerized with Docker for effortless deployment.

> **Status**: \[x] Fully functional with real torrents. Backend and frontend operational via Docker. Real torrent downloads using `libtorrent 2.0.11` confirmed. Live UI updates over authenticated WebSocket.

---

## ✨ Features

### Core Torrent Functionality

* [x] Real torrent downloading with `libtorrent`
* [x] Add torrents via magnet links and `.torrent` files
* [x] Real-time torrent progress updates via WebSocket
* [x] Torrent controls: pause, resume, remove
* [x] Automatic seeding on completion
* [x] Live stats: peers, trackers, speeds

### Cloud Integration

* [x] Google Drive upload (OAuth-based)
* [x] AWS S3 multipart upload support
* [x] WebDAV support for self-hosted storage
* [x] Trigger-based automatic uploads

### LAN Sync & Sharing

* [x] mDNS-based peer discovery
* [x] Local network P2P file transfers
* [x] Configurable bandwidth for LAN traffic
* [x] Optional encryption for LAN transfers

### Security

* [x] API key authentication (Bearer token)
* [x] TLS-ready for encrypted traffic
* [x] Input validation & SQL injection prevention
* [x] Proxy support (SOCKS/HTTP)

### UI/UX

* [x] Modern dark-themed responsive UI
* [x] Real-time frontend state via WebSocket
* [x] Live transfer stats and progress bars
* [x] Toast notifications and error handling

---

## 🚀 Quick Start (Docker)

### Prerequisites

* Docker + Docker Compose
* \~2GB available storage

### One-liner Setup

```bash
git clone https://github.com/adityasanehi/bitlynq-torrent-client.git
cd bitlynq-torrent-client
chmod +x setup-docker.sh && ./setup-docker.sh
```

### Manual Docker Deployment

```bash
mkdir -p downloads data logs
cp .env.docker .env
docker-compose up -d --build
```

### Access URLs

* Frontend: [http://localhost:3000](http://localhost:3000)
* Backend API: [http://localhost:8000](http://localhost:8000)
* API Docs (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)
* WebSocket: ws\://localhost:8000/ws

---

## 🧱 Tech Stack

### Backend

* Python 3.11 + FastAPI
* libtorrent 2.0.11 (real file downloads)
* SQLite with async I/O
* WebSockets with auth
* Cloud clients: Google Drive, S3, WebDAV
* LAN: `zeroconf` discovery for P2P

### Frontend

* React 18 + Vite
* Tailwind CSS with dark theme
* React Router DOM v6
* Authenticated WebSocket integration
* Toasts, live updates, responsive layout

---

## 📁 Project Layout

```
bitlynq-torrent-client/
├── docker-compose.yml
├── setup-docker.sh
├── .env.docker
├── backend/
│   ├── main.py, torrents.py, lan_sync.py, etc.
│   ├── cloud/ (gdrive.py, s3.py, webdav.py)
├── frontend/
│   ├── Dockerfile, tailwind.config.js
│   ├── src/components/, pages/, context/, services/
├── downloads/  # Real files
├── data/       # SQLite DB
└── logs/       # Runtime logs
```

---

## 🔐 Configuration (.env)

```env
API_KEY=dev-secret-key
HOST=0.0.0.0
PORT=8000
DOWNLOAD_PATH=./downloads
MAX_DOWNLOAD_RATE=0
MAX_UPLOAD_RATE=0

# Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_HOST=localhost
VITE_WS_PORT=8000
VITE_API_KEY=dev-secret-key

# Cloud Providers
GDRIVE_CREDENTIALS_PATH=./credentials/gdrive_credentials.json
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...
S3_REGION=us-east-1
WEBDAV_URL=https://...
WEBDAV_USERNAME=...
WEBDAV_PASSWORD=...

# LAN Sync
LAN_SYNC_ENABLED=true
LAN_SYNC_PORT=8001
DEVICE_NAME=BitLynq
```

---

## 📡 WebSocket Events

### Server → Client

* `initial_data` – Torrent snapshot on connect
* `torrent_status_update` – Every 2s live update
* `torrent_added`, `torrent_completed`
* `cloud_upload_start`, `cloud_upload_progress`, `cloud_upload_done`

---

## 🔧 API Highlights

### Torrent API

* `POST /torrent/add` – Add torrent (magnet/file)
* `GET /torrent/list` – All torrents
* `POST /torrent/{hash}/pause` / `resume`
* `DELETE /torrent/{hash}` – Remove

### Cloud API

* `POST /cloud/upload/{hash}`
* `POST /cloud/test` – Test creds

### LAN Sync

* `GET /peer/list` – Discovered peers
* `POST /peer/{id}/pull/{hash}` – Fetch torrent from peer

---

## 🏆 Achievements

* [x] **Real torrents working** with `libtorrent` 2.0.11
* [x] **Live WebSocket feed** with full auth
* [x] **Frontend + backend Dockerized**
* [x] **Cloud storage uploads** for all major platforms
* [x] **LAN peer sync working**

---

## 🔮 Roadmap

### In Progress

* [ ] Cloud upload UI integration
* [ ] Peer browser UI (LAN sync)
* [ ] Torrent search API integration

### Planned

* [ ] RSS monitoring
* [ ] Bandwidth scheduling
* [ ] Email/webhook notifications

---

## 🛡️ Troubleshooting

### Docker not working?

* Ensure Docker is running
* Check ports 3000 / 8000 aren’t occupied

### No torrent download?

* Check volume mounts
* Confirm `.torrent` file or magnet link is valid
* Ensure libtorrent version is correct

### WebSocket fails?

* Match API key in `.env` and frontend
* Check browser console for CORS issues

---

## 📄 License

MIT License - https://mit-license.org

## 🙌 Credits

* [libtorrent](https://libtorrent.org)
* [FastAPI](https://fastapi.tiangolo.com)
* [React](https://react.dev)
* [TailwindCSS](https://tailwindcss.com)
* [Docker](https://www.docker.com)
