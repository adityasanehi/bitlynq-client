import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useTorrents } from './TorrentContext';
import toast from 'react-hot-toast';

const WebSocketContext = createContext();

export function WebSocketProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const { updateTorrentsFromWS } = useTorrents();

  const maxReconnectAttempts = 10;
  const reconnectInterval = 5000; // 5 seconds

  const connect = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_WS_HOST || window.location.hostname;
      const wsPort = import.meta.env.VITE_WS_PORT || '8000';
      
      // ✅ FIX: Add API key to WebSocket URL
      const apiKey = import.meta.env.VITE_API_KEY || 'dev-secret-key-change-in-production';
      const wsUrl = `${protocol}//${wsHost}:${wsPort}/ws?api_key=${encodeURIComponent(apiKey)}`;
      
      console.log('Connecting to WebSocket:', wsUrl.replace(apiKey, '***'));
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected successfully');
        setConnected(true);
        setReconnectAttempts(0);
        toast.success('Connected to real-time updates', { duration: 3000 });
        
        // Send ping to keep connection alive
        const pingInterval = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000); // Ping every 30 seconds
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnected(false);
        
        // Don't reconnect if it was an authentication error
        if (event.code === 4001) {
          toast.error('Authentication failed. Please check your API key.');
          return;
        }
        
        // Attempt reconnection
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect... (${reconnectAttempts + 1}/${maxReconnectAttempts})`);
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, reconnectInterval);
        } else {
          toast.error('Lost connection to server. Please refresh the page.');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnected(false);
    }
  };

  const handleMessage = (message) => {
    switch (message.type) {
      // ✅ ENHANCED: Handle the correct message types from your backend
      case 'initial_data':
        // Handle initial data with torrents array
        if (message.data?.torrents && Array.isArray(message.data.torrents)) {
          updateTorrentsFromWS(message.data.torrents);
        }
        break;

      case 'torrent_status_update':
        // Handle real-time torrent updates
        if (message.data?.torrents && Array.isArray(message.data.torrents)) {
          updateTorrentsFromWS(message.data.torrents);
        }
        break;

      case 'torrent_status':
        // Legacy support - Update all torrent statuses
        if (message.data && Array.isArray(message.data)) {
          updateTorrentsFromWS(message.data);
        }
        break;

      case 'torrent_added':
        toast.success(`Torrent added: ${message.data?.name || 'Unknown'}`);
        // Refresh torrents list to get the new one
        setTimeout(() => {
          // This will be handled by the TorrentContext loadTorrents if needed
        }, 1000);
        break;

      case 'torrent_completed':
        toast.success(`Download completed: ${message.data?.name || 'Unknown'}`, {
          duration: 6000,
          icon: '🎉',
        });
        break;

      case 'torrent_paused':
        // Already handled by torrent context via real-time updates
        break;

      case 'torrent_resumed':
        // Already handled by torrent context via real-time updates
        break;

      case 'torrent_removed':
        // Already handled by torrent context via real-time updates
        break;

      case 'cloud_upload_started':
        toast(`Starting upload to ${message.data?.provider || 'cloud'}...`, {
          icon: '☁️',
        });
        break;

      case 'cloud_upload_progress':
        // Could show progress notification here
        const progress = message.data?.progress_percent || 0;
        if (progress % 25 === 0) { // Show progress every 25%
          toast(`Upload progress: ${progress.toFixed(1)}%`, {
            icon: '☁️',
            duration: 2000,
          });
        }
        break;

      case 'cloud_upload_completed':
        toast.success(`Upload completed to ${message.data?.provider || 'cloud'}`, {
          duration: 6000,
          icon: '☁️',
        });
        break;

      case 'cloud_upload_failed':
        toast.error(`Upload failed to ${message.data?.provider || 'cloud'}: ${message.data?.error || 'Unknown error'}`);
        break;

      case 'peer_discovered':
        toast(`New peer discovered: ${message.data?.name || 'Unknown device'}`, {
          icon: '📡',
          duration: 3000,
        });
        break;

      case 'peer_pull_started':
        toast(`Starting download from peer: ${message.data?.peer_name || 'Unknown'}`, {
          icon: '🔄',
        });
        break;

      case 'peer_pull_completed':
        toast.success(`Peer download completed from: ${message.data?.peer_name || 'Unknown'}`, {
          icon: '📡',
          duration: 6000,
        });
        break;

      case 'peer_pull_failed':
        toast.error(`Peer download failed: ${message.data?.error || 'Unknown error'}`);
        break;

      case 'settings_updated':
        toast.success('Settings updated successfully');
        break;

      case 'torrent_reannounced':
        toast.success('Torrent reannounced to trackers');
        break;

      case 'torrent_rechecking':
        toast(`Rechecking torrent files...`, {
          icon: '🔍',
        });
        break;

      case 'error':
        toast.error(message.data?.message || 'An error occurred');
        break;

      case 'pong':
        // Ping response - connection is alive
        console.debug('WebSocket ping/pong - connection alive');
        break;

      default:
        console.log('Unknown WebSocket message type:', message.type, message);
    }
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    setConnected(false);
  };

  const sendMessage = (message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('WebSocket not connected. Cannot send message:', message);
      return false;
    }
  };

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, []);

  // Show connection status in console and toast
  useEffect(() => {
    if (connected && reconnectAttempts === 0) {
      console.log('✅ WebSocket connected - real-time updates active');
    } else if (!connected && reconnectAttempts > 0) {
      console.log(`🔄 WebSocket reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
    }
  }, [connected, reconnectAttempts]);

  // Provide connection status indicator
  const ConnectionStatus = () => (
    <div className={`fixed top-4 right-4 z-50 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300 ${
      connected 
        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    }`}>
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${
          connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
        }`} />
        <span>
          {connected 
            ? 'Live' 
            : reconnectAttempts > 0 
              ? `Reconnecting (${reconnectAttempts})` 
              : 'Disconnected'
          }
        </span>
      </div>
    </div>
  );

  const value = {
    connected,
    reconnectAttempts,
    connect,
    disconnect,
    sendMessage,
    ConnectionStatus,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}