interface SpeechRecognitionResultLike {
  transcript: string
}

interface SpeechRecognitionAlternativeList {
  isFinal: boolean
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionAlternativeList
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognition
  webkitSpeechRecognition?: new () => SpeechRecognition
}
