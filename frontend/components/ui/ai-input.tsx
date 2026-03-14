"use client";

import { CornerRightUp, Mic, MicOff, Languages } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";

interface AIInputProps {
  id?: string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  onSubmit?: (value: string) => void
  onVoiceInput?: (text: string) => void
  className?: string
  disabled?: boolean
  value?: string
  onChange?: (value: string) => void
}

const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "sw", name: "Kiswahili" },
  { code: "ar", name: "العربية" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
];

export function AIInput({
  id = "ai-input",
  placeholder = "Type your message...",
  minHeight = 52,
  maxHeight = 200,
  onSubmit,
  onVoiceInput,
  className,
  disabled = false,
  value: controlledValue,
  onChange: controlledOnChange,
}: AIInputProps) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });
  
  const [internalValue, setInternalValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const recognitionRef = useRef<any>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Use controlled value if provided, otherwise use internal state
  const inputValue = controlledValue !== undefined ? controlledValue : internalValue;
  const setInputValue = controlledOnChange || setInternalValue;

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check if we're in a secure context (HTTPS or localhost)
      const isSecureContext = window.isSecureContext || 
                              window.location.protocol === 'https:' || 
                              window.location.hostname === 'localhost' ||
                              window.location.hostname === '127.0.0.1';
      
      if (!isSecureContext) {
        console.warn("[Speech Recognition] Not in secure context - requires HTTPS or localhost");
        setSpeechError("Speech recognition requires HTTPS. Please use a secure connection.");
      } else {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
          console.warn("[Speech Recognition] API not available in this browser");
        } else {
      
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = selectedLanguage;
      
      // Set service URI if available (for better reliability)
      // Chrome uses Google's speech service by default
      if ((recognition as any).serviceURI) {
        // Can customize service URI if needed
        console.log("[Speech Recognition] Using service:", (recognition as any).serviceURI);
      }

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null); // Clear any previous errors
      };

      recognition.onresult = (event: any) => {
        // Reset error and retry count on successful result
        setSpeechError(null);
        setRetryCount(0);
        
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        
        if (onVoiceInput) {
          onVoiceInput(transcript);
        } else {
          setInputValue(transcript);
          adjustHeight();
        }
      };

      recognition.onerror = (event: any) => {
        const errorType = event.error;
        const errorMessage = event.message || "";
        console.error("Speech recognition error:", errorType, errorMessage);
        
        setIsListening(false);
        
        // Handle different error types
        switch (errorType) {
          case "network":
            // Network error can mean:
            // 1. Actual network issue
            // 2. Speech recognition service unavailable
            // 3. Service blocked or rate-limited
            // 4. Browser compatibility issue
            const networkErrorMsg = retryCount < 2 
              ? "Speech service temporarily unavailable. Retrying..."
              : "Speech recognition service unavailable. This may be a browser or service issue. Please try:\n1. Refreshing the page\n2. Using Chrome or Edge browser\n3. Checking if microphone permissions are granted";
            
            setSpeechError(networkErrorMsg);
            
            // Auto-retry network errors up to 2 times
            if (retryCount < 2) {
              setRetryCount(prev => prev + 1);
              retryTimeoutRef.current = setTimeout(() => {
                try {
                  // Recreate recognition instance for retry (sometimes helps)
                  const newRecognition = new (window as any).SpeechRecognition || new (window as any).webkitSpeechRecognition();
                  newRecognition.continuous = false;
                  newRecognition.interimResults = true;
                  newRecognition.lang = selectedLanguage;
                  
                  newRecognition.onstart = () => {
                    setIsListening(true);
                    setSpeechError(null);
                  };
                  
                  newRecognition.onresult = (event: any) => {
                    setSpeechError(null);
                    setRetryCount(0);
                    let transcript = "";
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                      transcript += event.results[i][0].transcript;
                    }
                    if (onVoiceInput) {
                      onVoiceInput(transcript);
                    } else {
                      setInputValue(transcript);
                      adjustHeight();
                    }
                  };
                  
                  newRecognition.onerror = (event: any) => {
                    console.error("Speech recognition retry error:", event.error);
                    setIsListening(false);
                    if (event.error === "network" && retryCount >= 1) {
                      setSpeechError("Speech service unavailable. Please try typing instead or refresh the page.");
                      setRetryCount(0);
                    }
                  };
                  
                  newRecognition.onend = () => {
                    setIsListening(false);
                  };
                  
                  recognitionRef.current = newRecognition;
                  newRecognition.start();
                } catch (e) {
                  console.error("Retry failed:", e);
                  setSpeechError("Failed to reconnect. The speech service may be unavailable. Please try typing instead.");
                  setRetryCount(0);
                }
              }, 2000);
            } else {
              setSpeechError("Speech recognition service unavailable. Please use text input or refresh the page.");
              setRetryCount(0);
            }
            break;
          case "no-speech":
            setSpeechError("No speech detected. Please speak clearly.");
            setTimeout(() => setSpeechError(null), 3000);
            break;
          case "audio-capture":
            setSpeechError("Microphone access denied. Please allow microphone access in your browser settings.");
            setTimeout(() => setSpeechError(null), 5000);
            break;
          case "not-allowed":
          case "service-not-allowed":
            setSpeechError("Microphone permission denied. Please enable microphone access and refresh the page.");
            setTimeout(() => setSpeechError(null), 5000);
            break;
          case "aborted":
            // User stopped or aborted - don't show error
            setSpeechError(null);
            break;
          default:
            setSpeechError(`Speech recognition error: ${errorType}. Please try again.`);
            setTimeout(() => setSpeechError(null), 3000);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

          recognitionRef.current = recognition;
        }
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [selectedLanguage, onVoiceInput, setInputValue, adjustHeight]);

  // Close language menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false);
      }
    };

    if (showLanguageMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showLanguageMenu]);

  const handleReset = () => {
    if (!inputValue.trim() || disabled) return;
    onSubmit?.(inputValue);
    if (controlledValue === undefined) {
      setInternalValue("");
    }
    adjustHeight(true);
  };

  const handleVoiceToggle = () => {
    // Check browser support
    const SpeechRecognition = typeof window !== "undefined" 
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;
    
    if (!SpeechRecognition) {
      setSpeechError("Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.");
      setTimeout(() => setSpeechError(null), 5000);
      return;
    }
    
    // Check secure context
    const isSecureContext = typeof window !== "undefined" && (
      window.isSecureContext || 
      window.location.protocol === 'https:' || 
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
    
    if (!isSecureContext) {
      setSpeechError("Speech recognition requires HTTPS or localhost. Please use a secure connection.");
      setTimeout(() => setSpeechError(null), 5000);
      return;
    }

    if (!recognitionRef.current) {
      // Reinitialize if needed
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = selectedLanguage;
      
      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };
      
      recognition.onresult = (event: any) => {
        setSpeechError(null);
        setRetryCount(0);
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (onVoiceInput) {
          onVoiceInput(transcript);
        } else {
          setInputValue(transcript);
          adjustHeight();
        }
      };
      
      recognition.onerror = (event: any) => {
        const errorType = event.error;
        console.error("Speech recognition error:", errorType, event.message);
        setIsListening(false);
        
        switch (errorType) {
          case "network":
            setSpeechError("Speech service unavailable. This may be a temporary service issue. Please try again or use text input.");
            setTimeout(() => setSpeechError(null), 5000);
            break;
          case "no-speech":
            setSpeechError("No speech detected. Please speak clearly.");
            setTimeout(() => setSpeechError(null), 3000);
            break;
          case "audio-capture":
            setSpeechError("Microphone access denied. Please allow microphone access.");
            setTimeout(() => setSpeechError(null), 5000);
            break;
          case "not-allowed":
            setSpeechError("Microphone permission denied. Please enable microphone access.");
            setTimeout(() => setSpeechError(null), 5000);
            break;
          default:
            setSpeechError(`Speech error: ${errorType}. Please try again.`);
            setTimeout(() => setSpeechError(null), 3000);
        }
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setSpeechError(null);
      setRetryCount(0);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    } else {
      // Clear previous errors and retry count
      setSpeechError(null);
      setRetryCount(0);
      
      try {
        recognitionRef.current.start();
      } catch (error: any) {
        console.error("Error starting speech recognition:", error);
        if (error?.message?.includes("already started")) {
          // Recognition already running, just update state
          setIsListening(true);
        } else {
          setSpeechError("Failed to start speech recognition. The service may be unavailable. Please try typing instead.");
          setTimeout(() => setSpeechError(null), 5000);
        }
      }
    }
  };

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    setShowLanguageMenu(false);
    if (recognitionRef.current) {
      recognitionRef.current.lang = langCode;
    }
  };

  const isSpeechSupported = mounted && typeof window !== "undefined" && 
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return (
    <div className={cn("w-full", className)}>
      {speechError && (
        <div className="mb-2 p-2 bg-red-900/20 border border-red-800/50 rounded-lg text-xs text-red-300">
          {speechError}
          {retryCount > 0 && (
            <span className="ml-2 text-red-400">(Retrying {retryCount}/2...)</span>
          )}
        </div>
      )}
      <div className="relative w-full">
        <Textarea
          id={id}
          placeholder={placeholder}
          className={cn(
            "w-full bg-neutral-900/50 rounded-xl pl-5",
            isSpeechSupported ? "pr-28" : "pr-20",
            "placeholder:text-neutral-500",
            "border-0",
            "text-neutral-50",
            "overflow-y-auto resize-none",
            "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none",
            "transition-[height] duration-100 ease-out",
            "leading-[1.2] py-3",
            `min-h-[${minHeight}px]`,
            `max-h-[${maxHeight}px]`,
            disabled && "opacity-50 cursor-not-allowed",
            "[&::-webkit-resizer]:hidden"
          )}
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleReset();
            }
          }}
          disabled={disabled}
        />

        {/* Language Selector */}
        <div className="relative" ref={languageMenuRef}>
          <button
            type="button"
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded-xl bg-neutral-800/50 hover:bg-neutral-800 py-1.5 px-2 transition-all duration-200",
              isSpeechSupported ? (showLanguageMenu ? "right-28" : "right-20") : (showLanguageMenu ? "right-20" : "right-12")
            )}
            title="Select Language"
          >
            <Languages className="w-4 h-4 text-neutral-400" />
          </button>

          {showLanguageMenu && (
            <div className={cn(
              "absolute bottom-full mb-2 bg-neutral-900 border border-neutral-800 rounded-lg shadow-lg py-2 min-w-[180px] z-50",
              isSpeechSupported ? "right-20" : "right-12"
            )}>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm hover:bg-neutral-800 transition-colors",
                    selectedLanguage === lang.code && "bg-neutral-800 text-blue-400"
                  )}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Voice Input Button */}
        {isSpeechSupported && (
          <button
            type="button"
            onClick={handleVoiceToggle}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 rounded-xl py-1.5 px-2 transition-all duration-200",
              isListening 
                ? "bg-red-500/20 hover:bg-red-500/30" 
                : "bg-neutral-800/50 hover:bg-neutral-800",
              showLanguageMenu ? "right-20" : "right-12"
            )}
            title={isListening ? "Stop listening" : "Start voice input"}
          >
            {isListening ? (
              <MicOff className="w-4 h-4 text-red-400 animate-pulse" />
            ) : (
              <Mic className="w-4 h-4 text-neutral-400" />
            )}
          </button>
        )}

        {/* Submit Button */}
        <button
          onClick={handleReset}
          type="button"
          disabled={!inputValue.trim() || disabled}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 right-3",
            "rounded-xl py-1.5 px-2",
            "transition-all duration-200",
            inputValue && !disabled
              ? "opacity-100 scale-100 bg-blue-600 hover:bg-blue-500" 
              : "opacity-0 scale-95 pointer-events-none bg-neutral-800",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          title="Send message (Enter)"
        >
          <CornerRightUp className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
