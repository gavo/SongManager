import React, { useState, useMemo } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  FlatList
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ViewShot from 'react-native-view-shot';
import Share from 'react-native-share';
import Icon from 'react-native-vector-icons/FontAwesome5';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseSongText } from './src/engine/SongParser';
import { transposeChord, padChord } from './src/engine/ChordEngine';
import { initGoogleSignIn, signIn, signInSilently, signOut, saveSongToDrive, listSongsFromDrive, loadSongFromDrive, deleteSongFromDrive, DriveUser } from './src/services/GoogleDriveService';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [songTitle, setSongTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [transposeSteps, setTransposeSteps] = useState(0);
  const [user, setUser] = useState<DriveUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalVisible, setModalVisible] = useState(false);
  const [isLoadingSongs, setIsLoadingSongs] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [savedSongs, setSavedSongs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const viewShotRef = React.useRef<ViewShot>(null);

  // Initialize config once and auto login
  React.useEffect(() => {
    const hydrateSession = async () => {
      try {
        const storedTitle = await AsyncStorage.getItem('@songTitle');
        const storedText = await AsyncStorage.getItem('@rawText');
        const storedFileId = await AsyncStorage.getItem('@currentFileId');

        if (storedTitle !== null) setSongTitle(storedTitle);
        if (storedText !== null) setRawText(storedText);
        if (storedFileId !== null) setCurrentFileId(storedFileId);
      } catch (e) {
        console.error('Failed to load session.', e);
      } finally {
        setIsLoadingSession(false);
      }
    };

    hydrateSession();
    initGoogleSignIn();

    const autoLogin = async () => {
      let activeUser = await signInSilently();
      if (!activeUser) {
        // Fallback to interactive sign in if there's no pre-existing session
        activeUser = await signIn();
      }
      if (activeUser) {
        setUser(activeUser);
      }
    };

    autoLogin();
  }, []);

  // Save session state automatically whenever it changes
  React.useEffect(() => {
    const saveSession = async () => {
      if (isLoadingSession) return; // Prevent overwriting with default empties before load

      try {
        await AsyncStorage.setItem('@songTitle', songTitle);
        await AsyncStorage.setItem('@rawText', rawText);

        if (currentFileId) {
          await AsyncStorage.setItem('@currentFileId', currentFileId);
        } else {
          await AsyncStorage.removeItem('@currentFileId');
        }
      } catch (e) {
        console.error('Failed to save session.', e);
      }
    };

    saveSession();
  }, [songTitle, rawText, currentFileId, isLoadingSession]);

  // Re-calculate the parsed song ONLY when raw text or transpose steps change
  const songData = useMemo(() => {
    const groups = parseSongText(rawText);

    // Apply transposition and padding to the chords
    return groups.map((group: any) => {
      if (!group.chordsLine) return group;

      const transposedChords = group.parsedChords.map((c: any) => ({
        ...c,
        chord: transposeChord(c.chord, transposeSteps)
      }));

      return {
        ...group,
        parsedChords: transposedChords
      };
    });
  }, [rawText, transposeSteps]);

  // Compute the first chord of the song based on the transposed data
  const firstChord = useMemo(() => {
    for (const group of songData) {
      if (group.chordsLine && group.parsedChords && group.parsedChords.length > 0) {
        return group.parsedChords[0].chord;
      }
    }
    return '-';
  }, [songData]);

  const handleTransposeUp = () => setTransposeSteps((prev: number) => prev + 1);
  const handleTransposeDown = () => setTransposeSteps((prev: number) => prev - 1);

  const handleLogout = async () => {
    await signOut();
    setUser(null);
  };

  const handleSaveToDrive = async () => {
    if (!user) return Alert.alert('Error', 'Debes iniciar sesión primero');
    if (!songTitle.trim()) return Alert.alert('Error', 'Debes ponerle un título a la canción');

    setIsSaving(true);
    try {
      const res = await saveSongToDrive(songTitle.trim(), rawText);
      setCurrentFileId(res.id);
      Alert.alert('¡Éxito!', `¡"${songTitle}" fue guardada en tu Google Drive!`);
    } catch (e: any) {
      Alert.alert('Error al guardar', e.message || 'Error desconocido');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDriveSong = async () => {
    if (!currentFileId) return Alert.alert('Operación no Válida', 'Para borrar una canción primero debes seleccionarla o guardarla en Drive.');

    Alert.alert(
      'Confirmar Borrado',
      `¿Estás seguro de que deseas eliminar permanentemente "${songTitle}" de tu Google Drive?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSongFromDrive(currentFileId);
              Alert.alert('Eliminado', 'La canción ha sido borrada exitosamente.');
              setCurrentFileId(null);
            } catch (e: any) {
              Alert.alert('Error al borrar', e.message || 'Error desconocido');
            }
          }
        }
      ]
    );
  };

  const handleOpenLoadModal = async () => {
    setModalVisible(true);
    setIsLoadingSongs(true);
    setSearchQuery('');
    try {
      const songs = await listSongsFromDrive();
      setSavedSongs(songs);
    } catch (e: any) {
      Alert.alert('Error al cargar', e.message || 'Error desconocido');
      setModalVisible(false);
    } finally {
      setIsLoadingSongs(false);
    }
  };

  const handleLoadSong = async (fileId: string, fileName: string) => {
    try {
      setModalVisible(false);
      // Show a short UI loading state if desired, but await is fast for TXT
      const text = await loadSongFromDrive(fileId);
      setCurrentFileId(fileId);
      setSongTitle(fileName.replace('.txt', ''));
      setRawText(text);
      setTransposeSteps(0); // Reset transpose when loading new song
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo descargar la canción');
    }
  };

  const filteredSongs = useMemo(() => {
    if (!searchQuery) return savedSongs;
    // Normalize string: Remove diacritics (accents) and trim down to lowercase
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const query = normalize(searchQuery);
    return savedSongs.filter(song => normalize(song.name).includes(query));
  }, [savedSongs, searchQuery]);

  const handleShareWhatsApp = async () => {
    try {
      if (viewShotRef.current && viewShotRef.current.capture) {
        // Capture screenshot of the song view
        const uri = await viewShotRef.current.capture();

        // Share via native intent
        await Share.open({
          url: uri,
          title: songTitle || 'Compartir Acordes',
          message: songTitle || 'Canción',
          // We don't force specifically WhatsApp to give the user freedom, 
          // but the native share sheet makes it 1 tap away.
        });
      }
    } catch (error: any) {
      if (error.message !== 'User did not share') {
        Alert.alert('Error al compartir', 'Ocurrió un problema: ' + error.message);
      }
    }
  };

  if (isLoadingSession) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F4F8' }}>
        <ActivityIndicator size="large" color="#3182CE" />
        <Text style={{ marginTop: 15, color: '#4A5568', fontWeight: 'bold' }}>Restaurando Sesión...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

        <View style={styles.header}>
          <View style={[styles.transposeControls, { width: '100%', justifyContent: 'space-between', paddingHorizontal: 10 }]}>
            <TouchableOpacity style={styles.button} onPress={handleTransposeDown}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="minus" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Icon name="music" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <Text
              style={[styles.transposeValue, { flex: 1, textAlign: 'center', fontSize: 26, marginHorizontal: 15 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {firstChord}
            </Text>

            <TouchableOpacity style={styles.button} onPress={handleTransposeUp}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="plus" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Icon name="music" size={16} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>

          <View style={styles.editorContainer}>
            <View style={styles.cloudToolbar}>
              {user ? (
                <View style={styles.userBar}>
                  <Text style={styles.userName}>Hola, {user.name || 'Usuario'}</Text>
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity style={styles.cloudButtonLoad} onPress={handleOpenLoadModal}>
                      <Icon name="folder-open" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cloudButton} onPress={handleSaveToDrive} disabled={isSaving}>
                      {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="save" size={20} color="#FFFFFF" />}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cloudButtonDelete} onPress={handleDeleteDriveSong}>
                      <Icon name="trash-alt" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                      <Icon name="sign-out-alt" size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={[styles.userBar, { justifyContent: 'center', backgroundColor: 'transparent' }]}>
                  <ActivityIndicator size="small" color="#3182CE" />
                  <Text style={{ marginLeft: 10, color: '#718096', fontWeight: 'bold' }}>Sincronizando Drive...</Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>Editor</Text>
            <TextInput
              style={styles.titleInput}
              value={songTitle}
              onChangeText={setSongTitle}
              placeholder="Título de la Canción"
              placeholderTextColor="#A0AEC0"
            />
            <View style={styles.editorScrollWrapper}>
              <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                <TextInput
                  style={styles.textInput}
                  multiline
                  value={rawText}
                  onChangeText={setRawText}
                  autoCapitalize="none"
                  scrollEnabled={false}
                />
              </ScrollView>
            </View>
          </View>

          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.sectionTitle}>
                {songTitle || 'Sin Título'}   en {firstChord}
              </Text>
              <TouchableOpacity style={styles.shareButton} onPress={handleShareWhatsApp}>
                <Icon name="whatsapp" brand size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.songSheetWrapper}>
              <ScrollView horizontal contentContainerStyle={{ paddingRight: 40 }}>
                <ViewShot ref={viewShotRef} options={{ format: "jpg", quality: 0.9 }}>
                  <View style={styles.songSheet}>
                    {songData.map((group: any) => {
                      if (group.id.includes('empty')) {
                        return <View key={group.id} style={{ height: 16 }} />;
                      }

                      return (
                        <View key={group.id} style={styles.lineGroup}>
                          {/* Chords Line */}
                          {group.chordsLine && (
                            <View style={styles.chordLineContainer}>
                              {group.parsedChords.map((chordObj: any, index: number) => (
                                <Text
                                  key={index}
                                  style={[
                                    styles.chordText,
                                    { left: chordObj.index * 7.5 } // Refined layout for smaller monospace font
                                  ]}
                                >
                                  {padChord(chordObj.chord)}
                                </Text>
                              ))}
                            </View>
                          )}
                          {/* Lyrics Line */}
                          {group.lyricsLine !== null && (
                            <Text style={styles.lyricsText}>{group.lyricsLine}</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </ViewShot>
              </ScrollView>
            </View>
          </View>

        </ScrollView>

        {/* Load Songs Modal */}
        <Modal visible={isModalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Mis Canciones en Drive</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseButton}>
                  <Text style={styles.modalCloseText}>X</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.searchInput}
                placeholder="Buscar canción..."
                placeholderTextColor="#A0AEC0"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {isLoadingSongs ? (
                <ActivityIndicator size="large" color="#3182CE" style={{ marginTop: 20 }} />
              ) : savedSongs.length === 0 ? (
                <Text style={styles.emptyText}>No tienes canciones guardadas aún.</Text>
              ) : filteredSongs.length === 0 ? (
                <Text style={styles.emptyText}>No se encontraron canciones.</Text>
              ) : (
                <FlatList
                  data={filteredSongs}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }: { item: any }) => (
                    <TouchableOpacity style={styles.songItem} onPress={() => handleLoadSong(item.id, item.name)}>
                      <Text style={styles.songItemName}>{item.name.replace('.txt', '')}</Text>
                      <Text style={styles.songItemDate}>
                        {new Date(item.modifiedTime).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8', // Softer, more modern background color
  },
  header: {
    paddingVertical: 20,
    paddingHorizontal: 25,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#1A202C',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  transposeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderRadius: 30,
    padding: 5,
  },
  button: {
    backgroundColor: '#3182CE',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#3182CE',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  transposeValue: {
    fontSize: 20,
    fontWeight: '800',
    marginHorizontal: 25,
    color: '#2D3748',
    width: 36,
    textAlign: 'center',
  },
  cloudToolbar: {
    marginBottom: 25,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  userBar: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 15,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    gap: 10,
  },
  cloudButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#48BB78',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#48BB78',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cloudButtonLoad: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3182CE',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#3182CE',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cloudButtonDelete: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E53E3E',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#E53E3E',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  logoutButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F56565',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#F56565',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cloudButtonLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#48BB78',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 10,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A0AEC0',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  editorContainer: {
    marginBottom: 30,
  },
  titleInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 15,
    fontSize: 18,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  editorScrollWrapper: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  textInput: {
    padding: 20,
    minHeight: 180,
    minWidth: '100%',
    fontFamily: 'monospace',
    color: '#2D3748',
    textAlignVertical: 'top',
    fontSize: 13,
  },
  previewContainer: {
    marginBottom: 40,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  shareButton: {
    backgroundColor: '#25D366',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#25D366',
    shadowOpacity: 0.4,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  songSheetWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  songSheet: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 25,
    paddingVertical: 35,
    minWidth: '100%',
  },
  lineGroup: {
    marginBottom: 6,
  },
  chordLineContainer: {
    height: 18,
    flexDirection: 'row',
    position: 'relative',
    marginBottom: 0,
  },
  chordText: {
    position: 'absolute',
    color: '#E53E3E',
    fontWeight: '800',
    fontFamily: 'monospace',
    fontSize: 13,
    letterSpacing: 0,
  },
  lyricsText: {
    color: '#000000',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 25,
    minHeight: '60%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  modalCloseButton: {
    backgroundColor: '#EDF2F7',
    padding: 8,
    borderRadius: 20,
    width: 36,
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4A5568',
  },
  searchInput: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#2D3748',
    marginBottom: 15,
  },
  songItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  songItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2b6cb0',
  },
  songItemDate: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#A0AEC0',
    marginTop: 40,
    fontSize: 16,
  }
});

export default App;
