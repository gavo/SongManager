import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';

let isSyncing = false;

export const initGoogleSignIn = () => {
    GoogleSignin.configure({
        // We pass the provided Client ID here (webClientId is mostly used by the library for typings, 
        // Android natively infers its own from the SHA-1 registry if webClientId isn't enforcing it strictly)
        webClientId: '840378972503-dsfh2vjg4k6n82jm2in2ikvlj44qjd2p.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/drive'], // Full Google Drive permission to read user-uploaded txt files
        offlineAccess: true,
    });
};

export interface DriveUser {
    id: string;
    name: string | null;
    email: string;
    photo: string | null;
}

export const signIn = async (): Promise<DriveUser | null> => {
    try {
        await GoogleSignin.hasPlayServices();
        await GoogleSignin.signIn();
        const currentUser = GoogleSignin.getCurrentUser();

        if (currentUser?.user) {
            return {
                id: currentUser.user.id,
                name: currentUser.user.name,
                email: currentUser.user.email,
                photo: currentUser.user.photo
            };
        }
        return null;
    } catch (error: any) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
            console.log('User cancelled the login flow');
        } else if (error.code === statusCodes.IN_PROGRESS) {
            console.log('Operation (e.g. sign in) is in progress already');
        } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            console.log('Play services not available or outdated');
        } else {
            console.error('Google Sign-In Error:', error);
        }
        return null;
    }
};

export const signInSilently = async (): Promise<DriveUser | null> => {
    try {
        await GoogleSignin.hasPlayServices();
        await GoogleSignin.signInSilently();
        const currentUser = GoogleSignin.getCurrentUser();
        if (currentUser?.user) {
            return {
                id: currentUser.user.id,
                name: currentUser.user.name,
                email: currentUser.user.email,
                photo: currentUser.user.photo
            };
        }
        return null;
    } catch (error: any) {
        if (error.code === statusCodes.SIGN_IN_REQUIRED) {
            console.log('User has not signed in yet');
        } else {
            console.error('Google Sign-In Silently Error:', error);
        }
        return null;
    }
};

export const signOut = async () => {
    try {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
    } catch (error) {
        console.error(error);
    }
};

const FOLDER_NAME = 'SongManager App';

/**
 * Searches for the main App folder, or creates it if it doesn't exist.
 */
const getOrCreateFolder = async (accessToken: string): Promise<string> => {
    // 1. Search if the folder exists
    const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id; // Return existing folder ID
    }

    // 2. Create the folder since it doesn't exist
    const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });

    const createData = await createFolderRes.json();
    return createData.id;
};

/**
 * Saves a song to Google Drive using the REST API directly
 * since the official Drive SDK doesn't natively support React Native easily.
 */
export const saveSongToDrive = async (fileName: string, rawText: string) => {
    try {
        const networkState = await NetInfo.fetch();
        const fullFileName = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`;
        const offlineId = `offline_${Date.now()}`;

        if (!networkState.isConnected) {
            // OFFLINE SAVE LOGIC

            // 1. Save text locally
            await AsyncStorage.setItem(`@song_${offlineId}`, rawText);

            // 2. Mock a file object for the list
            const mockFile = { id: offlineId, name: fullFileName, modifiedTime: new Date().toISOString() };

            // 3. Update the offline song list (if exists) so the user immediately sees it
            const cachedListStr = await AsyncStorage.getItem('@songs_list');
            let cachedList = JSON.parse(cachedListStr || "[]");
            cachedList = cachedList.filter((f: any) => f.name !== mockFile.name); // basic overwrite UI patch
            cachedList.unshift(mockFile);
            await AsyncStorage.setItem('@songs_list', JSON.stringify(cachedList));

            // 4. Add to the Synchronization Queue
            const queueStr = await AsyncStorage.getItem('@sync_queue');
            let queue = JSON.parse(queueStr || "[]");
            // Remove older edits to the exact same file if user mashed "save" offline multiple times
            queue = queue.filter((item: any) => item.fileName !== fileName);
            queue.push({ fileName, rawText, timestamp: Date.now() });

            await AsyncStorage.setItem('@sync_queue', JSON.stringify(queue));
            return { id: offlineId };
        }

        const tokens = await GoogleSignin.getTokens();
        const accessToken = tokens.accessToken;

        if (!accessToken) {
            throw new Error('Not authenticated');
        }

        const folderId = await getOrCreateFolder(accessToken);

        // 1. Check if file already exists to avoid generating duplicates
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(fullFileName)}' and '${folderId}' in parents and trashed=false&spaces=drive`;
        const searchResponse = await fetch(searchUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const searchData = await searchResponse.json();

        const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

        // 2. Create the metadata for the file (Omit parents when patching to prevent Drive API errors)
        const metadata: any = {
            name: fullFileName,
            mimeType: 'text/plain'
        };
        if (!existingFile) {
            metadata.parents = [folderId];
        }

        // 3. Prepare the multipart upload body
        const boundary = 'foo_bar_baz';
        const delimiter = `\r\n--${boundary}\r\n`;
        const close_delim = `\r\n--${boundary}--`;

        let multipartRequestBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
            rawText +
            close_delim;

        // 4. Perform the fetch request
        const method = existingFile ? 'PATCH' : 'POST';
        const url = existingFile
            ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
                'Content-Length': String(multipartRequestBody.length)
            },
            body: multipartRequestBody
        });

        const result = await response.json();

        // Caching the newly saved text and updating local metadata list so it's ready for next offline trigger
        if (result && result.id) {
            await AsyncStorage.setItem(`@song_${result.id}`, rawText);

            // Overwrite into cache list to keep offline files synced with online reality
            const cachedListStr = await AsyncStorage.getItem('@songs_list');
            let cachedList = JSON.parse(cachedListStr || "[]");
            cachedList = cachedList.filter((f: any) => f.name !== fullFileName && !f.id.startsWith('offline_'));
            cachedList.unshift({ id: result.id, name: fullFileName, modifiedTime: new Date().toISOString() });
            await AsyncStorage.setItem('@songs_list', JSON.stringify(cachedList));
        }

        return result; // return parsed JSON object which contains file ID
    } catch (error) {
        console.error('Error saving to Drive:', error);
        throw error;
    }
};

/**
 * Lists all `.txt` song files from the App folder.
 */
export const listSongsFromDrive = async () => {
    try {
        const networkState = await NetInfo.fetch();
        if (!networkState.isConnected) {
            const cachedList = await AsyncStorage.getItem('@songs_list');
            return cachedList ? JSON.parse(cachedList) : [];
        }

        const tokens = await GoogleSignin.getTokens();
        const accessToken = tokens.accessToken;
        if (!accessToken) throw new Error('Not authenticated');

        const folderId = await getOrCreateFolder(accessToken);

        // Find all txt files inside the folder
        const query = encodeURIComponent(`'${folderId}' in parents and mimeType='text/plain' and trashed=false`);
        const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name, modifiedTime)`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const data = await response.json();
        const files = data.files || [];

        await AsyncStorage.setItem('@songs_list', JSON.stringify(files));
        return files;
    } catch (error) {
        console.error('Error listing songs:', error);
        const cachedList = await AsyncStorage.getItem('@songs_list');
        return cachedList ? JSON.parse(cachedList) : [];
    }
};

/**
 * Downloads the text content of a specific file ID or pulls from cache if offline.
 */
export const loadSongFromDrive = async (fileId: string): Promise<string> => {
    try {
        const networkState = await NetInfo.fetch();

        // Always try cache if it's an offline draft regardless of internet state
        if (!networkState.isConnected || fileId.startsWith('offline_')) {
            const localContent = await AsyncStorage.getItem(`@song_${fileId}`);
            if (localContent !== null) return localContent;

            Alert.alert(`DEBUG ID: ${fileId}`);
            const allKeys = await AsyncStorage.getAllKeys();
            console.log("DUMP ALL CACHE KEYS:", allKeys);

            throw new Error('Archivo desconectado no hallado localmente');
        }

        const tokens = await GoogleSignin.getTokens();
        const accessToken = tokens.accessToken;
        if (!accessToken) throw new Error('Not authenticated');

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error('Failed to download file');

        const text = await response.text();
        await AsyncStorage.setItem(`@song_${fileId}`, text);
        return text;
    } catch (error) {
        console.error('Error loading song:', error);
        const localContent = await AsyncStorage.getItem(`@song_${fileId}`);
        if (localContent !== null) return localContent;
        throw error;
    }
};

/**
 * Deletes a file from Google Drive permanently using its fileId.
 */
export const deleteSongFromDrive = async (fileId: string): Promise<boolean> => {
    try {
        const tokens = await GoogleSignin.getTokens();
        const accessToken = tokens.accessToken;
        if (!accessToken) throw new Error('Not authenticated');

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error('Failed to delete file');

        return true;
    } catch (error) {
        console.error('Error deleting song:', error);
        throw error;
    }
};

/**
 * Checks the async storage offline queue and attempts to upload everything to Drive.
 */
export const syncOfflineQueue = async () => {
    if (isSyncing) return;

    try {
        isSyncing = true;

        const networkState = await NetInfo.fetch();
        if (!networkState.isConnected) {
            isSyncing = false;
            return; // Wait until next launch
        }

        const queueStr = await AsyncStorage.getItem('@sync_queue');
        if (!queueStr) {
            isSyncing = false;
            return;
        }

        let queue = JSON.parse(queueStr);
        if (!queue || queue.length === 0) {
            isSyncing = false;
            return;
        }

        // Ensure user is signed in to perform real saves safely
        const tokens = await GoogleSignin.getTokens();
        if (!tokens || !tokens.accessToken) {
            isSyncing = false;
            return;
        }

        console.log(`[SYNC] Sincronizando ${queue.length} archivo(s) offline hacia Google Drive...`);
        let filesRemaining = [];

        for (const item of queue) {
            try {
                // By calling saveSongToDrive here, it naturally bypasses the offline guard
                // because networkState IS connected now.
                const res = await saveSongToDrive(item.fileName, item.rawText);
                console.log(`[SYNC] Subido exitosamente: ${item.fileName} -> ID: ${res.id}`);
            } catch (err) {
                console.error(`[SYNC] Error subiendo en fondo: ${item.fileName}`, err);
                filesRemaining.push(item); // Keep in queue for next retry
            }
        }

        // Keep files that failed, or clear the queue completely if all uploaded correctly
        if (filesRemaining.length > 0) {
            await AsyncStorage.setItem('@sync_queue', JSON.stringify(filesRemaining));
        } else {
            await AsyncStorage.removeItem('@sync_queue');
        }

    } catch (e) {
        console.error('Background Sync Failed:', e);
    } finally {
        isSyncing = false;
    }
};
