import React, { useState, useContext, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as Permissions from 'expo-permissions';
import { View, StyleSheet, Text } from 'react-native';
import { Storage, Auth } from 'aws-amplify';

import config from '../../../aws-exports';
import RecordButton from '../../components/recordButton';
import PlaybackForm from '../../components/playbackForm';
import { Context as AudioContext } from '../../context/audioContext/audioContext';
import { Context as RecordingsContext } from '../../context/recordingsContext/recordingsContext';
import { Context as UserContext } from '../../context/userContext/userContext';
const { aws_user_files_s3_bucket_region: region, aws_user_files_s3_bucket: bucket } = config;

Auth.configure({
  identityPoolId: config.aws_cognito_identity_pool_id,
  region: config.aws_cognito_region,
});

Storage.configure({
  AWSS3: {
    bucket,
    region,
  },
});

export default function RecordingScreen({ navigation }) {
  const [hasAudioPermissions, setAudioPermissions] = useState(false);
  const {
    setIsRecording,
    setRecording,
    setCurrentPlayback,
    state: { isRecording, recording, playback },
  } = useContext(AudioContext);
  const { postRecordingToS3AndDynamo } = useContext(RecordingsContext);

  const {
    state: { currentUser },
  } = useContext(UserContext);

  const audioModeOptions = {
    allowsRecordingIOS: true,
    interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DO_NOT_MIX,
    playsInSilentModeIOS: true,
    shouldDuckAndroid: true,
    interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
    playThroughEarpieceAndroid: false,
    staysActiveInBackground: true,
  };

  useEffect(() => {
    async function askForAudioPermissions() {
      const { status } = await Permissions.askAsync(Permissions.AUDIO_RECORDING);
      setAudioPermissions(status === 'granted');
    }

    askForAudioPermissions();
  }, []);

  const beginRecording = async () => {
    const _recording = new Audio.Recording();

    try {
      await Audio.setAudioModeAsync(audioModeOptions);
      await _recording.prepareToRecordAsync(
        (Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY = {
          android: {
            extension: '.m4a',
            outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
            audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_DEFAULT,
            sampleRate: 44100,
            numberOfChannels: 2,
            bitRate: 128000,
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
            audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_MEDIUM,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 96400,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
        })
      );

      await _recording.startAsync();
      setRecording(_recording);
      setIsRecording(true);
    } catch (error) {
      console.log(error);
    }
  };

  const stopRecording = async () => {
    await Audio.setAudioModeAsync({
      ...audioModeOptions,
      allowsRecordingIOS: false,
    });

    await recording.stopAndUnloadAsync();
    const { sound } = await recording.createNewLoadedSoundAsync({
      isLooping: false,
      isMuted: false,
      volume: 1,
    });

    setCurrentPlayback(sound);
    setIsRecording(false);
  };

  const startRecordedPlayBack = async () => {
    await Audio.setAudioModeAsync({
      ...audioModeOptions,
      allowsRecordingIOS: false,
    });
    try {
      (await playback.sound.playAsync()) || (await playback.sound.replayAsync());
    } catch (error) {
      console.log(error);
    }
  };

  const saveAndUnloadRecordedPlayback = async title => {
    setCurrentPlayback(null);
    navigation.navigate('Feed');
    await postRecordingToS3AndDynamo(title, recording, currentUser.id);
    await playback.sound.unloadAsync();
  };

  return (
    <View
      style={
        !playback.sound
          ? styles.mainContainer
          : { ...styles.mainContainer, justifyContent: 'center' }
      }
    >
      {playback.sound ? (
        <View style={styles.form}>
          <PlaybackForm
            startPlayback={startRecordedPlayBack}
            savePlaybackInfo={title => saveAndUnloadRecordedPlayback(title)}
          />
        </View>
      ) : (
        <>
          <View style={styles.recordingStatus}>
            <Text style={styles.recordingStatusText}>{isRecording ? 'Recording' : 'Record'}</Text>
          </View>
          <View style={styles.recordingButton}>
            <RecordButton
              hasAudioPermissions={hasAudioPermissions}
              isRecording={isRecording}
              stopRecording={stopRecording}
              beginRecording={beginRecording}
            />
          </View>
        </>
      )}
    </View>
  );
}

RecordingScreen.navigationOptions = {
  title: 'Record',
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  recordingButton: {
    marginBottom: 80,
    alignSelf: 'center',
  },
  recordingStatus: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingStatusText: {
    fontSize: 60,
  },
  form: {},
});
