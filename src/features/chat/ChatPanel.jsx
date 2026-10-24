import { useRef, useState } from "react";
import { z } from "zod";
import { api } from "../../api/index.js";
import Button from "../../components/ui/Button.jsx";
import { faqAnswer } from "./faq.js";
import { redact, sourceLine } from "./redact.js";

export const MAX_MESSAGE = 500;
const ReplySchema = z.object({ text: z.string().min(1).max(2000) });

/**
 * Chat about the website or the current project. Replies are plain text, labelled AI,
 * and the panel has no access to any write call, so it can never change an allocation.
 */
export default function ChatPanel({ context = {}, title = "Assistant" }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);

  async function send(event) {
    event?.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (message.length > MAX_MESSAGE) {
      setError(`Message is ${message.length} characters. The limit is ${MAX_MESSAGE}.`);
      return;
    }
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setText("");
    const safe = redact(context);
    setMessages((m) => [...m, { role: "user", text: message }]);
    let reply;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      const raw = await api.chat({ message, context: safe });
      const parsed = ReplySchema.safeParse({ text: raw?.text });
      if (!parsed.success) throw new Error("invalid");
      reply = { role: "ai", text: parsed.data.text, source: sourceLine(safe), ai: true };
    } catch {
      reply = { role: "ai", text: faqAnswer(message), source: "Answered from: built-in help", ai: false };
    } finally {
      sending.current = false;
      setBusy(false);
    }
    setMessages((m) => [...m, reply]);
  }

  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col rounded-panel border border-steel bg-carbon p-5">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
        {messages.length === 0 && <p className="text-sm text-soft-white/70">Ask about mapping, rules, TQs, spares or the run.</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <p className={`inline-block max-w-full whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-steel" : "bg-gunmetal"}`}>
              {m.role === "ai" && (
                <span className="mr-2 rounded-full border border-soft-white/50 px-1.5 text-[10px] uppercase">{m.ai ? "AI" : "Help"}</span>
              )}
              {m.text}
            </p>
            {m.source && <p className="mt-1 text-xs text-soft-white/60">{m.source}</p>}
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-data-tq">
          {error}
        </p>
      )}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          aria-label="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="focus-ring min-w-0 flex-1 rounded-full border border-steel bg-gunmetal px-4 py-2 text-sm"
          placeholder="Type a question"
        />
        <Button type="submit" disabled={busy}>
          Send
        </Button>
      </form>
    </section>
  );
}
