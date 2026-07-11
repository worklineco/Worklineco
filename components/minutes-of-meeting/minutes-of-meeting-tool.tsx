"use client";

import { FileText, Mic, Square, Wand2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
      isFinal: boolean;
    };
    length: number;
  };
};
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function MinutesOfMeetingTool() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [minutes, setMinutes] = useState<string[]>([]);
  const recognitionSupported = useMemo(
    () => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    []
  );

  function startRecording() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript ?? "";

        if (event.results[index].isFinal) {
          finalText += `${text.trim()} `;
        } else {
          interimText += text;
        }
      }

      if (finalText) {
        setTranscript((current) => `${current}${finalText}`.trimStart());
      }

      setInterimTranscript(interimText);
    };
    recognition.onerror = () => {
      setIsRecording(false);
      setInterimTranscript("");
    };
    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
    setInterimTranscript("");
  }

  function generateMinutes() {
    const lines = transcript
      .split(/(?<=[.!?])\s+|\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const bullets = lines.length ? lines : transcript.trim() ? [transcript.trim()] : [];

    setMinutes(
      bullets.map((line) => {
        if (/follow|action|to do|pending|responsib|will|shall|need/i.test(line)) {
          return `Action: ${line}`;
        }

        if (/decided|approved|agreed|confirmed|resolved/i.test(line)) {
          return `Decision: ${line}`;
        }

        return `Discussion: ${line}`;
      })
    );
  }

  return (
    <section className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
            <Mic className="size-5" />
          </div>
          <div>
            <p className="text-xs font-black uppercase text-emerald-700">Recorder</p>
            <h2 className="text-xl font-black text-slate-950">Meeting transcript</h2>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:bg-slate-400"
            disabled={!recognitionSupported || isRecording}
            onClick={startRecording}
            type="button"
          >
            <Mic className="size-4" />
            Start recording
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white disabled:bg-slate-300"
            disabled={!isRecording}
            onClick={stopRecording}
            type="button"
          >
            <Square className="size-4" />
            Stop
          </button>
        </div>

        {!recognitionSupported ? (
          <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
            Speech recording needs a browser with speech recognition support.
          </p>
        ) : null}

        <textarea
          className="mt-5 min-h-[28rem] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 outline-none focus:border-emerald-500 focus:bg-white"
          onChange={(event) => setTranscript(event.target.value)}
          placeholder="Transcript will appear here"
          value={interimTranscript ? `${transcript} ${interimTranscript}`.trim() : transcript}
        />
      </aside>

      <div className="rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Minutes</p>
              <h2 className="text-xl font-black text-slate-950">Structured bullets</h2>
            </div>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white"
            onClick={generateMinutes}
            type="button"
          >
            <Wand2 className="size-4" />
            Generate minutes
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {minutes.length ? (
            minutes.map((minute, index) => (
              <div className="flex gap-3 rounded-2xl bg-slate-50 p-3" key={`${minute}-${index}`}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-slate-500">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold leading-6 text-slate-700">{minute}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-500">
              Record or paste a transcript, then generate minutes.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
