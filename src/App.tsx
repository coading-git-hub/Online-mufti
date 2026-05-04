/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  Send, 
  Languages, 
  Moon, 
  Info, 
  MessageSquare,
  ScrollText,
  User,
  Quote,
  Mic,
  MicOff,
  Volume2,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Square
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { askMufti, speakText } from './services/gemini';
import { cn } from './lib/utils';

interface Message {
  role: 'user' | 'mufti';
  content: string;
  id: string;
  feedback?: 'positive' | 'negative';
}

const SUPPORTED_LANGUAGES = [
  { code: 'English', label: 'English' },
  { code: 'Urdu', label: 'اردو' },
  { code: 'Arabic', label: 'العربية' },
  { code: 'Hindi', label: 'हिंदी' },
  { code: 'Bengali', label: 'বাংলা' }
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [language, setLanguage] = useState('English');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      id: Date.now().toString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await askMufti(textToSend, language);
      const muftiMessage: Message = {
        role: 'mufti',
        content: response,
        id: (Date.now() + 1).toString()
      };
      setMessages(prev => [...prev, muftiMessage]);
      
      if (voiceMode) {
        handleSpeak(muftiMessage);
      }
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        role: 'mufti',
        content: `I apologize, my child. A technical difficulty has occurred: ${error instanceof Error ? error.message : String(error)}. Please check if your API key is correctly configured.`,
        id: (Date.now() + 1).toString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      // @ts-ignore
      window.recognition?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'English' ? 'en-US' : language === 'Urdu' ? 'ur-PK' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      handleSend(transcript);
    };

    recognition.start();
    (window as any).recognition = recognition;
  };

  const stopSpeaking = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (e) {
        // Already stopped
      }
      sourceRef.current = null;
    }
    setIsSpeaking(null);
  };

  const handleSpeak = async (message: Message) => {
    // If already speaking THIS message, stop it
    if (isSpeaking === message.id) {
      stopSpeaking();
      return;
    }

    // If speaking something else, stop that first
    if (isSpeaking) {
      stopSpeaking();
    }

    try {
      setIsSpeaking(message.id);
      
      // Remove markdown characters for cleaner speech
      const cleanText = message.content.replace(/[#*`>_]/g, '');
      
      try {
        const base64Audio = await speakText(cleanText, language);
        
        // If user stopped or switched while we were fetching
        if (isSpeaking !== message.id && isSpeaking !== null) return;

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const pcmData = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          float32Data[i] = pcmData[i] / 32768; // Normalize to [-1, 1]
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        
        const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        
        source.onended = () => {
          if (isSpeaking === message.id) {
            setIsSpeaking(null);
            sourceRef.current = null;
          }
        };
        
        sourceRef.current = source;
        source.start();
      } catch (aiError) {
        console.warn("AI TTS failed, falling back to browser speech:", aiError);
        // Fallback to browser's SpeechSynthesis
        const utternance = new SpeechSynthesisUtterance(cleanText);
        utternance.lang = language === 'Urdu' ? 'ur-PK' : language === 'Arabic' ? 'ar-SA' : 'en-US';
        utternance.onend = () => setIsSpeaking(null);
        window.speechSynthesis.speak(utternance);
      }

    } catch (error) {
      console.error("Speech error:", error);
      setIsSpeaking(null);
      sourceRef.current = null;
    }
  };

  const handleFeedback = (messageId: string, type: 'positive' | 'negative') => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, feedback: type } : msg
    ));
    // In a real app with backend, we would send this to the server/database here.
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto bg-islamic-cream shadow-2xl overflow-hidden font-sans">
      {/* Header */}
      <header className="bg-islamic-emerald p-4 text-white shadow-lg flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-islamic-gold p-2 rounded-full border-2 border-white/20">
            <ScrollText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold tracking-wide">Ask Mufti</h1>
            <p className="text-xs text-white/70 italic">Sharia Guidance from Classic Fatawa</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setVoiceMode(!voiceMode)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border",
              voiceMode 
                ? "bg-islamic-gold border-white/50 text-white shadow-inner" 
                : "bg-white/10 border-white/10 text-white/70 hover:bg-white/20"
            )}
            title="Auto-play voice for answers"
          >
            <Volume2 className={cn("w-4 h-4", voiceMode && "animate-pulse")} />
            <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Voice Mode</span>
          </button>

          <div className="relative">
          <button 
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors"
          >
            <Languages className="w-4 h-4" />
            <span className="text-sm font-medium">{SUPPORTED_LANGUAGES.find(l => l.code === language)?.label}</span>
          </button>
          
          <AnimatePresence>
            {showLanguageMenu && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-xl overflow-hidden border border-stone-200"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setShowLanguageMenu(false);
                    }}
                    className={cn(
                      "w-full px-4 py-2 text-left text-sm hover:bg-islamic-cream transition-colors",
                      language === lang.code ? "bg-islamic-cream text-islamic-emerald font-bold" : "text-stone-700"
                    )}
                  >
                    {lang.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>

      {/* Main Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth custom-scrollbar"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(6, 95, 70, 0.05) 1px, transparent 0)',
          backgroundSize: '24px 24px'
        }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 max-w-md mx-auto py-12">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="w-20 h-20 bg-islamic-emerald/5 rounded-full flex items-center justify-center border-2 border-islamic-emerald/10"
            >
              <Moon className="w-10 h-10 text-islamic-emerald opacity-20" />
            </motion.div>
            <div className="space-y-2">
              <h2 className="font-serif text-2xl text-islamic-emerald">Bismillahir Rahmanir Rahim</h2>
              <p className="text-stone-600">
                Welcome to the Sharia Consultant. You may ask questions regarding faith, worship, 
                and daily life based on <strong>Fatawa-e-Razawiyyah</strong> and <strong>Bahar-e-Shariat</strong>.
              </p>
            </div>
            
            <div className="grid grid-cols-1 gap-3 w-full">
              {[
                { label: "Method of Wudu", lang: "What is the correct Fard parts of Wudu?" },
                { label: "Zakat Rules", lang: "Explain the Nisab for Zakat according to Bahar-e-Shariat." },
                { label: "Prayer", lang: "What are the rules for Missed (Qaza) prayers?" }
              ].map((example, i) => (
                <button
                  key={i}
                  onClick={() => setInput(example.lang)}
                  className="p-3 bg-white border border-islamic-emerald/10 rounded-xl hover:border-islamic-emerald hover:bg-islamic-emerald/5 text-left text-sm text-stone-700 transition-all shadow-sm flex items-center gap-3 group"
                >
                  <BookOpen className="w-4 h-4 text-islamic-gold group-hover:scale-110 transition-transform" />
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex w-full mb-4",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div className={cn(
              "flex max-w-[85%] md:max-w-[75%] gap-3",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              <div className={cn(
                "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 border shadow-sm",
                msg.role === 'user' ? "bg-islamic-gold/10 border-islamic-gold text-islamic-gold" : "bg-islamic-emerald text-white border-islamic-emerald"
              )}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Quote className="w-4 h-4" />}
              </div>
              
              <div className={cn(
                "rounded-2xl p-4 shadow-sm",
                msg.role === 'user' 
                  ? "bg-islamic-gold text-white rounded-tr-none" 
                  : "bg-white border border-stone-100 rounded-tl-none"
              )}>
                <div className={cn(
                  "markdown-body",
                  msg.role === 'user' ? "text-white" : ""
                )}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                <div className={cn(
                  "flex items-center justify-between gap-4 mt-3 pt-3 border-t border-stone-50",
                  msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}>
                  <div className="text-[10px] opacity-40">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {msg.role === 'mufti' && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleSpeak(msg)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm",
                          isSpeaking === msg.id 
                            ? "bg-red-50 text-red-600 animate-pulse border border-red-200" 
                            : "text-stone-500 hover:bg-stone-50 hover:text-islamic-emerald border border-stone-200"
                        )}
                      >
                        {isSpeaking === msg.id ? (
                          <>
                            <Square className="w-3.5 h-3.5 fill-current" />
                            <span>Stop Listening</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Listen to Answer</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center bg-stone-50 rounded-lg border border-stone-200 p-0.5 shadow-sm">
                        <button
                          onClick={() => handleFeedback(msg.id, 'positive')}
                          className={cn(
                            "p-1 rounded-md transition-all",
                            msg.feedback === 'positive' 
                              ? "bg-islamic-emerald text-white" 
                              : "text-stone-400 hover:text-islamic-emerald hover:bg-white"
                          )}
                          title="Helpful Answer"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <div className="w-px h-3 bg-stone-200 mx-0.5" />
                        <button
                          onClick={() => handleFeedback(msg.id, 'negative')}
                          className={cn(
                            "p-1 rounded-md transition-all",
                            msg.feedback === 'negative' 
                              ? "bg-red-500 text-white" 
                              : "text-stone-400 hover:text-red-500 hover:bg-white"
                          )}
                          title="Not Helpful"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[75%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-islamic-emerald text-white flex items-center justify-center animate-pulse">
                <Quote className="w-4 h-4" />
              </div>
              <div className="bg-white border border-stone-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-islamic-emerald rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-islamic-emerald rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-islamic-emerald rounded-full animate-bounce"></span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-white border-t border-stone-100">
        <div className="relative flex items-center gap-2 max-w-3xl mx-auto">
          <button
            onClick={toggleListening}
            className={cn(
              "p-3 rounded-2xl transition-all shadow-sm active:scale-95",
              isListening 
                ? "bg-red-500 text-white animate-pulse" 
                : "bg-stone-50 border border-stone-200 text-stone-500 hover:bg-stone-100"
            )}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={language === 'Urdu' ? "اپنا سوال یہاں درج کریں..." : "Ask your Sharia query..."}
              dir={language === 'Urdu' || language === 'Arabic' ? 'rtl' : 'ltr'}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-islamic-emerald/20 focus:border-islamic-emerald text-stone-800 transition-all placeholder:text-stone-400 shadow-inner"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-islamic-emerald hover:bg-islamic-deep text-white rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:active:scale-100 group"
            >
              <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
        </div>
        <p className="text-[10px] text-center text-stone-400 mt-3 flex items-center justify-center gap-1">
          <Info className="w-3 h-3" />
          For critical matters, always consult a local Mufti in person. References from Bahar-e-Shariat & Fatawa-e-Razawiyyah.
        </p>
      </footer>
    </div>
  );
}
