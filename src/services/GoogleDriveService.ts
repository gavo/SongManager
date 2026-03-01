import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

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
        const tokens = await GoogleSignin.getTokens();
        const accessToken = tokens.accessToken;

        if (!accessToken) {
            throw new Error('Not authenticated');
        }

        const folderId = await getOrCreateFolder(accessToken);
        const fullFileName = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`;

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
        return data.files || [];
    } catch (error) {
        console.error('Error listing songs:', error);
        throw error;
    }
};

/**
 * Downloads the text content of a specific file ID.
 */
export const loadSongFromDrive = async (fileId: string): Promise<string> => {
    try {
        const tokens = await GoogleSignin.getTokens();
        const accessToken = tokens.accessToken;
        if (!accessToken) throw new Error('Not authenticated');

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) throw new Error('Failed to download file');

        const text = await response.text();
        return text;
    } catch (error) {
        console.error('Error loading song:', error);
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
