import RNFS from 'react-native-fs';

const BASE_DIR = `${RNFS.DocumentDirectoryPath}/SongManager`;

export const initLocalFileSystem = async () => {
  const exists = await RNFS.exists(BASE_DIR);
  if (!exists) {
    await RNFS.mkdir(BASE_DIR);
  }
};

export const saveSongLocally = async (title: string, content: string) => {
  await initLocalFileSystem();
  const fileName = `${title.trim()}.txt`;
  const filePath = `${BASE_DIR}/${fileName}`;
  await RNFS.writeFile(filePath, content, 'utf8');
  return { fileName, filePath };
};

export const listLocalSongs = async () => {
  await initLocalFileSystem();
  const files = await RNFS.readDir(BASE_DIR);
  return files
    .filter(f => f.name.endsWith('.txt'))
    .map(f => ({
      id: f.path, // Use path as unique ID
      name: f.name,
    }));
};

export const loadLocalSong = async (filePath: string) => {
  return await RNFS.readFile(filePath, 'utf8');
};

export const deleteLocalSong = async (filePath: string) => {
  await RNFS.unlink(filePath);
};
