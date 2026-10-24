import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MappingStep from "../features/mapping/MappingStep.jsx";
import ValuesStep from "../features/values/ValuesStep.jsx";
import Panel from "../components/ui/Panel.jsx";

export default function Mapping() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">{step === 1 ? "Column mapping" : "Confirm values"}</h1>
      <p className="mb-4 text-sm text-soft-white/70">Step {step} of 2</p>
      <Panel>
        {step === 1 ? (
          <MappingStep projectId={id} onContinue={() => setStep(2)} />
        ) : (
          <ValuesStep projectId={id} onContinue={() => navigate(`/projects/${id}/rules`)} />
        )}
      </Panel>
    </div>
  );
}
