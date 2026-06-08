import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, MessageSquare, Activity, CheckCircle, Volume2, AlertCircle } from 'lucide-react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import { useGeminiChat } from './hooks/useGeminiChat';

function App() {
    const [appState, setAppState] = useState('IDLE'); // IDLE | SESSION | EVALUATION
    const [category, setCategory] = useState('general');
    const [mode, setMode] = useState('speaking'); // speaking | listening
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [evaluationText, setEvaluationText] = useState('');
    const [appError, setAppError] = useState('');
    const silenceTimeoutRef = useRef(null);

    const handleSpeechResult = async (finalText, interimText) => {
        if (finalText) setTranscript(finalText);
        if (interimText) setInterimTranscript(interimText);

        const lowerText = (finalText + " " + interimText).toLowerCase();

        if (appState === 'IDLE') {
            if (lowerText.includes('mulai') || lowerText.includes('lanjut')) {
                console.log('📱 [App] Voice command detected: Mulai sesi');
                startSession(category, mode);
            }
        } else if (appState === 'SESSION') {
            if (lowerText.includes('akhiri sesi') || lowerText.includes('selesai latihan')) {
                endSession();
                return;
            }

            // Clear the previous timeout every time the user speaks (interim or final)
            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
            }

            // Only set the timer if there is actually some final text ready to send
            if (finalText.trim()) {
                console.log('📱 [App] Detected speech completion, starting 4s countdown...');
                silenceTimeoutRef.current = setTimeout(async () => {
                    console.log('📱 [App] 4s silence reached, processing user input...');
                    const textToSend = finalText;
                    setTranscript('');
                    setInterimTranscript('');

                    stopListening();
                    const response = await sendMessage(textToSend);
                    if (response && response.text) {
                        handleGeminiResponse(response.text);
                    } else {
                        setAppError("AI Error: " + (response?.error || "Unknown error"));
                        setAppState('IDLE');
                        startListening();
                    }
                }, 4000); // Wait 4 seconds of absolute silence before sending
            }
        }
    };

    const { isListening, startListening, stopListening, language, changeLanguage, error: speechError } = useSpeechRecognition(handleSpeechResult);
    const { speak, stopSpeaking, isSpeaking } = useTextToSpeech();
    const { initSession, sendMessage, chatHistory, isProcessing } = useGeminiChat();

    const handleGeminiResponse = (response) => {
        console.log('📱 [App] Parsing Gemini response:', response);
        if (response.includes('[EVALUATION]')) {
            console.log('📱 [App] Detected [EVALUATION] tag, ending session naturally.');
            const evalText = response.replace('[EVALUATION]', '').trim();
            setEvaluationText(evalText);
            setAppState('EVALUATION');
            speak(evalText, 'id-ID', () => {
                setAppState('IDLE');
                changeLanguage('id-ID');
                startListening();
            });
        } else {
            const queue = [];

            // Regex to match [EN] or [ID] tags and the text that follows them
            const regex = /(\[EN\]|\[ID\])?([^\[]+)/g;
            let match;
            while ((match = regex.exec(response)) !== null) {
                const tag = match[1];
                let text = match[2].trim();
                if (text) {
                    queue.push({
                        text: text,
                        lang: tag === '[ID]' ? 'id-ID' : 'en-US'
                    });
                }
            }

            const processQueue = (index) => {
                if (index < queue.length) {
                    console.log(`📱 [App] Processing speech queue item ${index + 1}/${queue.length} (${queue[index].lang})`);
                    speak(queue[index].text, queue[index].lang, () => {
                        setTimeout(() => processQueue(index + 1), 50);
                    });
                } else {
                    console.log('📱 [App] Speech queue finished, turning microphone back on.');
                    startListening();
                }
            };

            processQueue(0);
        }
    };

    const startSession = async (selectedCategory = category, selectedMode = 'speaking') => {
        console.log(`📱 [App] === STARTING SESSION (${selectedCategory} - ${selectedMode}) ===`);
        stopListening(); // Stop mic immediately to prevent multiple triggers
        setAppError('');
        setEvaluationText(''); // Clear previous session's evaluation history
        setAppState('SESSION');
        setTranscript('');
        setInterimTranscript('');
        setCategory(selectedCategory);
        setMode(selectedMode);

        const recogLang = selectedMode === 'listening' ? 'id-ID' : 'en-US';
        changeLanguage(recogLang);

        const initialGreeting = await initSession(selectedCategory, selectedMode);
        if (initialGreeting && initialGreeting.text) {
            handleGeminiResponse(initialGreeting.text);
        } else {
            setAppError("AI Error: " + (initialGreeting?.error || "Gagal memulai sesi."));
            setAppState('IDLE');
            changeLanguage('id-ID');
        }
    };

    const endSession = async () => {
        console.log('📱 [App] === ENDING SESSION ===');
        stopListening();
        const response = await sendMessage("[SYSTEM COMMAND: END SESSION]");
        if (response && response.text) {
            handleGeminiResponse(response.text);
        }
    };

    // We removed the buggy useEffect here since we handle the debounce inside handleSpeechResult directly.
    useEffect(() => {
        // Just a cleanup hook for unmounting
        return () => {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
            stopListening();
            stopSpeaking();
        };
    }, []);

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-2xl bg-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center border border-slate-700">

                {/* Error Banner */}
                {appError && (
                    <div className="mb-6 w-full bg-red-900/50 border border-red-500 rounded-xl p-4 flex items-center gap-3 text-red-200">
                        <AlertCircle size={24} className="text-red-400 shrink-0" />
                        <p className="text-sm">{appError}</p>
                    </div>
                )}

                {/* Status Indicator */}
                <div className="mb-8 flex items-center justify-center">
                    {appState === 'IDLE' && (
                        <div className="flex flex-col items-center">
                            <div className="w-24 h-24 mb-4 flex items-center justify-center">
                                <div className={`audio-wave ${isListening ? 'active' : ''}`}>
                                    <div className="bar"></div>
                                    <div className="bar"></div>
                                    <div className="bar"></div>
                                    <div className="bar"></div>
                                    <div className="bar"></div>
                                </div>
                            </div>
                            <p className="mt-4 text-slate-400 font-medium">Pilih kategori untuk memulai sesi:</p>

                            <div className="mt-6 flex flex-col gap-6 w-full max-w-lg">
                                {/* General Category */}
                                <div className="bg-slate-700/50 p-4 rounded-2xl flex flex-col items-center border border-slate-600">
                                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-blue-300"><MessageSquare size={20} /> Obrolan Umum</h3>
                                    <div className="flex gap-3 w-full justify-center">
                                        <button 
                                            onClick={() => startSession('general', 'speaking')}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg transition-all flex-1 flex flex-col items-center"
                                        >
                                            <span className="text-lg">🗣️</span>
                                            <span className="text-sm mt-1">Speaking (Jawab AI)</span>
                                        </button>
                                        <button 
                                            onClick={() => startSession('general', 'listening')}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium shadow-lg transition-all flex-1 flex flex-col items-center"
                                        >
                                            <span className="text-lg">🎧</span>
                                            <span className="text-sm mt-1">Listening (Pahami AI)</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Interview Category */}
                                <div className="bg-slate-700/50 p-4 rounded-2xl flex flex-col items-center border border-slate-600">
                                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-indigo-300"><Activity size={20} /> Interview: Fullstack Dev</h3>
                                    <div className="flex gap-3 w-full justify-center">
                                        <button 
                                            onClick={() => startSession('interview', 'speaking')}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium shadow-lg transition-all flex-1 flex flex-col items-center"
                                        >
                                            <span className="text-lg">🗣️</span>
                                            <span className="text-sm mt-1">Speaking (Jawab AI)</span>
                                        </button>
                                        <button 
                                            onClick={() => startSession('interview', 'listening')}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium shadow-lg transition-all flex-1 flex flex-col items-center"
                                        >
                                            <span className="text-lg">🎧</span>
                                            <span className="text-sm mt-1">Listening (Pahami AI)</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Workplace Category */}
                                <div className="bg-slate-700/50 p-4 rounded-2xl flex flex-col items-center border border-slate-600">
                                    <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-emerald-300"><MessageSquare size={20} /> Pekerjaan: Fullstack Dev</h3>
                                    <div className="flex gap-3 w-full justify-center">
                                        <button 
                                            onClick={() => startSession('workplace', 'speaking')}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium shadow-lg transition-all flex-1 flex flex-col items-center"
                                        >
                                            <span className="text-lg">🗣️</span>
                                            <span className="text-sm mt-1">Speaking (Jawab AI)</span>
                                        </button>
                                        <button 
                                            onClick={() => startSession('workplace', 'listening')}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium shadow-lg transition-all flex-1 flex flex-col items-center"
                                        >
                                            <span className="text-lg">🎧</span>
                                            <span className="text-sm mt-1">Listening (Pahami AI)</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {!isListening && <p className="text-red-400 text-xs mt-6">Mikrofon tidak aktif</p>}
                        </div>
                    )}

                    {appState === 'SESSION' && (
                        <div className="flex flex-col items-center">
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${isSpeaking ? 'bg-green-600 pulse-ring' : isProcessing ? 'bg-yellow-600 animate-pulse' : 'bg-transparent'}`}>
                                {isSpeaking ? <Volume2 size={40} /> : isProcessing ? <Activity size={40} /> : (
                                    <div className={`audio-wave ${isListening ? 'active' : ''}`}>
                                        <div className="bar"></div>
                                        <div className="bar"></div>
                                        <div className="bar"></div>
                                        <div className="bar"></div>
                                        <div className="bar"></div>
                                    </div>
                                )}
                            </div>
                            <p className="mt-4 text-blue-200 font-medium">
                                {isSpeaking ? "AI Berbicara..." : isProcessing ? "AI Berpikir..." : "Giliran Anda Berbicara..."}
                            </p>
                            <p className="mt-2 text-xs text-slate-400">Ucapkan <span className="text-red-400 font-bold">"Akhiri Sesi"</span> atau tekan tombol</p>
                            <button
                                onClick={endSession}
                                className="mt-6 px-6 py-2 bg-red-900/40 hover:bg-red-800 text-red-200 rounded-full font-bold shadow-lg transition-all border border-red-700/50 flex items-center gap-2"
                            >
                                Akhiri Sesi
                            </button>
                        </div>
                    )}

                    {appState === 'EVALUATION' && (
                        <div className="flex flex-col items-center">
                            <div className="w-24 h-24 rounded-full flex items-center justify-center bg-purple-600 pulse-ring">
                                <CheckCircle size={40} />
                            </div>
                            <p className="mt-4 text-purple-200 font-medium">Membacakan Penilaian...</p>
                        </div>
                    )}
                </div>

                {/* Live Transcript */}
                <div className="w-full bg-slate-900/50 rounded-xl p-6 min-h-[120px] border border-slate-700/50 text-center flex flex-col justify-center">
                    {speechError && <p className="text-red-400 text-sm mb-2">{speechError}</p>}

                    <p className="text-xl font-light text-slate-300">
                        {transcript && <span>{transcript} </span>}
                        {interimTranscript && <span className="text-slate-500 italic">{interimTranscript}</span>}
                        {!transcript && !interimTranscript && <span className="text-slate-600 italic">Mendengarkan...</span>}
                    </p>
                </div>

                {/* Evaluation Box */}
                {evaluationText && appState !== 'SESSION' && (
                    <div className="mt-6 w-full bg-purple-900/30 rounded-xl p-6 border border-purple-500/30">
                        <h3 className="text-purple-300 font-bold mb-2 flex items-center gap-2">
                            <CheckCircle size={18} /> Penilaian Sesi Ini
                        </h3>
                        <p className="text-purple-100 text-sm leading-relaxed">{evaluationText}</p>
                    </div>
                )}

            </div>
        </div>
    );
}

export default App;
