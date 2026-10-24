import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import ChatPanel from "../features/chat/ChatPanel.jsx";
import PreferencesPanel from "../features/preferences/PreferencesPanel.jsx";
import UploadPanel from "../features/upload/UploadPanel.jsx";
import Panel from "../components/ui/Panel.jsx";

// The 3D card is isolated so moving it is a small change (MI-6).
function PlantCard() {
  return (
    <Link
      to="/plant"
      className="focus-ring block rounded-panel border border-steel bg-carbon p-4 text-sm hover:bg-gunmetal"
    >
      <span className="font-semibold">3D plant view</span>
      <span className="block text-xs text-soft-white/70">Watch a guided tour of the plant, cabinets and channels.</span>
    </Link>
  );
}

export default function Projects() {
  const [prefs, setPrefs] = useState({ changed: {}, valid: true });
  const onPrefs = useCallback((value) => setPrefs(value), []);
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Panel title="Upload signals">
          <UploadPanel preferences={prefs.changed} blocked={!prefs.valid} />
        </Panel>
        <PreferencesPanel onChange={onPrefs} />
        <PlantCard />
      </div>
      <div className="h-[calc(100vh-9rem)]">
        <ChatPanel title="Assistant" />
      </div>
    </div>
  );
}
