import Button from "./Button.jsx";

export default function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="rounded-panel border border-data-tq p-4">
      <p className="text-sm text-soft-white">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
