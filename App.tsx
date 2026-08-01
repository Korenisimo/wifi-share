import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system/legacy';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { setup, start, stop, route } from 'expo-http-server';
import type { RequestEvent } from 'expo-http-server';

interface SharedFile {
  name: string;
  uri: string;
  size: number;
  isDirectory: boolean;
  modTime?: number;
}

interface SharedDirectory {
  name: string;
  uri: string;
  files: SharedFile[];
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [port] = useState(9666);
  const [directories, setDirectories] = useState<SharedDirectory[]>([]);
  const [loading, setLoading] = useState(false);
  const filesRef = useRef<SharedFile[]>([]);
  const dirsRef = useRef<SharedDirectory[]>([]);

  // Keep refs in sync
  useEffect(() => {
    const allFiles = directories.flatMap(d => d.files);
    filesRef.current = allFiles;
    dirsRef.current = directories;
  }, [directories]);

  useEffect(() => {
    getIpAddress();
  }, []);

  const getIpAddress = async () => {
    try {
      const ip = await Network.getIpAddressAsync();
      setIpAddress(ip);
    } catch {
      setIpAddress(null);
    }
  };

  const addDirectory = async () => {
    try {
      const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perms.granted) return;

      setLoading(true);
      const dirUri = perms.directoryUri;

      // Get directory name from URI
      const decodedUri = decodeURIComponent(dirUri);
      const dirName = decodedUri.split('/').pop() || decodedUri.split('%2F').pop() || 'Folder';

      // Read files in directory
      const fileUris = await StorageAccessFramework.readDirectoryAsync(dirUri);

      const files: SharedFile[] = [];
      for (const fileUri of fileUris) {
        try {
          const info = await FileSystem.getInfoAsync(fileUri);
          const decodedFileUri = decodeURIComponent(fileUri);
          const fileName = decodedFileUri.split('/').pop() || decodedFileUri.split('%2F').pop() || 'unknown';

          files.push({
            name: fileName,
            uri: fileUri,
            size: (info as any).size || 0,
            isDirectory: info.isDirectory || false,
          });
        } catch (e) {
          // Skip files we can't read
          console.warn('Skipping file:', fileUri, e);
        }
      }

      // Sort: directories first, then by name
      files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setDirectories(prev => [...prev, { name: dirName, uri: dirUri, files }]);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      console.error('Failed to add directory:', e);
      Alert.alert('Error', 'Failed to read directory');
    }
  };

  const removeDirectory = (index: number) => {
    setDirectories(prev => prev.filter((_, i) => i !== index));
  };

  const getMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
      mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
      mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
      aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/mp4',
      pdf: 'application/pdf', zip: 'application/zip',
      txt: 'text/plain', json: 'application/json', xml: 'text/xml',
      html: 'text/html', css: 'text/css', js: 'text/javascript',
      doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      apk: 'application/vnd.android.package-archive',
      srt: 'text/plain', ass: 'text/plain', sub: 'text/plain',
    };
    return mimeMap[ext] || 'application/octet-stream';
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (name: string, isDir: boolean): string => {
    if (isDir) return '📁';
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return '🎵';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return '🖼️';
    if (['pdf'].includes(ext)) return '📄';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    if (['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(ext)) return '📝';
    if (['apk'].includes(ext)) return '📱';
    if (['srt', 'ass', 'sub'].includes(ext)) return '💬';
    return '📄';
  };

  const isStreamable = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext);
  };

  const isViewable = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'pdf', 'txt', 'md', 'json', 'xml', 'html', 'css', 'js'].includes(ext);
  };

  const isVideo = (name: string): boolean => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext);
  };

  const generateFileListHTML = (files: SharedFile[], dirs: SharedDirectory[]): string => {
    const rows = files.map((file, i) => {
      if (file.isDirectory) return ''; // Skip subdirs for now
      const icon = getFileIcon(file.name, false);
      const size = formatSize(file.size);
      const streamBtn = isStreamable(file.name)
        ? `<td><a href="/stream?index=${i}" class="btn play">▶ Stream</a></td>`
        : isViewable(file.name)
        ? `<td><a href="/file?index=${i}" class="btn play" target="_blank">👁 View</a></td>`
        : `<td></td>`;

      return `
        <tr>
          <td>${icon}</td>
          <td><a href="/file?index=${i}" target="_blank">${file.name}</a></td>
          <td class="size">${size}</td>
          <td><a href="/download?index=${i}" class="btn">⬇ Download</a></td>
          ${streamBtn}
        </tr>`;
    }).join('');

    const dirList = dirs.map((d, i) =>
      `<span class="tag">${d.name} (${d.files.length} files)</span>`
    ).join(' ');

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WiFi Share</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
  h1 { text-align: center; margin-bottom: 8px; color: #00d2ff; }
  .info { text-align: center; color: #888; margin-bottom: 16px; }
  .dirs { text-align: center; margin-bottom: 16px; }
  .tag { display: inline-block; padding: 4px 12px; background: #16213e; border-radius: 12px; font-size: 13px; color: #aaa; margin: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 10px 8px; text-align: left; border-bottom: 1px solid #333; }
  th { color: #00d2ff; font-size: 14px; }
  td.size { color: #888; font-size: 13px; white-space: nowrap; }
  a { color: #00d2ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .btn { display: inline-block; padding: 4px 12px; background: #16213e; border-radius: 4px; font-size: 14px; white-space: nowrap; }
  .btn:hover { background: #0f3460; }
  .btn.play { background: #0f3460; }
</style>
</head><body>
<h1>📡 WiFi Share</h1>
<div class="dirs">${dirList}</div>
<p class="info">${files.filter(f => !f.isDirectory).length} files</p>
<table>
<tr><th></th><th>Name</th><th>Size</th><th></th><th></th></tr>
${rows}
</table>
</body></html>`;
  };

  const generateStreamPage = (file: SharedFile, index: number): string => {
    const isVid = isVideo(file.name);
    const mediaTag = isVid
      ? `<video controls autoplay style="max-width:100%;max-height:80vh"><source src="/file?index=${index}" type="${getMimeType(file.name)}">Your browser does not support video.</video>`
      : `<audio controls autoplay><source src="/file?index=${index}" type="${getMimeType(file.name)}">Your browser does not support audio.</audio>`;

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${file.name} - WiFi Share</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #1a1a2e; color: #eee; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
  a { color: #00d2ff; text-decoration: none; margin-bottom: 20px; }
  h2 { margin-bottom: 20px; text-align: center; word-break: break-all; }
</style>
</head><body>
<a href="/">← Back to files</a>
<h2>${file.name}</h2>
${mediaTag}
</body></html>`;
  };

  const parseIndex = (request: RequestEvent): number => {
    try {
      const params = JSON.parse(request.paramsJson || '{}');
      if (params.index !== undefined) return parseInt(params.index);
    } catch {}
    const match = request.path.match(/[?&]index=(\d+)/);
    if (match) return parseInt(match[1]);
    const parts = request.path.split('/');
    return parseInt(parts[parts.length - 1] || '0');
  };

  const serveFile = async (request: RequestEvent, asDownload: boolean) => {
    try {
      const index = parseIndex(request);
      const file = filesRef.current[index];
      if (!file) {
        return { statusCode: 404, contentType: 'text/plain', body: 'File not found' };
      }

      // Copy SAF content:// URI to cache so native code can read it directly
      const cachePath = FileSystem.cacheDirectory + 'serve_' + file.name;
      await FileSystem.copyAsync({ from: file.uri, to: cachePath });

      // Strip file:// prefix — native needs a raw filesystem path
      const nativePath = cachePath.replace('file://', '');

      const disposition = asDownload ? 'attachment' : 'inline';
      const contentType = asDownload ? 'application/octet-stream' : getMimeType(file.name);

      return {
        statusCode: 200,
        contentType,
        headers: {
          'Content-Disposition': `${disposition}; filename="${file.name}"`,
        },
        filePath: nativePath,
      };
    } catch (e) {
      console.error('Error serving file:', e);
      return { statusCode: 500, contentType: 'text/plain', body: 'Error reading file: ' + (e as Error).message };
    }
  };

  const setupRoutes = useCallback(() => {
    route('/', 'GET', async () => {
      const html = generateFileListHTML(filesRef.current, dirsRef.current);
      return { statusCode: 200, contentType: 'text/html', body: html };
    });

    route('/file', 'GET', async (request) => serveFile(request, false));
    route('/download', 'GET', async (request) => serveFile(request, true));

    route('/stream', 'GET', async (request) => {
      const index = parseIndex(request);
      const file = filesRef.current[index];
      if (!file) {
        return { statusCode: 404, contentType: 'text/html', body: '<h1>Not found</h1>' };
      }
      const html = generateStreamPage(file, index);
      return { statusCode: 200, contentType: 'text/html', body: html };
    });
  }, []);

  const startServer = async () => {
    try {
      await getIpAddress();
      setup(port, (event: { status: string }) => {
        console.log(`Server event: ${event.status}`);
      });
      setupRoutes();
      start();
      setIsRunning(true);
    } catch (e) {
      console.error('Failed to start server:', e);
      Alert.alert('Error', 'Failed to start server. Try restarting the app.');
    }
  };

  const stopServer = () => {
    try {
      stop();
      setIsRunning(false);
    } catch (e) {
      console.error('Failed to stop server:', e);
    }
  };

  const totalFiles = directories.reduce((sum, d) => sum + d.files.filter(f => !f.isDirectory).length, 0);

  const renderDirectory = ({ item, index }: { item: SharedDirectory; index: number }) => (
    <View style={styles.dirCard}>
      <View style={styles.dirHeader}>
        <Text style={styles.dirIcon}>📁</Text>
        <View style={styles.dirInfo}>
          <Text style={styles.dirName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.dirMeta}>{item.files.length} files</Text>
        </View>
        <TouchableOpacity onPress={() => removeDirectory(index)} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      {item.files.slice(0, 5).map((file, fi) => (
        <Text key={fi} style={styles.fileName} numberOfLines={1}>
          {getFileIcon(file.name, file.isDirectory)} {file.name}
          {file.size > 0 ? ` (${formatSize(file.size)})` : ''}
        </Text>
      ))}
      {item.files.length > 5 && (
        <Text style={styles.moreFiles}>+{item.files.length - 5} more</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <Text style={styles.title}>📡 WiFi Share</Text>

      {/* Server Control */}
      <View style={styles.serverCard}>
        <TouchableOpacity
          style={[styles.serverBtn, isRunning && styles.serverBtnStop]}
          onPress={isRunning ? stopServer : startServer}
          disabled={directories.length === 0}
        >
          <Text style={styles.serverBtnText}>
            {isRunning ? '⏹ Stop Server' : '▶ Start Server'}
          </Text>
        </TouchableOpacity>

        {isRunning && ipAddress && (
          <View style={styles.urlBox}>
            <Text style={styles.urlLabel}>Open on any device:</Text>
            <Text style={styles.urlText}>http://{ipAddress}:{port}</Text>
          </View>
        )}

        {!isRunning && directories.length === 0 && (
          <Text style={styles.hint}>Add directories to share, then start the server</Text>
        )}
        {!isRunning && directories.length > 0 && (
          <Text style={styles.hint}>{totalFiles} files ready to share</Text>
        )}
      </View>

      {/* Add Directory */}
      <TouchableOpacity style={styles.addBtn} onPress={addDirectory} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color="#00d2ff" />
        ) : (
          <Text style={styles.addBtnText}>+ Add Directory</Text>
        )}
      </TouchableOpacity>

      {/* Directory List */}
      <FlatList
        data={directories}
        renderItem={renderDirectory}
        keyExtractor={(item, i) => `${item.uri}-${i}`}
        style={styles.list}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>No directories added yet</Text>
            <Text style={styles.emptyHint}>Tap "Add Directory" to pick folders to share</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00d2ff',
    textAlign: 'center',
    marginVertical: 16,
  },
  serverCard: {
    marginHorizontal: 16,
    padding: 20,
    backgroundColor: '#16213e',
    borderRadius: 16,
    alignItems: 'center',
  },
  serverBtn: {
    backgroundColor: '#00d2ff',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
  },
  serverBtnStop: {
    backgroundColor: '#e74c3c',
  },
  serverBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  urlBox: {
    marginTop: 16,
    alignItems: 'center',
  },
  urlLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 4,
  },
  urlText: {
    color: '#00d2ff',
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: {
    color: '#666',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  addBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00d2ff',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addBtnText: {
    color: '#00d2ff',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  dirCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  dirHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dirIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  dirInfo: {
    flex: 1,
  },
  dirName: {
    color: '#eee',
    fontSize: 16,
    fontWeight: '600',
  },
  dirMeta: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtnText: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fileName: {
    color: '#aaa',
    fontSize: 13,
    paddingVertical: 3,
    paddingLeft: 36,
  },
  moreFiles: {
    color: '#666',
    fontSize: 13,
    paddingLeft: 36,
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyHint: {
    color: '#555',
    fontSize: 14,
    marginTop: 8,
  },
});
