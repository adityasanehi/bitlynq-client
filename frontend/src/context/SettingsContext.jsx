import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import toast from 'react-hot-toast';

const SettingsContext = createContext();

// Action types
const SETTINGS_ACTIONS = {
  SET_SETTINGS: 'SET_SETTINGS',
  UPDATE_SETTING: 'UPDATE_SETTING',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  RESET_SETTINGS: 'RESET_SETTINGS',
};

// Initial state
const initialState = {
  settings: {
    // Download settings
    download_path: './downloads',
    max_download_rate: 0,
    max_upload_rate: 0,
    max_connections: 200,
    max_uploads: 4,
    
    // Privacy settings
    use_proxy: false,
    proxy_type: 'socks5',
    proxy_host: '127.0.0.1',
    proxy_port: 9050,
    proxy_username: '',
    proxy_password: '',
    
    // Encryption
    enable_encryption: false,
    encryption_key: '',
    
    // LAN sync
    lan_sync_enabled: true,
    lan_sync_port: 8001,
    device_name: 'Hybrid Torrent Client',
    
    // Cloud providers
    gdrive_credentials_path: '',
    gdrive_folder_id: '',
    s3_access_key: '',
    s3_secret_key: '',
    s3_bucket: '',
    s3_region: 'us-east-1',
    s3_endpoint_url: '',
    webdav_url: '',
    webdav_username: '',
    webdav_password: '',
    webdav_root_path: '/torrents',
    
    // Security
    api_key: '',
    enable_tls: false,
    tls_cert_path: '',
    tls_key_path: '',
    
    // Torrent settings
    listen_port_min: 6881,
    listen_port_max: 6889,
    enable_dht: true,
    enable_lsd: true,
    enable_upnp: true,
    enable_natpmp: true,
    
    // Scheduling
    enable_scheduling: false,
    schedule_start_time: '22:00',
    schedule_stop_time: '06:00',
    
    // Watch folders
    enable_watch_folders: false,
    watch_folder_scan_interval: 30,
    
    // UI settings
    theme: 'dark',
    language: 'en',
    enable_notifications: true,
    auto_refresh_interval: 1000,
    
    // Logging
    log_level: 'INFO',
    log_file: '',
    max_log_size: 10485760,
    log_backup_count: 5,
  },
  loading: false,
  error: null,
  dirty: false, // Track if settings have been modified
};

// Reducer
function settingsReducer(state, action) {
  switch (action.type) {
    case SETTINGS_ACTIONS.SET_SETTINGS:
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
        loading: false,
        error: null,
        dirty: false,
      };
    
    case SETTINGS_ACTIONS.UPDATE_SETTING:
      return {
        ...state,
        settings: {
          ...state.settings,
          [action.payload.key]: action.payload.value,
        },
        dirty: true,
      };
    
    case SETTINGS_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };
    
    case SETTINGS_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
    
    case SETTINGS_ACTIONS.RESET_SETTINGS:
      return {
        ...initialState,
        dirty: true,
      };
    
    default:
      return state;
  }
}

// Provider component
export function SettingsProvider({ children }) {
  const [state, dispatch] = useReducer(settingsReducer, initialState);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Load settings from API
  const loadSettings = async () => {
    try {
      dispatch({ type: SETTINGS_ACTIONS.SET_LOADING, payload: true });
      const settings = await settingsAPI.getSettings();
      dispatch({ type: SETTINGS_ACTIONS.SET_SETTINGS, payload: settings });
    } catch (error) {
      console.error('Failed to load settings:', error);
      dispatch({ type: SETTINGS_ACTIONS.SET_ERROR, payload: error.message });
      toast.error('Failed to load settings');
    }
  };

  // Update a single setting
  const updateSetting = (key, value) => {
    dispatch({ 
      type: SETTINGS_ACTIONS.UPDATE_SETTING, 
      payload: { key, value } 
    });
  };

  // Save settings to API
  const saveSettings = async () => {
    try {
      dispatch({ type: SETTINGS_ACTIONS.SET_LOADING, payload: true });
      await settingsAPI.updateSettings(state.settings);
      dispatch({ type: SETTINGS_ACTIONS.SET_SETTINGS, payload: state.settings });
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      dispatch({ type: SETTINGS_ACTIONS.SET_ERROR, payload: error.message });
      toast.error('Failed to save settings');
      throw error;
    }
  };

  // Reset settings to default
  const resetSettings = async () => {
    try {
      dispatch({ type: SETTINGS_ACTIONS.SET_LOADING, payload: true });
      await settingsAPI.resetSettings();
      const defaultSettings = await settingsAPI.getSettings();
      dispatch({ type: SETTINGS_ACTIONS.SET_SETTINGS, payload: defaultSettings });
      toast.success('Settings reset to defaults');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      dispatch({ type: SETTINGS_ACTIONS.SET_ERROR, payload: error.message });
      toast.error('Failed to reset settings');
    }
  };

  // Validate settings
  const validateSettings = async (settingsToValidate = state.settings) => {
    try {
      const result = await settingsAPI.validateSettings(settingsToValidate);
      return result;
    } catch (error) {
      console.error('Settings validation failed:', error);
      throw error;
    }
  };

  // Export settings
  const exportSettings = async () => {
    try {
      const settingsData = await settingsAPI.exportSettings();
      
      // Create download link
      const blob = new Blob([JSON.stringify(settingsData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hybrid-torrent-settings-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Settings exported successfully');
    } catch (error) {
      console.error('Failed to export settings:', error);
      toast.error('Failed to export settings');
    }
  };

  // Import settings
  const importSettings = async (file) => {
    try {
      const text = await file.text();
      const settingsData = JSON.parse(text);
      
      // Validate imported settings
      await validateSettings(settingsData);
      
      dispatch({ type: SETTINGS_ACTIONS.SET_LOADING, payload: true });
      await settingsAPI.importSettings(settingsData);
      dispatch({ type: SETTINGS_ACTIONS.SET_SETTINGS, payload: settingsData });
      toast.success('Settings imported successfully');
    } catch (error) {
      console.error('Failed to import settings:', error);
      dispatch({ type: SETTINGS_ACTIONS.SET_ERROR, payload: error.message });
      toast.error('Failed to import settings: ' + error.message);
      throw error;
    }
  };

  // Get setting by key
  const getSetting = (key, defaultValue = null) => {
    return state.settings[key] ?? defaultValue;
  };

  // Check if cloud provider is configured
  const isCloudProviderConfigured = (provider) => {
    switch (provider.toLowerCase()) {
      case 'gdrive':
        return !!(state.settings.gdrive_credentials_path);
      case 's3':
        return !!(state.settings.s3_access_key && state.settings.s3_secret_key && state.settings.s3_bucket);
      case 'webdav':
        return !!(state.settings.webdav_url && state.settings.webdav_username && state.settings.webdav_password);
      default:
        return false;
    }
  };

  // Get configured cloud providers
  const getConfiguredCloudProviders = () => {
    const providers = [];
    if (isCloudProviderConfigured('gdrive')) providers.push('gdrive');
    if (isCloudProviderConfigured('s3')) providers.push('s3');
    if (isCloudProviderConfigured('webdav')) providers.push('webdav');
    return providers;
  };

  // Format bytes
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Validate proxy settings
  const validateProxySettings = () => {
    const errors = [];
    
    if (state.settings.use_proxy) {
      if (!state.settings.proxy_host) {
        errors.push('Proxy host is required');
      }
      
      if (!state.settings.proxy_port || state.settings.proxy_port < 1 || state.settings.proxy_port > 65535) {
        errors.push('Proxy port must be between 1 and 65535');
      }
      
      if (!['socks5', 'http'].includes(state.settings.proxy_type)) {
        errors.push('Proxy type must be socks5 or http');
      }
    }
    
    return errors;
  };

  // Validate port ranges
  const validatePortRanges = () => {
    const errors = [];
    
    if (state.settings.listen_port_min > state.settings.listen_port_max) {
      errors.push('Listen port minimum cannot be greater than maximum');
    }
    
    if (state.settings.listen_port_min < 1024 || state.settings.listen_port_max > 65535) {
      errors.push('Listen ports must be between 1024 and 65535');
    }
    
    return errors;
  };

  // Get validation errors
  const getValidationErrors = () => {
    const errors = [];
    errors.push(...validateProxySettings());
    errors.push(...validatePortRanges());
    return errors;
  };

  // Context value
  const value = {
    // State
    ...state,
    
    // Actions
    loadSettings,
    updateSetting,
    saveSettings,
    resetSettings,
    validateSettings,
    exportSettings,
    importSettings,
    getSetting,
    
    // Utilities
    isCloudProviderConfigured,
    getConfiguredCloudProviders,
    formatBytes,
    getValidationErrors,
    
    // Validation helpers
    validateProxySettings,
    validatePortRanges,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// Hook to use settings context
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}