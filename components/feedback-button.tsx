"use client";

import { MessageCircle, X, Send, Upload } from "lucide-react";
import { useRef, useState } from "react";

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!message.trim() || !email.trim()) {
      setSubmitStatus("error");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append("message", message);
      formData.append("email", email);
      if (file) {
        formData.append("file", file);
      }

      const response = await fetch("/api/feedback", {
        method: "POST",
        body: formData
      });

      if (response.ok) {
        setSubmitStatus("success");
        setMessage("");
        setEmail("");
        setFile(null);
        setTimeout(() => {
          setIsOpen(false);
          setSubmitStatus(null);
        }, 2000);
      } else {
        setSubmitStatus("error");
      }
    } catch (error) {
      console.error("Feedback submission error:", error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 p-4 shadow-lg transition hover:scale-110 hover:shadow-xl"
        aria-label="Send feedback"
      >
        <MessageCircle className="size-6 text-white" />
      </button>

      {/* Modal Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 className="text-lg font-black text-slate-950">Send Feedback</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 transition hover:text-slate-600"
            >
              <X className="size-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {/* Email Input */}
            <div>
              <label className="mb-2 block text-xs font-black uppercase text-slate-700">
                Your Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
            </div>

            {/* Message Input */}
            <div>
              <label className="mb-2 block text-xs font-black uppercase text-slate-700">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your feedback or issue..."
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                required
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="mb-2 block text-xs font-black uppercase text-slate-700">
                Upload Image (Optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                >
                  <Upload className="size-3.5" />
                  Choose Image
                </button>
                {file && (
                  <span className="text-xs text-slate-600">{file.name}</span>
                )}
              </div>
            </div>

            {/* Status Messages */}
            {submitStatus === "success" && (
              <div className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                ✓ Feedback sent successfully! Thank you.
              </div>
            )}
            {submitStatus === "error" && (
              <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
                ✗ Error sending feedback. Please try again.
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-gradient-to-r from-teal-500 to-cyan-600 py-2.5 text-xs font-black uppercase text-white transition disabled:opacity-50 hover:shadow-lg"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Send className="size-4" />
                  Send Feedback
                </span>
              )}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
