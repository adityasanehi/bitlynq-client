import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { torrentAPI } from '../services/api';
import toast from 'react-hot-toast';

const TorrentContext = createContext();

// Action types
const TORRENT_ACTIONS = {
  SET_TORRENTS: 'SET_TORRENTS',
  ADD_TORRENT: 'ADD_TORRENT',
  UPDATE_TORRENT: 'UPDATE_TORRENT',
  REMOVE_TORRENT: 'REMOVE_TORRENT',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  SET_STATS: 'SET_STATS',
};

// Initial state
const initialState = {
  torrents: [],
  loading: false,
  error: null,
  stats: {
    downloadRate: 0,
    uploadRate: 0,
    totalDownloaded: 0,
    totalUploaded: 0,
    activeTorrents: 0,
    totalPeers: 0,
  },
};

// Reducer
function torrentReducer(state, action) {
  switch (action.type) {
    case TORRENT_ACTIONS.SET_TORRENTS:
      return {
        ...state,
        torrents: action.payload,
        loading: false,
        error: null,
      };
    
    case TORRENT_ACTIONS.ADD_TORRENT:
      return {
        ...state,
        torrents: [...state.torrents, action.payload],
        error: null,
      };
    
    case TORRENT_ACTIONS.UPDATE_TORRENT:
      return {
        ...state,
        torrents: state.torrents.map(torrent =>
          torrent.hash === action.payload.hash ? { ...torrent, ...action.payload } : torrent
        ),
      };
    
    case TORRENT_ACTIONS.REMOVE_TORRENT:
      return {
        ...state,
        torrents: state.torrents.filter(torrent => torrent.hash !== action.payload),
      };
    
    case TORRENT_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };
    
    case TORRENT_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
    
    case TORRENT_ACTIONS.SET_STATS:
      return {
        ...state,
        stats: action.payload,
      };
    
    default:
      return state;
  }
}

// Provider component
export function TorrentProvider({ children }) {
  const [state, dispatch] = useReducer(torrentReducer, initialState);

  // Load torrents on mount
  useEffect(() => {
    loadTorrents();
  }, []);

  // Load torrents from API
  const loadTorrents = async () => {
    try {
      dispatch({ type: TORRENT_ACTIONS.SET_LOADING, payload: true });
      const torrents = await torrentAPI.getAllTorrents();
      dispatch({ type: TORRENT_ACTIONS.SET_TORRENTS, payload: torrents });
    } catch (error) {
      console.error('Failed to load torrents:', error);
      dispatch({ type: TORRENT_ACTIONS.SET_ERROR, payload: error.message });
      toast.error('Failed to load torrents');
    }
  };

  // Add torrent (magnet or file)
  const addTorrent = async (magnetOrFile, isFile = false) => {
    try {
      dispatch({ type: TORRENT_ACTIONS.SET_LOADING, payload: true });
      
      let torrent;
      if (isFile) {
        torrent = await torrentAPI.addTorrentFile(magnetOrFile);
      } else {
        torrent = await torrentAPI.addMagnet(magnetOrFile);
      }
      
      dispatch({ type: TORRENT_ACTIONS.ADD_TORRENT, payload: torrent });
      toast.success(`Added torrent: ${torrent.name}`);
      return torrent;
    } catch (error) {
      console.error('Failed to add torrent:', error);
      dispatch({ type: TORRENT_ACTIONS.SET_ERROR, payload: error.message });
      toast.error('Failed to add torrent');
      throw error;
    } finally {
      dispatch({ type: TORRENT_ACTIONS.SET_LOADING, payload: false });
    }
  };

  // Pause torrent
  const pauseTorrent = async (hash) => {
    try {
      await torrentAPI.pauseTorrent(hash);
      dispatch({ 
        type: TORRENT_ACTIONS.UPDATE_TORRENT, 
        payload: { hash, status: 'paused' } 
      });
      toast.success('Torrent paused');
    } catch (error) {
      console.error('Failed to pause torrent:', error);
      toast.error('Failed to pause torrent');
    }
  };

  // Resume torrent
  const resumeTorrent = async (hash) => {
    try {
      await torrentAPI.resumeTorrent(hash);
      dispatch({ 
        type: TORRENT_ACTIONS.UPDATE_TORRENT, 
        payload: { hash, status: 'downloading' } 
      });
      toast.success('Torrent resumed');
    } catch (error) {
      console.error('Failed to resume torrent:', error);
      toast.error('Failed to resume torrent');
    }
  };

  // Remove torrent
  const removeTorrent = async (hash, deleteFiles = false) => {
    try {
      await torrentAPI.removeTorrent(hash, deleteFiles);
      dispatch({ type: TORRENT_ACTIONS.REMOVE_TORRENT, payload: hash });
      toast.success('Torrent removed');
    } catch (error) {
      console.error('Failed to remove torrent:', error);
      toast.error('Failed to remove torrent');
    }
  };

  // Get torrent by hash
  const getTorrent = (hash) => {
    return state.torrents.find(torrent => torrent.hash === hash);
  };

  // Filter torrents by status
  const getTorrentsByStatus = (status) => {
    return state.torrents.filter(torrent => torrent.status === status);
  };

  // Calculate overall stats
  const calculateStats = () => {
    const stats = state.torrents.reduce(
      (acc, torrent) => ({
        downloadRate: acc.downloadRate + (torrent.download_rate || 0),
        uploadRate: acc.uploadRate + (torrent.upload_rate || 0),
        totalDownloaded: acc.totalDownloaded + (torrent.downloaded || 0),
        totalUploaded: acc.totalUploaded + (torrent.uploaded || 0),
        totalPeers: acc.totalPeers + (torrent.peers || 0),
      }),
      {
        downloadRate: 0,
        uploadRate: 0,
        totalDownloaded: 0,
        totalUploaded: 0,
        totalPeers: 0,
      }
    );

    stats.activeTorrents = state.torrents.filter(
      t => t.status === 'downloading' || t.status === 'seeding'
    ).length;

    return stats;
    };

  // Update torrent from WebSocket
  const updateTorrentFromWS = (torrentData) => {
    dispatch({ type: TORRENT_ACTIONS.UPDATE_TORRENT, payload: torrentData });
  };

  // Update multiple torrents from WebSocket
  const updateTorrentsFromWS = (torrentsData) => {
    torrentsData.forEach(torrent => {
      dispatch({ type: TORRENT_ACTIONS.UPDATE_TORRENT, payload: torrent });
    });
    
    // Update stats
    const stats = calculateStats();
    dispatch({ type: TORRENT_ACTIONS.SET_STATS, payload: stats });
  };

  // Format bytes to human readable
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format speed
  const formatSpeed = (bytesPerSecond) => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  // Format time
  const formatTime = (seconds) => {
    if (!seconds || seconds === Infinity) return 'Unknown';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'downloading':
        return 'text-blue-600 dark:text-blue-400';
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'seeding':
        return 'text-purple-600 dark:text-purple-400';
      case 'paused':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'checking':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'downloading':
        return 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4';
      case 'completed':
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'seeding':
        return 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12';
      case 'paused':
        return 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'error':
        return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z';
      case 'checking':
        return 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
      default:
        return 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  };

  // Calculate ETA
  const calculateETA = (torrent) => {
    if (torrent.status !== 'downloading' || !torrent.download_rate || torrent.download_rate === 0) {
      return null;
    }
    
    const remaining = torrent.size - torrent.downloaded;
    return Math.floor(remaining / torrent.download_rate);
  };

  // Sort torrents
  const sortTorrents = (torrents, sortBy, sortOrder = 'asc') => {
    return [...torrents].sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      // Handle string comparisons
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      // Handle null/undefined values
      if (aVal == null) aVal = 0;
      if (bVal == null) bVal = 0;
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  // Search torrents
  const searchTorrents = (torrents, query) => {
    if (!query.trim()) return torrents;
    
    const lowercaseQuery = query.toLowerCase();
    return torrents.filter(torrent =>
      torrent.name.toLowerCase().includes(lowercaseQuery) ||
      torrent.hash.toLowerCase().includes(lowercaseQuery)
    );
  };

  // Context value
  const value = {
    // State
    ...state,
    
    // Actions
    loadTorrents,
    addTorrent,
    pauseTorrent,
    resumeTorrent,
    removeTorrent,
    getTorrent,
    getTorrentsByStatus,
    updateTorrentFromWS,
    updateTorrentsFromWS,
    
    // Utilities
    formatBytes,
    formatSpeed,
    formatTime,
    getStatusColor,
    getStatusIcon,
    calculateETA,
    sortTorrents,
    searchTorrents,
    calculateStats,
  };

  return (
    <TorrentContext.Provider value={value}>
      {children}
    </TorrentContext.Provider>
  );
}

// Hook to use torrent context
export function useTorrents() {
  const context = useContext(TorrentContext);
  if (!context) {
    throw new Error('useTorrents must be used within a TorrentProvider');
  }
  return context;
}