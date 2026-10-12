export interface SpeechRecognitionCallbacks {
  onResult: (transcript: string) => void;
  onInterim?: (interim: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

export interface SpeechSynthesisOptions {
  rate?: number;
  pitch?: number;
  voiceName?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

// Support standard and webkit prefixes
const SpeechRecognitionClass =
  typeof window !== 'undefined'
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export class SpeechService {
  private recognition: any = null;
  private isListening: boolean = false;
  private isSpeaking: boolean = false;

  static isRecognitionSupported(): boolean {
    return Boolean(SpeechRecognitionClass);
  }

  static isSynthesisSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  startListening(callbacks: SpeechRecognitionCallbacks): boolean {
    if (!SpeechRecognitionClass) {
      callbacks.onError?.(
        'Speech Recognition is not supported by your current browser. Please use Google Chrome, Microsoft Edge, or a Chromium-based browser with Web Speech API support.'
      );
      return false;
    }

    if (this.isListening) {
      this.stopListening();
    }

    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        if (interimTranscript && callbacks.onInterim) {
          callbacks.onInterim(interimTranscript);
        }

        if (finalTranscript) {
          callbacks.onResult(finalTranscript.trim());
        }
      };

      this.recognition.onerror = (event: any) => {
        let msg = 'Speech recognition error occurred.';
        if (event.error === 'not-allowed') {
          msg = 'Microphone permission was denied. Please allow microphone access in browser settings.';
        } else if (event.error === 'no-speech') {
          msg = 'No speech detected. Listening continued.';
          return;
        } else if (event.error === 'network') {
          msg = 'Speech recognition network error. Please check your internet connection.';
        } else if (event.error === 'audio-capture') {
          msg = 'No microphone was found or microphone is in use by another application.';
        }
        callbacks.onError?.(msg);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        callbacks.onEnd?.();
      };

      this.recognition.start();
      return true;
    } catch (err: any) {
      callbacks.onError?.(`Failed to initialize speech recognition: ${err.message || 'Unknown error'}`);
      return false;
    }
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
    this.isListening = false;
  }

  speak(text: string, options: SpeechSynthesisOptions = {}): void {
    if (!SpeechService.isSynthesisSupported()) {
      options.onError?.(new Error('Speech Synthesis is not supported in this browser.'));
      return;
    }

    // Stop previous utterance
    window.speechSynthesis.cancel();

    // Clean markdown symbols for natural speaking
    const cleanText = text
      .replace(/[*#_`>]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = options.rate ?? 1.0;
    utterance.pitch = options.pitch ?? 1.0;

    // Pick a natural voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferred = voices.find(
        (v) =>
          v.name.includes('Natural') ||
          v.name.includes('Google US English') ||
          v.name.includes('Samantha') ||
          (v.lang.startsWith('en') && !v.localService)
      ) || voices.find((v) => v.lang.startsWith('en'));

      if (preferred) {
        utterance.voice = preferred;
      }
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      options.onStart?.();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      options.onEnd?.();
    };

    utterance.onerror = (e) => {
      this.isSpeaking = false;
      options.onError?.(new Error(`Speech synthesis error: ${e.error}`));
    };

    window.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    if (SpeechService.isSynthesisSupported()) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const speechService = new SpeechService();
