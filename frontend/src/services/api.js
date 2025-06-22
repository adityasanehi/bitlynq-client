// API Configuration - Fixed for Vite
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-secret-key-change-in-production';

// HTTP Client with authentication
class APIClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        ...options.headers,
      },
      ...options,
    };

    // Don't set Content-Type for FormData
    if (options.body instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.error || errorMessage;
        } catch {
          // If error response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  post(endpoint, data, options = {}) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request(endpoint, { ...options, method: 'POST', body });
  }

  put(endpoint, data, options = {}) {
    return this.request(endpoint, { 
      ...options, 
      method: 'PUT', 
      body: JSON.stringify(data) 
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

const client = new APIClient(API_BASE_URL);

// Torrent API
export const torrentAPI = {
  // Get all torrents
  getAllTorrents: () => client.get('/torrent/list'),

  // Get specific torrent
  getTorrent: (hash) => client.get(`/torrent/${hash}`),

  // Add magnet link
  addMagnet: (magnetLink) => {
    const formData = new FormData();
    formData.append('magnet', magnetLink);
    return client.post('/torrent/add', formData);
  },

  // Add torrent file
  addTorrentFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post('/torrent/add', formData);
  },

  // Pause torrent
  pauseTorrent: (hash) => client.post(`/torrent/${hash}/pause`),

  // Resume torrent
  resumeTorrent: (hash) => client.post(`/torrent/${hash}/resume`),

  // Remove torrent
  removeTorrent: (hash, deleteFiles = false) => 
    client.delete(`/torrent/${hash}?delete_files=${deleteFiles}`),

  // Get torrent pieces
  getTorrentPieces: (hash) => client.get(`/torrent/${hash}/pieces`),

  // Get torrent trackers
  getTorrentTrackers: (hash) => client.get(`/torrent/${hash}/trackers`),

  // Get torrent peers
  getTorrentPeers: (hash) => client.get(`/torrent/${hash}/peers`),

  // Set torrent priority
  setTorrentPriority: (hash, priority) => 
    client.post(`/torrent/${hash}/priority`, { priority }),

  // Set file priority
  setFilePriority: (hash, fileIndex, priority) => 
    client.post(`/torrent/${hash}/file/${fileIndex}/priority`, { priority }),

  // Force reannounce
  forceReannounce: (hash) => client.post(`/torrent/${hash}/reannounce`),

  // Force recheck
  forceRecheck: (hash) => client.post(`/torrent/${hash}/recheck`),

  // Move storage
  moveStorage: (hash, newPath) => 
    client.post(`/torrent/${hash}/move`, { new_path: newPath }),
};

// Cloud API
export const cloudAPI = {
  // Upload to cloud
  uploadToCloud: (torrentHash, provider, destinationPath = null) => 
    client.post(`/cloud/upload/${torrentHash}`, { 
      provider, 
      destination_path: destinationPath 
    }),

  // Get upload history
  getUploadHistory: () => client.get('/cloud/uploads'),

  // Test cloud provider connection
  testCloudConnection: (provider) => 
    client.post('/cloud/test', { provider }),

  // Get cloud provider info
  getCloudProviderInfo: (provider) => 
    client.get(`/cloud/info/${provider}`),

  // Delete cloud file
  deleteCloudFile: (provider, fileId) => 
    client.delete(`/cloud/${provider}/file/${fileId}`),

  // List cloud files
  listCloudFiles: (provider, path = '') => 
    client.get(`/cloud/${provider}/files?path=${encodeURIComponent(path)}`),
};

// LAN Sync API
export const lanAPI = {
  // Get discovered peers
  getPeers: () => client.get('/peer/list'),

  // Pull torrent from peer
  pullFromPeer: (peerId, torrentHash) => 
    client.post(`/peer/${peerId}/pull/${torrentHash}`),

  // Get peer torrents
  getPeerTorrents: (peerId) => client.get(`/peer/${peerId}/torrents`),

  // Ping peer
  pingPeer: (peerId) => client.post(`/peer/${peerId}/ping`),

  // Get peer info
  getPeerInfo: (peerId) => client.get(`/peer/${peerId}/info`),

  // Enable/disable LAN sync
  setLANSyncEnabled: (enabled) => 
    client.post('/peer/settings', { enabled }),
};

// Settings API
export const settingsAPI = {
  // Get all settings
  getSettings: () => client.get('/settings'),

  // Update settings
  updateSettings: (settings) => client.post('/settings', settings),

  // Get specific setting
  getSetting: (key) => client.get(`/settings/${key}`),

  // Set specific setting
  setSetting: (key, value) => client.post(`/settings/${key}`, { value }),

  // Reset settings to default
  resetSettings: () => client.post('/settings/reset'),

  // Export settings
  exportSettings: () => client.get('/settings/export'),

  // Import settings
  importSettings: (settingsData) => 
    client.post('/settings/import', settingsData),

  // Validate settings
  validateSettings: (settings) => 
    client.post('/settings/validate', settings),
};

// Statistics API
export const statsAPI = {
  // Get session stats
  getSessionStats: () => client.get('/stats/session'),

  // Get bandwidth stats
  getBandwidthStats: () => client.get('/stats/bandwidth'),

  // Get system stats
  getSystemStats: () => client.get('/stats/system'),

  // Get historical stats
  getHistoricalStats: (hours = 24) => 
    client.get(`/stats/history?hours=${hours}`),

  // Get torrent statistics
  getTorrentStats: () => client.get('/stats/torrents'),
};

// Health API
export const healthAPI = {
  // Health check
  healthCheck: () => client.get('/health'),

  // Get API info
  getAPIInfo: () => client.get('/'),

  // Test connection
  testConnection: async () => {
    try {
      await client.get('/health');
      return true;
    } catch {
      return false;
    }
  },
};

// Search API (if implemented)
export const searchAPI = {
  // Search torrents (if search feature is implemented)
  searchTorrents: (query, category = 'all') => 
    client.get(`/search?q=${encodeURIComponent(query)}&category=${category}`),

  // Get popular torrents
  getPopularTorrents: (category = 'all', limit = 50) => 
    client.get(`/search/popular?category=${category}&limit=${limit}`),

  // Get recent torrents
  getRecentTorrents: (category = 'all', limit = 50) => 
    client.get(`/search/recent?category=${category}&limit=${limit}`),
};

// Utility functions
export const utils = {
  // Format bytes
  formatBytes: (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // Format speed
  formatSpeed: (bytesPerSecond) => {
    return utils.formatBytes(bytesPerSecond) + '/s';
  },

  // Format time
  formatTime: (seconds) => {
    if (!seconds || seconds === Infinity) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  },

  // Validate magnet link
  isValidMagnetLink: (magnetLink) => {
    return /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/.test(magnetLink);
  },

  // Extract hash from magnet link
  extractHashFromMagnet: (magnetLink) => {
    const match = magnetLink.match(/xt=urn:btih:([a-fA-F0-9]{40})/);
    return match ? match[1] : null;
  },

  // Generate magnet link
  generateMagnetLink: (hash, name = '', trackers = []) => {
    let magnet = `magnet:?xt=urn:btih:${hash}`;
    
    if (name) {
      magnet += `&dn=${encodeURIComponent(name)}`;
    }
    
    trackers.forEach(tracker => {
      magnet += `&tr=${encodeURIComponent(tracker)}`;
    });
    
    return magnet;
  },
};

// Export everything
export default {
  torrentAPI,
  cloudAPI,
  lanAPI,
  settingsAPI,
  statsAPI,
  healthAPI,
  searchAPI,
  utils,
};