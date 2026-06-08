import { useState, useEffect, useRef, useCallback } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const useSpeechRecognition = (onResult) => {
  const [isListening, setIsListening] = useState(false);
  const [language, setLanguage] = useState('id-ID'); 
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  
  // Use a ref to keep track of the latest callback without re-triggering useEffect
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      console.log('🎤 [Speech] Microphone listening started', { language });
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) console.log('🎤 [Speech] Final transcript:', finalTranscript);
      onResultRef.current(finalTranscript.trim(), interimTranscript.trim());
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      if (event.error !== 'no-speech') {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      console.log('🎤 [Speech] Microphone stopped');
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [language]); // Removed onResult from dependencies!

  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        console.log('🎤 [Speech] Attempting to start listening...');
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn("🎤 [Speech] Could not start listening (might already be running)", err);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
          console.log('🎤 [Speech] Force stopping microphone...');
          recognitionRef.current.stop();
      } catch (err) {}
      setIsListening(false);
    }
  }, []);

  const changeLanguage = useCallback((lang) => {
    if (language !== lang) {
      console.log(`🎤 [Speech] Changing language from ${language} to ${lang}`);
      if (isListening && recognitionRef.current) {
        recognitionRef.current.stop(); 
      }
      setLanguage(lang); 
    }
  }, [language, isListening]);

  return { isListening, startListening, stopListening, language, changeLanguage, error };
};
