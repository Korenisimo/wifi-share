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
import * as MediaLibrary from 'expo-media-library';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import { setup, start, stop, route } from 'expo-http-server';
import type { RequestEvent } from 'expo-http-server';

type MediaAsset = MediaLibrary.Asset;

type FilterType = 'all' | 'video' | 'photo' | 'audio';

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [port] = useState(9666);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [assetCount, setAssetCount] = useState(0);
  const assetsRef = useRef<MediaAsset[]>([]);

  // Keep ref in sync
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    requestPermissions();
    getIpAddress();
  }, []);

  useEffect(() => {
    if (hasPermission) {
      loadAssets();
    }
  }, [hasPermission, filter]);

  const requestPermissions = async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setHasPermission(status === 'granted');
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'WiFi Share needs access to your media files to share them.'
      );
    }
  };

  const getIpAddress = async () => {
    try {
      const ip = await Network.getIpAddressAsync();
      setIpAddress(ip);
    } catch {
      setIpAddress(null);
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    try {
      const mediaType: MediaLibrary.MediaTypeValue[] =
        filter === 'video'
          ? [MediaLibrary.MediaType.video]
          : filter === 'photo'
          ? [MediaLibrary.MediaType.photo]
          : filter === 'audio'
          ? [MediaLibrary.MediaType.audio]
          : [MediaLibrary.MediaType.video, MediaLibrary.MediaType.photo, MediaLibrary.MediaType.audio];

      const result = await MediaLibrary.getAssetsAsync({
        mediaType,
        first: 200,
        sortBy: [MediaLibrary.SortBy.modificationTime],
      });
      setAssets(result.assets);
      setAssetCount(result.totalCount);
    } catch (e) {
      console.error('Failed to load assets:', e);
    }
    setLoading(false);
  };

  const getMimeType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      mp4: 'video/mp4',
      mkv: 'video/x-matroska',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      webm: 'video/webm',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
    };
    return mimeMap[ext] || 'application/octet-stream';
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const generateFileListHTML = (assetList: MediaAsset[]): string => {
    const rows = assetList
      .map((asset, i) => {
        const isVideo = asset.mediaType === 'video';
        const isAudio = asset.mediaType === 'audio';
        const icon = isVideo ? '🎬' : isAudio ? '🎵' : '🖼️';
        const duration = asset.duration > 0 ? formatDuration(asset.duration) : '';
        return `
        <tr>
          <td>${icon}</td>
          <td><a href="/file?index=${i}" target="_blank">${asset.filename}</a></td>
          <td>${duration}</td>
          <td><a href="/download?index=${i}" class="btn">⬇ Download</a></td>
          ${isVideo || isAudio ? `<td><a href="/stream?index=${i}" class="btn play">▶ Stream</a></td>` : `<td><a href="/file?index=${i}" class="btn play">👁 View</a></td>`}
        </tr>`;
      })
      .join('');

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WiFi Share</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
  h1 { text-align: center; margin-bottom: 20px; color: #00d2ff; }
  .info { text-align: center; color: #888; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #333; }
  th { color: #00d2ff; }
  a { color: #00d2ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .btn { display: inline-block; padding: 4px 12px; background: #16213e; border-radius: 4px; font-size: 14px; }
  .btn:hover { background: #0f3460; }
  .btn.play { background: #0f3460; }
  .btn.play:hover { background: #1a5276; }
  video, audio, img { max-width: 100%; }
</style>
</head><body>
<h1>📡 WiFi Share</h1>
<p class="info">${assetList.length} files available</p>
<table>
<tr><th></th><th>Name</th><th>Duration</th><th></th><th></th></tr>
${rows}
</table>
</body></html>`;
  };

  const generateStreamPage = (asset: MediaAsset, index: number): string => {
    const isVideo = asset.mediaType === 'video';
    const mediaTag = isVideo
      ? `<video controls autoplay style="max-width:100%;max-height:80vh"><source src="/file?index=${index}" type="${getMimeType(asset.filename)}">Your browser does not support video.</video>`
      : `<audio controls autoplay><source src="/file?index=${index}" type="${getMimeType(asset.filename)}">Your browser does not support audio.</audio>`;

    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${asset.filename} - WiFi Share</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #1a1a2e; color: #eee; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
  a { color: #00d2ff; text-decoration: none; margin-bottom: 20px; }
  h2 { margin-bottom: 20px; text-align: center; word-break: break-all; }
</style>
</head><body>
<a href="/">← Back to files</a>
<h2>${asset.filename}</h2>
${mediaTag}
</body></html>`;
  };

  const parseIndex = (request: RequestEvent): number => {
    // Try paramsJson (query params) first
    try {
      const params = JSON.parse(request.paramsJson || '{}');
      if (params.index !== undefined) return parseInt(params.index);
    } catch {}
    // Fallback: parse query string from path
    const match = request.path.match(/[?&]index=(\d+)/);
    if (match) return parseInt(match[1]);
    // Last fallback: last path segment
    const parts = request.path.split('/');
    return parseInt(parts[parts.length - 1] || '0');
  };

  const serveFile = async (request: RequestEvent, asDownload: boolean) => {
    try {
      const index = parseIndex(request);
      const asset = assetsRef.current[index];
      if (!asset) {
        return { statusCode: 404, contentType: 'text/plain', body: 'File not found' };
      }

      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
      const uri = assetInfo.localUri || asset.uri;

      if (!uri) {
        return { statusCode: 404, contentType: 'text/plain', body: 'File URI not available' };
      }

      const fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const disposition = asDownload ? 'attachment' : 'inline';
      const contentType = asDownload ? 'application/octet-stream' : getMimeType(asset.filename);

      return {
        statusCode: 200,
        contentType,
        headers: {
          'Content-Disposition': `${disposition}; filename="${asset.filename}"`,
        },
        body: fileContent,
      };
    } catch (e) {
      console.error('Error serving file:', e);
      return { statusCode: 500, contentType: 'text/plain', body: 'Error reading file' };
    }
  };

  const setupRoutes = useCallback(() => {
    // Index page
    route('/', 'GET', async () => {
      const html = generateFileListHTML(assetsRef.current);
      return { statusCode: 200, contentType: 'text/html', body: html };
    });

    // Serve file by index
    route('/file', 'GET', async (request) => serveFile(request, false));

    // Download file
    route('/download', 'GET', async (request) => serveFile(request, true));

    // Stream page (video/audio player)
    route('/stream', 'GET', async (request) => {
      const index = parseIndex(request);
      const asset = assetsRef.current[index];
      if (!asset) {
        return { statusCode: 404, contentType: 'text/html', body: '<h1>Not found</h1>' };
      }
      const html = generateStreamPage(asset, index);
      return { statusCode: 200, contentType: 'text/html', body: html };
    });
  }, []);

  const startServer = async () => {
    try {
      await getIpAddress();
      setup(port, (event: { status: string }) => {
        console.log(`Server event: ${event.status}`);
        if (event.status === 'ERROR') {
          Alert.alert('Error', 'Server error. Try restarting the app.');
        }
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

  const renderAsset = ({ item, index }: { item: MediaAsset; index: number }) => {
    const icon = item.mediaType === 'video' ? '🎬' : item.mediaType === 'audio' ? '🎵' : '🖼️';
    const duration = item.duration > 0 ? formatDuration(item.duration) : '';

    return (
      <View style={styles.assetRow}>
        <Text style={styles.assetIcon}>{icon}</Text>
        <View style={styles.assetInfo}>
          <Text style={styles.assetName} numberOfLines={1}>
            {item.filename}
          </Text>
          {duration ? <Text style={styles.assetMeta}>{duration}</Text> : null}
        </View>
      </View>
    );
  };

  const FilterButton = ({ type, label }: { type: FilterType; label: string }) => (
    <TouchableOpacity
      style={[styles.filterBtn, filter === type && styles.filterBtnActive]}
      onPress={() => setFilter(type)}
    >
      <Text style={[styles.filterText, filter === type && styles.filterTextActive]}>{label}</Text>
    </TouchableOpacity>
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
          disabled={!hasPermission}
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

        {!isRunning && (
          <Text style={styles.hint}>
            Start the server, then open the URL on any device on the same WiFi
          </Text>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <FilterButton type="all" label="All" />
        <FilterButton type="video" label="🎬 Video" />
        <FilterButton type="photo" label="🖼️ Photo" />
        <FilterButton type="audio" label="🎵 Audio" />
      </View>

      <Text style={styles.countText}>{assetCount} files found</Text>

      {/* File List */}
      {loading ? (
        <ActivityIndicator size="large" color="#00d2ff" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={assets}
          renderItem={renderAsset}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
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
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
    paddingHorizontal: 16,
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#16213e',
  },
  filterBtnActive: {
    backgroundColor: '#00d2ff',
  },
  filterText: {
    color: '#888',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  countText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  assetIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    color: '#eee',
    fontSize: 15,
  },
  assetMeta: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
});
