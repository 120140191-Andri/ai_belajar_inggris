import { useState, useCallback, useRef } from 'react';

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  const speak = useCallback((text, lang = 'en-US', onEndCallback = null) => {
    if (!('speechSynthesis' in window)) {
      console.error('🔊 [TTS] Text-to-speech not supported.');
      if(onEndCallback) onEndCallback();
      return;
    }
    
    console.log('🔊 [TTS] Preparing to speak:', { text, lang });

    // Clean text from markdown asterisks and hashes so it's not spoken aloud
    const cleanText = text.replace(/[*#_~`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance; // KEEP A REFERENCE TO PREVENT GARBAGE COLLECTION

    utterance.lang = lang;
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;

    // Try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang === lang && v.name.includes('Google'));
    if (enVoice) {
      utterance.voice = enVoice;
    }

    utterance.onstart = () => {
        console.log('🔊 [TTS] Speaking started');
        setIsSpeaking(true);
    };
    utterance.onend = () => {
      console.log('🔊 [TTS] Speaking finished');
      setIsSpeaking(false);
      if (onEndCallback) onEndCallback();
    };
    utterance.onerror = (e) => {
      console.error('🔊 [TTS] Speech synthesis error', e);
      setIsSpeaking(false);
      if (onEndCallback) onEndCallback();
    };

    console.log('🔊 [TTS] Sending to synthesis engine...');
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    console.log('🔊 [TTS] Force stopping speech synthesis...');
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { speak, stopSpeaking, isSpeaking };
};
