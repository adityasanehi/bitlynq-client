import React, { useState, useRef } from 'react';
import { XMarkIcon, LinkIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { useTorrents } from '../context/TorrentContext';
import toast from 'react-hot-toast';

const AddTorrentModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('magnet'); // 'magnet' or 'file'
  const [magnetLink, setMagnetLink] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const { addTorrent } = useTorrents();

  const resetForm = () => {
    setMagnetLink('');
    setSelectedFile(null);
    setIsSubmitting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  const validateMagnetLink = (link) => {
    const magnetRegex = /^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/;
    return magnetRegex.test(link);
  };

  const handleMagnetSubmit = async (e) => {
    e.preventDefault();
    
    if (!magnetLink.trim()) {
      toast.error('Please enter a magnet link');
      return;
    }

    if (!validateMagnetLink(magnetLink)) {
      toast.error('Invalid magnet link format');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await addTorrent(magnetLink, false);
      toast.success('Torrent added successfully!');
      handleClose();
    } catch (error) {
      // Error is already handled in the context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedFile) {
      toast.error('Please select a torrent file');
      return;
    }

    if (!selectedFile.name.endsWith('.torrent')) {
      toast.error('Please select a valid .torrent file');
      return;
    }

    setIsSubmitting(true);
    
    try {
      await addTorrent(selectedFile, true);
      toast.success('Torrent added successfully!');
      handleClose();
    } catch (error) {
      // Error is already handled in the context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.name.endsWith('.torrent')) {
        setSelectedFile(file);
      } else {
        toast.error('Please select a valid .torrent file');
        e.target.value = '';
      }
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.torrent')) {
      setSelectedFile(file);
      if (fileInputRef.current) {
        // Create a new FileList-like object
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInputRef.current.files = dt.files;
      }
    } else {
      toast.error('Please drop a valid .torrent file');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={handleClose}
        ></div>

        {/* Modal */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                Add New Torrent
              </h3>
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="bg-white dark:bg-gray-800 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="mt-4">
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('magnet')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'magnet'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <LinkIcon className="w-5 h-5 inline mr-2" />
                    Magnet Link
                  </button>
                  <button
                    onClick={() => setActiveTab('file')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === 'file'
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <DocumentIcon className="w-5 h-5 inline mr-2" />
                    Torrent File
                  </button>
                </nav>
              </div>
            </div>

            {/* Tab Content */}
            <div className="mt-6">
              {activeTab === 'magnet' ? (
                <form onSubmit={handleMagnetSubmit}>
                  <div>
                    <label htmlFor="magnetLink" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Magnet Link
                    </label>
                    <div className="mt-1">
                      <textarea
                        id="magnetLink"
                        name="magnetLink"
                        rows={4}
                        value={magnetLink}
                        onChange={(e) => setMagnetLink(e.target.value)}
                        className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="magnet:?xt=urn:btih:..."
                        disabled={isSubmitting}
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Paste the magnet link of the torrent you want to download.
                    </p>
                  </div>

                  {/* Submit Button */}
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !magnetLink.trim()}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center">
                          <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                          Adding...
                        </div>
                      ) : (
                        'Add Torrent'
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleFileSubmit}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Torrent File
                    </label>
                    
                    {/* File Drop Zone */}
                    <div
                      className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                      onDrop={handleFileDrop}
                      onDragOver={handleDragOver}
                    >
                      <div className="space-y-1 text-center">
                        <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <div className="flex text-sm text-gray-600 dark:text-gray-400">
                          <label
                            htmlFor="file-upload"
                            className="relative cursor-pointer bg-white dark:bg-gray-800 rounded-md font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                          >
                            <span>Upload a file</span>
                            <input
                              id="file-upload"
                              name="file-upload"
                              type="file"
                              accept=".torrent"
                              className="sr-only"
                              ref={fileInputRef}
                              onChange={handleFileChange}
                              disabled={isSubmitting}
                            />
                          </label>
                          <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          .torrent files only
                        </p>
                      </div>
                    </div>

                    {/* Selected File Display */}
                    {selectedFile && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                        <div className="flex items-center">
                          <DocumentIcon className="h-5 w-5 text-blue-400 mr-2" />
                          <span className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                            {selectedFile.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFile(null);
                              if (fileInputRef.current) {
                                fileInputRef.current.value = '';
                              }
                            }}
                            disabled={isSubmitting}
                            className="ml-auto text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 disabled:opacity-50"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !selectedFile}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center">
                          <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                          Adding...
                        </div>
                      ) : (
                        'Add Torrent'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddTorrentModal;