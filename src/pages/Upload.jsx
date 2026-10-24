import { useParams } from "react-router-dom";
import Panel from "../components/ui/Panel.jsx";
import UploadPanel from "../features/upload/UploadPanel.jsx";

export default function Upload() {
  const { id } = useParams();
  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Add files</h1>
      <Panel title="Upload signals">
        <UploadPanel projectId={id} />
      </Panel>
    </div>
  );
}
