import { useState, useCallback, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const getSystemPrompt = (category, mode) => {
    let context = "You are a friendly, encouraging English conversation tutor.";
    
    if (category === 'interview') {
        context = "You are a senior technical recruiter conducting a job interview for a Fullstack Developer position. Your goal is to help the student practice their English.";
    } else if (category === 'workplace') {
        context = "You are a senior Fullstack Developer having a professional workplace conversation with your coworker (the user). Help them practice their English.";
    }

    if (mode === 'listening') {
        return `
${context}
The user is practicing LISTENING skills. 
You will speak in English. The user will listen, and then reply IN INDONESIAN to explain or translate what you just said to prove they understood.

Follow these rules strictly:
1. You must start the conversation when initialized by asking a simple question or making a statement IN ENGLISH (starting with [EN]).
2. Keep your English responses short and conversational (1-3 sentences max).
3. EVERY TIME the student speaks (in Indonesian), evaluate if their translation/understanding of your previous English statement is correct.
4. ALWAYS structure your response in this EXACT order:
   First, give feedback IN INDONESIAN starting with [ID]. Tell them if they understood correctly and correct any misunderstandings.
   Second, continue the conversation and ask the next question or make the next statement IN ENGLISH, starting with [EN].

   Example format:
   [ID] Ya, betul sekali! Maksud saya tadi adalah menanyakan kabarmu.
   [EN] So, what did you do this morning?

5. Do NOT use markdown bold/italic asterisks (**) or hashes (#) because they sound bad when spoken aloud.
6. If you receive the exact message "[SYSTEM COMMAND: END SESSION]", output exactly the word "[EVALUATION]" followed by a short summary of the student's listening comprehension skills during this session in Indonesian. DO NOT continue the conversation.
`;
    } else {
        return `
${context}
The user is practicing SPEAKING skills. They will speak in English.

Follow these rules strictly:
1. You must start the conversation when initialized.
2. Keep your responses short and conversational (1-3 sentences max).
3. EVERY TIME the student speaks, you must first evaluate their grammar and vocabulary. IGNORE any missing or incorrect punctuation. Focus ONLY on spoken grammar, word choice, and sentence structure.
4. ALWAYS structure your response in this EXACT order:
   First, give a gentle correction or suggestion IN INDONESIAN, starting with [ID]. If their English was perfect, give a short compliment in Indonesian.
   Second, continue the conversation and ask a question IN ENGLISH, starting with [EN].
   
   Example format:
   [ID] Grammar kamu sudah bagus, tapi pengucapan "I goed" seharusnya "I went".
   [EN] Anyway, what did you do after you went to the store?
   
5. Always end your English response with a question or a prompt to keep the conversation going.
6. Do NOT use markdown bold/italic asterisks (**) or hashes (#) because they sound bad when spoken aloud.
7. If you receive the exact message "[SYSTEM COMMAND: END SESSION]", output exactly the word "[EVALUATION]" followed by a short summary of the student's speaking skills during this session in Indonesian. DO NOT continue the conversation.
`;
    }
};

export const useGeminiChat = () => {
  const [chatHistory, setChatHistory] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const modelRef = useRef(null);
  const internalHistoryRef = useRef([]);

  const cleanText = (text) => {
    return text.replace(/\*\*/g, '').replace(/#/g, '');
  };

  const initSession = useCallback(async (category = 'general', mode = 'speaking') => {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    if (!key) {
        return { error: "API Key (VITE_GEMINI_API_KEY) tidak ditemukan oleh browser. Silakan matikan terminal (Ctrl+C) lalu jalankan 'npm run dev' lagi, dan REFRESH browser Anda." };
    }
    const genAIInstance = new GoogleGenerativeAI(key);
    modelRef.current = genAIInstance.getGenerativeModel({ 
        model: "gemini-flash-lite-latest",
        systemInstruction: getSystemPrompt(category, mode) 
    });
    
    internalHistoryRef.current = [];
    setChatHistory([]);
    
    // Start the conversation
    setIsProcessing(true);
    console.log(`🤖 [Gemini] Starting new session with category: ${category}, mode: ${mode}`);
    try {
        const initialPrompt = mode === 'listening' 
            ? "Start the conversation by greeting me and saying a simple statement or question in English that I need to translate or understand."
            : "Start the conversation by greeting me and asking a simple question.";
            
        internalHistoryRef.current.push({ role: 'user', parts: [{ text: initialPrompt }] });
        console.log('🤖 [Gemini] Sending initial prompt...');
        const result = await modelRef.current.generateContent({ contents: internalHistoryRef.current });
        const responseText = result.response.text();
        console.log('🤖 [Gemini] Received initial response:', responseText);
        internalHistoryRef.current.push({ role: 'model', parts: [{ text: responseText }] });
        
        setChatHistory([{ role: 'model', text: responseText }]);
        setIsProcessing(false);
        return { text: responseText };
    } catch (error) {
        console.error("Error starting session:", error);
        setIsProcessing(false);
        return { error: error.message || "Unknown error" };
    }
  }, []);

  const sendMessage = useCallback(async (message) => {
    if (!modelRef.current) {
        return { error: "Chat session not initialized" };
    }

    setIsProcessing(true);
    setChatHistory(prev => [...prev, { role: 'user', text: message }]);

    // Add user message to internal history
    internalHistoryRef.current.push({ role: 'user', parts: [{ text: message }] });

    // --- TOKEN OPTIMIZATION ---
    // Keep only the last 6 messages (3 turns) to save tokens drastically.
    // If it exceeds 6, slice to keep the most recent ones.
    if (internalHistoryRef.current.length > 6) {
        internalHistoryRef.current = internalHistoryRef.current.slice(-6);
    }

    try {
      console.log('🤖 [Gemini] Sending message...', { message, historyLength: internalHistoryRef.current.length });
      const result = await modelRef.current.generateContent({ contents: internalHistoryRef.current });
      const responseText = result.response.text();
      console.log('🤖 [Gemini] Received response:', responseText);
      
      internalHistoryRef.current.push({ role: 'model', parts: [{ text: responseText }] });
      setChatHistory(prev => [...prev, { role: 'model', text: responseText }]);
      setIsProcessing(false);
      return { text: responseText };
    } catch (error) {
      console.error("Error sending message to Gemini:", error);
      internalHistoryRef.current.pop(); // Remove the user message that caused the error to avoid corruption
      setChatHistory(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error." }]);
      setIsProcessing(false);
      return { error: error.message || "Unknown error" };
    }
  }, []);

  return { initSession, sendMessage, chatHistory, isProcessing };
};
