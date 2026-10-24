import { useMemo } from "react";
import { buildRunContext } from "../chat/buildRunContext.js";
import ChatPanel from "../chat/ChatPanel.jsx";

// Reuses the dashboard chat. The key resets the conversation when the run changes.
export default function ChatTab({ runId, report, tqs }) {
  const context = useMemo(() => buildRunContext(report, tqs), [report, tqs]);
  return (
    <div className="h-[28rem]">
      <ChatPanel key={runId} title="Ask about this run" context={context} />
    </div>
  );
}
